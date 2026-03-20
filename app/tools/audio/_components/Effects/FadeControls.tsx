'use client';

import { Check, Waves } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocale } from '@/components/providers/locale-provider';
import { getAudioEditorCopy } from '../audio-editor-copy';
import { formatTime, getRangeStyle } from '../audio-editor-utils';

interface FadeControlsProps {
  fadeIn: number;
  fadeOut: number;
  onChange: (nextValues: { fadeIn?: number; fadeOut?: number }) => void;
  onPreview: () => void;
  onApply: () => void;
}

export function FadeControls({ fadeIn, fadeOut, onChange, onPreview, onApply }: FadeControlsProps) {
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
          <label className="audio-range-label">{copy.effects.fadeIn}</label>
          <span className="audio-value">{formatTime(fadeIn)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={5}
          step={0.05}
          value={fadeIn}
          onChange={(event) => onChange({ fadeIn: Number(event.target.value) })}
          style={getRangeStyle(fadeIn, 0, 5)}
          className="audio-range audio-focus-ring"
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <label className="audio-range-label">{copy.effects.fadeOut}</label>
          <span className="audio-value">{formatTime(fadeOut)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={5}
          step={0.05}
          value={fadeOut}
          onChange={(event) => onChange({ fadeOut: Number(event.target.value) })}
          style={getRangeStyle(fadeOut, 0, 5)}
          className="audio-range audio-focus-ring"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onPreview} className="audio-button-secondary audio-focus-ring h-9 px-3">
          <Waves size={14} strokeWidth={1.5} />
          {copy.effects.previewFade}
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
          {applied ? copy.effects.applied : copy.effects.applyFade}
        </button>
      </div>
    </div>
  );
}
