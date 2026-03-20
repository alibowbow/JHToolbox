'use client';

import { useLocale } from '@/components/providers/locale-provider';
import { getAudioEditorCopy } from '../audio-editor-copy';

interface AmplifyControlsProps {
  gain: number;
  onChange: (nextGain: number) => void;
  onPreview: () => void;
  onApply: () => void;
}

export function AmplifyControls({ gain, onChange, onPreview, onApply }: AmplifyControlsProps) {
  const { locale } = useLocale();
  const copy = getAudioEditorCopy(locale);

  return (
    <div className="space-y-4">
      <label className="block text-xs uppercase tracking-[0.18em] text-ink-faint">
        {copy.effects.amplifyGain}
        <input
          type="range"
          min={0.25}
          max={3}
          step={0.05}
          value={gain}
          onChange={(event) => onChange(Number(event.target.value))}
          className="mt-2 w-full accent-cyan-400"
        />
        <span className="mt-1 block text-sm font-semibold text-ink">{gain.toFixed(2)}x</span>
      </label>

      <div className="rounded-xl border border-border bg-base-subtle/70 px-3 py-2 text-xs text-ink-muted">
        {copy.effects.amplifyHint}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onPreview} className="btn-ghost px-3 py-2 text-xs">
          {copy.effects.previewAmplify}
        </button>
        <button type="button" onClick={onApply} className="btn-primary px-3 py-2 text-xs">
          {copy.effects.applyAmplify}
        </button>
      </div>
    </div>
  );
}
