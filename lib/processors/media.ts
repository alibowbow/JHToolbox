import { ProcessContext, ProcessedFile } from '@/types/processor';
import { baseName, parseNumber } from '@/lib/utils';
import { getFfmpeg } from '@/lib/processors/ffmpeg-client';

type MediaPreset = {
  outputName: string;
  mimeType: string;
  args: (input: string, output: string, options: Record<string, string | number | boolean>) => string[];
};

const presets: Record<string, MediaPreset> = {
  'video-to-gif': {
    outputName: 'output.gif',
    mimeType: 'image/gif',
    args: (_in, out, options) => {
      const fps = Math.max(1, parseNumber(options.fps, 12));
      const width = Math.max(120, parseNumber(options.width, 480));
      return ['-i', _in, '-vf', `fps=${fps},scale=${width}:-1:flags=lanczos`, '-loop', '0', out];
    },
  },
  'video-to-webp': {
    outputName: 'output.webp',
    mimeType: 'image/webp',
    args: (_in, out, options) => {
      const fps = Math.max(1, parseNumber(options.fps, 12));
      const width = Math.max(120, parseNumber(options.width, 640));
      return ['-i', _in, '-vf', `fps=${fps},scale=${width}:-1`, '-loop', '0', '-lossless', '0', out];
    },
  },
  'mute-video': {
    outputName: 'output.mp4',
    mimeType: 'video/mp4',
    args: (_in, out) => ['-i', _in, '-c:v', 'copy', '-an', out],
  },
  'extract-audio': {
    outputName: 'output.mp3',
    mimeType: 'audio/mpeg',
    args: (_in, out) => ['-i', _in, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', out],
  },
  'video-compress': {
    outputName: 'output.mp4',
    mimeType: 'video/mp4',
    args: (_in, out, options) => {
      const crf = Math.max(18, Math.min(40, parseNumber(options.crf, 28)));
      return ['-i', _in, '-c:v', 'libx264', '-crf', `${crf}`, '-preset', 'medium', '-c:a', 'aac', out];
    },
  },
  'mp4-webm': {
    outputName: 'output.webm',
    mimeType: 'video/webm',
    args: (_in, out) => ['-i', _in, '-c:v', 'libvpx-vp9', '-c:a', 'libopus', out],
  },
  'mp4-mov': {
    outputName: 'output.mov',
    mimeType: 'video/quicktime',
    args: (_in, out) => ['-i', _in, '-c', 'copy', out],
  },
  'mov-mp4': {
    outputName: 'output.mp4',
    mimeType: 'video/mp4',
    args: (_in, out) => ['-i', _in, '-c:v', 'libx264', '-c:a', 'aac', out],
  },
  'avi-mp4': {
    outputName: 'output.mp4',
    mimeType: 'video/mp4',
    args: (_in, out) => ['-i', _in, '-c:v', 'libx264', '-c:a', 'aac', out],
  },
  'm4a-mp3': {
    outputName: 'output.mp3',
    mimeType: 'audio/mpeg',
    args: (_in, out) => ['-i', _in, '-vn', '-acodec', 'libmp3lame', out],
  },
  'm4a-wav': {
    outputName: 'output.wav',
    mimeType: 'audio/wav',
    args: (_in, out) => ['-i', _in, '-vn', out],
  },
  'aac-mp3': {
    outputName: 'output.mp3',
    mimeType: 'audio/mpeg',
    args: (_in, out) => ['-i', _in, '-vn', '-acodec', 'libmp3lame', out],
  },
  'webm-mp3': {
    outputName: 'output.mp3',
    mimeType: 'audio/mpeg',
    args: (_in, out) => ['-i', _in, '-vn', '-acodec', 'libmp3lame', out],
  },
  'mp4-wav': {
    outputName: 'output.wav',
    mimeType: 'audio/wav',
    args: (_in, out) => ['-i', _in, '-vn', out],
  },
};

export async function processMediaTool(ctx: ProcessContext): Promise<ProcessedFile[]> {
  const { toolId, files, options, onProgress } = ctx;
  const preset = presets[toolId];

  if (!preset) {
    return [];
  }

  onProgress({ percent: 2, stage: 'ffmpeg.wasm 로딩 중' });
  const { ffmpeg, fetchFile } = await getFfmpeg((ratio) =>
    onProgress({
      percent: Math.max(5, Math.min(95, ratio * 100)),
      stage: '미디어 처리 중',
    }),
  );

  const out: ProcessedFile[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const inputName = `input-${index}.${file.name.split('.').pop() ?? 'bin'}`;
    const outputName = `out-${index}-${preset.outputName}`;

    await ffmpeg.writeFile(inputName, await fetchFile(file));
    await ffmpeg.exec(preset.args(inputName, outputName, options));
    const data = await ffmpeg.readFile(outputName);
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

    out.push({
      name: `${baseName(file.name)}-${preset.outputName}`,
      blob: new Blob([bytes], { type: preset.mimeType }),
      mimeType: preset.mimeType,
    });

    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);
    onProgress({ percent: ((index + 1) / files.length) * 100, stage: '파일 변환 완료' });
  }

  return out;
}