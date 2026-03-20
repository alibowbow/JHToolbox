import html2canvas from 'html2canvas';
import JSZip from 'jszip';
import { PDFDocument, degrees as pdfDegrees, rgb } from 'pdf-lib';
import * as XLSX from 'xlsx';
import { getPdfJs } from '@/lib/processors/pdfjs-client';
import { ProcessContext, ProcessedFile } from '@/types/processor';
import { baseName, parseBoolean, parseNumber } from '@/lib/utils';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const TEXT_PAGE_WIDTH = 1240;
const TEXT_PAGE_HEIGHT = 1754;
const TEXT_MARGIN = 104;

type PdfTextPage = {
  pageNumber: number;
  text: string;
  lines: string[];
};

type TextBlock =
  | { kind: 'title' | 'caption' | 'body'; text: string }
  | { kind: 'gap' | 'page-break' };

function parseList(input: string): number[] {
  return input
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0)
    .map((item) => Math.floor(item));
}

function parseMergePlan(input: string, fileCount: number): Array<{ fileIndex: number; pageIndex: number }> {
  try {
    const raw = JSON.parse(input);
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw
      .map((entry) => {
        if (
          !entry ||
          typeof entry !== 'object' ||
          !('fileIndex' in entry) ||
          !('pageIndex' in entry)
        ) {
          return null;
        }

        const fileIndex = Number(entry.fileIndex);
        const pageIndex = Number(entry.pageIndex);
        if (!Number.isInteger(fileIndex) || !Number.isInteger(pageIndex) || fileIndex < 0 || fileIndex >= fileCount || pageIndex < 0) {
          return null;
        }

        return { fileIndex, pageIndex };
      })
      .filter((entry): entry is { fileIndex: number; pageIndex: number } => entry !== null);
  } catch {
    return [];
  }
}

function blobFromBytes(bytes: Uint8Array, mimeType: string): Blob {
  return new Blob([Uint8Array.from(bytes).buffer], { type: mimeType });
}

function parseColor(color: string) {
  const normalized = color.replace('#', '').trim();
  const expanded = normalized.length === 3 ? normalized.split('').map((chunk) => `${chunk}${chunk}`).join('') : normalized;

  if (!/^[\da-fA-F]{6}$/.test(expanded)) {
    return rgb(0, 0, 0);
  }

  const red = Number.parseInt(expanded.slice(0, 2), 16) / 255;
  const green = Number.parseInt(expanded.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(expanded.slice(4, 6), 16) / 255;
  return rgb(red, green, blue);
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

function resolvePdfInputs(files: File[]) {
  return files.filter((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
}

function resolvePrimaryPdfInput(files: File[]) {
  return resolvePdfInputs(files)[0];
}

function resolvePdfWatermarkImage(files: File[]) {
  return files.find((file) => file.type.startsWith('image/'));
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function buildCorePropertiesXml(title: string, creator: string) {
  const timestamp = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(title)}</dc:title>
  <dc:creator>${escapeXml(creator)}</dc:creator>
  <cp:lastModifiedBy>${escapeXml(creator)}</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified>
</cp:coreProperties>`;
}

function buildAppPropertiesXml(appName: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>${escapeXml(appName)}</Application>
</Properties>`;
}

function normalizeExcelCell(value: unknown) {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

function splitLineToCells(line: string) {
  const parts = line.split(/\t+|\s{2,}/).map((value) => value.trim()).filter(Boolean);
  return parts.length > 1 ? parts : [line.trim()];
}

function sanitizeSheetName(name: string, index: number) {
  const cleaned = name.replace(/[\\/?*\[\]:]/g, ' ').trim();
  const fallback = `Sheet ${index + 1}`;
  return (cleaned || fallback).slice(0, 31);
}

function buildDocxDocumentXml(pages: PdfTextPage[]) {
  const bodyParts: string[] = [];

  pages.forEach((page, pageIndex) => {
    bodyParts.push(`
      <w:p>
        <w:r>
          <w:rPr><w:b/></w:rPr>
          <w:t>Page ${page.pageNumber}</w:t>
        </w:r>
      </w:p>`);

    const pageLines = page.lines.length > 0 ? page.lines : [page.text];
    pageLines
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        bodyParts.push(`
          <w:p>
            <w:r>
              <w:t xml:space="preserve">${escapeXml(line)}</w:t>
            </w:r>
          </w:p>`);
      });

    if (pageIndex < pages.length - 1) {
      bodyParts.push(`
        <w:p>
          <w:r><w:br w:type="page"/></w:r>
        </w:p>`);
    }
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" mc:Ignorable="w14 w15 wp14">
  <w:body>
    ${bodyParts.join('')}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

async function createDocxFromPdfPages(pages: PdfTextPage[], sourceName: string) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`);

  zip.folder('_rels')?.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);

  zip.folder('docProps')?.file('core.xml', buildCorePropertiesXml(sourceName, 'JH Toolbox'));
  zip.folder('docProps')?.file('app.xml', buildAppPropertiesXml('JH Toolbox'));
  zip.folder('word')?.file('document.xml', buildDocxDocumentXml(pages));
  zip.folder('word')?.folder('_rels')?.file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`);

  return await zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME });
}

async function extractDocxBlocks(file: File): Promise<TextBlock[]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const documentXml = await zip.file('word/document.xml')?.async('string');

  if (!documentXml) {
    throw new Error('This DOCX file does not contain a readable document.xml payload.');
  }

  const blocks: TextBlock[] = [{ kind: 'title', text: baseName(file.name) }];
  const paragraphs = documentXml.match(/<w:p[\s\S]*?<\/w:p>/g) ?? [];

  for (const paragraph of paragraphs) {
    if (/w:type="page"/.test(paragraph)) {
      blocks.push({ kind: 'page-break' });
    }

    const pieces = Array.from(paragraph.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g))
      .map((match) => decodeXmlEntities(match[1]))
      .filter(Boolean);

    if (pieces.length > 0) {
      blocks.push({ kind: 'body', text: pieces.join('') });
    }
  }

  if (blocks.length === 1) {
    blocks.push({ kind: 'body', text: 'No extractable text was found in the source document.' });
  }

  return blocks;
}

