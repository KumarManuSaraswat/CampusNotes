import { groqCompletion, GroqError } from '../groqClient.js';
import type { GeminiVisionClient } from './geminiVisionClient.js';
import { renderPdfImages } from './renderPdfImages.js';

export function createGroqVisionClient(options: { apiKey: string }): GeminiVisionClient {
  return {
    async generate(request) {
      const started = Date.now();
      const images =
        request.mimeType === 'application/pdf'
          ? await renderPdfImages(
              Buffer.from(request.base64Data, 'base64'),
              Math.min(12_000, request.timeoutMs),
            )
          : [`data:${request.mimeType};base64,${request.base64Data}`];
      const remaining = request.timeoutMs - (Date.now() - started);
      if (remaining <= 0) throw new GroqError('TIMEOUT');
      return groqCompletion(options.apiKey, {
        model: request.model,
        systemInstruction: request.systemInstruction,
        contents:
          'Transcribe every supplied page in order. Label them [Page 1], [Page 2], etc. Mark any unreadable content [unreadable].',
        images,
        timeoutMs: remaining,
        maxOutputTokens: images.length === 3 ? 1536 : 3072,
      });
    },
  };
}
