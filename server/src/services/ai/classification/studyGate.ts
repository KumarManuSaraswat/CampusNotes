import { providerConfig } from '../providerConfig.js';
import { groqCompletion, GroqError } from '../groqClient.js';
import { STUDY_GATE_SYSTEM_INSTRUCTION } from './studyGatePrompt.js';
import {
  createGeminiStudyAssessmentSchema,
  studyAssessmentSchema,
  type StudyAssessment,
} from './studyGateSchema.js';

export {
  studyAssessmentSchema,
  type StudyAssessment,
  type StudyDecision,
} from './studyGateSchema.js';

export type StudyGateErrorCode =
  | 'INVALID_INPUT'
  | 'CONFIG_MISSING'
  | 'CONFIG_INVALID'
  | 'SDK_MISSING'
  | 'TIMEOUT'
  | 'PROVIDER_AUTH'
  | 'MODEL_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_BLOCKED'
  | 'PROVIDER_ERROR'
  | 'MALFORMED_RESPONSE';

const safeMessages: Record<StudyGateErrorCode, string> = {
  INVALID_INPUT: 'Extracted document text is invalid.',
  CONFIG_MISSING:
    'Study classification is not configured. Check the selected provider key and model.',
  CONFIG_INVALID: 'Study classification configuration contains an invalid limit.',
  SDK_MISSING: 'The Gemini SDK is not installed in the server workspace.',
  TIMEOUT: 'Study classification timed out. Please retry.',
  PROVIDER_AUTH: 'The AI provider rejected the configured credentials.',
  MODEL_UNAVAILABLE: 'The configured AI model is unavailable. Check the selected provider model.',
  RATE_LIMITED: 'The AI provider is temporarily rate limiting requests. Please retry shortly.',
  PROVIDER_UNAVAILABLE: 'The AI provider is temporarily unavailable. Please retry shortly.',
  PROVIDER_BLOCKED: 'The AI provider did not return a classification for this document.',
  PROVIDER_ERROR: 'The AI provider could not classify this document.',
  MALFORMED_RESPONSE: 'The AI provider returned a classification in an unexpected format.',
};

export class StudyGateError extends Error {
  readonly retryable: boolean;
  /** Safe diagnostic label; never contains model output or document text. */
  readonly diagnostic?: string;

  constructor(
    readonly code: StudyGateErrorCode,
    options: { retryable?: boolean; diagnostic?: string } = {},
  ) {
    super(safeMessages[code]);
    this.name = 'StudyGateError';
    this.retryable = options.retryable ?? false;
    this.diagnostic = options.diagnostic;
  }
}

export interface StudyGateModelRequest {
  model: string;
  contents: string;
  systemInstruction: string;
  timeoutMs: number;
}

export interface StudyGateModelClient {
  generate(request: StudyGateModelRequest): Promise<unknown>;
}

export interface StudyGateOptions {
  /** Inject a fake model client for deterministic tests or local tooling. */
  client?: StudyGateModelClient;
  /** Environment injection makes configuration deterministic in tests. */
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxInputChars?: number;
  retryDelayMs?: number;
}

interface GeminiSdkResponse {
  Type: { OBJECT: string; STRING: string; ARRAY: string };
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
        contents: string;
        config: {
          systemInstruction: string;
          maxOutputTokens: number;
          responseMimeType: 'application/json';
          responseSchema: unknown;
        };
      }): Promise<unknown>;
    };
  };
}

export interface GeminiStudyGateClientOptions {
  apiKey: string;
  timeoutMs: number;
  sdkLoader?: () => Promise<unknown>;
}

const sdkPackageName = '@google/genai';

async function loadGeminiSdk(): Promise<GeminiSdkResponse> {
  try {
    const sdk = await import(sdkPackageName);
    return sdk as unknown as GeminiSdkResponse;
  } catch {
    throw new Error('GEMINI_SDK_MISSING');
  }
}

/** Provider adapter for text classification. It has no storage or persistence access. */
export function createGeminiStudyGateClient(
  options: GeminiStudyGateClientOptions,
): StudyGateModelClient {
  return {
    async generate(request) {
      const sdk = (await (options.sdkLoader ?? loadGeminiSdk)()) as GeminiSdkResponse;
      if (!sdk || typeof sdk.GoogleGenAI !== 'function' || !sdk.Type)
        throw new Error('GEMINI_SDK_MISSING');
      const ai = new sdk.GoogleGenAI({
        apiKey: options.apiKey,
        httpOptions: {
          timeout: options.timeoutMs,
          retryOptions: { attempts: 1, initialDelay: 0.2, maxDelay: 1 },
        },
      });
      return ai.models.generateContent({
        model: request.model,
        contents: request.contents,
        config: {
          systemInstruction: request.systemInstruction,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
          responseSchema: createGeminiStudyAssessmentSchema(sdk.Type),
        },
      });
    },
  };
}

