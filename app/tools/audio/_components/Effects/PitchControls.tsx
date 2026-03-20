'use client';

import { Check, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocale } from '@/components/providers/locale-provider';
import { getAudioEditorCopy } from '../audio-editor-copy';
import { getRangeStyle } from '../audio-editor-utils';

interface PitchControlsProps {
  pitch: number;
  onChange: (nextPitch: number) => void;
  onPreview: () => void;
  onApply: () => void;
}

export function PitchControls({ pitch, onChange, onPreview, onApply }: PitchControlsProps) {
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
          <label className="audio-range-label">{copy.effects.pitchShift}</label>
          <span className="audio-value">
            {pitch > 0 ? `+${pitch}` : pitch} {copy.effects.semitones}
          </span>
        </div>
        <input
          type="range"
          min={-12}
          max={12}
          step={1}
          value={pitch}
          onChange={(event) => onChange(Number(event.target.value))}
          style={getRangeStyle(pitch, -12, 12)}
          className="audio-range audio-focus-ring"
        />
      </div>

      <div className="audio-surface-muted rounded-[10px] px-3 py-2 text-xs leading-relaxed text-[var(--text-secondary)]">
        {copy.effects.pitchHint}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onPreview} className="audio-button-secondary audio-focus-ring h-9 px-3">
          <Sparkles size={14} strokeWidth={1.5} />
          {copy.effects.previewPitch}
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
          {applied ? copy.effects.applied : copy.effects.applyPitch}
        </button>
      </div>
    </div>
  );
}
