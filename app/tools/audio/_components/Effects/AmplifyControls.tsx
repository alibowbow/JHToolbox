'use client';

import { Check, Volume2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocale } from '@/components/providers/locale-provider';
import { getAudioEditorCopy } from '../audio-editor-copy';
import { getRangeStyle } from '../audio-editor-utils';

interface AmplifyControlsProps {
  gain: number;
  onChange: (nextGain: number) => void;
  onPreview: () => void;
  onApply: () => void;
}

export function AmplifyControls({ gain, onChange, onPreview, onApply }: AmplifyControlsProps) {
  const { locale } = useLocale();
  const copy = getAudioEditorCopy(locale);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (!applied) {
      return;
    }

    const timeoutId = window.setTimeout(() => setApplied(false), 800);
    return () => window.clearTimeout(timeoutId);
  }, [applied]);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <label className="audio-range-label">{copy.effects.amplifyGain}</label>
          <span className="audio-value">{gain.toFixed(2)}x</span>
        </div>
        <input
          type="range"
          min={0.25}
          max={3}
          step={0.05}
          value={gain}
          onChange={(event) => onChange(Number(event.target.value))}
          style={getRangeStyle(gain, 0.25, 3)}
          className="audio-range audio-focus-ring"
        />
      </div>

      <div className="audio-surface-muted rounded-[10px] px-3 py-2 text-xs leading-relaxed text-[var(--text-secondary)]">
        {copy.effects.amplifyHint}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onPreview} className="audio-button-secondary audio-focus-ring h-9 px-3">
          <Volume2 size={14} strokeWidth={1.5} />
          {copy.effects.previewAmplify}
        </button>
        <button
          type="button"
          onClick={() => {
            onApply();
            setApplied(true);
          }}
          className="audio-button-primary audio-focus-ring h-9 px-3"
        >
          <Check size={14} strokeWidth={1.5} />
          {applied ? copy.effects.applied : copy.effects.applyAmplify}
        </button>
      </div>
    </div>
  );
}
