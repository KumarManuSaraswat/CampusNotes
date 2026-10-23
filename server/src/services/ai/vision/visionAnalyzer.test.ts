import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createVisionAnalyzer,
  extractVisualText,
  VisionError,
  type VisionAnalyzerOptions,
  type VisionInput,
} from './visionAnalyzer.js';
import { createGeminiVisionClient, type GeminiVisionClient } from './geminiVisionClient.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=',
  'base64',
);
const jpeg = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');
const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF');
const env = { GEMINI_API_KEY: 'unit-test-key', GEMINI_MODEL: 'test-model' } as NodeJS.ProcessEnv;
const input = (bytes = png, mimeType: VisionInput['mimeType'] = 'image/png'): VisionInput => ({
  bytes,
  mimeType,
});
const clientWith = (response: unknown): GeminiVisionClient => ({
  generate: vi.fn().mockResolvedValue(response),
});
const runOptions = (
  client: GeminiVisionClient,
  overrides: Partial<VisionAnalyzerOptions> = {},
): VisionAnalyzerOptions => ({ env, client, retryDelayMs: 0, ...overrides });

beforeEach(() => vi.clearAllMocks());

describe('extractVisualText', () => {
  it('transcribes JPEG input', async () => {
    const result = await extractVisualText(input(jpeg, 'image/jpeg'), {
      ...runOptions(clientWith({ text: 'Java classes and objects' })),
    });
    expect(result).toEqual({ text: 'Java classes and objects', warnings: [] });
  });

  it('transcribes PNG input and preserves visible headings', async () => {
    const result = await extractVisualText(input(), {
      ...runOptions(clientWith({ text: '## Normalization  \r\n\r\nFirst normal form' })),
    });
    expect(result.text).toBe('## Normalization\n\nFirst normal form');
  });

  it('sends a scanned PDF as inline PDF data', async () => {
    const client = clientWith({ text: '[Page 1]\nSELECT * FROM students;' });
    const result = await extractVisualText(input(pdf, 'application/pdf'), runOptions(client));
    expect(result.text).toBe('[Page 1]\nSELECT * FROM students;');
    expect(client.generate).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'application/pdf', model: 'test-model' }),
    );
  });

  it('normalizes surrounding whitespace without flattening meaningful lines', async () => {
    const result = await extractVisualText(input(), {
      ...runOptions(clientWith({ text: '\n  Heading  \n\n  Detail  \n\n\n' })),
    });
    expect(result.text).toBe('Heading\n\n  Detail');
  });

  it('marks partially unreadable content', async () => {
    const result = await extractVisualText(input(), {
      ...runOptions(
        clientWith({ text: 'Encapsulation combines data and [unreadable] in a class.' }),
      ),
    });
    expect(result.warnings).toContain('Some content could not be read clearly.');
    expect(result.text).toContain('[unreadable]');
  });

  it('returns null and a warning for a blank page', async () => {
    const result = await extractVisualText(input(), runOptions(clientWith({ text: ' \n ' })));
    expect(result).toEqual({ text: null, warnings: ['No readable text could be extracted.'] });
  });

  it('rejects an empty buffer', async () => {
    await expect(
      extractVisualText(input(Buffer.alloc(0)), runOptions(clientWith({ text: 'x' }))),
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  it('rejects an unsupported MIME type', async () => {
    await expect(
      extractVisualText(
        { bytes: png, mimeType: 'image/gif' as VisionInput['mimeType'] },
        runOptions(clientWith({ text: 'x' })),
      ),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_MIME' });
  });

  it('rejects content that does not match the declared MIME type', async () => {
    await expect(
      extractVisualText(input(jpeg, 'image/png'), runOptions(clientWith({ text: 'x' }))),
    ).rejects.toMatchObject({ code: 'MIME_MISMATCH' });
  });

  it('rejects oversized input before calling Gemini', async () => {
    const client = clientWith({ text: 'x' });
    await expect(
      extractVisualText(input(png), runOptions(client, { maxBytes: png.length - 1 })),
    ).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
    expect(client.generate).not.toHaveBeenCalled();
  });

  it('rejects a PDF with a missing end marker', async () => {
    await expect(
      extractVisualText(
        input(Buffer.from('%PDF-1.7 this is not complete'), 'application/pdf'),
        runOptions(clientWith({ text: 'x' })),
      ),
    ).rejects.toMatchObject({ code: 'MALFORMED_DOCUMENT' });
  });

  it('normalizes an empty provider response as no readable text', async () => {
    await expect(extractVisualText(input(), runOptions(clientWith({ text: '' })))).resolves.toEqual(
      {
        text: null,
        warnings: ['No readable text could be extracted.'],
      },
    );
  });

  it('rejects a malformed provider response', async () => {
    await expect(
      extractVisualText(input(), runOptions(clientWith({ candidates: 'bad' }))),
    ).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    });
  });

  it('requires API key configuration', async () => {
    await expect(
      extractVisualText(
        input(),
        runOptions(clientWith({ text: 'x' }), { env: { GEMINI_MODEL: 'test-model' } }),
      ),
    ).rejects.toMatchObject({ code: 'CONFIG_MISSING' });
  });

  it('requires model configuration', async () => {
    await expect(
      extractVisualText(
        input(),
        runOptions(clientWith({ text: 'x' }), { env: { GEMINI_API_KEY: 'test-key' } }),
      ),
    ).rejects.toMatchObject({ code: 'CONFIG_MISSING' });
  });

  it('classifies rate limiting and retries once', async () => {
    const client: GeminiVisionClient = {
      generate: vi
        .fn()
        .mockRejectedValueOnce({ status: 429 })
        .mockResolvedValueOnce({ text: 'receipt: apples, milk' }),
    };
    const result = await extractVisualText(input(), runOptions(client));
    expect(result.text).toBe('receipt: apples, milk');
    expect(client.generate).toHaveBeenCalledTimes(2);
  });

  it('marks a provider timeout as retryable and stops after one retry', async () => {
    const client: GeminiVisionClient = {
      generate: vi.fn().mockImplementation(() => new Promise(() => {})),
    };
    await expect(
      extractVisualText(input(), runOptions(client, { timeoutMs: 5 })),
    ).rejects.toMatchObject({ code: 'TIMEOUT', retryable: true });
    expect(client.generate).toHaveBeenCalledTimes(2);
  });

  it('retries a temporary provider failure and returns the eventual result', async () => {
    const client: GeminiVisionClient = {
      generate: vi
        .fn()
        .mockRejectedValueOnce({ status: 503 })
        .mockResolvedValueOnce({ text: 'temporary provider recovered' }),
    };
    await expect(extractVisualText(input(), runOptions(client))).resolves.toMatchObject({
      text: 'temporary provider recovered',
    });
    expect(client.generate).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-retryable provider error', async () => {
    const client: GeminiVisionClient = { generate: vi.fn().mockRejectedValue({ status: 400 }) };
    await expect(extractVisualText(input(), runOptions(client))).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
      retryable: false,
    });
    expect(client.generate).toHaveBeenCalledTimes(1);
  });

  it('maps provider authentication failures without retrying', async () => {
    const client: GeminiVisionClient = {
      generate: vi.fn().mockRejectedValue({ status: 400, message: 'API key not valid' }),
    };
    await expect(extractVisualText(input(), runOptions(client))).rejects.toMatchObject({
      code: 'PROVIDER_AUTH',
      retryable: false,
    });
    expect(client.generate).toHaveBeenCalledTimes(1);
  });

  it('maps invalid or unavailable model responses', async () => {
    const client: GeminiVisionClient = { generate: vi.fn().mockRejectedValue({ status: 404 }) };
    await expect(extractVisualText(input(), runOptions(client))).rejects.toMatchObject({
      code: 'MODEL_UNAVAILABLE',
      retryable: false,
    });
  });

  it('transcribes non-academic content without making a relevance decision', async () => {
    const result = await extractVisualText(input(), {
      ...runOptions(clientWith({ text: 'Corner shop receipt: tea, bread, and apples.' })),
    });
    expect(result.text).toBe('Corner shop receipt: tea, bread, and apples.');
    expect(Object.keys(result).sort()).toEqual(['text', 'warnings']);
  });

  it('adapts the bytes module to the existing VisionAnalyzer contract without persistence', async () => {
    const loadDocument = vi.fn().mockResolvedValue(png);
    const analyzer = createVisionAnalyzer(loadDocument, runOptions(clientWith({ text: 'Line 1' })));
    const result = await analyzer.analyze({
      noteId: 'n1',
      storagePublicId: 'asset',
      storageProvider: 'cloudinary',
      fileType: 'image/png',
      requestedBy: 'u1',
    });
    expect(result).toEqual({ text: 'Line 1', status: 'completed', error: null, warnings: [] });
    expect(result.warnings).toEqual([]);
    expect(loadDocument).toHaveBeenCalledTimes(1);
  });

  it('maps analyzer failures to the frozen failed extraction contract', async () => {
    const analyzer = createVisionAnalyzer(vi.fn().mockResolvedValue(png), {
      ...runOptions(clientWith({ text: 'x' })),
      env: {},
    });
    await expect(
      analyzer.analyze({
        noteId: 'n1',
        storagePublicId: 'asset',
        storageProvider: 'cloudinary',
        fileType: 'image/png',
        requestedBy: 'u1',
      }),
    ).resolves.toMatchObject({ text: null, status: 'failed', error: 'CONFIG_MISSING' });
  });

  it('does not expose document-loader errors through the contract adapter', async () => {
    const analyzer = createVisionAnalyzer(
      vi.fn().mockRejectedValue(new Error('private storage token')),
      runOptions(clientWith({ text: 'x' })),
    );
    const result = await analyzer.analyze({
      noteId: 'n1',
      storagePublicId: 'asset',
      storageProvider: 'cloudinary',
      fileType: 'image/png',
      requestedBy: 'u1',
    });
    expect(result.error).toBe('SOURCE_UNAVAILABLE');
    expect(result.error).not.toContain('token');
  });

  it('uses the official SDK request shape and injectable SDK loader', async () => {
    const generateContent = vi.fn().mockResolvedValue({ text: 'hello' });
    class FakeGoogleGenAI {
      models = { generateContent };
      constructor(public options: unknown) {}
    }
    const client = createGeminiVisionClient({
      apiKey: 'secret-for-test',
      timeoutMs: 10_000,
      sdkLoader: async () => ({ GoogleGenAI: FakeGoogleGenAI }),
    });
    await client.generate({
      model: 'configured-model',
      mimeType: 'image/png',
      base64Data: png.toString('base64'),
      systemInstruction: 'Transcribe only.',
      timeoutMs: 10_000,
    });
    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'configured-model',
        contents: [
          'Transcribe only.',
          { inlineData: { data: png.toString('base64'), mimeType: 'image/png' } },
        ],
      }),
    );
  });

  it('maps an unavailable SDK to a safe prerequisite error', async () => {
    const client = createGeminiVisionClient({
      apiKey: 'test',
      timeoutMs: 1000,
      sdkLoader: async () => {
        throw new Error('GEMINI_SDK_MISSING');
      },
    });
    await expect(extractVisualText(input(), runOptions(client))).rejects.toMatchObject({
      code: 'SDK_MISSING',
      message: expect.not.stringContaining('test'),
    });
  });

  it('marks output token-limit termination as incomplete', async () => {
    const result = await extractVisualText(input(), {
      ...runOptions(
        clientWith({
          text: 'partial transcription',
          candidates: [{ finishReason: 'MAX_TOKENS' }],
        }),
      ),
    });
    expect(result.warnings).toContain(
      'Transcription may be incomplete because the model output reached its limit.',
    );
  });

  it('does not expose provider error text or request credentials', async () => {
    const client: GeminiVisionClient = {
      generate: vi.fn().mockRejectedValue(new Error('secret-for-test invalid model; key=private')),
    };
    let caught: unknown;
    try {
      await extractVisualText(input(), runOptions(client));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(VisionError);
    expect((caught as Error).message).not.toContain('private');
  });
});
