'use client';

import { useState } from 'react';

export function BeforeAfterImageCompare({
  beforeUrl,
  afterUrl,
  title,
  description,
  beforeLabel,
  afterLabel,
  sliderLabel,
  testIdPrefix = 'before-after-compare',
}: {
  beforeUrl: string;
  afterUrl: string;
  title: string;
  description: string;
  beforeLabel: string;
  afterLabel: string;
  sliderLabel: string;
  testIdPrefix?: string;
}) {
  const [position, setPosition] = useState(50);

  return (
    <div className="space-y-4" data-testid={testIdPrefix}>
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-base-subtle/70 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className="mt-1 text-xs text-ink-muted">{description}</p>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
          <span className="rounded-full border border-border bg-base-elevated px-2 py-1">{beforeLabel}</span>
          <span className="rounded-full border border-prime/30 bg-prime/10 px-2 py-1 text-prime">{afterLabel}</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-base-subtle">
        <div className="relative h-[22rem] w-full bg-base-elevated" data-testid={`${testIdPrefix}-stage`}>
          <img src={beforeUrl} alt={beforeLabel} className="absolute inset-0 h-full w-full object-contain" />
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
            data-testid={`${testIdPrefix}-after-layer`}
          >
            <img src={afterUrl} alt={afterLabel} className="absolute inset-0 h-full w-full object-contain" />
          </div>

          <div className="pointer-events-none absolute inset-y-0" style={{ left: `calc(${position}% - 1px)` }}>
            <div className="absolute inset-y-0 w-0.5 bg-white/90 shadow-[0_0_0_1px_rgba(15,23,42,0.16)]" />
            <div className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-base-elevated/95 text-xs font-semibold text-ink shadow-lg">
              {position}%
            </div>
          </div>
        </div>
      </div>

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-ink-faint">{sliderLabel}</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={position}
          onChange={(event) => setPosition(Number(event.target.value))}
          className="mt-3 w-full accent-cyan-500"
          data-testid={`${testIdPrefix}-slider`}
        />
      </label>
    </div>
  );
}
