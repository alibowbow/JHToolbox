'use client';

interface SpeedControlsProps {
  speed: number;
  onChange: (nextSpeed: number) => void;
  onPreview: () => void;
  onApply: () => void;
}

export function SpeedControls({ speed, onChange, onPreview, onApply }: SpeedControlsProps) {
  return (
    <div className="space-y-4">
      <label className="block text-xs uppercase tracking-[0.18em] text-ink-faint">
        Playback speed
        <input
          type="range"
          min={0.25}
          max={4}
          step={0.05}
          value={speed}
          onChange={(event) => onChange(Number(event.target.value))}
          className="mt-2 w-full accent-cyan-400"
        />
        <span className="mt-1 block text-sm font-semibold text-ink">{speed.toFixed(2)}x</span>
      </label>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onPreview} className="btn-ghost px-3 py-2 text-xs">
          Preview speed
        </button>
        <button type="button" onClick={onApply} className="btn-primary px-3 py-2 text-xs">
          Apply speed
        </button>
      </div>
    </div>
  );
}
