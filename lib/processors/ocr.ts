import { getPdfJs } from '@/lib/processors/pdfjs-client';
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

async function runImageOcr(file: File, lang: string, onProgress: (value: number) => void): Promise<string> {
  const tesseract: any = await import('tesseract.js');
  const worker: any = await tesseract.createWorker(lang, 1, {
    logger: (message: any) => {
      if (typeof message?.progress === 'number') {
        onProgress(message.progress);
      }
    },
  });

  if (worker.loadLanguage && worker.initialize) {
    await worker.loadLanguage(lang);
    await worker.initialize(lang);
  }

  const output = await worker.recognize(file);
  await worker.terminate();
  return output?.data?.text ?? '';
}

export async function processOcrTool(ctx: ProcessContext): Promise<ProcessedFile[]> {
  const { toolId, files, options, onProgress } = ctx;

  if (toolId === 'ocr-image-to-text') {
    const lang = String(options.lang ?? 'eng');
    const outputFiles: ProcessedFile[] = [];

    for (let index = 0; index < files.length; index += 1) {
      onProgress({ percent: (index / files.length) * 100, stage: 'Preparing OCR worker' });
      const file = files[index];
      const text = await runImageOcr(file, lang, (ratio) =>
        onProgress({
          percent: ((index + ratio) / files.length) * 100,
          stage: 'Running image OCR',
        }),
      );

      outputFiles.push(textResult(`${baseName(file.name)}.txt`, text));
    }

    return outputFiles;
  }

  if (toolId === 'ocr-pdf-to-text') {
    const file = files[0];
    const pdfjsLib = await getPdfJs();
    const input = new Uint8Array(await file.arrayBuffer());

    const documentHandle = await pdfjsLib.getDocument({
      data: input,
      useWorkerFetch: false,
    }).promise;

    let text = '';
    for (let pageNo = 1; pageNo <= documentHandle.numPages; pageNo += 1) {
      onProgress({
        percent: ((pageNo - 1) / documentHandle.numPages) * 100,
        stage: 'Extracting PDF text',
      });
      const page = await documentHandle.getPage(pageNo);
      const content = await page.getTextContent();
      const line = (content.items ?? [])
        .map((item: any) => (typeof item.str === 'string' ? item.str : ''))
        .join(' ')
        .trim();

      text += `\n\n[Page ${pageNo}]\n${line}`;
    }

    return [
      textResult(`${baseName(file.name)}.txt`, text.trim(), {
        pages: documentHandle.numPages,
      }),
    ];
  }

  return [];
}
