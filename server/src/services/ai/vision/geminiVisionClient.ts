import type { VisionMimeType } from './visionAnalyzer.js';

/** Provider-neutral request shape used by the analyzer's injected client. */
export interface GeminiVisionRequest {
  model: string;
  mimeType: VisionMimeType;
  base64Data: string;
  systemInstruction: string;
  timeoutMs: number;
}

/** The narrow Gemini capability the document analyzer needs. */
export interface GeminiVisionClient {
  generate(request: GeminiVisionRequest): Promise<unknown>;
}

export interface GeminiVisionClientOptions {
  apiKey: string;
  timeoutMs: number;
  sdkLoader?: () => Promise<unknown>;
}

interface GeminiSdkResponse {
  GoogleGenAI: new (options: {
    apiKey: string;
    httpOptions: {
      timeout: number;
      retryOptions: { attempts: number; initialDelay: number; maxDelay: number };
    };
  }) => {
    models: {
      generateContent(request: {
        model: string;
        contents: Array<string | { inlineData: { data: string; mimeType: string } }>;
        config: { systemInstruction: string; maxOutputTokens: number };
      }): Promise<unknown>;
    };
  };
}

const sdkPackageName = '@google/genai';

async function loadGeminiSdk(): Promise<GeminiSdkResponse> {
  try {
    // Keep the optional SDK lazy-loaded: the rest of CampusNotes can start without AI credentials
    // or the Member 4 dependency installation. The integration owner installs @google/genai.
    const sdk = await import(sdkPackageName);
    return sdk as unknown as GeminiSdkResponse;
  } catch {
    throw new Error('GEMINI_SDK_MISSING');
  }
}

/**
 * Creates the provider adapter. Bytes use Gemini's inlineData/base64 format, including PDFs;
 * this keeps small scanned documents in one request and avoids persisting provider files.
 */
export function createGeminiVisionClient(options: GeminiVisionClientOptions): GeminiVisionClient {
  return {
    async generate(request) {
      const sdk = (await (options.sdkLoader ?? loadGeminiSdk)()) as GeminiSdkResponse;
      if (!sdk || typeof sdk.GoogleGenAI !== 'function') throw new Error('GEMINI_SDK_MISSING');
      const ai = new sdk.GoogleGenAI({
        apiKey: options.apiKey,
        httpOptions: {
          timeout: options.timeoutMs,
          // The analyzer owns the single retry, avoiding stacked SDK + service retries.
          retryOptions: { attempts: 1, initialDelay: 0.2, maxDelay: 1 },
        },
      });
      return ai.models.generateContent({
        model: request.model,
        contents: [
          request.systemInstruction,
          { inlineData: { data: request.base64Data, mimeType: request.mimeType } },
        ],
        config: {
          systemInstruction: request.systemInstruction,
          // MAX_TOKENS is checked by the analyzer and surfaced as an incomplete warning.
          maxOutputTokens: 8192,
        },
      });
    },
  };
}
