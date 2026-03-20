import { getFfmpeg } from '@/lib/processors/ffmpeg-client';
import { baseName, extOf, parseNumber } from '@/lib/utils';
import { ProcessContext, ProcessedFile } from '@/types/processor';

type MediaPreset = {
  outputName: string | ((file: File, options: Record<string, string | number | boolean>) => string);
  mimeType: string | ((file: File, options: Record<string, string | number | boolean>) => string);
  args: (input: string, file: File, output: string, options: Record<string, string | number | boolean>) => string[];
};

type AudioFormatConfig = {
  ext: string;
  mimeType: string;
  codecArgs: string[];
  bitrateOptional?: boolean;
};

type VideoFormatConfig = {
  ext: string;
  mimeType: string;
  withAudioArgs: string[];
  withoutAudioArgs: string[];
};

type UnifiedVideoOutputFormat = keyof typeof VIDEO_FORMATS | 'gif' | 'webp';
type AudioTransformProgress = {
  percent: number;
  stage: string;
};

type AudioTransformOptions = {
  outputFormat: string;
  bitrate?: string;
  sampleRate?: string;
  channels?: string;
  trimMode?: string;
  startTime?: number;
  endTime?: number;
  outputName?: string;
  onProgress?: (progress: AudioTransformProgress) => void;
};

const AUDIO_FORMATS: Record<string, AudioFormatConfig> = {
  mp3: { ext: 'mp3', mimeType: 'audio/mpeg', codecArgs: ['-c:a', 'libmp3lame'], bitrateOptional: true },
  wav: { ext: 'wav', mimeType: 'audio/wav', codecArgs: ['-c:a', 'pcm_s16le'] },
  m4a: { ext: 'm4a', mimeType: 'audio/mp4', codecArgs: ['-c:a', 'aac'], bitrateOptional: true },
  aac: { ext: 'aac', mimeType: 'audio/aac', codecArgs: ['-c:a', 'aac'], bitrateOptional: true },
  ogg: { ext: 'ogg', mimeType: 'audio/ogg', codecArgs: ['-c:a', 'libvorbis'], bitrateOptional: true },
  webm: { ext: 'webm', mimeType: 'audio/webm', codecArgs: ['-c:a', 'libopus'], bitrateOptional: true },
  flac: { ext: 'flac', mimeType: 'audio/flac', codecArgs: ['-c:a', 'flac'] },
};