async function extractPptxBlocks(file: File): Promise<TextBlock[]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const slideEntries = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((left, right) => {
      const leftNumber = Number(left.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
      const rightNumber = Number(right.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
      return leftNumber - rightNumber;
    });

  if (!slideEntries.length) {
    throw new Error('This PPTX file does not contain readable slide XML.');
  }

  const blocks: TextBlock[] = [];

  for (let index = 0; index < slideEntries.length; index += 1) {
    const xml = await zip.file(slideEntries[index])?.async('string');
    const lines = Array.from((xml ?? '').matchAll(/<a:t>([\s\S]*?)<\/a:t>/g))
      .map((match) => decodeXmlEntities(match[1]).trim())
      .filter(Boolean);

    blocks.push({ kind: 'title', text: `Slide ${index + 1}` });

    if (lines.length > 0) {
      lines.forEach((line) => blocks.push({ kind: 'body', text: line }));
    } else {
      blocks.push({ kind: 'body', text: 'This slide does not expose text content that can be converted in the browser.' });
    }

    if (index < slideEntries.length - 1) {
      blocks.push({ kind: 'page-break' });
    }
  }

  return blocks;
}

function wrapLongToken(context: CanvasRenderingContext2D, token: string, maxWidth: number) {
  const lines: string[] = [];
  let current = '';

  for (const character of token) {
    const next = `${current}${character}`;
    if (current && context.measureText(next).width > maxWidth) {
      lines.push(current);
      current = character;
      continue;
    }
    current = next;
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function wrapCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  const paragraphs = text.split('\n');

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) {
      lines.push('');
      continue;
    }

    const words = trimmed.split(/\s+/);
    let current = '';

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (context.measureText(candidate).width <= maxWidth) {
        current = candidate;
        continue;
      }

      if (current) {
        lines.push(current);
      }

      if (context.measureText(word).width > maxWidth) {
        const broken = wrapLongToken(context, word, maxWidth);
        if (broken.length > 1) {
          lines.push(...broken.slice(0, -1));
          current = broken[broken.length - 1] ?? '';
          continue;
        }
      }

      current = word;
    }

    if (current) {
      lines.push(current);
    }
  }

  return lines.length > 0 ? lines : [''];
}

function createTextCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = TEXT_PAGE_WIDTH;
  canvas.height = TEXT_PAGE_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas rendering is not available in this browser.');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.textBaseline = 'top';

  return { canvas, context };
}

function renderBlocksToCanvases(blocks: TextBlock[]) {
  const pages: HTMLCanvasElement[] = [];
  let { canvas, context } = createTextCanvas();
  let cursorY = TEXT_MARGIN;
  let hasContent = false;

  const startNewPage = () => {
    if (hasContent || pages.length === 0) {
      pages.push(canvas);
    }

    const next = createTextCanvas();
    canvas = next.canvas;
    context = next.context;
    cursorY = TEXT_MARGIN;
    hasContent = false;
  };

  for (const block of blocks) {
    if (block.kind === 'page-break') {
      startNewPage();
      continue;
    }

    if (block.kind === 'gap') {
      cursorY += 18;
      continue;
    }

    if (!('text' in block)) {
      continue;
    }

    const isTitle = block.kind === 'title';
    const isCaption = block.kind === 'caption';
    const fontSize = isTitle ? 38 : isCaption ? 26 : 24;
    const lineHeight = isTitle ? 52 : isCaption ? 36 : 32;
    const color = isTitle ? '#0f172a' : isCaption ? '#475569' : '#111827';
    const maxWidth = TEXT_PAGE_WIDTH - TEXT_MARGIN * 2;

    context.font = `${isTitle ? '700' : isCaption ? '600' : '400'} ${fontSize}px system-ui, sans-serif`;
    const wrappedLines = wrapCanvasText(context, block.text, maxWidth);
    const blockHeight = wrappedLines.length * lineHeight + (isTitle ? 16 : isCaption ? 10 : 8);

    if (cursorY + blockHeight > TEXT_PAGE_HEIGHT - TEXT_MARGIN) {
      startNewPage();
      context.font = `${isTitle ? '700' : isCaption ? '600' : '400'} ${fontSize}px system-ui, sans-serif`;
    }

    context.fillStyle = color;
    wrappedLines.forEach((line) => {
      context.fillText(line, TEXT_MARGIN, cursorY);
      cursorY += lineHeight;
    });

    cursorY += isTitle ? 16 : isCaption ? 10 : 8;
    hasContent = true;
  }

  if (hasContent || pages.length === 0) {
    pages.push(canvas);
  }

  return pages;
}

