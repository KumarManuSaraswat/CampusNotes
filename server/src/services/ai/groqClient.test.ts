import { afterEach, describe, expect, it, vi } from 'vitest';
import { providerConfig } from './providerConfig.js';
import { groqCompletion, jsonSchema } from './groqClient.js';
import { assessStudyContent } from './classification/studyGate.js';
import { extractVisualText } from './vision/visionAnalyzer.js';
import { suggestMetadata } from './suggestMetadata.js';
import { suggestSummary } from './suggestSummary.js';
import { suggestPageOrder } from './suggestPageOrder.js';

const env = { AI_PROVIDER: 'groq', GROQ_API_KEY: 'test-only-groq-key' };
const source = 'SQL joins connect relational tables using an INNER JOIN.';
const academic = {
  decision: 'academic' as const,
  category: 'Computer Science' as const,
  subject: 'Databases',
  tags: ['SQL'],
  reason: 'The source explains SQL joins.',
  evidence: ['SQL joins'],
  warnings: [],
};
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=',
  'base64',
);
const request = {
  model: 'openai/gpt-oss-20b',
  systemInstruction: 'Return JSON.',
  contents: 'Test',
  timeoutMs: 1000,
  maxOutputTokens: 2048,
};
function mockResponse(content: unknown, finish = 'stop') {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        choices: [
          {
            message: { content: typeof content === 'string' ? content : JSON.stringify(content) },
            finish_reason: finish,
          },
        ],
      }),
    ),
  );
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Groq provider integration', () => {
  it('selects Groq without any Gemini key; keeps legacy selection and rejects unknown providers', () => {
    expect(providerConfig(env)).toMatchObject({ provider: 'groq', model: 'openai/gpt-oss-20b' });
    expect(providerConfig(env, true).model).toBe('qwen/qwen3.8-27b');
    expect(providerConfig({ GEMINI_MODEL: 'legacy' }).model).toBe('legacy');
    expect(() => providerConfig({ AI_PROVIDER: 'typo' })).toThrow();
    expect(providerConfig({ ...env, GROQ_MODEL: 'custom-model' }).model).toBe('custom-model');
  });

  it('sends structured classification only to Groq and preserves evidence validation', async () => {
    const fetcher = mockResponse(academic);
    expect(await assessStudyContent({ extractedText: source }, { env })).toEqual(academic);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer test-only-groq-key');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('openai/gpt-oss-20b');
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.schema.additionalProperties).toBe(false);
    expect(body.messages[1].content).toContain(JSON.stringify(source));
    mockResponse({ ...academic, evidence: ['fabricated evidence'] });
    await expect(assessStudyContent({ extractedText: source }, { env })).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    });
  });

  it('does not silently truncate long documents or use the Gemini key when Groq is missing', async () => {
    const fetcher = mockResponse(academic);
    expect((await assessStudyContent({ extractedText: 'x'.repeat(12001) }, { env })).decision).toBe(
      'review',
    );
    await expect(
      assessStudyContent(
        { extractedText: source },
        {
          env: { AI_PROVIDER: 'groq', GEMINI_API_KEY: 'must-not-use-this' },
        },
      ),
    ).rejects.toMatchObject({ code: 'CONFIG_MISSING' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'PROVIDER_AUTH'],
    [403, 'PROVIDER_AUTH'],
    [404, 'MODEL_UNAVAILABLE'],
    [429, 'RATE_LIMITED'],
    [503, 'PROVIDER_UNAVAILABLE'],
  ])('maps HTTP %s to %s without exposing raw provider errors', async (status, code) => {
    const fetcher = vi
      .fn()
      .mockImplementation(
        async () => new Response('private-source secret-key', { status: Number(status) }),
      );
    vi.stubGlobal('fetch', fetcher);
    const error = await assessStudyContent(
      { extractedText: source },
      { env, retryDelayMs: 0 },
    ).catch((e: Error) => e);
    expect(error).toMatchObject({ code });
    expect(String(error)).not.toMatch(/private-source|secret-key/);
    expect(fetcher).toHaveBeenCalledTimes(status === 503 ? 2 : 1);
  });

  it('aborts a hung fetch without retrying', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal!.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const pending = groqCompletion('fake', request, fetcher);
    const assertion = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed and truncated classifications', async () => {
    mockResponse('not json');
    await expect(assessStudyContent({ extractedText: source }, { env })).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    });
    mockResponse(academic, 'length');
    await expect(assessStudyContent({ extractedText: source }, { env })).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    });
  });

  it('sends image bytes to the vision model and flags incomplete transcription', async () => {
    const fetcher = mockResponse('[Page 1] SQL joins [unreadable]', 'length');
    const result = await extractVisualText({ bytes: png, mimeType: 'image/png' }, { env });
    expect(result.warnings).toHaveLength(2);
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.model).toBe('qwen/qwen3.8-27b');
    expect(body.messages[1].content[1].image_url.url).toBe(
      `data:image/png;base64,${png.toString('base64')}`,
    );
    expect(body.reasoning_effort).toBe('none');
  });

  it('does not retry vision quota failures', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 429 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(
      extractVisualText({ bytes: png, mimeType: 'image/png' }, { env }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('converts nullable enums and nested schemas without losing allowed values', () => {
    expect(jsonSchema({ type: 'STRING', nullable: true, enum: ['Arts'] })).toEqual({
      anyOf: [{ type: 'string', enum: ['Arts'] }, { type: 'null' }],
    });
    expect(
      jsonSchema({
        type: 'ARRAY',
        items: { type: 'OBJECT', properties: { x: { type: 'STRING' } }, required: ['x'] },
      }),
    ).toMatchObject({ items: { additionalProperties: false } });
  });

  it('uses Groq for metadata and retains protected-field rules', async () => {
    mockResponse({
      title: 'SQL notes',
      subject: 'Databases',
      topics: ['SQL'],
      keywords: ['join'],
      documentType: 'notes',
      description: 'A lesson on SQL joins.',
      uncertaintyNotes: [],
    });
    expect(await suggestMetadata(source, academic, env)).toMatchObject({
      title: 'SQL notes',
      instructor: null,
      lectureDate: null,
    });
  });

  it('uses Groq for summaries and page ordering, still rejecting ungrounded output', async () => {
    const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
    const assets = ids.map((id) => ({ id, extractedText: source }));
    const bullets = Array.from({ length: 3 }, () => ({
      text: 'SQL joins connect tables.',
      sourceAssetId: ids[0],
      excerpt: 'SQL joins',
    }));
    mockResponse({ bullets });
    expect(await suggestSummary(assets, env)).toHaveLength(3);
    mockResponse({ bullets: bullets.map((b) => ({ ...b, excerpt: 'invented fact' })) });
    await expect(suggestSummary(assets, env)).rejects.toThrow('SUMMARY_UNGROUNDED');
    const order = {
      orderedAssetIds: ids,
      reasons: ids.map((assetId) => ({
        assetId,
        reason: 'SQL joins are discussed.',
        evidence: 'SQL joins',
      })),
      uncertainAssetIds: ids,
    };
    mockResponse(order);
    expect(await suggestPageOrder(assets, env)).toEqual(order);
    mockResponse({ ...order, orderedAssetIds: [ids[0], ids[0]] });
    await expect(suggestPageOrder(assets, env)).rejects.toThrow('ORDER_INVALID_IDS');
  });
});
