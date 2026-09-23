import { openPdfDocument } from '@/lib/processors/pdfjs-client';
import { ProcessContext, ProcessedFile } from '@/types/processor';
import { baseName } from '@/lib/utils';

function textResult(
  name: string,
  text: string,
  metadata?: Record<string, string | number | boolean>,
): ProcessedFile {
  return {
    name,
    blob: new Blob([text], { type: 'text/plain;charset=utf-8' }),
    mimeType: 'text/plain',
    textContent: text,
    metadata,
  };
}

type OcrEngine = {
  recognize: (image: Blob | HTMLCanvasElement, onProgress: (ratio: number) => void) => Promise<string>;
  terminate: () => Promise<void>;
};

/**
 * One tesseract worker for the whole run: loading the language data is the
 * slow part, so every image or page reuses it. Cancelling terminates it.
 */
async function createOcrEngine(lang: string, signal?: AbortSignal): Promise<OcrEngine> {
  const tesseract: any = await import('tesseract.js');
  let reportProgress: (ratio: number) => void = () => undefined;
  const worker: any = await tesseract.createWorker(lang, 1, {
    logger: (message: any) => {
      if (message?.status === 'recognizing text' && typeof message.progress === 'number') {
        reportProgress(message.progress);
      }
    },
  });
  let terminated = false;
  const terminate = async () => {
    if (!terminated) {
      terminated = true;
      await Promise.resolve(worker.terminate()).catch(() => undefined);
    }
  };
  signal?.addEventListener('abort', () => void terminate(), { once: true });

  return {
    recognize: async (image, onProgress) => {
      reportProgress = onProgress;
      const output = await worker.recognize(image);
      return String(output?.data?.text ?? '').trim();
    },
    terminate,
  };
}

/** Text of one PDF page, with line breaks where pdf.js reports them. */
function joinTextItems(items: any[]): string {
  let text = '';
  for (const item of items) {
    if (typeof item?.str !== 'string') {
      continue;
    }
    text += item.str;
    text += item.hasEOL ? '\n' : item.str && !item.str.endsWith(' ') ? ' ' : '';
  }
  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Renders a page large enough for OCR (about 2× its PDF size, capped). */
async function renderPageForOcr(page: any): Promise<HTMLCanvasElement> {
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(2.5, 2400 / Math.max(base.width, base.height, 1));
  const viewport = page.getViewport({ scale });
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
  return canvas;
}

export async function processOcrTool(ctx: ProcessContext): Promise<ProcessedFile[]> {
  const { toolId, files, options, onProgress, signal } = ctx;
  const lang = String(options.lang ?? 'kor+eng');

  if (!files.length) {
    throw new Error('Select at least one image or PDF file.');
  }

  if (toolId === 'ocr-image-to-text') {
    onProgress({ percent: 2, stage: 'Preparing OCR worker' });
    const engine = await createOcrEngine(lang, signal);
    try {
      const outputFiles: ProcessedFile[] = [];
      for (let index = 0; index < files.length; index += 1) {
        signal?.throwIfAborted();
        const file = files[index];
        const text = await engine.recognize(file, (ratio) =>
          onProgress({ percent: ((index + ratio) / files.length) * 100, stage: 'Running image OCR' }),
        );
        outputFiles.push(textResult(`${baseName(file.name)}.txt`, text));
      }
      return outputFiles;
    } finally {
      await engine.terminate();
    }
  }

  if (toolId === 'ocr-pdf-to-text') {
    const mode = String(options.ocrMode ?? 'auto');
    const outputFiles: ProcessedFile[] = [];
    let engine: OcrEngine | null = null;

    try {
      for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const file = files[fileIndex];
        const documentHandle = await openPdfDocument(new Uint8Array(await file.arrayBuffer()));
        const pageCount = documentHandle.numPages;
        const sections: string[] = [];
        let ocrPages = 0;

        for (let pageNo = 1; pageNo <= pageCount; pageNo += 1) {
          signal?.throwIfAborted();
          const progressBase = (fileIndex + (pageNo - 1) / pageCount) / files.length;
          const pageShare = 1 / pageCount / files.length;
          onProgress({ percent: progressBase * 100, stage: 'Extracting PDF text' });

          const page = await documentHandle.getPage(pageNo);
          let text = mode === 'always' ? '' : joinTextItems((await page.getTextContent()).items ?? []);

          // A scanned page has no text layer: read it with OCR instead.
          if (mode !== 'never' && text.replace(/\s/g, '').length < 4) {
            engine ??= await createOcrEngine(lang, signal);
            const canvas = await renderPageForOcr(page);
            text = await engine.recognize(canvas, (ratio) =>
              onProgress({ percent: (progressBase + ratio * pageShare) * 100, stage: 'Running image OCR' }),
            );
            ocrPages += 1;
          }

          sections.push(pageCount > 1 ? `[${pageNo}]\n${text}` : text);
        }

        outputFiles.push(
          textResult(`${baseName(file.name)}.txt`, sections.join('\n\n').trim(), {
            pages: pageCount,
            ocrPages,
          }),
        );
      }
      return outputFiles;
    } finally {
      await engine?.terminate();
    }
  }

  return [];
}