async function canvasesToPdfBlob(canvases: HTMLCanvasElement[]) {
  const documentHandle = await PDFDocument.create();

  for (const canvas of canvases) {
    const pngBlob = await canvasBlob(canvas, 'image/png', 1);
    const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
    const image = await documentHandle.embedPng(pngBytes);
    const page = documentHandle.addPage([A4_WIDTH, A4_HEIGHT]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: A4_WIDTH,
      height: A4_HEIGHT,
    });
  }

  const bytes = await documentHandle.save({ useObjectStreams: true });
  return blobFromBytes(bytes, 'application/pdf');
}

async function renderBlocksToPdfBlob(blocks: TextBlock[]) {
  const canvases = renderBlocksToCanvases(blocks);
  return await canvasesToPdfBlob(canvases);
}

async function extractPdfTextPages(
  file: File,
  onProgress?: (value: number) => void,
): Promise<PdfTextPage[]> {
  const pdfjsLib = await getPdfJs();
  const input = new Uint8Array(await file.arrayBuffer());
  const documentHandle = await pdfjsLib.getDocument({
    data: input,
    useWorkerFetch: false,
  }).promise;

  const pages: PdfTextPage[] = [];

  for (let pageNo = 1; pageNo <= documentHandle.numPages; pageNo += 1) {
    onProgress?.((pageNo - 1) / Math.max(1, documentHandle.numPages));
    const page = await documentHandle.getPage(pageNo);
    const textContent = await page.getTextContent();
    const rows = new Map<number, Array<{ x: number; text: string }>>();

    for (const item of textContent.items as Array<{ str?: string; transform?: number[] }>) {
      const text = String(item.str ?? '').trim();
      if (!text) {
        continue;
      }

      const transform = Array.isArray(item.transform) ? item.transform : [0, 0, 0, 0, 0, 0];
      const x = Number(transform[4] ?? 0);
      const y = Math.round(Number(transform[5] ?? 0) / 4) * 4;
      const bucket = rows.get(y) ?? [];
      bucket.push({ x, text });
      rows.set(y, bucket);
    }

    const lines = Array.from(rows.entries())
      .sort((left, right) => right[0] - left[0])
      .map(([, entries]) =>
        entries
          .sort((left, right) => left.x - right.x)
          .map((entry) => entry.text)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter(Boolean);

    pages.push({
      pageNumber: pageNo,
      text: lines.join('\n'),
      lines,
    });
  }

  return pages;
}

function createWorkbookFromPdfPages(pages: PdfTextPage[]) {
  const workbook = XLSX.utils.book_new();

  pages.forEach((page, index) => {
    const rows = page.lines.length > 0 ? page.lines.map((line) => splitLineToCells(line)) : [[page.text]];
    const sheet = XLSX.utils.aoa_to_sheet(rows.length > 0 ? rows : [['']]);
    XLSX.utils.book_append_sheet(workbook, sheet, sanitizeSheetName(`Page ${page.pageNumber}`, index));
  });

  const buffer = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
  }) as ArrayBuffer;

  return new Blob([buffer], { type: XLSX_MIME });
}

function workbookToBlocks(fileName: string, workbook: XLSX.WorkBook) {
  const blocks: TextBlock[] = [{ kind: 'title', text: baseName(fileName) }];

  workbook.SheetNames.forEach((sheetName, index) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }) as unknown[][];

    blocks.push({ kind: 'caption', text: sheetName });
    if (rows.length === 0) {
      blocks.push({ kind: 'body', text: 'This sheet is empty.' });
    } else {
      rows.forEach((row) => {
        const cells = row.map((cell) => normalizeExcelCell(cell)).filter((value) => value !== '');
        if (cells.length > 0) {
          blocks.push({ kind: 'body', text: cells.join(' | ') });
        }
      });
    }

    if (index < workbook.SheetNames.length - 1) {
      blocks.push({ kind: 'page-break' });
    }
  });

  return blocks;
}

async function waitForFrameLoad(iframe: HTMLIFrameElement) {
  await new Promise<void>((resolve, reject) => {
    iframe.onload = () => resolve();
    iframe.onerror = () => reject(new Error('The HTML file could not be rendered in the preview frame.'));
  });
}

