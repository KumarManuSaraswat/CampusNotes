import { PDFDocument } from 'pdf-lib';

export interface ImagePage {
  mimeType: 'image/jpeg' | 'image/png';
  bytes: Buffer;
}

/** Creates a PDF from original image bytes in the exact order supplied by the author. */
export async function combineImagePages(pages: ImagePage[]): Promise<Buffer> {
  if (pages.length < 2 || pages.length > 10) throw new Error('INVALID_PAGE_COUNT');
  const pdf = await PDFDocument.create();
  for (const source of pages) {
    const image =
      source.mimeType === 'image/jpeg'
        ? await pdf.embedJpg(source.bytes)
        : source.mimeType === 'image/png'
          ? await pdf.embedPng(source.bytes)
          : null;
    if (!image) throw new Error('UNSUPPORTED_IMAGE');
    const page = pdf.addPage([595.28, 841.89]);
    const fit = image.scaleToFit(page.getWidth() - 48, page.getHeight() - 48);
    page.drawImage(image, {
      x: (page.getWidth() - fit.width) / 2,
      y: (page.getHeight() - fit.height) / 2,
      width: fit.width,
      height: fit.height,
    });
  }
  const bytes = Buffer.from(await pdf.save());
  if (bytes.length > 35 * 1024 * 1024) throw new Error('PDF_TOO_LARGE');
  const verified = await PDFDocument.load(bytes);
  if (verified.getPageCount() !== pages.length) throw new Error('PDF_PAGE_COUNT_MISMATCH');
  return bytes;
}
