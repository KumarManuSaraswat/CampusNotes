import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadImage, createCanvas } from '@napi-rs/canvas';
import { testPdf } from '../document/testPdf.js';
import { renderPdfImages } from './renderPdfImages.js';
import { extractVisualText } from './visionAnalyzer.js';

afterEach(() => vi.unstubAllGlobals());
describe('bounded Groq PDF rendering', () => {
  it('renders all pages in order to real PNGs without modifying the original', async () => {
    const bytes = testPdf([
      { text: 'Page one: algebra', image: true },
      { text: 'Page two: matrices' },
    ]);
    const copy = Buffer.from(bytes);
    const images = await renderPdfImages(bytes);
    expect(images).toHaveLength(2);
    expect(images[0]).not.toBe(images[1]);
    for (const url of images) {
      expect(url).toMatch(/^data:image\/png;base64,/);
      const image = await loadImage(Buffer.from(url.split(',')[1], 'base64'));
      expect(image.width).toBe(1224);
      expect(image.height).toBe(1584);
      const canvas = createCanvas(image.width, image.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
      expect(pixels.some((value, i) => i % 4 !== 3 && value < 200)).toBe(true);
    }
    expect(bytes.equals(copy)).toBe(true);
  });

  it('sends rendered PDF pages through the actual Groq adapter', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '[Page 1] Algebra' }, finish_reason: 'stop' }],
          }),
        ),
      );
    vi.stubGlobal('fetch', fetcher);
    const result = await extractVisualText(
      { bytes: testPdf([{ image: true }]), mimeType: 'application/pdf' },
      {
        env: { AI_PROVIDER: 'groq', GROQ_API_KEY: 'fake' },
      },
    );
    expect(result).toEqual({ text: '[Page 1] Algebra', warnings: [] });
    expect(JSON.parse(fetcher.mock.calls[0][1].body).messages[1].content[1].image_url.url).toMatch(
      /^data:image\/png;base64,/,
    );
  });

  it('rejects oversized page counts before calling Groq, never classifying a subset', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(
      extractVisualText(
        {
          bytes: testPdf(Array.from({ length: 4 }, () => ({ image: true }))),
          mimeType: 'application/pdf',
        },
        {
          env: { AI_PROVIDER: 'groq', GROQ_API_KEY: 'fake' },
        },
      ),
    ).rejects.toMatchObject({ code: 'PAGE_LIMIT' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects damaged or locked PDFs with safe errors', async () => {
    await expect(renderPdfImages(Buffer.from('%PDF-1.7 bad %%EOF'))).rejects.toMatchObject({
      code: 'PARSER_FAILED',
    });
    await expect(renderPdfImages(testPdf([{ text: 'secret' }], true))).rejects.toMatchObject({
      code: 'PASSWORD_REQUIRED',
    });
  });

  it('terminates rendering on timeout', async () => {
    await expect(renderPdfImages(testPdf([{ image: true }]), 1)).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });
});