async function renderTallCanvasToPdfBlob(canvas: HTMLCanvasElement) {
  const documentHandle = await PDFDocument.create();
  const segmentHeight = Math.max(1, Math.floor(canvas.width * (A4_HEIGHT / A4_WIDTH)));

  for (let top = 0; top < canvas.height; top += segmentHeight) {
    const sliceHeight = Math.min(segmentHeight, canvas.height - top);
    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = sliceHeight;

    const sliceContext = sliceCanvas.getContext('2d');
    if (!sliceContext) {
      continue;
    }

    sliceContext.fillStyle = '#ffffff';
    sliceContext.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
    sliceContext.drawImage(canvas, 0, top, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

    const pngBlob = await canvasBlob(sliceCanvas, 'image/png', 1);
    const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
    const image = await documentHandle.embedPng(pngBytes);
    const pageHeight = Math.min(A4_HEIGHT, A4_WIDTH * (sliceHeight / canvas.width));
    const page = documentHandle.addPage([A4_WIDTH, pageHeight]);

    page.drawImage(image, {
      x: 0,
      y: 0,
      width: A4_WIDTH,
      height: pageHeight,
    });
  }

  const bytes = await documentHandle.save({ useObjectStreams: true });
  return blobFromBytes(bytes, 'application/pdf');
}

async function renderHtmlFileToPdf(file: File, width: number) {
  const html = await file.text();
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = `${width}px`;
  iframe.style.height = '1200px';
  iframe.style.border = '0';
  iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');
  document.body.appendChild(iframe);

  try {
    iframe.srcdoc = html;
    await waitForFrameLoad(iframe);
    await new Promise((resolve) => window.setTimeout(resolve, 250));

    const doc = iframe.contentDocument;
    if (!doc) {
      throw new Error('The browser did not expose the rendered HTML document.');
    }

    const target = doc.documentElement as HTMLElement;
    const captureWidth = Math.max(width, target.scrollWidth, doc.body?.scrollWidth ?? 0);
    const captureHeight = Math.max(target.scrollHeight, doc.body?.scrollHeight ?? 0, doc.body?.offsetHeight ?? 0, 1);

    iframe.style.width = `${captureWidth}px`;
    iframe.style.height = `${captureHeight}px`;
    await new Promise((resolve) => window.setTimeout(resolve, 120));

    const canvas = await html2canvas(target, {
      backgroundColor: '#ffffff',
      useCORS: true,
      scale: Math.min(2, window.devicePixelRatio || 1),
      width: captureWidth,
      height: captureHeight,
      windowWidth: captureWidth,
      windowHeight: captureHeight,
      scrollX: 0,
      scrollY: 0,
    });

    return await renderTallCanvasToPdfBlob(canvas);
  } finally {
    iframe.remove();
  }
}

async function createTextOverlayPng(
  text: string,
  {
    width,
    height,
    fontSize,
    color,
    background,
    border,
    italic = false,
  }: {
    width: number;
    height: number;
    fontSize: number;
    color: string;
    background?: string;
    border?: string;
    italic?: boolean;
  },
) {
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas rendering is not available in this browser.');
  }

  context.scale(scale, scale);
  if (background) {
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
  }

  if (border) {
    context.strokeStyle = border;
    context.lineWidth = 2;
    context.strokeRect(1, 1, Math.max(0, width - 2), Math.max(0, height - 2));
  }

  context.fillStyle = color;
  context.textBaseline = 'top';
  context.font = `${italic ? 'italic ' : ''}600 ${fontSize}px system-ui, sans-serif`;

  const padding = Math.max(8, fontSize * 0.35);
  const lines = wrapCanvasText(context, text, Math.max(24, width - padding * 2));
  let y = padding;

  for (const line of lines) {
    if (y > height - padding) {
      break;
    }
    context.fillText(line, padding, y);
    y += fontSize * 1.35;
  }

  return new Uint8Array(await (await canvasBlob(canvas, 'image/png', 1)).arrayBuffer());
}

async function embedOptionalPdfImage(documentHandle: PDFDocument, file: File | undefined) {
  if (!file) {
    return null;
  }

  if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
    return await documentHandle.embedJpg(new Uint8Array(await file.arrayBuffer()));
  }

  const pngBlob = await anyImageToPngBlob(file);
  return await documentHandle.embedPng(new Uint8Array(await pngBlob.arrayBuffer()));
}

function normalizeCompareLine(line: string, ignoreWhitespace: boolean) {
  return (ignoreWhitespace ? line.replace(/\s+/g, ' ') : line).trim();
}

function buildLineCountMap(lines: string[]) {
  const map = new Map<string, number>();

  lines.forEach((line) => {
    map.set(line, (map.get(line) ?? 0) + 1);
  });

  return map;
}

