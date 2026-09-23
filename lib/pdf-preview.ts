'use client';

import { openPdfDocument } from '@/lib/processors/pdfjs-client';

export type PdfPageInfo = {
  /** Page size as displayed (rotation applied), in PDF points. */
  width: number;
  height: number;
  /** Display point → PDF user-space point (handles rotated pages). */
  toPdfPoint: (x: number, y: number) => [number, number];
  /** PDF user-space rectangle → display rectangle [x1, y1, x2, y2] in points. */
  toDisplayRect: (rect: [number, number, number, number]) => [number, number, number, number];
};

export type PdfPreview = {
  pageCount: number;
  pageInfo: (pageNumber: number) => Promise<PdfPageInfo>;
  /** An object URL of the page rendered `cssWidth` pixels wide (cached). */
  renderPage: (pageNumber: number, cssWidth: number) => Promise<string>;
  destroy: () => void;
};

/** Page previews for the editors, rendered on demand and cached per size. */
export async function openPdfPreview(file: File): Promise<PdfPreview> {
  const doc = await openPdfDocument(new Uint8Array(await file.arrayBuffer()));
  const renders = new Map<string, Promise<string>>();
  const urls: string[] = [];
  let destroyed = false;

  const pageInfo = async (pageNumber: number): Promise<PdfPageInfo> => {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    return {
      width: viewport.width,
      height: viewport.height,
      toPdfPoint: (x, y) => viewport.convertToPdfPoint(x, y) as [number, number],
      toDisplayRect: (rect) => viewport.convertToViewportRectangle(rect) as [number, number, number, number],
    };
  };

  const renderPage = (pageNumber: number, cssWidth: number) => {
    const width = Math.max(60, Math.round(cssWidth));
    const key = `${pageNumber}@${width}`;
    let pending = renders.get(key);
    if (!pending) {
      pending = (async () => {
        const page = await doc.getPage(pageNumber);
        const base = page.getViewport({ scale: 1 });
        const pixelRatio = Math.min(2, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);
        const viewport = page.getViewport({ scale: (width * pixelRatio) / base.width });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('Canvas unavailable.');
        }
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport }).promise;
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('Failed to create a canvas blob.'))), 'image/png'),
        );
        const url = URL.createObjectURL(blob);
        if (destroyed) {
          URL.revokeObjectURL(url);
        } else {
          urls.push(url);
        }
        return url;
      })();
      renders.set(key, pending);
      pending.catch(() => renders.delete(key));
    }
    return pending;
  };

  return {
    pageCount: doc.numPages,
    pageInfo,
    renderPage,
    destroy: () => {
      destroyed = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
      void doc.destroy?.();
    },
  };
}
