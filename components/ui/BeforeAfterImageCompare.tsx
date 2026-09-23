'use client';

import { useState } from 'react';

/**
 * Original on the left, result on the right of a divider the user drags. A
 * transparent range input covers the image, so mouse, touch and keyboard all
 * move the divider without custom pointer code.
 */
export function BeforeAfterImageCompare({
  beforeUrl,
  afterUrl,
  beforeLabel,
  afterLabel,
  sliderLabel,
  testIdPrefix = 'before-after-compare',
}: {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel: string;
  afterLabel: string;
  sliderLabel: string;
  testIdPrefix?: string;
}) {
  const [position, setPosition] = useState(50);

  return (
    <div
      className="checkerboard relative h-[22rem] w-full select-none overflow-hidden rounded-xl border border-border"
      data-testid={testIdPrefix}
    >
      <img src={beforeUrl} alt={beforeLabel} className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ clipPath: `inset(0 0 0 ${position}%)` }}
        data-testid={`${testIdPrefix}-after-layer`}
      >
        <img src={afterUrl} alt={afterLabel} className="absolute inset-0 h-full w-full object-contain" />
      </div>

      <div className="pointer-events-none absolute inset-y-0" style={{ left: `${position}%` }} aria-hidden="true">
        <div className="absolute inset-y-0 -ml-px w-0.5 bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.25)]" />
        <div className="absolute left-0 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/80 bg-base-elevated text-ink-muted shadow-pop">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 3 1.5 7 5 11M9 3l3.5 4L9 11" />
          </svg>
        </div>
      </div>

      <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white">{beforeLabel}</span>
      <span className="pointer-events-none absolute right-2 top-2 rounded-md bg-prime px-2 py-0.5 text-[11px] font-medium text-prime-contrast">{afterLabel}</span>

      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={position}
        onChange={(event) => setPosition(Number(event.target.value))}
        aria-label={sliderLabel}
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        data-testid={`${testIdPrefix}-slider`}
      />
    </div>
  );
}