const VIDEO_FORMATS: Record<string, VideoFormatConfig> = {
  mp4: {
    ext: 'mp4',
    mimeType: 'video/mp4',
    withAudioArgs: ['-c:v', 'libx264', '-crf', '23', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', 'faststart'],
    withoutAudioArgs: ['-c:v', 'libx264', '-crf', '23', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-an', '-movflags', 'faststart'],
  },
  webm: {
    ext: 'webm',
    mimeType: 'video/webm',
    withAudioArgs: ['-c:v', 'libvpx-vp9', '-crf', '36', '-b:v', '0', '-row-mt', '1', '-c:a', 'libopus'],
    withoutAudioArgs: ['-c:v', 'libvpx-vp9', '-crf', '36', '-b:v', '0', '-row-mt', '1', '-an'],
  },
  mov: {
    ext: 'mov',
    mimeType: 'video/quicktime',
    withAudioArgs: ['-c:v', 'libx264', '-crf', '23', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac'],
    withoutAudioArgs: ['-c:v', 'libx264', '-crf', '23', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-an'],
  },
};

const LEGACY_VIDEO_CONVERTER_OUTPUTS: Partial<Record<string, UnifiedVideoOutputFormat>> = {
  'mp4-webm': 'webm',
  'mp4-mov': 'mov',
  'mov-mp4': 'mp4',
  'avi-mp4': 'mp4',
  'video-to-gif': 'gif',
  'video-to-webp': 'webp',
  'gif-to-video': 'mp4',
};

function blobFromBytes(bytes: Uint8Array, mimeType: string): Blob {
  return new Blob([Uint8Array.from(bytes).buffer], { type: mimeType });
}

async function canvasBlob(source: HTMLCanvasElement, mimeType = 'image/png', quality = 0.92): Promise<Blob> {
  return await new Promise((resolve, reject) => {
    source.toBlob(
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

function getAudioFormatConfig(format: string, inputExt: string) {
  const normalizedInput = inputExt.toLowerCase();
  const requestedFormat = format === 'keep' ? normalizedInput : format.toLowerCase();

  if (requestedFormat === 'mp4') {
    return AUDIO_FORMATS.m4a;
  }

  return AUDIO_FORMATS[requestedFormat] ?? AUDIO_FORMATS.mp3;
}

function getAudioEncodingArgs(
  format: string,
  inputExt: string,
  options: Record<string, string | number | boolean>,
) {
  const config = getAudioFormatConfig(format, inputExt);
  const bitrate = String(options.bitrate ?? '192k');
  const sampleRate = String(options.sampleRate ?? 'keep');
  const channels = String(options.channels ?? 'keep');
  const args = [...config.codecArgs];

  if (config.bitrateOptional) {
    args.push('-b:a', bitrate);
  }

  if (sampleRate !== 'keep') {
    args.push('-ar', sampleRate);
  }

  if (channels !== 'keep') {
    args.push('-ac', channels);
  }

  return { config, args };
}

function getVideoFormatConfig(format: string) {
  const requestedFormat = format.toLowerCase();
  return VIDEO_FORMATS[requestedFormat] ?? VIDEO_FORMATS.mp4;
}

function hasTrimSelection(options: Record<string, string | number | boolean>) {
  const startTime = Math.max(0, parseNumber(options.startTime, 0));
  const endTime = Math.max(0, parseNumber(options.endTime, 0));
  return startTime > 0.01 || endTime > startTime + 0.05;
}

function buildVideoInputArgs(inputName: string, options: Record<string, string | number | boolean>) {
  const startTime = Math.max(0, parseNumber(options.startTime, 0));
  const endTime = Math.max(0, parseNumber(options.endTime, 0));

  if (endTime > startTime + 0.05) {
    return ['-ss', `${startTime}`, '-t', `${Number((endTime - startTime).toFixed(3))}`, '-i', inputName];
  }

  if (startTime > 0.01) {
    return ['-ss', `${startTime}`, '-i', inputName];
  }

  return ['-i', inputName];
}

function buildTempoFilter(speed: number) {
  let remaining = Math.max(0.25, Math.min(4, speed));
  const filters: string[] = [];

  while (remaining > 2) {
    filters.push('atempo=2');
    remaining /= 2;
  }

  while (remaining < 0.5) {
    filters.push('atempo=0.5');
    remaining /= 0.5;
  }

  filters.push(`atempo=${remaining.toFixed(4)}`);
  return filters.join(',');
}

function buildAudioConvertArgs(
  inputName: string,
  file: File,
  outputName: string,
  options: Record<string, string | number | boolean>,
) {
  const { args } = getAudioEncodingArgs(String(options.outputFormat ?? 'mp3'), extOf(file.name), options);
  return ['-i', inputName, '-vn', ...args, outputName];
}

function buildAudioCutArgs(
  inputName: string,
  file: File,
  outputName: string,
  options: Record<string, string | number | boolean>,
) {
  const trimMode = String(options.trimMode ?? 'keep');
  const startTime = Math.max(0, parseNumber(options.startTime, 0));
  const endTime = Math.max(startTime + 0.05, parseNumber(options.endTime, startTime + 1));
  const { args } = getAudioEncodingArgs(String(options.outputFormat ?? 'keep'), extOf(file.name), options);

  if (trimMode === 'remove') {
    if (startTime <= 0.05) {
      return ['-i', inputName, '-ss', `${endTime}`, ...args, outputName];
    }

    const filterGraph = [
      `[0:a]atrim=end=${startTime},asetpts=N/SR/TB[first]`,
      `[0:a]atrim=start=${endTime},asetpts=N/SR/TB[second]`,
      '[first][second]concat=n=2:v=0:a=1[out]',
    ].join(';');

    return ['-i', inputName, '-filter_complex', filterGraph, '-map', '[out]', ...args, outputName];
  }

  return ['-i', inputName, '-ss', `${startTime}`, '-to', `${endTime}`, ...args, outputName];
}

async function transformSingleAudioFile(
  file: File,
  outputName: string,
  mimeType: string,
  buildArgs: (inputName: string, outputName: string) => string[],
  onProgress?: (progress: AudioTransformProgress) => void,
) {
  const { ffmpeg, fetchFile } = await getFfmpeg((ratio) =>
    onProgress?.({
      percent: Math.max(5, Math.min(95, ratio * 100)),
      stage: 'Processing audio',
    }),
  );

  const inputName = `audio-transform-input-${Date.now()}.${extOf(file.name) || 'bin'}`;
  const fsOutputName = `audio-transform-output-${Date.now()}.${extOf(outputName) || 'bin'}`;

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));
    await ffmpeg.exec(buildArgs(inputName, fsOutputName));
    const data = await ffmpeg.readFile(fsOutputName);
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    onProgress?.({ percent: 100, stage: 'Finished audio' });
    return {
      name: outputName,
      blob: blobFromBytes(bytes, mimeType),
      mimeType,
    } satisfies ProcessedFile;
  } finally {
    await Promise.allSettled([ffmpeg.deleteFile(inputName), ffmpeg.deleteFile(fsOutputName)]);
  }
}

export async function convertAudioFile(file: File, options: AudioTransformOptions) {
  const config = getAudioFormatConfig(options.outputFormat, extOf(file.name));
  const outputName = options.outputName ?? `${baseName(file.name)}-converted.${config.ext}`;

  return await transformSingleAudioFile(
    file,
    outputName,
    config.mimeType,
    (inputName, fsOutputName) =>
      buildAudioConvertArgs(inputName, file, fsOutputName, {
        outputFormat: options.outputFormat,
        bitrate: options.bitrate ?? '192k',
        sampleRate: options.sampleRate ?? 'keep',
        channels: options.channels ?? 'keep',
      }),
    options.onProgress,
  );
}

export async function trimAudioFile(file: File, options: AudioTransformOptions) {
  const config = getAudioFormatConfig(options.outputFormat, extOf(file.name));
  const outputName = options.outputName ?? `${baseName(file.name)}-trimmed.${config.ext}`;

  return await transformSingleAudioFile(
    file,
    outputName,
    config.mimeType,
    (inputName, fsOutputName) =>
      buildAudioCutArgs(inputName, file, fsOutputName, {
        outputFormat: options.outputFormat,
        trimMode: options.trimMode ?? 'keep',
        startTime: options.startTime ?? 0,
        endTime: options.endTime ?? 0,
        bitrate: options.bitrate ?? '192k',
        sampleRate: options.sampleRate ?? 'keep',
        channels: options.channels ?? 'keep',
      }),
    options.onProgress,
  );
}

async function execWithFallback(ffmpeg: any, primaryArgs: string[], fallbackArgs: string[]) {
  try {
    await ffmpeg.exec(primaryArgs);
  } catch {
    await ffmpeg.exec(fallbackArgs);
  }
}

async function createTextWatermarkBlob(text: string, fontSize: number) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas unavailable for watermark generation.');
  }

  context.font = `700 ${fontSize}px sans-serif`;
  const metrics = context.measureText(text);
  const padding = Math.max(16, Math.floor(fontSize * 0.8));
  canvas.width = Math.ceil(metrics.width + padding * 2);
  canvas.height = Math.ceil(fontSize + padding * 1.8);

  const finalContext = canvas.getContext('2d');
  if (!finalContext) {
    throw new Error('Canvas unavailable for watermark generation.');
  }

  finalContext.clearRect(0, 0, canvas.width, canvas.height);
  finalContext.font = `700 ${fontSize}px sans-serif`;
  finalContext.textBaseline = 'middle';
  finalContext.fillStyle = '#ffffff';
  finalContext.strokeStyle = 'rgba(15, 23, 42, 0.55)';
  finalContext.lineWidth = Math.max(2, fontSize * 0.08);
  finalContext.strokeText(text, padding, canvas.height / 2);
  finalContext.fillText(text, padding, canvas.height / 2);

  return await canvasBlob(canvas, 'image/png', 1);
}

async function createThumbnailFromVideo(file: File, options: Record<string, string | number | boolean>) {
  const timestamp = Math.max(0, parseNumber(options.timestamp, 1));
  const outputFormat = String(options.format ?? 'jpg');
  const targetWidth = Math.max(120, parseNumber(options.width, 960));
  const url = URL.createObjectURL(file);

  try {
    const video = document.createElement('video');
    video.src = url;
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Failed to load video metadata.'));
    });

    const safeTime = Math.min(timestamp, Math.max(0, (video.duration || timestamp) - 0.05));
    video.currentTime = safeTime;

    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error('Failed to seek video.'));
    });

    const aspectRatio = video.videoWidth / Math.max(video.videoHeight, 1);
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = Math.max(1, Math.round(targetWidth / Math.max(aspectRatio, 0.01)));
    const drawContext = canvas.getContext('2d');
    if (!drawContext) {
      throw new Error('Canvas unavailable.');
    }

    drawContext.drawImage(video, 0, 0, canvas.width, canvas.height);
    const mimeType = outputFormat === 'png' ? 'image/png' : 'image/jpeg';
    const blob = await canvasBlob(canvas, mimeType, outputFormat === 'png' ? 1 : 0.92);

    return {
      name: `${baseName(file.name)}-thumbnail.${outputFormat === 'png' ? 'png' : 'jpg'}`,
      blob,
      mimeType,
    } satisfies ProcessedFile;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function writeImageFrames(ffmpeg: any, files: File[], dirName: string) {
  await ffmpeg.createDir(dirName);

  for (let index = 0; index < files.length; index += 1) {
    const bitmap = await createImageBitmap(files[index]);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      throw new Error('Canvas unavailable while preparing GIF frames.');
    }

    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pngBlob = await canvasBlob(canvas, 'image/png', 1);
    const bytes = new Uint8Array(await pngBlob.arrayBuffer());
    const frameName = `${dirName}/frame-${String(index + 1).padStart(3, '0')}.png`;
    await ffmpeg.writeFile(frameName, bytes);
  }
}

