import { ProcessContext, ProcessedFile } from '@/types/processor';
import { baseName, extOf, parseNumber } from '@/lib/utils';
import { getFfmpeg } from '@/lib/processors/ffmpeg-client';

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

const AUDIO_FORMATS: Record<string, AudioFormatConfig> = {
  mp3: { ext: 'mp3', mimeType: 'audio/mpeg', codecArgs: ['-c:a', 'libmp3lame'], bitrateOptional: true },
  wav: { ext: 'wav', mimeType: 'audio/wav', codecArgs: ['-c:a', 'pcm_s16le'] },
  m4a: { ext: 'm4a', mimeType: 'audio/mp4', codecArgs: ['-c:a', 'aac'], bitrateOptional: true },
  aac: { ext: 'aac', mimeType: 'audio/aac', codecArgs: ['-c:a', 'aac'], bitrateOptional: true },
  ogg: { ext: 'ogg', mimeType: 'audio/ogg', codecArgs: ['-c:a', 'libvorbis'], bitrateOptional: true },
  webm: { ext: 'webm', mimeType: 'audio/webm', codecArgs: ['-c:a', 'libopus'], bitrateOptional: true },
  flac: { ext: 'flac', mimeType: 'audio/flac', codecArgs: ['-c:a', 'flac'] },
};

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

const presets: Record<string, MediaPreset> = {
  'video-to-gif': {
    outputName: 'output.gif',
    mimeType: 'image/gif',
    args: (_input, _file, output, options) => {
      const fps = Math.max(1, parseNumber(options.fps, 12));
      const width = Math.max(120, parseNumber(options.width, 480));
      return ['-i', _input, '-vf', `fps=${fps},scale=${width}:-1:flags=lanczos`, '-loop', '0', output];
    },
  },
  'video-to-webp': {
    outputName: 'output.webp',
    mimeType: 'image/webp',
    args: (_input, _file, output, options) => {
      const fps = Math.max(1, parseNumber(options.fps, 12));
      const width = Math.max(120, parseNumber(options.width, 640));
      return ['-i', _input, '-vf', `fps=${fps},scale=${width}:-1`, '-loop', '0', '-lossless', '0', output];
    },
  },
  'mute-video': {
    outputName: 'output.mp4',
    mimeType: 'video/mp4',
    args: (input, _file, output) => ['-i', input, '-c:v', 'copy', '-an', output],
  },
  'extract-audio': {
    outputName: 'output.mp3',
    mimeType: 'audio/mpeg',
    args: (input, _file, output) => ['-i', input, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', output],
  },
  'video-compress': {
    outputName: 'output.mp4',
    mimeType: 'video/mp4',
    args: (input, _file, output, options) => {
      const crf = Math.max(18, Math.min(40, parseNumber(options.crf, 28)));
      return ['-i', input, '-c:v', 'libx264', '-crf', `${crf}`, '-preset', 'medium', '-c:a', 'aac', output];
    },
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
      const inputName = `input-${index}.${file.name.split('.').pop() ?? 'bin'}`;
      const resolvedOutputName = typeof preset.outputName === 'function' ? preset.outputName(file, options) : preset.outputName;
      const outputName = `out-${index}-${resolvedOutputName}`;
      const mimeType = typeof preset.mimeType === 'function' ? preset.mimeType(file, options) : preset.mimeType;

      await ffmpeg.writeFile(inputName, await fetchFile(file));
      await ffmpeg.exec(preset.args(inputName, file, outputName, options));
      const data = await ffmpeg.readFile(outputName);
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

      outputFiles.push({
        name: `${baseName(file.name)}-${resolvedOutputName}`,
        blob: new Blob([bytes], { type: mimeType }),
        mimeType,
      });

      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
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
