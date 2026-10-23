import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { fileTypeFromBuffer } from 'file-type';
import {
  DocumentPreparationError,
  isDocumentErrorCode,
  type DocumentInput,
  type DocumentOptions,
  type PreparedDocument,
} from './documentTypes.js';
import { pdfWorkerSource } from './pdfWorkerSource.js';

export { DocumentPreparationError } from './documentTypes.js';
export type {
  DocumentInput,
  DocumentOptions,
  PreparedDocument,
  DocumentMimeType,
} from './documentTypes.js';

const defaults: Required<DocumentOptions> = {
  maxBytes: 10 * 1024 * 1024,
  maxPages: 40,
  maxTextChars: 100_000,
  timeoutMs: 15_000,
};
const ceilings: Required<DocumentOptions> = {
  maxBytes: 14 * 1024 * 1024,
  maxPages: 100,
  maxTextChars: 500_000,
  timeoutMs: 120_000,
};

function limitsFor(options: DocumentOptions): Required<DocumentOptions> {
  const limits = { ...defaults, ...options };
  for (const key of Object.keys(defaults) as Array<keyof DocumentOptions>) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > ceilings[key]) {
      throw new DocumentPreparationError('INVALID_OPTIONS');
    }
  }
  return limits;
}

async function readPdf(
  bytes: Buffer,
  limits: Required<DocumentOptions>,
): Promise<PreparedDocument> {
  let moduleUrl: string;
  try {
    moduleUrl = pathToFileURL(
      createRequire(import.meta.url).resolve('pdfjs-dist/legacy/build/pdf.mjs'),
    ).href;
  } catch {
    throw new DocumentPreparationError('PARSER_UNAVAILABLE');
  }
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(pdfWorkerSource, {
        eval: true,
        // This source is plain CommonJS. Do not inherit tsx/test loaders or --input-type=module.
        execArgv: [],
        // Uint8Array.from copies the source; transferring PDF.js data must not detach the upload.
        workerData: { bytes: Uint8Array.from(bytes), moduleUrl, ...limits },
        resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32 },
      });
    } catch {
      reject(new DocumentPreparationError('PARSER_FAILED'));
      return;
    }
    let settled = false;
    const finish = (error?: DocumentPreparationError, result?: PreparedDocument) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Do not return until parser execution has stopped; no untracked work after timeout.
      void worker.terminate().then(
        () => {
          if (error) reject(error);
          else resolve(result!);
        },
        () => reject(new DocumentPreparationError('PARSER_FAILED')),
      );
    };
    const timer = setTimeout(
      () => finish(new DocumentPreparationError('TIMEOUT')),
      limits.timeoutMs,
    );
    worker.once('error', () => finish(new DocumentPreparationError('PARSER_FAILED')));
    worker.once('exit', () => finish(new DocumentPreparationError('PARSER_FAILED')));
    worker.once('message', (message: { error?: unknown; result?: PreparedDocument }) => {
      if (isDocumentErrorCode(message.error)) finish(new DocumentPreparationError(message.error));
      else if (message.result && ['text', 'vision_required'].includes(message.result.status))
        finish(undefined, message.result);
      else finish(new DocumentPreparationError('PARSER_FAILED'));
    });
  });
}

/** Prepare already-authorized stored bytes. No storage, model calls, DB writes, or acceptance logic. */
export async function prepareDocument(
  input: DocumentInput,
  options: DocumentOptions = {},
): Promise<PreparedDocument> {
  const limits = limitsFor(options);
  if (!input || !Buffer.isBuffer(input.bytes) || input.bytes.length === 0) {
    throw new DocumentPreparationError('INVALID_INPUT');
  }
  if (!['application/pdf', 'image/jpeg', 'image/png'].includes(input.mimeType)) {
    throw new DocumentPreparationError('UNSUPPORTED_MIME');
  }
  if (input.bytes.length > limits.maxBytes) throw new DocumentPreparationError('FILE_TOO_LARGE');
  let detected;
  try {
    detected = await fileTypeFromBuffer(input.bytes);
  } catch {
    throw new DocumentPreparationError('MALFORMED_DOCUMENT');
  }
  if (!detected) throw new DocumentPreparationError('MALFORMED_DOCUMENT');
  if (detected.mime !== input.mimeType) throw new DocumentPreparationError('MIME_MISMATCH');
  if (input.mimeType !== 'application/pdf') {
    return {
      status: 'vision_required',
      text: null,
      pageCount: null,
      warnings: ['Images require visual transcription.'],
    };
  }
  if (
    !/%PDF-\d\.\d/.test(input.bytes.subarray(0, 1024).toString('latin1')) ||
    !input.bytes.subarray(-1024).includes(Buffer.from('%%EOF'))
  ) {
    throw new DocumentPreparationError('MALFORMED_DOCUMENT');
  }
  return readPdf(input.bytes, limits);
}
