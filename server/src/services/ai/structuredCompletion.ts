import { GoogleGenAI, type Schema } from '@google/genai';
import { providerConfig } from './providerConfig.js';
import { groqCompletion, GroqError } from './groqClient.js';

/** Shared provider selection for optional metadata, summary and page-order suggestions. */
export async function structuredCompletion(
  request: {
    contents: string;
    config: {
      systemInstruction: string;
      responseMimeType: string;
      responseSchema: Schema;
      maxOutputTokens: number;
    };
  },
  env: NodeJS.ProcessEnv,
) {
  const config = providerConfig(env);
  if (!config.apiKey || !config.model) throw new GroqError('CONFIG_MISSING');
  if (config.provider === 'groq') {
    // Optional suggestions must not send arbitrarily large groups against a free-tier quota.
    if (request.contents.length > 18_000) throw new GroqError('INPUT_TOO_LONG');
    const result = await groqCompletion(config.apiKey, {
      ...request.config,
      contents: request.contents,
      model: config.model,
      timeoutMs: 15_000,
      schema: request.config.responseSchema as Record<string, unknown>,
      maxOutputTokens: Math.max(2048, request.config.maxOutputTokens),
    });
    if (result.candidates[0].finishReason !== 'STOP') throw new GroqError('MALFORMED_RESPONSE');
    return result;
  }
  const ai = new GoogleGenAI({ apiKey: config.apiKey, httpOptions: { timeout: 15_000 } });
  return ai.models.generateContent({ ...request, model: config.model });
}
