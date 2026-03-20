'use client';

interface FadeControlsProps {
  fadeIn: number;
  fadeOut: number;
  onChange: (nextValues: { fadeIn?: number; fadeOut?: number }) => void;
  onPreview: () => void;
  onApply: () => void;
}

export function FadeControls({ fadeIn, fadeOut, onChange, onPreview, onApply }: FadeControlsProps) {
  return (
    <div className="space-y-4">
      <label className="block text-xs uppercase tracking-[0.18em] text-ink-faint">
        Fade in
        <input
          type="range"
          min={0}
          max={5}
          step={0.05}
          value={fadeIn}
          onChange={(event) => onChange({ fadeIn: Number(event.target.value) })}
          className="mt-2 w-full accent-cyan-400"
        />
        <span className="mt-1 block text-sm font-semibold text-ink">{fadeIn.toFixed(2)}s</span>
      </label>
      <label className="block text-xs uppercase tracking-[0.18em] text-ink-faint">
        Fade out
        <input
          type="range"
          min={0}
          max={5}
          step={0.05}
          value={fadeOut}
          onChange={(event) => onChange({ fadeOut: Number(event.target.value) })}
          className="mt-2 w-full accent-cyan-400"
        />
        <span className="mt-1 block text-sm font-semibold text-ink">{fadeOut.toFixed(2)}s</span>
      </label>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onPreview} className="btn-ghost px-3 py-2 text-xs">
          Preview fade
        </button>
        <button type="button" onClick={onApply} className="btn-primary px-3 py-2 text-xs">
          Apply fade
        </button>
      </div>
    </div>
  );
}
