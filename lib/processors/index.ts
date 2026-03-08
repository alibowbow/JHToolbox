import { ProcessContext, ProcessedFile } from '@/types/processor';
import { processPdfTool } from '@/lib/processors/pdf';
import { processImageTool } from '@/lib/processors/image';
import { processOcrTool } from '@/lib/processors/ocr';
import { processMediaTool } from '@/lib/processors/media';
import { processDataTool } from '@/lib/processors/data';
import { processWebTool } from '@/lib/processors/web';

const PDF_TOOLS = new Set([
  'pdf-merge',
  'pdf-split',
  'pdf-rearrange',
  'pdf-rotate',
  'pdf-delete-page',
  'pdf-add-page-numbers',
  'pdf-extract-images',
  'pdf-compress',
  'pdf-to-png',
  'pdf-to-jpg',
  'pdf-to-webp',
  'image-to-pdf',
]);

const IMAGE_TOOLS = new Set([
  'image-resize',
  'image-compress',
  'image-crop',
  'image-flip',
  'image-rotate',
  'image-pixelate',
  'image-add-text',
  'image-add-border',
  'image-split',
  'image-combine',
  'image-collage',
  'image-background-transparent',
  'image-blur-background',
  'png-jpg',
  'jpg-png',
  'png-webp',
  'webp-png',
  'webp-jpg',
  'jpg-webp',
  'gif-jpg',
  'gif-png',
  'tiff-jpg',
  'tiff-png',
  'svg-png',
]);

const OCR_TOOLS = new Set(['ocr-image-to-text', 'ocr-pdf-to-text']);
const MEDIA_TOOLS = new Set([
  'video-to-gif',
  'video-to-webp',
  'mute-video',
  'extract-audio',
  'video-compress',
  'mp4-webm',
  'mp4-mov',
  'mov-mp4',
  'avi-mp4',
  'm4a-mp3',
  'm4a-wav',
  'aac-mp3',
  'webm-mp3',
  'mp4-wav',
  'audio-convert',
  'audio-cut',
]);

const DATA_TOOLS = new Set([
  'csv-json',
  'json-csv',
  'excel-csv',
  'csv-excel',
  'xml-json',
  'json-xml',
  'xml-csv',
  'split-csv',
  'create-zip',
  'extract-zip',
]);

const WEB_TOOLS = new Set(['qr-generator', 'url-image', 'url-pdf', 'detect-cms', 'image-metadata']);

export async function runTool(ctx: ProcessContext): Promise<ProcessedFile[]> {
  if (PDF_TOOLS.has(ctx.toolId)) {
    return await processPdfTool(ctx);
  }

  if (IMAGE_TOOLS.has(ctx.toolId)) {
    return await processImageTool(ctx);
  }

  if (OCR_TOOLS.has(ctx.toolId)) {
    return await processOcrTool(ctx);
  }

  if (MEDIA_TOOLS.has(ctx.toolId)) {
    return await processMediaTool(ctx);
  }

  if (DATA_TOOLS.has(ctx.toolId)) {
    return await processDataTool(ctx);
  }

  if (WEB_TOOLS.has(ctx.toolId)) {
    return await processWebTool(ctx);
  }

  throw new Error('Unsupported tool.');
}
