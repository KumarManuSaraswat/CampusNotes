/**
 * Plain JavaScript intentionally runs in an isolated Node worker in both tsx development
 * and compiled production. No TS loader or separately copied runtime asset is needed.
 * Bytes and limits enter through workerData, never string interpolation/evaluation.
 * The parent terminates this worker on its wall-clock deadline, including CPU-bound parsing.
 */
export const pdfWorkerSource = String.raw`
const { parentPort, workerData } = require('node:worker_threads');

async function run() {
  let task;
  try {
    let pdfjs;
    try {
      pdfjs = await import(workerData.moduleUrl);
    } catch {
      parentPort.postMessage({ error: 'PARSER_UNAVAILABLE' });
      return;
    }
    task = pdfjs.getDocument({
      data: workerData.bytes,
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: false,
      useWorkerFetch: false,
      stopAtErrors: true,
      verbosity: 0,
    });
    const pdf = await task.promise;
    if (pdf.numPages > workerData.maxPages) {
      parentPort.postMessage({ error: 'PAGE_LIMIT' });
      return;
    }
    if (pdf.numPages < 1) {
      parentPort.postMessage({ error: 'MALFORMED_DOCUMENT' });
      return;
    }
    const imageOps = new Set(Object.entries(pdfjs.OPS)
      .filter(([name]) => name.startsWith('paint') && name.includes('Image'))
      .map(([, value]) => value));
    const pages = [];
    let total = 0;
    let sparse = false;
    let raster = false;
    let unclear = false;
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      try {
        const content = await page.getTextContent();
        const parts = [];
        for (const item of content.items) {
          if (typeof item.str !== 'string') continue;
          // Bound raw text too, before whitespace normalization can hide its size.
          total += item.str.length + 1;
          if (total > workerData.maxTextChars) {
            parentPort.postMessage({ error: 'TEXT_LIMIT' });
            return;
          }
          parts.push(item.str + (item.hasEOL ? '\n' : ' '));
        }
        const text = parts.join('').replace(/\r\n?/g, '\n')
          .replace(/[\t ]+/g, ' ').replace(/ *\n */g, '\n')
          .replace(/\n{3,}/g, '\n\n').trim();
        const readable = (text.match(/[\p{L}\p{N}]/gu) || []).length;
        if (readable < 40) sparse = true;
        // Replacement characters and private-use glyphs often indicate a broken font mapping.
        if (/[\uFFFD\uE000-\uF8FF]/u.test(text)) unclear = true;
        const ops = await page.getOperatorList();
        if (ops.fnArray.some((op) => imageOps.has(op))) raster = true;
        pages.push('[Page ' + number + ']\n' + text);
      } finally {
        page.cleanup();
      }
    }
    const text = pages.join('\n\n');
    if (text.length > workerData.maxTextChars) {
      parentPort.postMessage({ error: 'TEXT_LIMIT' });
      return;
    }
    const warnings = [];
    if (sparse) warnings.push('One or more pages have little or no readable text; visual transcription is needed.');
    if (raster) warnings.push('The PDF contains images that text extraction cannot read; visual transcription is needed.');
    if (unclear) warnings.push('Some text could not be decoded reliably; visual transcription is needed.');
    parentPort.postMessage({
      result: {
        status: warnings.length ? 'vision_required' : 'text',
        text: warnings.length ? null : text,
        pageCount: pdf.numPages,
        warnings,
      },
    });
  } catch (error) {
    const code = error && error.name === 'PasswordException' ? 'PASSWORD_REQUIRED' : 'MALFORMED_DOCUMENT';
    parentPort.postMessage({ error: code });
  } finally {
    if (task) await task.destroy().catch(() => {});
    parentPort.close();
  }
}
run().catch(() => { parentPort.postMessage({ error: 'PARSER_FAILED' }); parentPort.close(); });
`;
