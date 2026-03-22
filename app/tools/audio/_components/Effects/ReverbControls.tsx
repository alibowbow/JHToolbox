'use client';

import { Check, Waves } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocale } from '@/components/providers/locale-provider';
import { getAudioEditorCopy } from '../audio-editor-copy';
import { getRangeStyle } from '../audio-editor-utils';

interface ReverbControlsProps {
  decay: number;
  mix: number;
  onChange: (nextValues: { reverbDecay?: number; reverbMix?: number }) => void;
  onPreview: () => void;
  onApply: () => void;
}

export function ReverbControls({ decay, mix, onChange, onPreview, onApply }: ReverbControlsProps) {
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
          <label className="audio-range-label">{copy.effects.reverbDecay ?? 'Decay'}</label>
          <span className="audio-value">{decay.toFixed(2)}s</span>
        </div>
        <input
          type="range"
          min={0.2}
          max={4}
          step={0.05}
          value={decay}
          onChange={(event) => onChange({ reverbDecay: Number(event.target.value) })}
          style={getRangeStyle(decay, 0.2, 4)}
          className="audio-range audio-focus-ring"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <label className="audio-range-label">{copy.effects.reverbMix ?? 'Mix'}</label>
          <span className="audio-value">{Math.round(mix * 100)}%</span>
        </div>
        <input
          type="range"
          min={0.05}
          max={1}
          step={0.01}
          value={mix}
          onChange={(event) => onChange({ reverbMix: Number(event.target.value) })}
          style={getRangeStyle(mix, 0.05, 1)}
          className="audio-range audio-focus-ring"
        />
      </div>

      <div className="audio-surface-muted rounded-[10px] px-3 py-2 text-xs leading-relaxed text-[var(--text-secondary)]">
        {copy.effects.reverbHint ?? 'Add depth with a short synthetic room tail on the selected range.'}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onPreview} className="audio-button-secondary audio-focus-ring h-9 px-3">
          <Waves size={14} strokeWidth={1.5} />
          {copy.effects.previewReverb ?? 'Preview reverb'}
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
          {applied ? copy.effects.applied : copy.effects.applyReverb ?? 'Apply reverb'}
        </button>
      </div>
    </div>
  );
}
