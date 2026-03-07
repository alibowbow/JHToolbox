import { PDFDocument, degrees as pdfDegrees, rgb } from 'pdf-lib';
import { getPdfJs } from '@/lib/processors/pdfjs-client';
import { ProcessContext, ProcessedFile } from '@/types/processor';
import { baseName, parseNumber } from '@/lib/utils';

function parseList(input: string): number[] {
  return input
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0)
    .map((item) => Math.floor(item));
}

function blobFromBytes(bytes: Uint8Array, mimeType: string): Blob {
  return new Blob([Uint8Array.from(bytes).buffer], { type: mimeType });
}

async function canvasBlob(canvas: HTMLCanvasElement, mimeType: string, quality = 0.92): Promise<Blob> {
  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to create a canvas blob.'));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality,
    );
  });
}

async function renderPdfPages(
  file: File,
  mimeType: string,
  quality: number,
  onProgress: (value: number) => void,
): Promise<ProcessedFile[]> {
  const pdfjsLib = await getPdfJs();
  const input = new Uint8Array(await file.arrayBuffer());

  const documentHandle = await pdfjsLib.getDocument({
    data: input,
    useWorkerFetch: false,
  }).promise;

  const outputs: ProcessedFile[] = [];
  for (let pageNo = 1; pageNo <= documentHandle.numPages; pageNo += 1) {
    onProgress((pageNo - 1) / documentHandle.numPages);
    const page = await documentHandle.getPage(pageNo);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    const context = canvas.getContext('2d');
    if (!context) {
      continue;
    }

    await page.render({ canvasContext: context, viewport }).promise;
    const blob = await canvasBlob(canvas, mimeType, quality);
    const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png';

    outputs.push({
      name: `${baseName(file.name)}-page-${pageNo}.${extension}`,
      blob,
      mimeType,
    });
  }

  return outputs;
}

async function anyImageToPngBlob(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  bitmap.close();
  return await canvasBlob(canvas, 'image/png', 1);
}