async function readDirectoryPngs(ffmpeg: any, dirName: string) {
  const nodes = await ffmpeg.listDir(dirName);
  const files = nodes.filter((node: { name: string; isDir: boolean }) => !node.isDir && node.name.endsWith('.png'));
  files.sort((left: { name: string }, right: { name: string }) => left.name.localeCompare(right.name));
  return files;
}

async function processAudioMerge(ctx: ProcessContext) {
  const { files, options, onProgress } = ctx;
  const { ffmpeg, fetchFile } = await getFfmpeg((ratio) =>
    onProgress({
      percent: Math.max(5, Math.min(95, ratio * 100)),
      stage: 'Processing audio',
    }),
  );

  const inputNames: string[] = [];
  const listName = 'audio-merge.txt';
  const inputExt = extOf(files[0]?.name ?? 'mp3');
  const { config, args } = getAudioEncodingArgs(String(options.outputFormat ?? 'mp3'), inputExt, options);

  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const inputName = `merge-input-${index}.${extOf(file.name) || 'bin'}`;
      inputNames.push(inputName);
      await ffmpeg.writeFile(inputName, await fetchFile(file));
    }

    const listText = inputNames.map((name) => `file '${name}'`).join('\n');
    await ffmpeg.writeFile(listName, new TextEncoder().encode(listText));

    const outputName = `audio-merge-output.${config.ext}`;
    await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', listName, ...args, outputName]);
    const data = await ffmpeg.readFile(outputName);
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

    return [
      {
        name: `merged-audio.${config.ext}`,
        blob: blobFromBytes(bytes, config.mimeType),
        mimeType: config.mimeType,
      },
    ] satisfies ProcessedFile[];
  } finally {
    await Promise.allSettled(inputNames.map((name) => ffmpeg.deleteFile(name)));
    await Promise.allSettled([ffmpeg.deleteFile(listName)]);
    await Promise.allSettled(
      Object.values(AUDIO_FORMATS).map((item) => ffmpeg.deleteFile(`audio-merge-output.${item.ext}`)),
    );
  }
}

