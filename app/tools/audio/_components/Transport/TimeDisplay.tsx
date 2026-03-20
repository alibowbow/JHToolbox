'use client';

import { formatTime } from '../audio-editor-utils';

interface TimeDisplayProps {
  currentTime: number;
  duration: number;
}

export function TimeDisplay({ currentTime, duration }: TimeDisplayProps) {
  return (
    <div className="rounded-xl border border-border bg-base-subtle/80 px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.18em] text-ink-faint">Time</p>
      <p className="mt-1 text-sm font-semibold text-ink">
        {formatTime(currentTime)} / {formatTime(duration)}
      </p>
    </div>
  );
}