function buildPdfCompareReport(
  leftName: string,
  rightName: string,
  leftPages: PdfTextPage[],
  rightPages: PdfTextPage[],
  ignoreWhitespace: boolean,
) {
  const report: string[] = [];
  let changedPages = 0;
  let onlyLeftCount = 0;
  let onlyRightCount = 0;

  report.push('PDF Compare Report');
  report.push(`Left: ${leftName}`);
  report.push(`Right: ${rightName}`);
  report.push(`Ignore whitespace: ${ignoreWhitespace ? 'yes' : 'no'}`);
  report.push('');

  const maxPages = Math.max(leftPages.length, rightPages.length);
  for (let index = 0; index < maxPages; index += 1) {
    const leftLines = (leftPages[index]?.lines ?? []).map((line) => normalizeCompareLine(line, ignoreWhitespace)).filter(Boolean);
    const rightLines = (rightPages[index]?.lines ?? []).map((line) => normalizeCompareLine(line, ignoreWhitespace)).filter(Boolean);
    const leftCounts = buildLineCountMap(leftLines);
    const rightCounts = buildLineCountMap(rightLines);

    const onlyLeft: string[] = [];
    const onlyRight: string[] = [];

    for (const [line, count] of leftCounts.entries()) {
      const delta = count - (rightCounts.get(line) ?? 0);
      if (delta > 0) {
        onlyLeft.push(`${line}${delta > 1 ? ` (${delta}x)` : ''}`);
      }
    }

    for (const [line, count] of rightCounts.entries()) {
      const delta = count - (leftCounts.get(line) ?? 0);
      if (delta > 0) {
        onlyRight.push(`${line}${delta > 1 ? ` (${delta}x)` : ''}`);
      }
    }

    if (onlyLeft.length === 0 && onlyRight.length === 0) {
      report.push(`Page ${index + 1}: no text differences detected.`);
      continue;
    }

    changedPages += 1;
    onlyLeftCount += onlyLeft.length;
    onlyRightCount += onlyRight.length;
    report.push(`Page ${index + 1}:`);

    if (onlyLeft.length > 0) {
      report.push('  Only in left PDF:');
      onlyLeft.slice(0, 12).forEach((line) => report.push(`    - ${line}`));
      if (onlyLeft.length > 12) {
        report.push(`    - ... ${onlyLeft.length - 12} more`);
      }
    }

    if (onlyRight.length > 0) {
      report.push('  Only in right PDF:');
      onlyRight.slice(0, 12).forEach((line) => report.push(`    - ${line}`));
      if (onlyRight.length > 12) {
        report.push(`    - ... ${onlyRight.length - 12} more`);
      }
    }
  }

  report.push('');
  report.push('Summary');
  report.push(`Changed pages: ${changedPages}`);
  report.push(`Left-only differences: ${onlyLeftCount}`);
  report.push(`Right-only differences: ${onlyRightCount}`);

  return {
    text: report.join('\n'),
    metadata: {
      leftPages: leftPages.length,
      rightPages: rightPages.length,
      changedPages,
      differencesFound: changedPages > 0,
    },
  };
}

async function processEditPdf(
  files: File[],
  options: Record<string, string | number | boolean>,
) {
  const pdfFile = resolvePrimaryPdfInput(files);
  if (!pdfFile) {
    throw new Error('Add a PDF file to edit.');
  }

  const documentHandle = await PDFDocument.load(await pdfFile.arrayBuffer());
  const imageFile = resolvePdfWatermarkImage(files);
  const pageNumber = Math.max(1, Math.floor(parseNumber(options.pageNumber, 1)));
  const pageIndex = clamp(pageNumber - 1, 0, Math.max(0, documentHandle.getPageCount() - 1));
  const page = documentHandle.getPage(pageIndex);
  const editType = String(options.editType ?? 'text');
  const x = Math.max(0, parseNumber(options.x, 40));
  const y = Math.max(0, parseNumber(options.y, 40));
  const width = Math.max(24, parseNumber(options.width, 220));
  const height = Math.max(24, parseNumber(options.height, 72));
  const fontSize = Math.max(8, parseNumber(options.fontSize, 18));
  const color = String(options.color ?? '#111827');
  const opacity = clamp(parseNumber(options.opacity, 0.9), 0.05, 1);
  const text = String(options.text ?? 'Edited with JH Toolbox').trim() || 'Edited with JH Toolbox';

  if (editType === 'image') {
    const image = await embedOptionalPdfImage(documentHandle, imageFile);
    if (!image) {
      throw new Error('Add an image file along with the PDF to place an image overlay.');
    }

    page.drawImage(image, {
      x,
      y,
      width,
      height,
      opacity,
    });
  } else if (editType === 'rectangle' || editType === 'highlight') {
    page.drawRectangle({
      x,
      y,
      width,
      height,
      color: parseColor(editType === 'highlight' && options.color === undefined ? '#fde047' : color),
      borderColor: parseColor(color),
      borderWidth: editType === 'highlight' ? 0 : 1,
      opacity: editType === 'highlight' ? clamp(opacity, 0.1, 0.65) : opacity,
    });
  } else {
    const overlay = await createTextOverlayPng(text, {
      width,
      height,
      fontSize,
      color,
      background: editType === 'comment' ? '#FEF3C7' : undefined,
      border: editType === 'comment' ? '#F59E0B' : undefined,
    });
    const image = await documentHandle.embedPng(overlay);
    page.drawImage(image, {
      x,
      y,
      width,
      height,
      opacity,
    });
  }

  const bytes = await documentHandle.save({ useObjectStreams: true });
  return {
    name: `${baseName(pdfFile.name)}-edited.pdf`,
    blob: blobFromBytes(bytes, 'application/pdf'),
    mimeType: 'application/pdf',
  };
}