async function processAudioSingle(
  ctx: ProcessContext,
  buildArgs: (inputName: string, file: File, outputName: string, options: Record<string, string | number | boolean>) => string[],
  resolveOutput: (file: File, options: Record<string, string | number | boolean>) => { name: string; mimeType: string },
) {
  const { files, options, onProgress } = ctx;
  const { ffmpeg, fetchFile } = await getFfmpeg((ratio) =>
    onProgress({
      percent: Math.max(5, Math.min(95, ratio * 100)),
      stage: 'Processing audio',
    }),
  );

  const outputFiles: ProcessedFile[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const inputName = `audio-input-${index}.${extOf(file.name) || 'bin'}`;
    const { name, mimeType } = resolveOutput(file, options);
    const outputName = `audio-output-${index}.${extOf(name) || 'bin'}`;

    try {
      await ffmpeg.writeFile(inputName, await fetchFile(file));
      await ffmpeg.exec(buildArgs(inputName, file, outputName, options));
      const data = await ffmpeg.readFile(outputName);
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
      outputFiles.push({
        name,
        blob: blobFromBytes(bytes, mimeType),
        mimeType,
      });
      onProgress({ percent: ((index + 1) / files.length) * 100, stage: 'Finished file' });
    } finally {
      await Promise.allSettled([ffmpeg.deleteFile(inputName), ffmpeg.deleteFile(outputName)]);
    }
  }

  return outputFiles;
}

async function processAudioFade(ctx: ProcessContext) {
  return await processAudioSingle(
    ctx,
    (inputName, file, outputName, options) => {
      const fadeInDuration = Math.max(0, parseNumber(options.fadeInDuration, 1.5));
      const fadeOutDuration = Math.max(0, parseNumber(options.fadeOutDuration, 1.5));
      const { args } = getAudioEncodingArgs(String(options.outputFormat ?? 'mp3'), extOf(file.name), options);
      const filters: string[] = [];

      if (fadeInDuration > 0) {
        filters.push(`afade=t=in:st=0:d=${fadeInDuration}`);
      }

      if (fadeOutDuration > 0) {
        filters.push('areverse', `afade=t=in:st=0:d=${fadeOutDuration}`, 'areverse');
      }

      if (!filters.length) {
        return ['-i', inputName, ...args, outputName];
      }

      return ['-i', inputName, '-af', filters.join(','), ...args, outputName];
    },
    (file, options) => {
      const config = getAudioFormatConfig(String(options.outputFormat ?? 'mp3'), extOf(file.name));
      return {
        name: `${baseName(file.name)}-faded.${config.ext}`,
        mimeType: config.mimeType,
      };
    },
  );
}

async function processAudioSpeedChange(ctx: ProcessContext) {
  return await processAudioSingle(
    ctx,
    (inputName, file, outputName, options) => {
      const speed = Math.max(0.5, Math.min(2, parseNumber(options.speed, 1.25)));
      const { args } = getAudioEncodingArgs(String(options.outputFormat ?? 'mp3'), extOf(file.name), options);
      return ['-i', inputName, '-af', buildTempoFilter(speed), ...args, outputName];
    },
    (file, options) => {
      const config = getAudioFormatConfig(String(options.outputFormat ?? 'mp3'), extOf(file.name));
      return {
        name: `${baseName(file.name)}-speed.${config.ext}`,
        mimeType: config.mimeType,
      };
    },
  );
}

async function processAudioPitchChange(ctx: ProcessContext) {
  return await processAudioSingle(
    ctx,
    (inputName, file, outputName, options) => {
      const semitones = Math.max(-12, Math.min(12, parseNumber(options.semitones, 2)));
      const factor = Number(Math.pow(2, semitones / 12).toFixed(4));
      const { args } = getAudioEncodingArgs(String(options.outputFormat ?? 'mp3'), extOf(file.name), options);
      const filter = `asetrate=44100*${factor},aresample=44100,${buildTempoFilter(1 / factor)}`;
      return ['-i', inputName, '-af', filter, ...args, outputName];
    },
    (file, options) => {
      const config = getAudioFormatConfig(String(options.outputFormat ?? 'mp3'), extOf(file.name));
      return {
        name: `${baseName(file.name)}-pitch.${config.ext}`,
        mimeType: config.mimeType,
      };
    },
  );
}