export async function processPdfTool(ctx: ProcessContext): Promise<ProcessedFile[]> {
  const { toolId, files, options, onProgress } = ctx;

  if (toolId === 'pdf-merge') {
    const merged = await PDFDocument.create();

    for (let index = 0; index < files.length; index += 1) {
      onProgress({ percent: (index / files.length) * 100, stage: 'Merging PDF files' });
      const sourceDocument = await PDFDocument.load(await files[index].arrayBuffer());
      const pages = await merged.copyPages(sourceDocument, sourceDocument.getPageIndices());
      pages.forEach((page) => merged.addPage(page));
    }

    const bytes = await merged.save({ useObjectStreams: true });
    return [
      {
        name: 'merged.pdf',
        blob: blobFromBytes(bytes, 'application/pdf'),
        mimeType: 'application/pdf',
      },
    ];
  }

  if (toolId === 'pdf-split') {
    const source = files[0];
    const input = await PDFDocument.load(await source.arrayBuffer());
    const outputFiles: ProcessedFile[] = [];

    for (let index = 0; index < input.getPageCount(); index += 1) {
      onProgress({ percent: (index / input.getPageCount()) * 100, stage: 'Splitting PDF pages' });
      const documentHandle = await PDFDocument.create();
      const [page] = await documentHandle.copyPages(input, [index]);
      documentHandle.addPage(page);

      const bytes = await documentHandle.save({ useObjectStreams: true });
      outputFiles.push({
        name: `${baseName(source.name)}-page-${index + 1}.pdf`,
        blob: blobFromBytes(bytes, 'application/pdf'),
        mimeType: 'application/pdf',
      });
    }

    return outputFiles;
  }

  if (toolId === 'pdf-rearrange') {
    const source = files[0];
    const orderRaw = String(options.order ?? '');
    const sourceDocument = await PDFDocument.load(await source.arrayBuffer());
    const pageCount = sourceDocument.getPageCount();

    const parsedOrder = parseList(orderRaw)
      .map((value) => value - 1)
      .filter((value) => value >= 0 && value < pageCount);
    const fallbackOrder = Array.from({ length: pageCount }, (_, index) => index);
    const finalOrder = parsedOrder.length === pageCount ? parsedOrder : fallbackOrder;

    const output = await PDFDocument.create();
    const copiedPages = await output.copyPages(sourceDocument, finalOrder);
    copiedPages.forEach((page) => output.addPage(page));

    const bytes = await output.save({ useObjectStreams: true });
    return [
      {
        name: `${baseName(source.name)}-rearranged.pdf`,
        blob: blobFromBytes(bytes, 'application/pdf'),
        mimeType: 'application/pdf',
      },
    ];
  }

  if (toolId === 'pdf-rotate') {
    const source = files[0];
    const rotation = parseNumber(options.degrees, 90);
    const documentHandle = await PDFDocument.load(await source.arrayBuffer());

    documentHandle.getPages().forEach((page) => {
      page.setRotation(pdfDegrees(rotation));
    });

    const bytes = await documentHandle.save({ useObjectStreams: true });
    return [
      {
        name: `${baseName(source.name)}-rotated.pdf`,
        blob: blobFromBytes(bytes, 'application/pdf'),
        mimeType: 'application/pdf',
      },
    ];
  }

  if (toolId === 'pdf-delete-page') {
    const source = files[0];
    const pagesToDelete = parseList(String(options.pages ?? '')).map((value) => value - 1);
    const documentHandle = await PDFDocument.load(await source.arrayBuffer());

    pagesToDelete
      .filter((value) => value >= 0 && value < documentHandle.getPageCount())
      .sort((left, right) => right - left)
      .forEach((value) => documentHandle.removePage(value));

    const bytes = await documentHandle.save({ useObjectStreams: true });
    return [
      {
        name: `${baseName(source.name)}-deleted.pdf`,
        blob: blobFromBytes(bytes, 'application/pdf'),
        mimeType: 'application/pdf',
      },
    ];
  }

  if (toolId === 'pdf-add-page-numbers') {
    const source = files[0];
    const startNumber = parseNumber(options.startNumber, 1);
    const fontSize = parseNumber(options.fontSize, 12);
    const documentHandle = await PDFDocument.load(await source.arrayBuffer());

    documentHandle.getPages().forEach((page, index) => {
      const { width } = page.getSize();
      const text = `${startNumber + index}`;
      page.drawText(text, {
        x: width / 2 - fontSize,
        y: 20,
        size: fontSize,
        color: rgb(0.1, 0.1, 0.1),
      });
    });

    const bytes = await documentHandle.save({ useObjectStreams: true });
    return [
      {
        name: `${baseName(source.name)}-numbered.pdf`,
        blob: blobFromBytes(bytes, 'application/pdf'),
        mimeType: 'application/pdf',
      },
    ];
  }

  if (toolId === 'pdf-compress') {
    const source = files[0];
    const documentHandle = await PDFDocument.load(await source.arrayBuffer());
    const bytes = await documentHandle.save({
      useObjectStreams: true,
      objectsPerTick: 60,
      addDefaultPage: false,
    });

    return [
      {
        name: `${baseName(source.name)}-compressed.pdf`,
        blob: blobFromBytes(bytes, 'application/pdf'),
        mimeType: 'application/pdf',
      },
    ];
  }

  if (
    toolId === 'pdf-extract-images' ||
    toolId === 'pdf-to-png' ||
    toolId === 'pdf-to-jpg' ||
    toolId === 'pdf-to-webp'
  ) {
    const source = files[0];
    const quality = parseNumber(options.quality, 0.9);
    const mimeType =
      toolId === 'pdf-to-jpg' ? 'image/jpeg' : toolId === 'pdf-to-webp' ? 'image/webp' : 'image/png';

    const pages = await renderPdfPages(source, mimeType, quality, (value) =>
      onProgress({ percent: value * 100, stage: 'Rendering PDF pages' }),
    );

    if (toolId === 'pdf-extract-images') {
      return pages.map((file, index) => ({
        ...file,
        name: `${baseName(source.name)}-image-${index + 1}.png`,
        mimeType: 'image/png',
      }));
    }

    return pages;
  }

  if (toolId === 'image-to-pdf') {
    const output = await PDFDocument.create();

    for (let index = 0; index < files.length; index += 1) {
      onProgress({ percent: (index / files.length) * 100, stage: 'Adding images to PDF' });
      const file = files[index];
      const bytes = new Uint8Array(await file.arrayBuffer());

      let embeddedImage: any;
      if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
        embeddedImage = await output.embedJpg(bytes);
      } else if (file.type === 'image/png') {
        embeddedImage = await output.embedPng(bytes);
      } else {
        const pngBlob = await anyImageToPngBlob(file);
        const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
        embeddedImage = await output.embedPng(pngBytes);
      }

      const page = output.addPage([embeddedImage.width, embeddedImage.height]);
      page.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width: embeddedImage.width,
        height: embeddedImage.height,
      });
    }

    const bytes = await output.save({ useObjectStreams: true });
    return [
      {
        name: 'images-to-pdf.pdf',
        blob: blobFromBytes(bytes, 'application/pdf'),
        mimeType: 'application/pdf',
      },
    ];
  }

  return [];
}