async function processSignPdf(
  files: File[],
  options: Record<string, string | number | boolean>,
) {
  const pdfFile = resolvePrimaryPdfInput(files);
  if (!pdfFile) {
    throw new Error('Add a PDF file to sign.');
  }

  const documentHandle = await PDFDocument.load(await pdfFile.arrayBuffer());
  const signatureType = String(options.signatureType ?? 'text');
  const imageFile = resolvePdfWatermarkImage(files);
  const pageNumber = Math.max(1, Math.floor(parseNumber(options.pageNumber, 1)));
  const pageIndex = clamp(pageNumber - 1, 0, Math.max(0, documentHandle.getPageCount() - 1));
  const page = documentHandle.getPage(pageIndex);
  const x = Math.max(0, parseNumber(options.x, 40));
  const y = Math.max(0, parseNumber(options.y, 40));
  const width = Math.max(48, parseNumber(options.width, 180));
  const height = Math.max(32, parseNumber(options.height, 72));
  const fontSize = Math.max(10, parseNumber(options.fontSize, 22));
  const color = String(options.color ?? '#0f172a');
  const includeDate = parseBoolean(options.includeDate, true);
  const signerName = String(options.signerName ?? 'Signed with JH Toolbox').trim() || 'Signed with JH Toolbox';

  if (signatureType === 'image') {
    const image = await embedOptionalPdfImage(documentHandle, imageFile);
    if (!image) {
      throw new Error('Add a signature image together with the PDF file.');
    }

    page.drawImage(image, {
      x,
      y,
      width,
      height,
    });
  } else {
    const signatureLines = includeDate ? `${signerName}\n${new Date().toLocaleDateString()}` : signerName;
    const overlay = await createTextOverlayPng(signatureLines, {
      width,
      height,
      fontSize,
      color,
      border: '#94a3b8',
      italic: true,
    });
    const image = await documentHandle.embedPng(overlay);
    page.drawImage(image, {
      x,
      y,
      width,
      height,
    });
  }

  const bytes = await documentHandle.save({ useObjectStreams: true });
  return {
    name: `${baseName(pdfFile.name)}-signed.pdf`,
    blob: blobFromBytes(bytes, 'application/pdf'),
    mimeType: 'application/pdf',
  };
}

async function processRepairPdf(file: File) {
  let sourceDocument: PDFDocument;

  try {
    sourceDocument = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  } catch {
    throw new Error('This PDF could not be parsed. The repair tool can only rebuild PDFs that still open in the browser.');
  }

  const rebuilt = await PDFDocument.create();
  const copiedPages = await rebuilt.copyPages(sourceDocument, sourceDocument.getPageIndices());
  copiedPages.forEach((page) => rebuilt.addPage(page));
  rebuilt.setProducer('JH Toolbox');
  rebuilt.setCreator('JH Toolbox');
  rebuilt.setTitle(baseName(file.name));
  rebuilt.setModificationDate(new Date());

  const bytes = await rebuilt.save({
    useObjectStreams: false,
    addDefaultPage: false,
  });

  return {
    name: `${baseName(file.name)}-repaired.pdf`,
    blob: blobFromBytes(bytes, 'application/pdf'),
    mimeType: 'application/pdf',
    metadata: {
      pages: rebuilt.getPageCount(),
      repaired: true,
      note: 'Rebuilt from parseable PDF objects only.',
    },
  };
}

async function processPdfAClone(
  file: File,
  options: Record<string, string | number | boolean>,
) {
  const sourceDocument = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  const archival = await PDFDocument.create();
  const copiedPages = await archival.copyPages(sourceDocument, sourceDocument.getPageIndices());
  copiedPages.forEach((page) => archival.addPage(page));

  const title = String(options.title ?? '').trim() || baseName(file.name);
  const author = String(options.author ?? '').trim() || 'JH Toolbox';
  const subject = String(options.subject ?? '').trim() || 'Archival browser export';

  archival.setTitle(title);
  archival.setAuthor(author);
  archival.setSubject(subject);
  archival.setProducer('JH Toolbox');
  archival.setCreator('JH Toolbox');
  archival.setKeywords(['archival', 'browser-only', 'pdfa-like']);
  archival.setCreationDate(new Date());
  archival.setModificationDate(new Date());

  const bytes = await archival.save({
    useObjectStreams: false,
    addDefaultPage: false,
  });

  return {
    name: `${baseName(file.name)}-archival.pdf`,
    blob: blobFromBytes(bytes, 'application/pdf'),
    mimeType: 'application/pdf',
    metadata: {
      profile: 'PDF/A-like',
      validated: false,
      note: 'Metadata and page objects were rebuilt, but PDF/A compliance is not formally validated.',
    },
  };
}

