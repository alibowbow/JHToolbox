'use client';

type WavRecordingResult = {
  file: File;
  duration: number;
};

type WavRecordingOptions = {
  outputName: string;
  onPeak?: (peak: number) => void;
};

export type WavRecordingSession = {
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<WavRecordingResult>;
  cleanup: () => Promise<void>;
};

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function clampSample(sample: number) {
  return Math.max(-1, Math.min(1, sample));
}

function encodeMonoWav(samples: Float32Array, sampleRate: number) {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = 44;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = clampSample(samples[index]);
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += bytesPerSample;
  }

  return buffer;
}

function mergeChunks(chunks: Float32Array[], totalLength: number) {
  const merged = new Float32Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return merged;
}

export async function createWavRecordingSession(
  stream: MediaStream,
  { outputName, onPeak }: WavRecordingOptions,
): Promise<WavRecordingSession> {
  const AudioContextCtor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextCtor) {
    throw new Error('AudioContext is unavailable in this browser.');
  }

  const audioContext = new AudioContextCtor();
  await audioContext.resume();

  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  const silentGain = audioContext.createGain();
  silentGain.gain.value = 0;

  const chunks: Float32Array[] = [];
  let totalLength = 0;
  let stopped = false;
  let paused = false;
  let finalized = false;
  let stopPromise: Promise<WavRecordingResult> | null = null;

  processor.onaudioprocess = (event) => {
    if (stopped || paused) {
      return;
    }

    const channelCount = event.inputBuffer.numberOfChannels;
    const sampleLength = event.inputBuffer.length;
    const monoChunk = new Float32Array(sampleLength);
    let chunkPeak = 0;

    for (let sampleIndex = 0; sampleIndex < sampleLength; sampleIndex += 1) {
      let monoValue = 0;

      for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
        monoValue += event.inputBuffer.getChannelData(channelIndex)[sampleIndex] ?? 0;
      }

      monoValue /= Math.max(channelCount, 1);
      monoChunk[sampleIndex] = monoValue;
      chunkPeak = Math.max(chunkPeak, Math.abs(monoValue));
    }

    chunks.push(monoChunk);
    totalLength += monoChunk.length;
    onPeak?.(chunkPeak);
  };

  source.connect(processor);
  processor.connect(silentGain);
  silentGain.connect(audioContext.destination);

  const disconnect = async () => {
    if (finalized) {
      return;
    }

    finalized = true;
    processor.onaudioprocess = null;
    source.disconnect();
    processor.disconnect();
    silentGain.disconnect();
    await audioContext.close().catch(() => undefined);
  };

  return {
    pause: async () => {
      if (stopped || paused) {
        return;
      }

      paused = true;
      onPeak?.(0);
    },
    resume: async () => {
      if (stopped || !paused) {
        return;
      }

      paused = false;
    },
    stop: async () => {
      if (stopPromise) {
        return await stopPromise;
      }

      stopPromise = (async () => {
        stopped = true;
        await disconnect();
        const samples = mergeChunks(chunks, totalLength);
        const buffer = encodeMonoWav(samples, audioContext.sampleRate);
        const duration = samples.length / Math.max(audioContext.sampleRate, 1);

        return {
          file: new File([buffer], outputName, { type: 'audio/wav' }),
          duration,
        };
      })();

      return await stopPromise;
    },
    cleanup: async () => {
      stopped = true;
      await disconnect();
    },
  };
}