async function processVideoConvert(ctx: ProcessContext, forcedOutputFormat?: UnifiedVideoOutputFormat) {
  const { files, options, onProgress } = ctx;
  const outputFormat = forcedOutputFormat ?? (String(options.outputFormat ?? 'mp4').toLowerCase() as UnifiedVideoOutputFormat);
  const { ffmpeg, fetchFile } = await getFfmpeg((ratio) =>
    onProgress({
      percent: Math.max(5, Math.min(95, ratio * 100)),
      stage: 'Converting video',
    }),
  );

  const outputFiles: ProcessedFile[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const inputName = `video-convert-input-${index}.${extOf(file.name) || 'bin'}`;
    const outputExt = outputFormat === 'gif' ? 'gif' : outputFormat === 'webp' ? 'webp' : getVideoFormatConfig(outputFormat).ext;
    const outputMimeType = outputFormat === 'gif' ? 'image/gif' : outputFormat === 'webp' ? 'image/webp' : getVideoFormatConfig(outputFormat).mimeType;
    const outputName = `video-convert-output-${index}.${outputExt}`;

    try {
      await ffmpeg.writeFile(inputName, await fetchFile(file));
      const inputArgs = buildVideoInputArgs(inputName, options);
      if (outputFormat === 'gif') {
        const fps = Math.max(1, Math.min(30, parseNumber(options.fps, 12)));
        const width = Math.max(120, Math.round(parseNumber(options.width, 640)));
        await ffmpeg.exec([...inputArgs, '-vf', `fps=${fps},scale=${width}:-1:flags=lanczos`, '-loop', '0', outputName]);
      } else if (outputFormat === 'webp') {
        const fps = Math.max(1, Math.min(30, parseNumber(options.fps, 12)));
        const width = Math.max(120, Math.round(parseNumber(options.width, 640)));
        await ffmpeg.exec([...inputArgs, '-vf', `fps=${fps},scale=${width}:-1`, '-loop', '0', '-lossless', '0', outputName]);
      } else {
        const config = getVideoFormatConfig(outputFormat);
        await execWithFallback(
          ffmpeg,
          [...inputArgs, ...config.withAudioArgs, outputName],
          [...inputArgs, ...config.withoutAudioArgs, outputName],
        );
      }

      const data = await ffmpeg.readFile(outputName);
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
      outputFiles.push({
        name: `${baseName(file.name)}-converted.${outputExt}`,
        blob: blobFromBytes(bytes, outputMimeType),
        mimeType: outputMimeType,
      });
      onProgress({ percent: ((index + 1) / files.length) * 100, stage: 'Finished file' });
    } finally {
      await Promise.allSettled([ffmpeg.deleteFile(inputName), ffmpeg.deleteFile(outputName)]);
    }
  }

  return outputFiles;
}

async function processVideoSpeedChange(ctx: ProcessContext) {
  const { files, options, onProgress } = ctx;
  const speed = Math.max(0.5, Math.min(2, parseNumber(options.speed, 1.25)));
  const { ffmpeg, fetchFile } = await getFfmpeg((ratio) =>
    onProgress({
      percent: Math.max(5, Math.min(95, ratio * 100)),
      stage: 'Processing video',
    }),
  );

  const outputFiles: ProcessedFile[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const inputName = `video-speed-input-${index}.${extOf(file.name) || 'bin'}`;
    const outputName = `video-speed-output-${index}.mp4`;

    try {
      await ffmpeg.writeFile(inputName, await fetchFile(file));
      const inputArgs = buildVideoInputArgs(inputName, options);
      await execWithFallback(
        ffmpeg,
        [...inputArgs, '-filter:v', `setpts=PTS/${speed}`, '-af', buildTempoFilter(speed), '-c:v', 'libx264', '-c:a', 'aac', outputName],
        [...inputArgs, '-filter:v', `setpts=PTS/${speed}`, '-an', '-c:v', 'libx264', outputName],
      );
      const data = await ffmpeg.readFile(outputName);
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
      outputFiles.push({
        name: `${baseName(file.name)}-speed.mp4`,
        blob: blobFromBytes(bytes, 'video/mp4'),
        mimeType: 'video/mp4',
      });
    } finally {
      await Promise.allSettled([ffmpeg.deleteFile(inputName), ffmpeg.deleteFile(outputName)]);
    }
  }

  return outputFiles;
}

async function processVideoWatermark(ctx: ProcessContext) {
  const { files, options, onProgress } = ctx;
  const sourceFiles = files.filter((file) => file.type.startsWith('video/'));
  const watermarkType = String(options.watermarkType ?? 'text');
  const opacity = Math.max(0.05, Math.min(1, parseNumber(options.opacity, 0.6)));
  const scale = Math.max(0.05, Math.min(1, parseNumber(options.scale, 0.24)));
  const x = Math.max(0, Math.round(parseNumber(options.x, 24)));
  const y = Math.max(0, Math.round(parseNumber(options.y, 24)));

  if (!sourceFiles.length) {
    throw new Error('Select at least one video file.');
  }

  const { ffmpeg, fetchFile } = await getFfmpeg((ratio) =>
    onProgress({
      percent: Math.max(5, Math.min(95, ratio * 100)),
      stage: 'Processing video',
    }),
  );

  let watermarkBlob: Blob;
  if (watermarkType === 'image') {
    const watermarkFile = files.find((file) => file.type.startsWith('image/'));
    if (!watermarkFile) {
      throw new Error('Add a PNG or JPG watermark image.');
    }
    watermarkBlob = watermarkFile;
  } else {
    watermarkBlob = await createTextWatermarkBlob(
      String(options.text ?? 'JH Toolbox'),
      Math.max(16, Math.round(parseNumber(options.fontSize, 42))),
    );
  }

  const watermarkExt = watermarkType === 'image' ? extOf((watermarkBlob as File).name ?? 'png') || 'png' : 'png';
  const watermarkName = `video-watermark.${watermarkExt}`;
  const outputFiles: ProcessedFile[] = [];

  try {
    await ffmpeg.writeFile(watermarkName, await fetchFile(watermarkBlob));

    for (let index = 0; index < sourceFiles.length; index += 1) {
      const file = sourceFiles[index];
      const inputName = `video-watermark-input-${index}.${extOf(file.name) || 'bin'}`;
      const outputName = `video-watermark-output-${index}.mp4`;
      const filterGraph = [
        `[1:v]format=rgba,colorchannelmixer=aa=${opacity.toFixed(2)},scale=iw*${scale}:ih*${scale}[wm]`,
        `[0:v][wm]overlay=${x}:${y}:format=auto[v]`,
      ].join(';');

      try {
        await ffmpeg.writeFile(inputName, await fetchFile(file));
        const inputArgs = buildVideoInputArgs(inputName, options);
        await execWithFallback(
          ffmpeg,
          [
            ...inputArgs,
            '-i',
            watermarkName,
            '-filter_complex',
            filterGraph,
            '-map',
            '[v]',
            '-map',
            '0:a?',
            '-c:v',
            'libx264',
            '-c:a',
            'aac',
            '-shortest',
            outputName,
          ],
          [
            ...inputArgs,
            '-i',
            watermarkName,
            '-filter_complex',
            filterGraph,
            '-map',
            '[v]',
            '-an',
            '-c:v',
            'libx264',
            '-shortest',
            outputName,
          ],
        );

        const data = await ffmpeg.readFile(outputName);
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        outputFiles.push({
          name: `${baseName(file.name)}-watermarked.mp4`,
          blob: blobFromBytes(bytes, 'video/mp4'),
          mimeType: 'video/mp4',
        });
      } finally {
        await Promise.allSettled([ffmpeg.deleteFile(inputName), ffmpeg.deleteFile(outputName)]);
      }
    }
  } finally {
    await Promise.allSettled([ffmpeg.deleteFile(watermarkName)]);
  }

  return outputFiles;
}

