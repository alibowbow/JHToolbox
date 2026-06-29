import { ProcessContext, ProcessedFile } from '@/types/processor';

// Processor modules are imported dynamically (below) rather than statically so
// that webpack splits each category into its own async chunk. Without this, a
// single static graph drags every category's heavy static deps (pdf-lib, xlsx,
// html2canvas, pica, browser-image-compression, qrcode …) into the shared
// bundle of *every* tool page. With dynamic import(), opening an image tool no
// longer downloads pdf-lib/xlsx, and the per-category code loads on first run.

const PDF_TOOLS = new Set([
  'pdf-merge',
  'pdf-split',
  'pdf-rearrange',
  'pdf-rotate',
  'pdf-delete-page',
  'pdf-add-page-numbers',
  'pdf-watermark',
  'pdf-redact',
  'pdf-extract-images',
  'pdf-compress',
  'pdf-reduce-size',
  'pdf-to-png',
  'pdf-to-jpg',
  'pdf-to-webp',
  'pdf-to-word',
  'pdf-to-excel',
  'word-to-pdf',
  'powerpoint-to-pdf',
  'excel-to-pdf',
  'html-to-pdf',
  'edit-pdf',
  'pdf-sign',
  'pdf-repair',
  'pdf-compare',
  'pdf-to-pdfa',
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
  'image-upscale',
  'image-watermark',
  'image-color-palette-extract',
  'image-auto-enhance',
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

const HWPX_TOOLS = new Set(['pdf-to-hwpx', 'hwpx-to-pdf']);

const OCR_TOOLS = new Set(['ocr-image-to-text', 'ocr-pdf-to-text']);
const MEDIA_TOOLS = new Set([
  'video-to-gif',
  'video-to-webp',
  'mute-video',
  'extract-audio',
  'video-compress',
  'video-convert',
  'video-speed-change',
  'video-crop',
  'video-resize',
  'video-watermark',
  'video-reverse',
  'video-thumbnail-generator',
  'images-to-gif',
  'gif-to-video',
  'gif-speed-change',
  'gif-reverse',
  'gif-frame-extract',
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
  'audio-merge',
  'audio-fade',
  'audio-speed-change',
  'audio-pitch-change',
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
    const { processPdfTool } = await import('@/lib/processors/pdf');
    return await processPdfTool(ctx);
  }

  if (HWPX_TOOLS.has(ctx.toolId)) {
    const { processHwpxTool } = await import('@/lib/processors/hwpx');
    return await processHwpxTool(ctx);
  }

  if (IMAGE_TOOLS.has(ctx.toolId)) {
    const { processImageTool } = await import('@/lib/processors/image');
    return await processImageTool(ctx);
  }

  if (OCR_TOOLS.has(ctx.toolId)) {
    const { processOcrTool } = await import('@/lib/processors/ocr');
    return await processOcrTool(ctx);
  }

  if (MEDIA_TOOLS.has(ctx.toolId)) {
    const { processMediaTool } = await import('@/lib/processors/media');
    return await processMediaTool(ctx);
  }

  if (DATA_TOOLS.has(ctx.toolId)) {
    const { processDataTool } = await import('@/lib/processors/data');
    return await processDataTool(ctx);
  }

  if (WEB_TOOLS.has(ctx.toolId)) {
    const { processWebTool } = await import('@/lib/processors/web');
    return await processWebTool(ctx);
  }

  throw new Error('Unsupported tool.');
}
