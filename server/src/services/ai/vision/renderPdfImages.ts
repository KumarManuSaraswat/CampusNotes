import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { GroqError } from '../groqClient.js';

// Groq's default vision model accepts three images. Never silently read a PDF subset.
const workerSource = String.raw`
const { parentPort, workerData } = require('node:worker_threads');
(async () => {
  // PDF.js can skip unsupported/oversized objects with a warning. Fail the whole reading
  // in that case so a partially rendered page cannot become approval evidence.
  let warned = false;
  console.log = console.warn = () => { warned = true; };
  const { createCanvas, DOMMatrix, ImageData, Path2D } = require(workerData.canvasPath);
  Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
  const { getDocument } = await import(workerData.pdfUrl);
  const task = getDocument({
    data: workerData.bytes, isEvalSupported: false, useSystemFonts: false,
    useWorkerFetch: false, stopAtErrors: true, verbosity: 1,
    standardFontDataUrl: workerData.fontPath,
    maxImageSize: 16_000_000, canvasMaxAreaInBytes: 16_000_000,
  });
  const pdf = await task.promise;
  try {
    if (pdf.numPages > 3) throw { code: 'PAGE_LIMIT' };
    const images = [];
    let size = 0;
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const natural = page.getViewport({ scale: 1 });
      if (!Number.isFinite(natural.width + natural.height) || natural.width <= 0 || natural.height <= 0)
        throw { code: 'PARSER_FAILED' };
      const scale = Math.min(2, 2000 / Math.max(natural.width, natural.height));
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
      if (warned) throw { code: 'PARSER_FAILED' };
      const url = 'data:image/png;base64,' + canvas.toBuffer('image/png').toString('base64');
      size += url.length;
      if (size > 18 * 1024 * 1024) throw { code: 'FILE_TOO_LARGE' };
      images.push(url);
      page.cleanup();
      canvas.width = canvas.height = 1;
    }
    parentPort.postMessage({ images });
  } finally { await task.destroy(); }
})().catch(error => parentPort.postMessage({
  error: error?.name === 'PasswordException' ? 'PASSWORD_REQUIRED' : error?.code || 'PARSER_FAILED',
}));
`;

/** Rendering runs outside the request thread, with bounded pages, pixels, memory and lifetime. */
export async function renderPdfImages(bytes: Buffer, timeoutMs = 12_000): Promise<string[]> {
  const require = createRequire(import.meta.url);
  let pdfPath: string;
  let canvasPath: string;
  try {
    pdfPath = require.resolve('pdfjs-dist/legacy/build/pdf.mjs');
    canvasPath = require.resolve('@napi-rs/canvas');
  } catch {
    throw new GroqError('PARSER_FAILED');
  }
  return new Promise((resolveResult, reject) => {
    const worker = new Worker(workerSource, {
      eval: true,
      execArgv: [],
      workerData: {
        bytes: Uint8Array.from(bytes),
        canvasPath,
        pdfUrl: pathToFileURL(pdfPath).href,
        fontPath: resolve(dirname(pdfPath), '../../standard_fonts') + '/',
      },
      resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32 },
    });
    let settled = false;
    const finish = (error?: GroqError, images?: string[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate().then(
        () => (error ? reject(error) : resolveResult(images!)),
        () => reject(new GroqError('PARSER_FAILED')),
      );
    };
    const timer = setTimeout(() => finish(new GroqError('TIMEOUT')), timeoutMs);
    worker.once('error', () => finish(new GroqError('PARSER_FAILED')));
    worker.once('exit', () => finish(new GroqError('PARSER_FAILED')));
    worker.once('message', (message: { error?: string; images?: string[] }) => {
      if (message.images?.length && message.images.length <= 3) finish(undefined, message.images);
      else
        finish(
          new GroqError(
            ['PAGE_LIMIT', 'FILE_TOO_LARGE', 'PASSWORD_REQUIRED'].includes(message.error || '')
              ? message.error!
              : 'PARSER_FAILED',
          ),
        );
    });
  });
}
