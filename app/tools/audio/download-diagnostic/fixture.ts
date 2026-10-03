// Preview-only diagnostic. No user files, capture, uploads, or product fallback.
export const SAMPLE_RATE = 44_100;
export const MAX_BYTES = 44 + SAMPLE_RATE * 240 * 2 * 2;
export const CASES = [
  { id: '2-wav', seconds: 2, channels: 1, bitrate: 128, format: 'wav', label: '1단계 · 2초 WAV · mono' },
  { id: '180-mp3', seconds: 180, channels: 2, bitrate: 128, format: 'mp3', label: '2단계 · 3분 MP3 · stereo · 128 kbps' },
  { id: '180-wav', seconds: 180, channels: 2, bitrate: 128, format: 'wav', label: '2단계 · 3분 WAV · stereo' },
  { id: '240-mp3', seconds: 240, channels: 2, bitrate: 320, format: 'mp3', label: '3단계 · 4분 MP3 · stereo · 320 kbps' },
  { id: '240-wav', seconds: 240, channels: 2, bitrate: 128, format: 'wav', label: '3단계 · 4분 WAV · stereo' },
] as const;
export type FixtureCase = typeof CASES[number];
export const base64Length = (bytes: number) => 4 * Math.ceil(bytes / 3);

export async function synthesizeWav(seconds: number, channels: number, signal: AbortSignal) {
  if (![2, 180, 240].includes(seconds) || ![1, 2].includes(channels)) throw new Error('허용되지 않은 길이 / 채널입니다.');
  signal.throwIfAborted();
  const frames = SAMPLE_RATE * seconds;
  const bytes = new Uint8Array(44 + frames * 2 * channels);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); ascii(8, 'WAVE');
  ascii(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, channels, true); view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2 * channels, true); view.setUint16(32, 2 * channels, true);
  view.setUint16(34, 16, true); ascii(36, 'data'); view.setUint32(40, frames * 2 * channels, true);
  for (let start = 0; start < frames; start += SAMPLE_RATE) {
    signal.throwIfAborted();
    for (let i = start; i < Math.min(start + SAMPLE_RATE, frames); i++) {
      const fade = Math.min(1, i / 441, (frames - 1 - i) / 441);
      for (let channel = 0; channel < channels; channel++) {
        view.setInt16(44 + (i * channels + channel) * 2, Math.round(Math.sin(2 * Math.PI * (channel ? 660 : 440) * i / SAMPLE_RATE) * 8192 * fade), true);
      }
    }
    // Bound each synchronous chunk and allow cancellation on long fixtures.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  signal.throwIfAborted();
  return bytes;
}

async function encodeMp3(wav: Uint8Array, bitrate: number, signal: AbortSignal, status: (text: string) => void) {
  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  signal.throwIfAborted();
  // Own this worker: cancel/finish must release its WASM heap, including load failures.
  const ffmpeg = new FFmpeg();
  const urls: string[] = [];
  const stop = () => ffmpeg.terminate();
  signal.addEventListener('abort', stop, { once: true });
  try {
    status('MP3 인코더 로딩 중 · 고정된 공개 코드만 HTTPS로 받습니다');
    const core = 'https://unpkg.com/@ffmpeg/core@0.12.9/dist/umd/ffmpeg-core';
    for (const extension of ['js', 'wasm']) {
      const response = await fetch(`${core}.${extension}`, { signal });
      if (!response.ok) throw new Error(`인코더 로드 실패: HTTP ${response.status}`);
      const blob = await response.blob();
      signal.throwIfAborted();
      urls.push(URL.createObjectURL(blob));
    }
    await ffmpeg.load({ coreURL: urls[0], wasmURL: urls[1] });
    signal.throwIfAborted();
    status(`MP3 인코딩 중 · ${bitrate} kbps`);
    await ffmpeg.writeFile('fixture.wav', wav);
    const exitCode = await ffmpeg.exec(['-i', 'fixture.wav', '-codec:a', 'libmp3lame', '-b:a', `${bitrate}k`, 'fixture.mp3']);
    if (exitCode !== 0) throw new Error(`MP3 인코딩 실패: ${exitCode}`);
    signal.throwIfAborted();
    const result = await ffmpeg.readFile('fixture.mp3');
    if (typeof result === 'string' || result.byteLength > MAX_BYTES) throw new Error('출력 크기 제한 초과');
    return new Blob([result as Uint8Array<ArrayBuffer>], { type: 'audio/mpeg' });
  } finally {
    signal.removeEventListener('abort', stop);
    ffmpeg.terminate();
    urls.forEach(url => URL.revokeObjectURL(url));
  }
}

export async function createFixture(item: FixtureCase, signal: AbortSignal, status: (text: string) => void) {
  // Runtime allowlist as well as a restricted UI; no arbitrary sizes or inputs.
  if (!CASES.some(candidate => candidate.id === item.id && candidate.seconds === item.seconds && candidate.format === item.format && candidate.channels === item.channels && candidate.bitrate === item.bitrate)) {
    throw new Error('허용되지 않은 fixture입니다.');
  }
  status('440 / 660 Hz 합성 오디오 생성 중');
  const wav = await synthesizeWav(item.seconds, item.channels, signal);
  return item.format === 'mp3'
    ? encodeMp3(wav, item.bitrate, signal, status)
    : new Blob([wav], { type: 'audio/wav' });
}

/** Explicit, bounded conversion of this page's synthetic output only. */
export function prepareDataUri(blob: Blob, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  if (blob.size > MAX_BYTES || !['audio/wav', 'audio/mpeg'].includes(blob.type)) {
    return Promise.reject(new Error('data URI 변환 제한 초과'));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => reader.abort();
    const cleanup = () => {
      signal.removeEventListener('abort', abort);
      reader.onload = reader.onerror = reader.onabort = null;
    };
    reader.onload = () => {
      const result = reader.result;
      cleanup();
      if (signal.aborted) reject(signal.reason);
      else if (typeof result !== 'string' || !result.startsWith(`data:${blob.type};base64,`)) reject(new Error('data URI 생성 실패'));
      else resolve(result);
    };
    reader.onerror = () => { const error = reader.error; cleanup(); reject(error); };
    reader.onabort = () => { cleanup(); reject(new DOMException('취소됨', 'AbortError')); };
    signal.addEventListener('abort', abort, { once: true });
    reader.readAsDataURL(blob);
  });
}