async function processVideoReverse(ctx: ProcessContext) {
  const { files, onProgress } = ctx;
  const { ffmpeg, fetchFile } = await getFfmpeg((ratio) =>
    onProgress({
      percent: Math.max(5, Math.min(95, ratio * 100)),
      stage: 'Processing video',
    }),
  );

  const outputFiles: ProcessedFile[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const inputName = `video-reverse-input-${index}.${extOf(file.name) || 'bin'}`;
    const outputName = `video-reverse-output-${index}.mp4`;

    try {
      await ffmpeg.writeFile(inputName, await fetchFile(file));
      const inputArgs = buildVideoInputArgs(inputName, ctx.options);
      await execWithFallback(
        ffmpeg,
        [...inputArgs, '-vf', 'reverse', '-af', 'areverse', '-c:v', 'libx264', '-c:a', 'aac', outputName],
        [...inputArgs, '-vf', 'reverse', '-an', '-c:v', 'libx264', outputName],
      );

      const data = await ffmpeg.readFile(outputName);
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
      outputFiles.push({
        name: `${baseName(file.name)}-reversed.mp4`,
        blob: blobFromBytes(bytes, 'video/mp4'),
        mimeType: 'video/mp4',
      });
    } finally {
      await Promise.allSettled([ffmpeg.deleteFile(inputName), ffmpeg.deleteFile(outputName)]);
    }
  }

  return outputFiles;
}

async function processVideoThumbnail(ctx: ProcessContext) {
  const { files, options, onProgress } = ctx;
  const outputFiles: ProcessedFile[] = [];

  for (let index = 0; index < files.length; index += 1) {
    onProgress({ percent: (index / files.length) * 100, stage: 'Capturing thumbnail' });
    outputFiles.push(await createThumbnailFromVideo(files[index], options));
  }

  return outputFiles;
}

async function processImagesToGif(ctx: ProcessContext) {
  const { files, options, onProgress } = ctx;
  const fps = Math.max(1, Math.min(24, parseNumber(options.fps, 4)));
  const width = Math.max(120, Math.round(parseNumber(options.width, 640)));
  const framesDir = `gif-frames-${Date.now()}`;
  const outputName = 'images-to-gif-output.gif';
  const { ffmpeg } = await getFfmpeg((ratio) =>
    onProgress({
      percent: Math.max(5, Math.min(95, ratio * 100)),
      stage: 'Building GIF',
    }),
  );

  try {
    await writeImageFrames(ffmpeg, files, framesDir);
    await ffmpeg.exec([
      '-framerate',
      `${fps}`,
      '-i',
      `${framesDir}/frame-%03d.png`,
      '-vf',
      `scale=${width}:-1:flags=lanczos`,
      '-loop',
      '0',
      outputName,
    ]);

    const data = await ffmpeg.readFile(outputName);
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    return [
      {
        name: 'animated.gif',
        blob: blobFromBytes(bytes, 'image/gif'),
        mimeType: 'image/gif',
      },
    ];
  } finally {
    const frameNodes = await readDirectoryPngs(ffmpeg, framesDir).catch(() => []);
    await Promise.allSettled(
      frameNodes.map((node: { name: string }) => ffmpeg.deleteFile(`${framesDir}/${node.name}`)),
    );
    await Promise.allSettled([ffmpeg.deleteDir(framesDir), ffmpeg.deleteFile(outputName)]);
  }
}

