import { clampTime } from './types';

export type WavEncodeOptions = {
  bitDepth?: 16;
};

function writeAscii(view: DataView, offset: number, text: string) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

export function encodeWav(buffer: AudioBuffer, options: WavEncodeOptions = {}): Uint8Array {
  const bitDepth = options.bitDepth ?? 16;
  const bytesPerSample = bitDepth / 8;
  const numberOfChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const frameCount = buffer.length;
  const blockAlign = numberOfChannels * bytesPerSample;
  const dataLength = frameCount * blockAlign;
  const output = new Uint8Array(44 + dataLength);
  const view = new DataView(output.buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  const channels = Array.from({ length: numberOfChannels }, (_, channelIndex) =>
    buffer.getChannelData(channelIndex),
  );
  const sampleOffset = 44;
  let writeOffset = sampleOffset;

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    for (let channelIndex = 0; channelIndex < numberOfChannels; channelIndex += 1) {
      const channelData = channels[channelIndex];
      const sample = clampTime(channelData[frameIndex] ?? 0, -1, 1);
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;

      view.setInt16(writeOffset, Math.round(intSample), true);
      writeOffset += bytesPerSample;
    }
  }

  return output;
}

export function createWavBlob(buffer: AudioBuffer): Blob {
  return new Blob([encodeWav(buffer) as unknown as ArrayBuffer], { type: 'audio/wav' });
}
