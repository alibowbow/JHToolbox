import imageCompression from 'browser-image-compression';
import picaFactory from 'pica';
import { ProcessContext, ProcessedFile } from '@/types/processor';
import { baseName, parseBoolean, parseNumber } from '@/lib/utils';

const pica = picaFactory();

function mimeExt(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  return 'png';
}

async function toBitmap(file: Blob): Promise<ImageBitmap> {
  return await createImageBitmap(file);
}

function canvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(width));
  c.height = Math.max(1, Math.round(height));
  return c;
}

async function canvasBlob(source: HTMLCanvasElement, mimeType = 'image/png', quality = 0.92): Promise<Blob> {
  return await new Promise((resolve, reject) => {
    source.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('이미지 Blob 생성에 실패했습니다.'));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality,
    );
  });
}

async function exportCanvas(
  source: HTMLCanvasElement,
  originalName: string,
  mimeType = 'image/png',
  quality = 0.92,
): Promise<ProcessedFile> {
  const blob = await canvasBlob(source, mimeType, quality);
  const ext = mimeExt(mimeType);
  const name = `${baseName(originalName)}.${ext}`;

  return {
    name,
    blob,
    mimeType,
  };
}

async function resizeWithPica(file: File, width: number, height: number, mimeType: string): Promise<ProcessedFile> {
  const bitmap = await toBitmap(file);
  const from = canvas(bitmap.width, bitmap.height);
  from.getContext('2d')!.drawImage(bitmap, 0, 0);

  const target = canvas(width, height);
  await pica.resize(from, target);
  bitmap.close();

  return await exportCanvas(target, file.name, mimeType, 0.92);
}

function clampRect(x: number, y: number, width: number, height: number, maxW: number, maxH: number) {
  const nx = Math.max(0, Math.min(x, maxW - 1));
  const ny = Math.max(0, Math.min(y, maxH - 1));
  const nw = Math.max(1, Math.min(width, maxW - nx));
  const nh = Math.max(1, Math.min(height, maxH - ny));
  return { x: nx, y: ny, width: nw, height: nh };
}

async function convertFormat(file: File, mimeType: string, quality = 0.9): Promise<ProcessedFile> {
  const bitmap = await toBitmap(file);
  const c = canvas(bitmap.width, bitmap.height);
  c.getContext('2d')!.drawImage(bitmap, 0, 0);
  bitmap.close();
  return await exportCanvas(c, file.name, mimeType, quality);
}

function splitTargets(toolId: string): { mimeType: string; quality: number } | null {
  if (toolId === 'png-jpg' || toolId === 'gif-jpg' || toolId === 'tiff-jpg' || toolId === 'webp-jpg') {
    return { mimeType: 'image/jpeg', quality: 0.9 };
  }
  if (toolId === 'jpg-png' || toolId === 'gif-png' || toolId === 'tiff-png' || toolId === 'webp-png' || toolId === 'svg-png') {
    return { mimeType: 'image/png', quality: 1 };
  }
  if (toolId === 'png-webp' || toolId === 'jpg-webp') {
    return { mimeType: 'image/webp', quality: 0.9 };
  }
  return null;
}

function getOutputMime(options: Record<string, string | number | boolean>, fallback: string): string {
  const format = options.format;
  if (typeof format === 'string' && format.startsWith('image/')) {
    return format;
  }
  return fallback;
}

async function addTextWithFabricFallback(
  source: HTMLCanvasElement,
  text: string,
  fontSize: number,
  color: string,
  x: number,
  y: number,
): Promise<void> {
  try {
    const fabricAny: any = await import('fabric');
    const staticCanvas = new fabricAny.StaticCanvas(null, {
      width: source.width,
      height: source.height,
    });
    const bg = new fabricAny.Image(source, {
      left: 0,
      top: 0,
    });
    staticCanvas.add(bg);
    const txt = new fabricAny.Text(text, { left: x, top: y, fill: color, fontSize });
    staticCanvas.add(txt);
    staticCanvas.renderAll();

    const output = staticCanvas.toCanvasElement();
    const ctx = source.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, source.width, source.height);
      ctx.drawImage(output, 0, 0);
    }
  } catch {
    const ctx = source.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.fillStyle = color;
    ctx.font = `${fontSize}px sans-serif`;
    ctx.fillText(text, x, y);
  }
}