export async function processPdfTool(ctx: ProcessContext): Promise<ProcessedFile[]> {
  const { toolId, files, options, onProgress } = ctx;

  if (!files.length) {
    throw new Error('Select at least one PDF file.');
  }

  if (toolId === 'pdf-merge') {
    const merged = await PDFDocument.create();
    const mergePlan = parseMergePlan(String(options.mergePlan ?? ''), files.length);

    if (mergePlan.length > 0) {
      const sourceDocuments = await Promise.all(files.map(async (file) => await PDFDocument.load(await file.arrayBuffer())));

      for (let index = 0; index < mergePlan.length; index += 1) {
        const { fileIndex, pageIndex } = mergePlan[index];
        const sourceDocument = sourceDocuments[fileIndex];
        if (pageIndex >= sourceDocument.getPageCount()) {
          continue;
        }

        onProgress({ percent: (index / mergePlan.length) * 100, stage: 'Merging PDF files' });
        const [page] = await merged.copyPages(sourceDocument, [pageIndex]);
        merged.addPage(page);
      }
    } else {
      for (let index = 0; index < files.length; index += 1) {
        onProgress({ percent: (index / files.length) * 100, stage: 'Merging PDF files' });
        const sourceDocument = await PDFDocument.load(await files[index].arrayBuffer());
        const pages = await merged.copyPages(sourceDocument, sourceDocument.getPageIndices());
        pages.forEach((page) => merged.addPage(page));
      }
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

    const parsedOrder = Array.from(
      new Set(
        parseList(orderRaw)
          .map((value) => value - 1)
          .filter((value) => value >= 0 && value < pageCount),
      ),
    );
    const fallbackOrder = Array.from({ length: pageCount }, (_, index) => index);
    const finalOrder = parsedOrder.length > 0 ? parsedOrder : fallbackOrder;

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

  if (toolId === 'pdf-watermark') {
    const pdfFiles = resolvePdfInputs(files);
    const watermarkType = String(options.watermarkType ?? 'text');
    const opacity = clamp(parseNumber(options.opacity, 0.2), 0.05, 1);
    const rotation = parseNumber(options.rotation, -24);
    const scale = clamp(parseNumber(options.scale, 0.24), 0.05, 1);
    const fontSize = parseNumber(options.fontSize, 32);
    const text = String(options.text ?? 'JH Toolbox').trim() || 'JH Toolbox';

    if (!pdfFiles.length) {
      throw new Error('Add at least one PDF file to watermark.');
    }

    let watermarkImageBytes: Uint8Array | null = null;
    let watermarkImageType: 'png' | 'jpg' | null = null;

    if (watermarkType === 'image') {
      const watermarkFile = resolvePdfWatermarkImage(files);
      if (!watermarkFile) {
        throw new Error('Add a watermark image along with the PDF file.');
      }

      if (watermarkFile.type === 'image/jpeg' || watermarkFile.type === 'image/jpg') {
        watermarkImageBytes = new Uint8Array(await watermarkFile.arrayBuffer());
        watermarkImageType = 'jpg';
      } else {
        const pngBlob = await anyImageToPngBlob(watermarkFile);
        watermarkImageBytes = new Uint8Array(await pngBlob.arrayBuffer());
        watermarkImageType = 'png';
      }
    }

    const outputFiles: ProcessedFile[] = [];
    for (let fileIndex = 0; fileIndex < pdfFiles.length; fileIndex += 1) {
      const source = pdfFiles[fileIndex];
      onProgress({ percent: (fileIndex / pdfFiles.length) * 100, stage: 'Applying watermark' });
      const documentHandle = await PDFDocument.load(await source.arrayBuffer());

      const embeddedWatermark =
        watermarkImageBytes && watermarkImageType === 'jpg'
          ? await documentHandle.embedJpg(watermarkImageBytes)
          : watermarkImageBytes && watermarkImageType === 'png'
            ? await documentHandle.embedPng(watermarkImageBytes)
            : null;

      documentHandle.getPages().forEach((page) => {
        const { width, height } = page.getSize();

        if (embeddedWatermark) {
          const targetWidth = Math.max(48, width * scale);
          const targetHeight = (targetWidth / embeddedWatermark.width) * embeddedWatermark.height;
          page.drawImage(embeddedWatermark, {
            x: Math.max(0, width - targetWidth - 24),
            y: Math.max(0, 24),
            width: Math.min(targetWidth, width),
            height: Math.min(targetHeight, height),
            opacity,
            rotate: pdfDegrees(rotation),
          });
          return;
        }

        page.drawText(text, {
          x: Math.max(24, width * 0.5 - text.length * fontSize * 0.28),
          y: height * 0.5,
          size: fontSize,
          color: rgb(0.12, 0.12, 0.12),
          opacity,
          rotate: pdfDegrees(rotation),
        });
      });

      const bytes = await documentHandle.save({ useObjectStreams: true });
      outputFiles.push({
        name: `${baseName(source.name)}-watermarked.pdf`,
        blob: blobFromBytes(bytes, 'application/pdf'),
        mimeType: 'application/pdf',
      });
    }

    return outputFiles;
  }

  if (toolId === 'pdf-redact') {
    const source = files[0];
    const pageStart = Math.max(1, Math.floor(parseNumber(options.pageStart, 1)));
    const pageEnd = Math.max(pageStart, Math.floor(parseNumber(options.pageEnd, pageStart)));
    const x = Math.max(0, parseNumber(options.x, 40));
    const y = Math.max(0, parseNumber(options.y, 40));
    const width = Math.max(1, parseNumber(options.width, 240));
    const height = Math.max(1, parseNumber(options.height, 48));
    const color = parseColor(String(options.color ?? '#000000'));

    const documentHandle = await PDFDocument.load(await source.arrayBuffer());
    documentHandle.getPages().forEach((page, index) => {
      const pageNumber = index + 1;
      if (pageNumber < pageStart || pageNumber > pageEnd) {
        return;
      }

      page.drawRectangle({
        x,
        y,
        width,
        height,
        color,
        borderColor: color,
        borderWidth: 0,
      });
    });

    const bytes = await documentHandle.save({ useObjectStreams: true });
    return [
      {
        name: `${baseName(source.name)}-redacted.pdf`,
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

  if (toolId === 'pdf-to-word') {
    const source = files[0];
    const pages = await extractPdfTextPages(source, (value) =>
      onProgress({ percent: value * 100, stage: 'Extracting PDF text for Word' }),
    );
    const blob = await createDocxFromPdfPages(pages, baseName(source.name));
    return [
      {
        name: `${baseName(source.name)}.docx`,
        blob,
        mimeType: DOCX_MIME,
        metadata: {
          pages: pages.length,
          mode: 'text extraction',
        },
      },
    ];
  }

  if (toolId === 'pdf-to-excel') {
    const source = files[0];
    const pages = await extractPdfTextPages(source, (value) =>
      onProgress({ percent: value * 100, stage: 'Extracting PDF text for Excel' }),
    );
    const blob = createWorkbookFromPdfPages(pages);
    return [
      {
        name: `${baseName(source.name)}.xlsx`,
        blob,
        mimeType: XLSX_MIME,
        metadata: {
          sheets: pages.length,
          mode: 'line extraction',
        },
      },
    ];
  }

  if (toolId === 'word-to-pdf') {
    const source = files[0];
    const blocks = await extractDocxBlocks(source);
    const blob = await renderBlocksToPdfBlob(blocks);
    return [
      {
        name: `${baseName(source.name)}.pdf`,
        blob,
        mimeType: 'application/pdf',
      },
    ];
  }

  if (toolId === 'powerpoint-to-pdf') {
    const source = files[0];
    const blocks = await extractPptxBlocks(source);
    const blob = await renderBlocksToPdfBlob(blocks);
    return [
      {
        name: `${baseName(source.name)}.pdf`,
        blob,
        mimeType: 'application/pdf',
        metadata: {
          mode: 'slide text extraction',
        },
      },
    ];
  }

  if (toolId === 'excel-to-pdf') {
    const source = files[0];
    const workbook = XLSX.read(await source.arrayBuffer(), { type: 'array', cellDates: true });
    const blocks = workbookToBlocks(source.name, workbook);
    const blob = await renderBlocksToPdfBlob(blocks);
    return [
      {
        name: `${baseName(source.name)}.pdf`,
        blob,
        mimeType: 'application/pdf',
        metadata: {
          sheets: workbook.SheetNames.length,
        },
      },
    ];
  }

  if (toolId === 'html-to-pdf') {
    const source = files[0];
    const width = Math.max(320, Math.floor(parseNumber(options.width, 1200)));
    const blob = await renderHtmlFileToPdf(source, width);
    return [
      {
        name: `${baseName(source.name)}.pdf`,
        blob,
        mimeType: 'application/pdf',
        metadata: {
          mode: 'html render',
          width,
        },
      },
    ];
  }

  if (toolId === 'edit-pdf') {
    return [await processEditPdf(files, options)];
  }

  if (toolId === 'pdf-sign') {
    return [await processSignPdf(files, options)];
  }

  if (toolId === 'pdf-repair') {
    return [await processRepairPdf(files[0])];
  }

  if (toolId === 'pdf-compare') {
    const pdfFiles = resolvePdfInputs(files);
    if (pdfFiles.length < 2) {
      throw new Error('Add two PDF files to compare.');
    }

    const ignoreWhitespace = parseBoolean(options.ignoreWhitespace, true);
    const leftPages = await extractPdfTextPages(pdfFiles[0], (value) =>
      onProgress({ percent: value * 50, stage: 'Extracting text from the first PDF' }),
    );
    const rightPages = await extractPdfTextPages(pdfFiles[1], (value) =>
      onProgress({ percent: 50 + value * 50, stage: 'Extracting text from the second PDF' }),
    );
    const report = buildPdfCompareReport(pdfFiles[0].name, pdfFiles[1].name, leftPages, rightPages, ignoreWhitespace);
    const blob = new Blob([report.text], { type: 'text/plain' });

    return [
      {
        name: `${baseName(pdfFiles[0].name)}-vs-${baseName(pdfFiles[1].name)}.txt`,
        blob,
        mimeType: 'text/plain',
        textContent: report.text,
        metadata: report.metadata,
      },
    ];
  }

  if (toolId === 'pdf-to-pdfa') {
    return [await processPdfAClone(files[0], options)];
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

      let embeddedImage: Awaited<ReturnType<PDFDocument['embedPng']>> | Awaited<ReturnType<PDFDocument['embedJpg']>>;
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
