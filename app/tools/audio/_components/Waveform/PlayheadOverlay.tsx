'use client';

import { formatTime } from '../audio-editor-utils';

interface PlayheadOverlayProps {
  positionPercent: number;
  currentTime: number;
}

export function PlayheadOverlay({ positionPercent, currentTime }: PlayheadOverlayProps) {
  return (
    <div
      className="pointer-events-none absolute inset-y-0 z-20 w-[1.5px] bg-[var(--playhead)]"
      style={{ left: `${positionPercent * 100}%` }}
    >
      <span className="absolute -top-1 left-1/2 h-0 w-0 -translate-x-1/2 border-l-[6px] border-r-[6px] border-t-0 border-b-[7px] border-l-transparent border-r-transparent border-b-[var(--playhead)]" />
      <span className="audio-mono absolute -top-7 left-1/2 -translate-x-1/2 rounded-md border border-[var(--border)] bg-[rgba(30,32,35,0.96)] px-2 py-1 text-[10px] text-[var(--text-primary)]">
        {formatTime(currentTime)}
      </span>
    </div>
  );
}
