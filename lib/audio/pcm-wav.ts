/**
 * 16-bit PCM WAV from recorded sample chunks. Pure (no browser APIs), so the
 * recorder's output format can be checked in Node.
 */

/** A float sample (-1…1) as a 16-bit integer, clipped. */
export function toPcm16(sample: number): number {
  const clipped = sample > 1 ? 1 : sample < -1 ? -1 : sample;
  return clipped < 0 ? Math.round(clipped * 0x8000) : Math.round(clipped * 0x7fff);
}

/** Frames held by one channel's chunks. */
export function countFrames(chunks: Int16Array[]): number {
  return chunks.reduce((sum, chunk) => sum + chunk.length, 0);
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

/**
 * `channelChunks[c]` is channel c's chunks in recording order; every channel
 * must hold the same number of frames. Samples are interleaved as WAV expects.
 */
export function encodePcm16Wav(channelChunks: Int16Array[][], sampleRate: number): ArrayBuffer {
  const channels = Math.max(1, channelChunks.length);
  const frames = countFrames(channelChunks[0] ?? []);
  const blockAlign = channels * 2;
  const dataSize = frames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  if (LITTLE_ENDIAN) {
    // Typed-array copies are far faster than DataView for long recordings.
    const samples = new Int16Array(buffer, 44, frames * channels);
    for (let channel = 0; channel < channels; channel += 1) {
      let frame = 0;
      for (const chunk of channelChunks[channel] ?? []) {
        if (channels === 1) {
          samples.set(chunk, frame);
        } else {
          for (let index = 0; index < chunk.length; index += 1) {
            samples[(frame + index) * channels + channel] = chunk[index];
          }
        }
        frame += chunk.length;
      }
    }
  } else {
    for (let channel = 0; channel < channels; channel += 1) {
      let frame = 0;
      for (const chunk of channelChunks[channel] ?? []) {
        for (let index = 0; index < chunk.length; index += 1) {
          view.setInt16(44 + ((frame + index) * channels + channel) * 2, chunk[index], true);
        }
        frame += chunk.length;
      }
    }
  }

  return buffer;
}
