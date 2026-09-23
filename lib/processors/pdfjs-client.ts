let pdfjsPromise: Promise<any> | null = null;

export async function getPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs')
      .then((pdfjs) => {
        if (typeof window !== 'undefined') {
          pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        }

        return pdfjs;
      })
      .catch((cause) => {
        pdfjsPromise = null;
        throw cause;
      });
  }

  return await pdfjsPromise;
}

/**
 * Opens a PDF with pdf.js. The CJK character maps and the standard 14 fonts
 * are served from /pdfjs (copied from pdfjs-dist at build time); without them
 * Korean, Japanese and Chinese text in many PDFs renders blank or garbled and
 * text extraction returns nothing.
 */
export async function openPdfDocument(data: Uint8Array) {
  const pdfjs = await getPdfJs();
  return await pdfjs.getDocument({
    data,
    useWorkerFetch: false,
    cMapUrl: '/pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/pdfjs/standard_fonts/',
    isEvalSupported: false,
  }).promise;
}