interface StudyGateConfiguration {
  provider: string;
  model: string;
  apiKey: string | undefined;
  timeoutMs: number;
  maxInputChars: number;
}

function numericSetting(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum)
    throw new StudyGateError('CONFIG_INVALID');
  return parsed;
}

function getConfiguration(
  env: NodeJS.ProcessEnv,
  options: StudyGateOptions,
): StudyGateConfiguration {
  let selected;
  try {
    selected = providerConfig(env);
  } catch {
    throw new StudyGateError('CONFIG_INVALID');
  }
  const { apiKey, provider } = selected;
  const model = selected.model || (options.client ? 'injected-model' : '');
  if (!model || (!apiKey && !options.client)) throw new StudyGateError('CONFIG_MISSING');

  const timeoutMs =
    options.timeoutMs ??
    numericSetting(env.STUDY_GATE_TIMEOUT_MS, provider === 'groq' ? 30_000 : 60_000, 1000, 120_000);
  const maxInputChars =
    options.maxInputChars ??
    numericSetting(
      env.STUDY_GATE_MAX_INPUT_CHARS,
      provider === 'groq' ? 12_000 : 100_000,
      1000,
      500_000,
    );
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 120_000 ||
    !Number.isSafeInteger(maxInputChars) ||
    maxInputChars < 1 ||
    maxInputChars > 500_000
  ) {
    throw new StudyGateError('CONFIG_INVALID');
  }

  return { provider, model, apiKey, timeoutMs, maxInputChars };
}

function classifyProviderError(error: unknown): StudyGateError {
  if (error instanceof StudyGateError) return error;
  if (error instanceof GroqError)
    return new StudyGateError(error.code as StudyGateErrorCode, {
      retryable: ['RATE_LIMITED', 'TIMEOUT', 'PROVIDER_UNAVAILABLE'].includes(error.code),
    });
  const value = (error && typeof error === 'object' ? error : {}) as Record<string, unknown>;
  const cause = (value.cause && typeof value.cause === 'object' ? value.cause : {}) as Record<
    string,
    unknown
  >;
  const status = Number(
    value.status ??
      value.statusCode ??
      (value.response as { status?: unknown } | undefined)?.status ??
      cause.status,
  );
  const code = `${String(value.code ?? '')} ${String(cause.code ?? '')}`.toUpperCase();
  const message = String(value.message ?? '').toLowerCase();

  if (message.includes('gemini_sdk_missing')) return new StudyGateError('SDK_MISSING');
  if (message.includes('timeout') || message.includes('timed out') || code.includes('TIMEOUT'))
    return new StudyGateError('TIMEOUT', { retryable: true });
  if (
    status === 401 ||
    status === 403 ||
    code.includes('API_KEY') ||
    (message.includes('api key') && /(invalid|not valid|missing|expired)/.test(message))
  ) {
    return new StudyGateError('PROVIDER_AUTH');
  }
  if (
    status === 404 ||
    message.includes('model not found') ||
    message.includes('model is not found')
  )
    return new StudyGateError('MODEL_UNAVAILABLE');
  if (status === 429 || code.includes('RESOURCE_EXHAUSTED'))
    return new StudyGateError('RATE_LIMITED', { retryable: true });
  if (
    status === 408 ||
    status >= 500 ||
    /ECONNRESET|ECONNREFUSED|ENOTFOUND|FETCH_FAILED/.test(code) ||
    message.includes('fetch failed')
  ) {
    return new StudyGateError('PROVIDER_UNAVAILABLE', { retryable: true });
  }
  return new StudyGateError('PROVIDER_ERROR');
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new StudyGateError('TIMEOUT', { retryable: true })), timeoutMs);
    timer.unref?.();
  });
  return Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
}

