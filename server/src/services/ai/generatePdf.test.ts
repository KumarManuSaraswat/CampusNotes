import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { combineImagePages } from './generatePdf.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=',
  'base64',
);

describe('combined PDF', () => {
  it('contains one uncropped page per confirmed image', async () => {
    const bytes = await combineImagePages([
      { mimeType: 'image/png', bytes: png },
      { mimeType: 'image/png', bytes: png },
    ]);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getPages().every((page) => page.getWidth() > 500 && page.getHeight() > 800)).toBe(
      true,
    );
  });
});
