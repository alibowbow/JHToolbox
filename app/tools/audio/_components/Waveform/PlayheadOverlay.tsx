'use client';

import { formatTime } from '../audio-editor-utils';

interface PlayheadOverlayProps {
  positionPercent: number;
  currentTime: number;
}

export function PlayheadOverlay({ positionPercent, currentTime }: PlayheadOverlayProps) {
  return (
    <div
      className="absolute inset-y-0 z-20 w-0.5 bg-prime shadow-[0_0_0_1px_rgba(0,179,214,0.35),0_0_18px_rgba(0,179,214,0.55)]"
      style={{ left: `${positionPercent * 100}%` }}
    >
      <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full border border-prime/30 bg-base-elevated px-2 py-1 text-[10px] font-semibold text-prime">
        {formatTime(currentTime)}
      </span>
    </div>
  );
}
