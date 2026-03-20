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
