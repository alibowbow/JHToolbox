import { getPdfJs } from '@/lib/processors/pdfjs-client';
import type { RasterDocument, RasterPage } from '@/lib/document-model/types';
import { writeRasterHwpx } from '@/lib/hwpx/package-writer';
import { HWPX_MIME } from '@/lib/hwpx/xml-builders';

export interface FidelityOptions {
  /** 144 / 200 / 300 */
  dpi: number;
  imageFormat: 'png' | 'jpeg';
  /** 0..1, used only for JPEG */
  jpegQuality: number;
  maxPages: number;
}

export function resolveFidelityDpi(value: unknown): number {
  const dpi = Math.round(Number(value));
  return dpi === 144 || dpi === 200 || dpi === 300 ? dpi : 200;
}

/**
 * PDF → fidelity HWPX (browser): render each page to a full-page image at the
 * chosen DPI and place it on an HWPX page of the original physical size. Page
 * rotation is honored by using the rotated viewport's actual point dimensions.
 * Pages are processed one at a time and the canvas is released between pages.
 */
export async function convertPdfToFidelityHwpx(
  file: File,
  options: FidelityOptions,
  onProgress: (percent: number, stage: string) => void,
): Promise<{ blob: Blob; pageCount: number }> {
  const pdfjsLib = await getPdfJs();
  const input = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({ data: input, useWorkerFetch: false }).promise;

  try {
    const scale = options.dpi / 72;
    const total: number = doc.numPages;
    const cap = Math.min(total, Math.max(1, options.maxPages));
    const pages: RasterPage[] = [];

    for (let pageNo = 1; pageNo <= cap; pageNo += 1) {
      onProgress(((pageNo - 1) / cap) * 92, `Rendering page ${pageNo} of ${cap}`);
      const page = await doc.getPage(pageNo);
      const baseViewport = page.getViewport({ scale: 1 }); // points, with page rotation applied
      const renderViewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(renderViewport.width));
      canvas.height = Math.max(1, Math.ceil(renderViewport.height));
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('The browser could not create a canvas to render the PDF.');
      }
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport: renderViewport }).promise;

      const mime = options.imageFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, mime, options.imageFormat === 'jpeg' ? options.jpegQuality : undefined),
      );
      if (!blob || blob.size === 0) {
        throw new Error(`The browser failed to encode page ${pageNo} as an image.`);
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());

      pages.push({
        pageNumber: pageNo,
        widthPt: baseViewport.width,
        heightPt: baseViewport.height,
        image: { bytes, format: options.imageFormat, pixelWidth: canvas.width, pixelHeight: canvas.height },
      });

      canvas.width = 0;
      canvas.height = 0;
    }

    onProgress(96, 'Building HWPX package');
    const rasterDoc: RasterDocument = {
      pages,
      metadata: {
        title: file.name.replace(/\.[^/.]+$/, ''),
        producer: 'JH Toolbox',
        createdAtIso: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      },
    };
    const hwpxBytes = await writeRasterHwpx(rasterDoc);

    return {
      blob: new Blob([Uint8Array.from(hwpxBytes).buffer], { type: HWPX_MIME }),
      pageCount: pages.length,
    };
  } finally {
    await doc.destroy();
  }
}
