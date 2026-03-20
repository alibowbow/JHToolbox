'use client';

import { formatTime } from '../audio-editor-utils';

interface WaveformTimelineProps {
  duration: number;
  zoom: number;
}

export function WaveformTimeline({ duration, zoom }: WaveformTimelineProps) {
  const segments = Math.max(6, Math.min(16, Math.floor(zoom * 2.5)));
  const step = duration > 0 ? duration / segments : 0;

  return (
    <div className="rounded-t-2xl border border-border border-b-0 bg-base-subtle/80 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">Timeline</span>
        <span className="badge border border-border bg-base-elevated text-ink-muted">x{zoom.toFixed(1)}</span>
      </div>
      <div
        className="mt-3 grid gap-2 text-[11px] text-ink-muted"
        style={{ gridTemplateColumns: `repeat(${segments + 1}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: segments + 1 }, (_, index) => (
          <div key={index} className="relative">
            <span className="block h-2 border-l border-border-bright/60" />
            <span className="mt-1 block truncate">{formatTime(step * index, false)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
