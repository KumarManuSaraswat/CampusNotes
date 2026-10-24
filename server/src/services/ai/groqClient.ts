/** Server-only, fixed-origin transport. Never expose raw provider bodies or credentials. */
export interface GroqRequest {
  model: string;
  systemInstruction: string;
  contents: string;
  timeoutMs: number;
  maxOutputTokens: number;
  schema?: Record<string, unknown>;
  images?: string[];
}

export class GroqError extends Error {
  constructor(
    readonly code: string,
    readonly status?: number,
  ) {
    super(`AI request failed (${code}).`);
    this.name = 'GroqError';
  }
}

/** Reuse the existing schemas, translating Gemini's type/nullable notation to JSON Schema. */
export function jsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const { nullable, ...result } = schema;
  if (typeof result.type === 'string') result.type = result.type.toLowerCase();
  if (result.properties) {
    result.properties = Object.fromEntries(
      Object.entries(result.properties as Record<string, Record<string, unknown>>).map(
        ([key, value]) => [key, jsonSchema(value)],
      ),
    );
    result.additionalProperties = false;
  }
  if (result.items) result.items = jsonSchema(result.items as Record<string, unknown>);
  return nullable ? { anyOf: [result, { type: 'null' }] } : result;
}

export async function groqCompletion(
  apiKey: string,
  request: GroqRequest,
  fetcher: typeof fetch = fetch,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs);
  timer.unref?.();
  try {
    const response = await fetcher('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        messages: [
          { role: 'system', content: request.systemInstruction },
          {
            role: 'user',
            content: request.images?.length
              ? [
                  { type: 'text', text: request.contents },
                  ...request.images.map((url) => ({ type: 'image_url', image_url: { url } })),
                ]
              : request.contents,
          },
        ],
        max_completion_tokens: request.maxOutputTokens,
        ...(request.model.startsWith('openai/gpt-oss-') ? { reasoning_effort: 'low' } : {}),
        ...(request.model.startsWith('qwen/qwen3.8-') ? { reasoning_effort: 'none' } : {}),
        ...(request.schema
          ? {
              response_format: {
                type: 'json_schema',
                json_schema: {
                  name: 'document_result',
                  strict: true,
                  schema: jsonSchema(request.schema),
                },
              },
            }
          : {}),
      }),
    });
    if (!response.ok) {
      // Discard the raw body, which may echo private source text or credentials.
      await response.body?.cancel();
      const code =
        response.status === 429
          ? 'RATE_LIMITED'
          : [401, 403].includes(response.status)
            ? 'PROVIDER_AUTH'
            : response.status === 404
              ? 'MODEL_UNAVAILABLE'
              : response.status >= 500 || response.status === 408
                ? 'PROVIDER_UNAVAILABLE'
                : 'PROVIDER_ERROR';
      throw new GroqError(code, response.status);
    }
    const data = (await response.json()) as {
      choices?: Array<{
        message?: { content?: unknown; refusal?: unknown };
        finish_reason?: string;
      }>;
    };
    const choice = data?.choices?.[0];
    if (choice?.message?.refusal || choice?.finish_reason === 'content_filter')
      throw new GroqError('PROVIDER_BLOCKED');
    if (
      typeof choice?.message?.content !== 'string' ||
      !['stop', 'length'].includes(choice.finish_reason || '')
    )
      throw new GroqError('MALFORMED_RESPONSE');
    // Existing adapters perform schema/evidence checks and fail closed on truncation.
    return {
      text: choice.message.content,
      candidates: [{ finishReason: choice.finish_reason === 'length' ? 'MAX_TOKENS' : 'STOP' }],
    };
  } catch (error) {
    if (error instanceof GroqError) throw error;
    if (controller.signal.aborted) throw new GroqError('TIMEOUT');
    if (error instanceof SyntaxError) throw new GroqError('MALFORMED_RESPONSE');
    throw new GroqError('PROVIDER_UNAVAILABLE');
  } finally {
    clearTimeout(timer);
  }
}
