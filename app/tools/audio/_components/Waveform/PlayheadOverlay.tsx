'use client';

interface PlayheadOverlayProps {
  positionPercent: number;
}

export function PlayheadOverlay({ positionPercent }: PlayheadOverlayProps) {
  return (
    <div
      data-testid="audio-playhead"
      className="pointer-events-none absolute inset-y-0 z-10 w-px bg-[rgba(255,255,255,0.72)]"
      style={{ left: `${positionPercent * 100}%` }}
    >
      <span className="absolute -top-1 left-1/2 h-0 w-0 -translate-x-1/2 border-l-[4px] border-r-[4px] border-t-0 border-b-[6px] border-l-transparent border-r-transparent border-b-[rgba(255,255,255,0.72)]" />
    </div>
  );
}
