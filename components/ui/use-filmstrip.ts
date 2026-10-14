'use client';

import { useEffect, useState } from 'react';
import type { FrameSize } from '@/components/ui/crop-math';

const FILMSTRIP_FRAMES = 10;

/** Evenly spaced still frames for the timeline, read from a hidden video. */
export function useFilmstrip(previewUrl: string, duration: number, size: FrameSize, count = FILMSTRIP_FRAMES) {
  const [frames, setFrames] = useState<string[]>([]);

  useEffect(() => {
    setFrames([]);
    if (!duration || !size.width || !size.height) {
      return;
    }

    let cancelled = false;
    const probe = document.createElement('video');
    probe.muted = true;
    probe.playsInline = true;
    probe.preload = 'auto';
    probe.src = previewUrl;
    const canvas = document.createElement('canvas');
    canvas.height = 96;
    canvas.width = Math.max(2, Math.round((canvas.height * size.width) / size.height));
    const context = canvas.getContext('2d');

    const waitFor = (eventName: string) =>
      new Promise<void>((resolve, reject) => {
        const done = () => {
          window.clearTimeout(timer);
          probe.removeEventListener(eventName, done);
          resolve();
        };
        const timer = window.setTimeout(() => {
          probe.removeEventListener(eventName, done);
          reject(new Error('timeout'));
        }, 4000);
        probe.addEventListener(eventName, done);
      });

    void (async () => {
      if (!context) {
        return;
      }
      if (probe.readyState < 2) {
        await waitFor('loadeddata');
      }
      for (let index = 0; index < count && !cancelled; index += 1) {
        const seeked = waitFor('seeked');
        probe.currentTime = ((index + 0.5) / count) * duration;
        await seeked;
        if (cancelled) {
          return;
        }
        context.drawImage(probe, 0, 0, canvas.width, canvas.height);
        const frame = canvas.toDataURL('image/jpeg', 0.7);
        setFrames((current) => [...current, frame]);
      }
    })()
      .catch(() => undefined)
      .finally(() => {
        probe.removeAttribute('src');
        probe.load();
      });

    return () => {
      cancelled = true;
    };
  }, [count, duration, previewUrl, size.height, size.width]);

  return frames;
}
