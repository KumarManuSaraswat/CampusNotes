export type DocumentMimeType = 'application/pdf' | 'image/jpeg' | 'image/png';

export interface DocumentInput {
  bytes: Buffer;
  mimeType: DocumentMimeType;
}

/** Routing only. Neither result grants publication permission or rejects study content. */
export type PreparedDocument =
  | {
      status: 'text';
      text: string;
      pageCount: number;
      warnings: string[];
    }
  | {
      status: 'vision_required';
      text: null;
      pageCount: number | null;
      warnings: string[];
    };

export interface DocumentOptions {
  maxBytes?: number;
  maxPages?: number;
  maxTextChars?: number;
  timeoutMs?: number;
}

export type DocumentErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_OPTIONS'
  | 'UNSUPPORTED_MIME'
  | 'MIME_MISMATCH'
  | 'FILE_TOO_LARGE'
  | 'MALFORMED_DOCUMENT'
  | 'PASSWORD_REQUIRED'
  | 'PAGE_LIMIT'
  | 'TEXT_LIMIT'
  | 'TIMEOUT'
  | 'PARSER_UNAVAILABLE'
  | 'PARSER_FAILED';

const messages: Record<DocumentErrorCode, string> = {
  INVALID_INPUT: 'A non-empty document buffer is required.',
  INVALID_OPTIONS: 'Document processing limits are invalid.',
  UNSUPPORTED_MIME: 'Choose a PDF, JPG, or PNG document.',
  MIME_MISMATCH: 'The document content does not match its file type.',
  FILE_TOO_LARGE: 'The document exceeds the processing size limit.',
  MALFORMED_DOCUMENT: 'The document is damaged or incomplete.',
  PASSWORD_REQUIRED: 'Upload a PDF that does not require a password.',
  PAGE_LIMIT: 'The PDF has too many pages. Split it into smaller documents.',
  TEXT_LIMIT: 'The PDF contains too much text. Split it into smaller documents.',
  TIMEOUT: 'Document preparation took too long. Please retry.',
  PARSER_UNAVAILABLE: 'Document preparation is temporarily unavailable.',
  PARSER_FAILED: 'The document could not be prepared. Please retry.',
};

export class DocumentPreparationError extends Error {
  readonly retryable: boolean;
  constructor(readonly code: DocumentErrorCode) {
    super(messages[code]);
    this.name = 'DocumentPreparationError';
    this.retryable = ['TIMEOUT', 'PARSER_UNAVAILABLE', 'PARSER_FAILED'].includes(code);
  }
}

export function isDocumentErrorCode(code: unknown): code is DocumentErrorCode {
  return typeof code === 'string' && Object.hasOwn(messages, code);
}
