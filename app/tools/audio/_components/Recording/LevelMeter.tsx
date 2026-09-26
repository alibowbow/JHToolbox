'use client';

import { useEffect, useRef } from 'react';

/** Peak (0…1) on a -60…0 dB scale, 0…1. */
function toMeter(peak: number) {
  if (peak <= 0.001) {
    return 0;
  }
  return Math.min(1, Math.max(0, (20 * Math.log10(peak) + 60) / 60));
}

/**
 * Input level while recording, one bar per channel. Reads the latest peaks
 * each frame and moves the bars directly, so the editor does not re-render
 * twenty times a second.
 */
export function LevelMeter({ readPeaks, label }: { readPeaks: () => number[]; label: string }) {
  const barsRef = useRef<Array<HTMLSpanElement | null>>([]);
  const clipRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    let frame = 0;
    const shown = [0, 0];
    let clipUntil = 0;
    const draw = (now: number) => {
      const peaks = readPeaks();
      for (let channel = 0; channel < 2; channel += 1) {
        const target = toMeter(peaks[channel] ?? peaks[0] ?? 0);
        // Rise at once, fall smoothly.
        shown[channel] = target > shown[channel] ? target : shown[channel] * 0.9 + target * 0.1;
        const bar = barsRef.current[channel];
        if (bar) {
          bar.style.clipPath = `inset(0 ${(100 - shown[channel] * 100).toFixed(1)}% 0 0)`;
        }
      }
      if (peaks.some((peak) => peak >= 0.99)) {
        clipUntil = now + 1200;
      }
      if (clipRef.current) {
        clipRef.current.style.opacity = now < clipUntil ? '1' : '0.15';
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [readPeaks]);

  return (
    <div className="flex items-center gap-1.5" role="img" aria-label={label} data-testid="audio-level-meter">
      <div className="flex w-20 flex-col gap-1 sm:w-28">
        {[0, 1].map((channel) => (
          <span key={channel} className="audio-meter-track block h-1.5">
            <span
              ref={(element) => {
                barsRef.current[channel] = element;
              }}
              className="audio-meter-fill block"
            />
          </span>
        ))}
      </div>
      <span ref={clipRef} className="h-2 w-2 rounded-full bg-red-500 opacity-15" aria-hidden="true" />
    </div>
  );
}
