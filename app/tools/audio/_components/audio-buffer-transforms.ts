import { cloneAudioBuffer, createAudioBufferLike } from '@/lib/audio';

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampSample(value: number) {
  return clamp(value, -1, 1);
}

function secondsToSample(buffer: AudioBuffer, timeSec: number) {
  return clamp(Math.round(timeSec * buffer.sampleRate), 0, buffer.length);
}

function createBufferFromChannels(reference: AudioBuffer, channels: Float32Array[]) {
  const length = Math.max(1, channels[0]?.length ?? 1);
  const nextBuffer = createAudioBufferLike(reference, length);

  channels.forEach((channelData, channelIndex) => {
    nextBuffer.copyToChannel(new Float32Array(channelData), channelIndex);
  });

  return nextBuffer;
}

function sliceChannel(channelData: Float32Array, startSample: number, endSample: number) {
  return new Float32Array(channelData.slice(startSample, endSample));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function isSilentAudioBuffer(buffer: AudioBuffer) {
  for (let channelIndex = 0; channelIndex < buffer.numberOfChannels; channelIndex += 1) {
    const channelData = buffer.getChannelData(channelIndex);
    const step = Math.max(1, Math.floor(channelData.length / 4096));

    for (let sampleIndex = 0; sampleIndex < channelData.length; sampleIndex += step) {
      if (Math.abs(channelData[sampleIndex] ?? 0) > 0.001) {
        return false;
      }
    }
  }

  return true;
}

export function extractAudioRange(buffer: AudioBuffer, startSec: number, endSec: number) {
  const startSample = secondsToSample(buffer, Math.min(startSec, endSec));
  const endSample = secondsToSample(buffer, Math.max(startSec, endSec));
  const nextChannels = Array.from({ length: buffer.numberOfChannels }, (_, channelIndex) =>
    sliceChannel(buffer.getChannelData(channelIndex), startSample, Math.max(startSample + 1, endSample)),
  );

  return createBufferFromChannels(buffer, nextChannels);
}

export function removeAudioRange(buffer: AudioBuffer, startSec: number, endSec: number) {
  const startSample = secondsToSample(buffer, Math.min(startSec, endSec));
  const endSample = secondsToSample(buffer, Math.max(startSec, endSec));

  if (startSample === 0 && endSample >= buffer.length) {
    return createAudioBufferLike(buffer, 1);
  }

  const nextChannels = Array.from({ length: buffer.numberOfChannels }, (_, channelIndex) => {
    const channelData = buffer.getChannelData(channelIndex);
    const prefix = sliceChannel(channelData, 0, startSample);
    const suffix = sliceChannel(channelData, endSample, buffer.length);
    const merged = new Float32Array(Math.max(1, prefix.length + suffix.length));

    merged.set(prefix, 0);
    merged.set(suffix, prefix.length);
    return merged;
  });

  return createBufferFromChannels(buffer, nextChannels);
}

export function applyFadeToAudioRange(
  buffer: AudioBuffer,
  startSec: number,
  endSec: number,
  fadeInSec: number,
  fadeOutSec: number,
) {
  const nextBuffer = cloneAudioBuffer(buffer);
  const startSample = secondsToSample(buffer, Math.min(startSec, endSec));
  const endSample = secondsToSample(buffer, Math.max(startSec, endSec));
  const fadeInSamples = Math.round(Math.max(0, fadeInSec) * buffer.sampleRate);
  const fadeOutSamples = Math.round(Math.max(0, fadeOutSec) * buffer.sampleRate);

  for (let channelIndex = 0; channelIndex < nextBuffer.numberOfChannels; channelIndex += 1) {
    const channelData = nextBuffer.getChannelData(channelIndex);

    for (let sampleIndex = startSample; sampleIndex < endSample; sampleIndex += 1) {
      let gain = 1;

      if (fadeInSamples > 0 && sampleIndex - startSample < fadeInSamples) {
        gain = Math.min(gain, (sampleIndex - startSample) / fadeInSamples);
      }

      if (fadeOutSamples > 0 && endSample - sampleIndex <= fadeOutSamples) {
        gain = Math.min(gain, (endSample - sampleIndex) / fadeOutSamples);
      }

      channelData[sampleIndex] *= clamp(gain, 0, 1);
    }
  }

  return nextBuffer;
}

function resampleChannelSegment(channelData: Float32Array, startSample: number, endSample: number, rate: number) {
  const sourceLength = Math.max(1, endSample - startSample);
  const nextLength = Math.max(1, Math.round(sourceLength / Math.max(rate, 0.05)));
  const nextSegment = new Float32Array(nextLength);

  for (let sampleIndex = 0; sampleIndex < nextLength; sampleIndex += 1) {
    const sourceIndexFloat = sampleIndex * rate;
    const sourceIndex = Math.min(sourceLength - 1, Math.floor(sourceIndexFloat));
    const nextSourceIndex = Math.min(sourceLength - 1, sourceIndex + 1);
    const mix = sourceIndexFloat - sourceIndex;
    const baseValue = channelData[startSample + sourceIndex] ?? 0;
    const nextValue = channelData[startSample + nextSourceIndex] ?? baseValue;

    nextSegment[sampleIndex] = lerp(baseValue, nextValue, mix);
  }

  return nextSegment;
}

export function applySpeedToAudioRange(buffer: AudioBuffer, startSec: number, endSec: number, rate: number) {
  const safeRate = Math.max(0.25, Math.min(rate, 4));
  const startSample = secondsToSample(buffer, Math.min(startSec, endSec));
  const endSample = secondsToSample(buffer, Math.max(startSec, endSec));

  const nextChannels = Array.from({ length: buffer.numberOfChannels }, (_, channelIndex) => {
    const channelData = buffer.getChannelData(channelIndex);
    const prefix = sliceChannel(channelData, 0, startSample);
    const resampled = resampleChannelSegment(channelData, startSample, endSample, safeRate);
    const suffix = sliceChannel(channelData, endSample, buffer.length);
    const merged = new Float32Array(prefix.length + resampled.length + suffix.length);

    merged.set(prefix, 0);
    merged.set(resampled, prefix.length);
    merged.set(suffix, prefix.length + resampled.length);
    return merged;
  });

  return createBufferFromChannels(buffer, nextChannels);
}

export function applyPitchToAudioRange(buffer: AudioBuffer, startSec: number, endSec: number, semitones: number) {
  const playbackRate = Math.pow(2, semitones / 12);
  return applySpeedToAudioRange(buffer, startSec, endSec, playbackRate);
}

export function applyGainToAudioRange(buffer: AudioBuffer, startSec: number, endSec: number, gain: number) {
  const nextBuffer = cloneAudioBuffer(buffer);
  const startSample = secondsToSample(buffer, Math.min(startSec, endSec));
  const endSample = secondsToSample(buffer, Math.max(startSec, endSec));
  const safeGain = Math.max(0, gain);

  for (let channelIndex = 0; channelIndex < nextBuffer.numberOfChannels; channelIndex += 1) {
    const channelData = nextBuffer.getChannelData(channelIndex);

    for (let sampleIndex = startSample; sampleIndex < endSample; sampleIndex += 1) {
      channelData[sampleIndex] = clampSample(channelData[sampleIndex] * safeGain);
    }
  }

  return nextBuffer;
}

export function applyReverbToAudioRange(
  buffer: AudioBuffer,
  startSec: number,
  endSec: number,
  decaySec: number,
  mix: number,
) {
  const nextBuffer = cloneAudioBuffer(buffer);
  const startSample = secondsToSample(buffer, Math.min(startSec, endSec));
  const endSample = secondsToSample(buffer, Math.max(startSec, endSec));
  const safeMix = clamp(mix, 0, 1);
  const safeDecay = clamp(decaySec, 0.1, 6);
  const delayStepsSec = [0.024, 0.051, 0.093, 0.148, 0.221];

  for (let channelIndex = 0; channelIndex < nextBuffer.numberOfChannels; channelIndex += 1) {
    const sourceChannel = buffer.getChannelData(channelIndex);
    const targetChannel = nextBuffer.getChannelData(channelIndex);

    for (let sampleIndex = startSample; sampleIndex < endSample; sampleIndex += 1) {
      const dry = sourceChannel[sampleIndex] ?? 0;
      let wet = 0;

      for (let delayIndex = 0; delayIndex < delayStepsSec.length; delayIndex += 1) {
        const delaySamples = Math.max(1, Math.round(delayStepsSec[delayIndex] * safeDecay * buffer.sampleRate));
        const delayedIndex = sampleIndex - delaySamples;
        if (delayedIndex < startSample) {
          continue;
        }

        const attenuation = Math.pow(0.6, delayIndex + 1) * (1 / safeDecay);
        wet += (sourceChannel[delayedIndex] ?? 0) * attenuation;
      }

      targetChannel[sampleIndex] = clampSample(dry * (1 - safeMix) + (dry + wet) * safeMix);
    }
  }

  return nextBuffer;
}