async function processGifFrameExtract(ctx: ProcessContext) {
  const { files, onProgress } = ctx;
  const { ffmpeg, fetchFile } = await getFfmpeg((ratio) =>
    onProgress({
      percent: Math.max(5, Math.min(95, ratio * 100)),
      stage: 'Extracting GIF frames',
    }),
  );

  const outputFiles: ProcessedFile[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const inputName = `gif-frame-input-${index}.${extOf(file.name) || 'gif'}`;
    const dirName = `gif-frame-output-${index}`;

    try {
      await ffmpeg.writeFile(inputName, await fetchFile(file));
      await ffmpeg.createDir(dirName);
      await ffmpeg.exec(['-i', inputName, '-vsync', '0', `${dirName}/frame-%03d.png`]);

      const pngFiles = await readDirectoryPngs(ffmpeg, dirName);
      for (const node of pngFiles) {
        const data = await ffmpeg.readFile(`${dirName}/${node.name}`);
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        outputFiles.push({
          name: `${baseName(file.name)}-${node.name}`,
          blob: blobFromBytes(bytes, 'image/png'),
          mimeType: 'image/png',
        });
      }
    } finally {
      const pngFiles = await readDirectoryPngs(ffmpeg, dirName).catch(() => []);
      await Promise.allSettled(
        pngFiles.map((node: { name: string }) => ffmpeg.deleteFile(`${dirName}/${node.name}`)),
      );
      await Promise.allSettled([ffmpeg.deleteDir(dirName), ffmpeg.deleteFile(inputName)]);
    }
  }

  return outputFiles;
}

