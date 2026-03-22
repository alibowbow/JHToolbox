'use client';

import { formatTime } from '../audio-editor-utils';

interface PlayheadOverlayProps {
  positionPercent: number;
  currentTime: number;
  isDragging?: boolean;
}

export function PlayheadOverlay({ positionPercent, currentTime, isDragging = false }: PlayheadOverlayProps) {
  const edgeOffset = positionPercent <= 0.02 ? 12 : positionPercent >= 0.98 ? -12 : 0;

  return (
    <button
      type="button"
      data-waveform-handle="playhead"
      data-testid="audio-playhead"
      className="absolute inset-y-0 z-30 w-6 -translate-x-1/2 cursor-ew-resize bg-transparent"
      style={{ left: `calc(${positionPercent * 100}% + ${edgeOffset}px)` }}
      aria-label={`Playhead ${formatTime(currentTime)}`}
    >
      <span className="pointer-events-none absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-[var(--accent)] shadow-[0_0_0_1px_var(--border-strong),0_0_14px_rgba(0,212,200,0.22)]" />
      <span className="pointer-events-none absolute -top-1 left-1/2 h-0 w-0 -translate-x-1/2 border-l-[4px] border-r-[4px] border-t-0 border-b-[6px] border-l-transparent border-r-transparent border-b-[var(--accent)]" />
      {isDragging ? (
        <span className="audio-mono pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 rounded-md border border-[var(--border-strong)] bg-[var(--waveform-label-bg)] px-2 py-1 text-[10px] text-[var(--text-primary)]">
          {formatTime(currentTime)}
        </span>
      ) : null}
    </button>
  );
}