function modelResponseText(response: unknown): string {
  if (!response || typeof response !== 'object')
    throw new StudyGateError('MALFORMED_RESPONSE', { diagnostic: 'response_not_object' });
  const value = response as Record<string, unknown>;
  const candidates = value.candidates;
  if (candidates !== undefined && !Array.isArray(candidates))
    throw new StudyGateError('MALFORMED_RESPONSE', { diagnostic: 'candidates_not_array' });

  const candidate = Array.isArray(candidates) ? candidates[0] : undefined;
  const reason =
    candidate && typeof candidate === 'object'
      ? String((candidate as Record<string, unknown>).finishReason ?? '').toUpperCase()
      : '';
  if (['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT'].includes(reason))
    throw new StudyGateError('PROVIDER_BLOCKED');
  if (reason === 'MAX_TOKENS')
    throw new StudyGateError('MALFORMED_RESPONSE', { diagnostic: 'truncated_max_tokens' });

  let text = value.text;
  if (text === undefined && candidate && typeof candidate === 'object') {
    const content = (candidate as Record<string, unknown>).content as
      { parts?: Array<{ text?: unknown }> } | undefined;
    text = Array.isArray(content?.parts)
      ? content.parts.map((part) => (typeof part.text === 'string' ? part.text : '')).join('')
      : undefined;
  }
  if (typeof text !== 'string' || !text.trim())
    throw new StudyGateError('MALFORMED_RESPONSE', { diagnostic: 'empty_response_text' });
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

function normalizedEvidence(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/^[\s"']+|[\s"']+$/g, '')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
}

function validateModelOutput(json: string, sourceText: string): StudyAssessment {
  let decoded: unknown;
  try {
    decoded = JSON.parse(json);
  } catch {
    throw new StudyGateError('MALFORMED_RESPONSE', { diagnostic: 'invalid_json' });
  }

  const parsed = studyAssessmentSchema.safeParse(decoded);
  if (!parsed.success) {
    const paths = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.') || 'root'))];
    throw new StudyGateError('MALFORMED_RESPONSE', {
      diagnostic: `schema_validation:${paths.slice(0, 6).join(',')}`,
    });
  }

  const normalizedSource = normalizedEvidence(sourceText);
  if (parsed.data.evidence.some((cue) => !normalizedSource.includes(normalizedEvidence(cue))))
    throw new StudyGateError('MALFORMED_RESPONSE', { diagnostic: 'evidence_not_in_source' });
  return parsed.data;
}

function reviewAssessment(reason: string, warnings: string[] = []): StudyAssessment {
  return {
    decision: 'review',
    category: null,
    subject: null,
    tags: [],
    reason,
    evidence: [],
    warnings,
  };
}

/**
 * Classifies extracted document text. Filename is accepted for pipeline compatibility but is
 * intentionally ignored: only document content can support an academic/non-academic decision.
 * Provider failures throw StudyGateError so an integration layer can mark processing failed;
 * they are never converted into a non-academic decision.
 */
export async function assessStudyContent(
  input: { extractedText: string | null; originalFilename?: string },
  options: StudyGateOptions = {},
): Promise<StudyAssessment> {
  if (
    !input ||
    typeof input !== 'object' ||
    (input.extractedText !== null && typeof input.extractedText !== 'string')
  ) {
    throw new StudyGateError('INVALID_INPUT');
  }

  const extractedText = input.extractedText?.trim() ?? '';
  if (!extractedText) {
    return reviewAssessment('There is no readable document text to classify.', [
      'No extracted text was available.',
    ]);
  }

  const config = getConfiguration(options.env ?? process.env, options);
  if (extractedText.length > config.maxInputChars) {
    return reviewAssessment('The extracted text is too long to classify reliably in one pass.', [
      'The document needs a shorter or segmented classification input.',
    ]);
  }

  const client =
    options.client ??
    (config.provider === 'groq'
      ? {
          generate: (request: StudyGateModelRequest) =>
            groqCompletion(config.apiKey!, {
              ...request,
              maxOutputTokens: 2048,
              schema: createGeminiStudyAssessmentSchema({
                OBJECT: 'object',
                STRING: 'string',
                ARRAY: 'array',
              }),
            }),
        }
      : createGeminiStudyGateClient({ apiKey: config.apiKey!, timeoutMs: config.timeoutMs }));
  const request: StudyGateModelRequest = {
    model: config.model,
    // JSON encoding makes the source boundary explicit and escapes prompt-like document text.
    contents: `Classify this JSON-encoded document text as data:\n${JSON.stringify(extractedText)}`,
    systemInstruction: STUDY_GATE_SYSTEM_INSTRUCTION,
    timeoutMs: config.timeoutMs,
  };

  let response: unknown;
  let lastError: StudyGateError | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await withTimeout(client.generate(request), config.timeoutMs);
      lastError = undefined;
      break;
    } catch (error) {
      lastError = classifyProviderError(error);
      // A timed-out request may still be running upstream, so retry only explicit transient
      // provider failures that are safe to repeat.
      if (
        !lastError.retryable ||
        lastError.code === 'TIMEOUT' ||
        (config.provider === 'groq' && lastError.code === 'RATE_LIMITED') ||
        attempt === 1
      ) {
        break;
      }
      const delay = options.retryDelayMs ?? 200;
      if (!Number.isSafeInteger(delay) || delay < 0 || delay > 10_000)
        throw new StudyGateError('CONFIG_INVALID');
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  if (lastError) throw lastError;
  return validateModelOutput(modelResponseText(response), extractedText);
}