const presets: Record<string, MediaPreset> = {
  'video-to-gif': {
    outputName: 'output.gif',
    mimeType: 'image/gif',
    args: (input, _file, output, options) => {
      const fps = Math.max(1, parseNumber(options.fps, 12));
      const width = Math.max(120, parseNumber(options.width, 480));
      return [...buildVideoInputArgs(input, options), '-vf', `fps=${fps},scale=${width}:-1:flags=lanczos`, '-loop', '0', output];
    },
  },
  'video-to-webp': {
    outputName: 'output.webp',
    mimeType: 'image/webp',
    args: (input, _file, output, options) => {
      const fps = Math.max(1, parseNumber(options.fps, 12));
      const width = Math.max(120, parseNumber(options.width, 640));
      return [...buildVideoInputArgs(input, options), '-vf', `fps=${fps},scale=${width}:-1`, '-loop', '0', '-lossless', '0', output];
    },
  },
  'mute-video': {
    outputName: 'output.mp4',
    mimeType: 'video/mp4',
    args: (input, _file, output, options) =>
      hasTrimSelection(options)
        ? [...buildVideoInputArgs(input, options), '-c:v', 'libx264', '-an', output]
        : ['-i', input, '-c:v', 'copy', '-an', output],
  },
  'extract-audio': {
    outputName: 'output.mp3',
    mimeType: 'audio/mpeg',
    args: (input, _file, output, options) => [...buildVideoInputArgs(input, options), '-vn', '-acodec', 'libmp3lame', '-q:a', '2', output],
  },
  'video-compress': {
    outputName: 'output.mp4',
    mimeType: 'video/mp4',
    args: (input, _file, output, options) => {
      const crf = Math.max(18, Math.min(40, parseNumber(options.crf, 28)));
      return [...buildVideoInputArgs(input, options), '-c:v', 'libx264', '-crf', `${crf}`, '-preset', 'medium', '-c:a', 'aac', output];
    },
  },
  'video-trim': {
    outputName: 'output.mp4',
    mimeType: 'video/mp4',
    args: (input, _file, output, options) => {
      return [...buildVideoInputArgs(input, options), '-c:v', 'libx264', '-c:a', 'aac', output];
    },
  },
  'video-crop': {
    outputName: 'output.mp4',
    mimeType: 'video/mp4',
    args: (input, _file, output, options) => {
      const x = Math.max(0, Math.round(parseNumber(options.x, 0)));
      const y = Math.max(0, Math.round(parseNumber(options.y, 0)));
      const width = Math.max(16, Math.round(parseNumber(options.width, 1280)));
      const height = Math.max(16, Math.round(parseNumber(options.height, 720)));
      return [...buildVideoInputArgs(input, options), '-vf', `crop=${width}:${height}:${x}:${y}`, '-c:v', 'libx264', '-c:a', 'aac', output];
    },
  },
  'video-resize': {
    outputName: 'output.mp4',
    mimeType: 'video/mp4',
    args: (input, _file, output, options) => {
      const width = Math.max(120, Math.round(parseNumber(options.width, 1280)));
      const height = Math.max(120, Math.round(parseNumber(options.height, 720)));
      return [...buildVideoInputArgs(input, options), '-vf', `scale=${width}:${height}:flags=lanczos`, '-c:v', 'libx264', '-c:a', 'aac', output];
    },
  },
  'gif-to-video': {
    outputName: 'output.mp4',
    mimeType: 'video/mp4',
    args: (input, _file, output) => ['-i', input, '-movflags', 'faststart', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', output],
  },
  'gif-speed-change': {
    outputName: 'output.gif',
    mimeType: 'image/gif',
    args: (input, _file, output, options) => {
      const speed = Math.max(0.5, Math.min(2, parseNumber(options.speed, 1.5)));
      return ['-i', input, '-vf', `setpts=PTS/${speed}`, '-loop', '0', output];
    },
  },
  'gif-reverse': {
    outputName: 'output.gif',
    mimeType: 'image/gif',
    args: (input, _file, output) => ['-i', input, '-vf', 'reverse', '-loop', '0', output],
  },
  'mp4-webm': {
    outputName: 'output.webm',
    mimeType: 'video/webm',
    args: (input, _file, output) => ['-i', input, '-c:v', 'libvpx-vp9', '-c:a', 'libopus', output],
  },
  'mp4-mov': {
    outputName: 'output.mov',
    mimeType: 'video/quicktime',
    args: (input, _file, output) => ['-i', input, '-c', 'copy', output],
  },
  'mov-mp4': {
    outputName: 'output.mp4',
    mimeType: 'video/mp4',
    args: (input, _file, output) => ['-i', input, '-c:v', 'libx264', '-c:a', 'aac', output],
  },
  'avi-mp4': {
    outputName: 'output.mp4',
    mimeType: 'video/mp4',
    args: (input, _file, output) => ['-i', input, '-c:v', 'libx264', '-c:a', 'aac', output],
  },
  'm4a-mp3': {
    outputName: 'output.mp3',
    mimeType: 'audio/mpeg',
    args: (input, _file, output) => ['-i', input, '-vn', '-acodec', 'libmp3lame', output],
  },
  'm4a-wav': {
    outputName: 'output.wav',
    mimeType: 'audio/wav',
    args: (input, _file, output) => ['-i', input, '-vn', output],
  },
  'aac-mp3': {
    outputName: 'output.mp3',
    mimeType: 'audio/mpeg',
    args: (input, _file, output) => ['-i', input, '-vn', '-acodec', 'libmp3lame', output],
  },
  'webm-mp3': {
    outputName: 'output.mp3',
    mimeType: 'audio/mpeg',
    args: (input, _file, output) => ['-i', input, '-vn', '-acodec', 'libmp3lame', output],
  },
  'mp4-wav': {
    outputName: 'output.wav',
    mimeType: 'audio/wav',
    args: (input, _file, output) => ['-i', input, '-vn', output],
  },
  'audio-convert': {
    outputName: (file, options) => {
      const config = getAudioFormatConfig(String(options.outputFormat ?? 'mp3'), extOf(file.name));
      return `output.${config.ext}`;
    },
    mimeType: (file, options) => {
      const config = getAudioFormatConfig(String(options.outputFormat ?? 'mp3'), extOf(file.name));
      return config.mimeType;
    },
    args: (input, file, output, options) => buildAudioConvertArgs(input, file, output, options),
  },
  'audio-cut': {
    outputName: (file, options) => {
      const config = getAudioFormatConfig(String(options.outputFormat ?? 'keep'), extOf(file.name));
      return `output.${config.ext}`;
    },
    mimeType: (file, options) => {
      const config = getAudioFormatConfig(String(options.outputFormat ?? 'keep'), extOf(file.name));
      return config.mimeType;
    },
    args: (input, file, output, options) => buildAudioCutArgs(input, file, output, options),
  },
};

export async function processMediaTool(ctx: ProcessContext): Promise<ProcessedFile[]> {
  const { toolId, files, options, onProgress } = ctx;

  if (!files.length) {
    throw new Error('Select at least one media file.');
  }

  const legacyVideoOutputFormat = LEGACY_VIDEO_CONVERTER_OUTPUTS[toolId];

  if (toolId === 'video-convert' || legacyVideoOutputFormat) {
    return await processVideoConvert(ctx, legacyVideoOutputFormat);
  }

  if (toolId === 'video-thumbnail-generator') {
    return await processVideoThumbnail(ctx);
  }

  if (toolId === 'audio-merge') {
    return await processAudioMerge(ctx);
  }

  if (toolId === 'audio-fade') {
    return await processAudioFade(ctx);
  }

  if (toolId === 'audio-speed-change') {
    return await processAudioSpeedChange(ctx);
  }

  if (toolId === 'audio-pitch-change') {
    return await processAudioPitchChange(ctx);
  }

  if (toolId === 'video-speed-change') {
    return await processVideoSpeedChange(ctx);
  }

  if (toolId === 'video-watermark') {
    return await processVideoWatermark(ctx);
  }

  if (toolId === 'video-reverse') {
    return await processVideoReverse(ctx);
  }

  if (toolId === 'images-to-gif') {
    return await processImagesToGif(ctx);
  }

  if (toolId === 'gif-frame-extract') {
    return await processGifFrameExtract(ctx);
  }

  const preset = presets[toolId];
  if (!preset) {
    return [];
  }

  onProgress({ percent: 2, stage: 'Loading ffmpeg.wasm' });
  const { ffmpeg, fetchFile } = await getFfmpeg((ratio) =>
    onProgress({
      percent: Math.max(5, Math.min(95, ratio * 100)),
      stage: 'Processing media',
    }),
  );

  const outputFiles: ProcessedFile[] = [];
  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const inputName = `input-${index}.${extOf(file.name) || 'bin'}`;
      const resolvedOutputName = typeof preset.outputName === 'function' ? preset.outputName(file, options) : preset.outputName;
      const outputName = `out-${index}-${resolvedOutputName}`;
      const mimeType = typeof preset.mimeType === 'function' ? preset.mimeType(file, options) : preset.mimeType;

      try {
        await ffmpeg.writeFile(inputName, await fetchFile(file));
        await ffmpeg.exec(preset.args(inputName, file, outputName, options));
        const data = await ffmpeg.readFile(outputName);
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

        outputFiles.push({
          name: `${baseName(file.name)}-${resolvedOutputName}`,
          blob: blobFromBytes(bytes, mimeType),
          mimeType,
        });
      } finally {
        await Promise.allSettled([ffmpeg.deleteFile(inputName), ffmpeg.deleteFile(outputName)]);
      }

      onProgress({ percent: ((index + 1) / files.length) * 100, stage: 'Finished file' });
    }
  } catch (cause) {
    if (cause instanceof Error && cause.message) {
      throw cause;
    }

    if (typeof cause === 'string' && cause.length > 0) {
      throw new Error(cause);
    }

    throw new Error('Media processing failed.');
  }

  return outputFiles;
}
