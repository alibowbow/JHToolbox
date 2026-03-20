'use client';

interface PitchControlsProps {
  pitch: number;
  onChange: (nextPitch: number) => void;
  onPreview: () => void;
  onApply: () => void;
}

export function PitchControls({ pitch, onChange, onPreview, onApply }: PitchControlsProps) {
  return (
    <div className="space-y-4">
      <label className="block text-xs uppercase tracking-[0.18em] text-ink-faint">
        Pitch shift
        <input
          type="range"
          min={-12}
          max={12}
          step={1}
          value={pitch}
          onChange={(event) => onChange(Number(event.target.value))}
          className="mt-2 w-full accent-cyan-400"
        />
        <span className="mt-1 block text-sm font-semibold text-ink">{pitch > 0 ? `+${pitch}` : pitch} semitones</span>
      </label>

      <div className="rounded-xl border border-border bg-base-subtle/70 px-3 py-2 text-xs text-ink-muted">
        Pitch preview is staged first. Precise time-stretch correction can be added in a later iteration.
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onPreview} className="btn-ghost px-3 py-2 text-xs">
          Preview pitch
        </button>
        <button type="button" onClick={onApply} className="btn-primary px-3 py-2 text-xs">
          Apply pitch
        </button>
      </div>
    </div>
  );
}