export async function processImageTool(ctx: ProcessContext): Promise<ProcessedFile[]> {
  const { toolId, files, options, onProgress } = ctx;

  const conversionTarget = splitTargets(toolId);
  if (conversionTarget) {
    const out: ProcessedFile[] = [];
    for (let index = 0; index < files.length; index += 1) {
      onProgress({ percent: (index / files.length) * 100, stage: '이미지 변환 중' });
      out.push(await convertFormat(files[index], conversionTarget.mimeType, conversionTarget.quality));
    }
    return out;
  }

  if (toolId === 'image-resize') {
    const width = parseNumber(options.width, 1280);
    const height = parseNumber(options.height, 720);
    const mimeType = getOutputMime(options, 'image/png');

    const output: ProcessedFile[] = [];
    for (let index = 0; index < files.length; index += 1) {
      onProgress({ percent: (index / files.length) * 100, stage: '리사이즈 처리 중' });
      output.push(await resizeWithPica(files[index], width, height, mimeType));
    }
    return output;
  }

  if (toolId === 'image-compress') {
    const quality = parseNumber(options.quality, 0.75);
    const mimeType = getOutputMime(options, 'image/jpeg');

    const out: ProcessedFile[] = [];
    for (let index = 0; index < files.length; index += 1) {
      onProgress({ percent: (index / files.length) * 100, stage: '압축 중' });
      const compressed = await imageCompression(files[index], {
        initialQuality: Math.max(0.1, Math.min(1, quality)),
        fileType: mimeType,
        useWebWorker: true,
      });
      out.push({
        name: `${baseName(files[index].name)}.${mimeExt(mimeType)}`,
        blob: compressed,
        mimeType,
      });
    }
    return out;
  }

  if (toolId === 'image-crop') {
    const out: ProcessedFile[] = [];
    const x = parseNumber(options.x, 0);
    const y = parseNumber(options.y, 0);
    const width = parseNumber(options.width, 512);
    const height = parseNumber(options.height, 512);

    for (let index = 0; index < files.length; index += 1) {
      onProgress({ percent: (index / files.length) * 100, stage: '크롭 처리 중' });
      const bitmap = await toBitmap(files[index]);
      const rect = clampRect(x, y, width, height, bitmap.width, bitmap.height);
      const c = canvas(rect.width, rect.height);
      c.getContext('2d')!.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
      bitmap.close();
      out.push(await exportCanvas(c, files[index].name, 'image/png', 1));
    }

    return out;
  }

  if (toolId === 'image-flip') {
    const horizontal = parseBoolean(options.horizontal, true);
    const vertical = parseBoolean(options.vertical, false);
    const out: ProcessedFile[] = [];

    for (let index = 0; index < files.length; index += 1) {
      onProgress({ percent: (index / files.length) * 100, stage: '반전 처리 중' });
      const bitmap = await toBitmap(files[index]);
      const c = canvas(bitmap.width, bitmap.height);
      const ctx2d = c.getContext('2d')!;

      ctx2d.save();
      ctx2d.translate(horizontal ? bitmap.width : 0, vertical ? bitmap.height : 0);
      ctx2d.scale(horizontal ? -1 : 1, vertical ? -1 : 1);
      ctx2d.drawImage(bitmap, 0, 0);
      ctx2d.restore();
      bitmap.close();

      out.push(await exportCanvas(c, files[index].name, 'image/png', 1));
    }

    return out;
  }

  if (toolId === 'image-rotate') {
    const degrees = parseNumber(options.degrees, 90);
    const radians = (degrees * Math.PI) / 180;
    const out: ProcessedFile[] = [];

    for (let index = 0; index < files.length; index += 1) {
      onProgress({ percent: (index / files.length) * 100, stage: '회전 처리 중' });
      const bitmap = await toBitmap(files[index]);
      const cos = Math.abs(Math.cos(radians));
      const sin = Math.abs(Math.sin(radians));
      const width = Math.round(bitmap.width * cos + bitmap.height * sin);
      const height = Math.round(bitmap.width * sin + bitmap.height * cos);
      const c = canvas(width, height);
      const ctx2d = c.getContext('2d')!;
      ctx2d.translate(width / 2, height / 2);
      ctx2d.rotate(radians);
      ctx2d.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
      bitmap.close();
      out.push(await exportCanvas(c, files[index].name, 'image/png', 1));
    }

    return out;
  }

  if (toolId === 'image-pixelate') {
    const size = Math.max(2, parseNumber(options.size, 10));
    const out: ProcessedFile[] = [];

    for (let index = 0; index < files.length; index += 1) {
      onProgress({ percent: (index / files.length) * 100, stage: '픽셀화 처리 중' });
      const bitmap = await toBitmap(files[index]);
      const c = canvas(bitmap.width, bitmap.height);
      const ctx2d = c.getContext('2d')!;

      const smallW = Math.max(1, Math.floor(bitmap.width / size));
      const smallH = Math.max(1, Math.floor(bitmap.height / size));

      const temp = canvas(smallW, smallH);
      const tctx = temp.getContext('2d')!;
      tctx.drawImage(bitmap, 0, 0, smallW, smallH);

      ctx2d.imageSmoothingEnabled = false;
      ctx2d.drawImage(temp, 0, 0, smallW, smallH, 0, 0, bitmap.width, bitmap.height);
      bitmap.close();
      out.push(await exportCanvas(c, files[index].name, 'image/png', 1));
    }

    return out;
  }

  if (toolId === 'image-add-text') {
    const text = String(options.text ?? 'TinyWow Tools');
    const fontSize = parseNumber(options.fontSize, 42);
    const color = String(options.color ?? '#ffffff');
    const x = parseNumber(options.x, 20);
    const y = parseNumber(options.y, 60);

    const out: ProcessedFile[] = [];
    for (let index = 0; index < files.length; index += 1) {
      onProgress({ percent: (index / files.length) * 100, stage: '텍스트 추가 중' });
      const bitmap = await toBitmap(files[index]);
      const c = canvas(bitmap.width, bitmap.height);
      c.getContext('2d')!.drawImage(bitmap, 0, 0);
      bitmap.close();
      await addTextWithFabricFallback(c, text, fontSize, color, x, y);
      out.push(await exportCanvas(c, files[index].name, 'image/png', 1));
    }

    return out;
  }

  if (toolId === 'image-add-border') {
    const borderSize = parseNumber(options.size, 16);
    const color = String(options.color ?? '#0ea5e9');

    const out: ProcessedFile[] = [];
    for (let index = 0; index < files.length; index += 1) {
      onProgress({ percent: (index / files.length) * 100, stage: '테두리 추가 중' });
      const bitmap = await toBitmap(files[index]);
      const c = canvas(bitmap.width + borderSize * 2, bitmap.height + borderSize * 2);
      const ctx2d = c.getContext('2d')!;
      ctx2d.fillStyle = color;
      ctx2d.fillRect(0, 0, c.width, c.height);
      ctx2d.drawImage(bitmap, borderSize, borderSize);
      bitmap.close();
      out.push(await exportCanvas(c, files[index].name, 'image/png', 1));
    }

    return out;
  }

  if (toolId === 'image-split') {
    const rows = Math.max(1, parseNumber(options.rows, 2));
    const cols = Math.max(1, parseNumber(options.cols, 2));
    const out: ProcessedFile[] = [];

    const source = files[0];
    const bitmap = await toBitmap(source);
    const tileW = Math.floor(bitmap.width / cols);
    const tileH = Math.floor(bitmap.height / rows);

    let done = 0;
    for (let r = 0; r < rows; r += 1) {
      for (let cIdx = 0; cIdx < cols; cIdx += 1) {
        onProgress({
          percent: (done / (rows * cols)) * 100,
          stage: '이미지 분할 중',
        });
        const c = canvas(tileW, tileH);
        c.getContext('2d')!.drawImage(
          bitmap,
          cIdx * tileW,
          r * tileH,
          tileW,
          tileH,
          0,
          0,
          tileW,
          tileH,
        );

        out.push({
          name: `${baseName(source.name)}-r${r + 1}-c${cIdx + 1}.png`,
          blob: await canvasBlob(c, 'image/png', 1),
          mimeType: 'image/png',
        });
        done += 1;
      }
    }

    bitmap.close();
    return out;
  }

  if (toolId === 'image-combine') {
    if (!files.length) {
      return [];
    }

    const direction = String(options.direction ?? 'horizontal');
    const gap = Math.max(0, parseNumber(options.gap, 8));
    const bitmaps = await Promise.all(files.map((file) => toBitmap(file)));

    const width =
      direction === 'horizontal'
        ? bitmaps.reduce((sum, bmp) => sum + bmp.width, 0) + gap * (bitmaps.length - 1)
        : Math.max(...bitmaps.map((bmp) => bmp.width));

    const height =
      direction === 'vertical'
        ? bitmaps.reduce((sum, bmp) => sum + bmp.height, 0) + gap * (bitmaps.length - 1)
        : Math.max(...bitmaps.map((bmp) => bmp.height));

    const c = canvas(width, height);
    const ctx2d = c.getContext('2d')!;
    let cursorX = 0;
    let cursorY = 0;

    bitmaps.forEach((bmp, index) => {
      onProgress({ percent: (index / bitmaps.length) * 100, stage: '이미지 결합 중' });
      ctx2d.drawImage(bmp, cursorX, cursorY);
      if (direction === 'horizontal') {
        cursorX += bmp.width + gap;
      } else {
        cursorY += bmp.height + gap;
      }
      bmp.close();
    });

    return [await exportCanvas(c, 'combined.png', 'image/png', 1)];
  }

  if (toolId === 'image-collage') {
    if (!files.length) {
      return [];
    }

    const cols = Math.max(1, parseNumber(options.columns, 3));
    const gap = Math.max(0, parseNumber(options.gap, 8));
    const bg = String(options.background ?? '#ffffff');
    const thumbs = await Promise.all(files.map((file) => toBitmap(file)));
    const cell = 320;
    const rows = Math.ceil(thumbs.length / cols);

    const totalW = cols * cell + gap * (cols + 1);
    const totalH = rows * cell + gap * (rows + 1);
    const c = canvas(totalW, totalH);
    const ctx2d = c.getContext('2d')!;

    ctx2d.fillStyle = bg;
    ctx2d.fillRect(0, 0, totalW, totalH);

    thumbs.forEach((bmp, index) => {
      onProgress({ percent: (index / thumbs.length) * 100, stage: '콜라주 생성 중' });
      const row = Math.floor(index / cols);
      const col = index % cols;
      const x = gap + col * (cell + gap);
      const y = gap + row * (cell + gap);
      const scale = Math.min(cell / bmp.width, cell / bmp.height);
      const width = Math.round(bmp.width * scale);
      const height = Math.round(bmp.height * scale);
      const offsetX = x + Math.floor((cell - width) / 2);
      const offsetY = y + Math.floor((cell - height) / 2);
      ctx2d.drawImage(bmp, offsetX, offsetY, width, height);
      bmp.close();
    });

    return [await exportCanvas(c, 'collage.png', 'image/png', 1)];
  }

  if (toolId === 'image-background-transparent') {
    const threshold = Math.max(0, Math.min(255, parseNumber(options.threshold, 235)));
    const out: ProcessedFile[] = [];

    for (let index = 0; index < files.length; index += 1) {
      onProgress({ percent: (index / files.length) * 100, stage: '배경 투명화 중' });
      const bmp = await toBitmap(files[index]);
      const c = canvas(bmp.width, bmp.height);
      const ctx2d = c.getContext('2d')!;
      ctx2d.drawImage(bmp, 0, 0);
      bmp.close();

      const imageData = ctx2d.getImageData(0, 0, c.width, c.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] >= threshold && data[i + 1] >= threshold && data[i + 2] >= threshold) {
          data[i + 3] = 0;
        }
      }
      ctx2d.putImageData(imageData, 0, 0);
      out.push(await exportCanvas(c, files[index].name, 'image/png', 1));
    }

    return out;
  }

  if (toolId === 'image-blur-background') {
    const radius = Math.max(1, parseNumber(options.radius, 8));
    const out: ProcessedFile[] = [];

    for (let index = 0; index < files.length; index += 1) {
      onProgress({ percent: (index / files.length) * 100, stage: '배경 블러 처리 중' });
      const bmp = await toBitmap(files[index]);
      const c = canvas(bmp.width, bmp.height);
      const ctx2d = c.getContext('2d')!;
      ctx2d.filter = `blur(${radius}px)`;
      ctx2d.drawImage(bmp, 0, 0);
      ctx2d.filter = 'none';
      bmp.close();
      out.push(await exportCanvas(c, files[index].name, 'image/png', 1));
    }

    return out;
  }

  return [];
}