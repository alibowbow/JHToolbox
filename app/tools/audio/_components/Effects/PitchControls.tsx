'use client';

import { useLocale } from '@/components/providers/locale-provider';
import { getAudioEditorCopy } from '../audio-editor-copy';

interface PitchControlsProps {
  pitch: number;
  onChange: (nextPitch: number) => void;
  onPreview: () => void;
  onApply: () => void;
}

export function PitchControls({ pitch, onChange, onPreview, onApply }: PitchControlsProps) {
  const { locale } = useLocale();
  const copy = getAudioEditorCopy(locale);

  return (
    <div className="space-y-4">
      <label className="block text-xs uppercase tracking-[0.18em] text-ink-faint">
        {copy.effects.pitchShift}
        <input
          type="range"
          min={-12}
          max={12}
          step={1}
          value={pitch}
          onChange={(event) => onChange(Number(event.target.value))}
          className="mt-2 w-full accent-cyan-400"
        />
        <span className="mt-1 block text-sm font-semibold text-ink">
          {pitch > 0 ? `+${pitch}` : pitch} {copy.effects.semitones}
        </span>
      </label>

      <div className="rounded-xl border border-border bg-base-subtle/70 px-3 py-2 text-xs text-ink-muted">
        {copy.effects.pitchHint}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onPreview} className="btn-ghost px-3 py-2 text-xs">
          {copy.effects.previewPitch}
        </button>
        <button type="button" onClick={onApply} className="btn-primary px-3 py-2 text-xs">
          {copy.effects.applyPitch}
        </button>
      </div>
    </div>
  );
}
