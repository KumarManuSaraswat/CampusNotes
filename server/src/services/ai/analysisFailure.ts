export type AnalysisStage = 'storage' | 'document' | 'vision' | 'classification';

const providerMessages: Record<string, string> = {
  CONFIG_MISSING:
    'The server is missing its Gemini configuration. Ask the administrator to check the API key and model.',
  CONFIG_INVALID:
    'The server has invalid analysis settings. Ask the administrator to check the configuration.',
  SDK_MISSING: 'The server could not load Gemini. Ask the administrator to rebuild the backend.',
  PROVIDER_AUTH:
    'Gemini refused access. Ask the administrator to check the API key and project permissions.',
  MODEL_UNAVAILABLE:
    'The configured Gemini model is unavailable to this project. Ask the administrator to check GEMINI_MODEL.',
  RATE_LIMITED:
    'Gemini has reached a rate or quota limit. Check the project quota before retrying.',
  TIMEOUT: 'Gemini took too long to respond. Please retry shortly.',
  PROVIDER_UNAVAILABLE: 'Gemini is temporarily unavailable. Please retry shortly.',
  PROVIDER_BLOCKED: 'Gemini could not process this content. You can request a human review.',
  MALFORMED_RESPONSE:
    'Gemini returned an incomplete or invalid result. Retry or request a human review.',
};
const documentMessages: Record<string, string> = {
  PASSWORD_REQUIRED: 'This PDF requires a password. Upload an unlocked copy.',
  MALFORMED_DOCUMENT: 'This PDF is damaged or incomplete. Try exporting it again.',
  PAGE_LIMIT: 'This PDF has too many pages. Split it into smaller documents.',
  TEXT_LIMIT: 'This PDF contains too much text. Split it into smaller documents.',
  FILE_TOO_LARGE: 'This document exceeds the processing size limit.',
  MIME_MISMATCH: 'The document content does not match its file type.',
  UNSUPPORTED_MIME: 'Choose a PDF, JPG, or PNG document.',
  TIMEOUT: 'Reading the document took too long. Please retry.',
  PARSER_UNAVAILABLE:
    'The server could not load the PDF reader. Ask the administrator to check the backend runtime and dependencies.',
  PARSER_FAILED:
    'The server could not read this PDF. Try exporting it again or request a human review.',
};

/** Only allowlisted codes and our own text may leave the provider boundary. */
export function analysisFailure(stage: AnalysisStage, error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  const messages = stage === 'document' ? documentMessages : providerMessages;
  if (stage !== 'storage' && typeof code === 'string' && Object.hasOwn(messages, code)) {
    return { stage, code, message: `[${stage}/${code}] ${messages[code]}` };
  }
  const fallback = {
    storage: [
      'ORIGINAL_UNAVAILABLE',
      'The server could not retrieve your saved original. Try opening the document; ask the administrator to check Cloudinary access if it also fails.',
    ],
    document: [
      'DOCUMENT_FAILED',
      'The server could not prepare this document. Try exporting it again or request a human review.',
    ],
    vision: ['VISION_FAILED', 'The image-reading step failed. Retry or request a human review.'],
    classification: [
      'CLASSIFICATION_FAILED',
      'The study check failed or returned an invalid result. Retry or request a human review.',
    ],
  }[stage];
  return { stage, code: fallback[0], message: `[${stage}/${fallback[0]}] ${fallback[1]}` };
}
