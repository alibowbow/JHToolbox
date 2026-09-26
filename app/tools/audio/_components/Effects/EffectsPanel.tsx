'use client';

import { Check, Headphones } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocale } from '@/components/providers/locale-provider';
import { AudioEffectTab, AudioEffectsState, getRangeStyle } from '../audio-editor-utils';
import { getAudioEditorCopy } from '../audio-editor-copy';

interface EffectsPanelProps {
  activeTab: AudioEffectTab;
  effects: AudioEffectsState;
  /** What Apply changes, e.g. "Applies to the selection 0:01.2–0:03.4". */
  targetLabel: string;
  onTabChange: (tab: AudioEffectTab) => void;
  onChange: (nextEffects: Partial<AudioEffectsState>) => void;
  onPreview: (tab: AudioEffectTab) => void;
  onApply: (tab: AudioEffectTab) => void;
}

type Parameter = {
  key: keyof AudioEffectsState;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
};

const signed = (value: number) => (value > 0 ? `+${value}` : `${value}`);

/**
 * One rack for every effect: pick it, set its parameters, preview, apply.
 * Each effect is described by its parameters instead of its own component.
 */
export function EffectsPanel({ activeTab, effects, targetLabel, onTabChange, onChange, onPreview, onApply }: EffectsPanelProps) {
  const { locale } = useLocale();
  const copy = getAudioEditorCopy(locale);
  const [appliedTab, setAppliedTab] = useState<AudioEffectTab | null>(null);

  useEffect(() => {
    if (!appliedTab) {
      return;
    }
    const timeoutId = window.setTimeout(() => setAppliedTab(null), 900);
    return () => window.clearTimeout(timeoutId);
  }, [appliedTab]);

  const seconds = (value: number) => `${value.toFixed(2)}s`;
  const effectsByTab: Record<AudioEffectTab, { label: string; parameters: Parameter[]; hint?: string }> = {
    fade: {
      label: copy.effects.fade,
      parameters: [
        { key: 'fadeIn', label: copy.effects.fadeIn, min: 0, max: 5, step: 0.05, format: seconds },
        { key: 'fadeOut', label: copy.effects.fadeOut, min: 0, max: 5, step: 0.05, format: seconds },
      ],
    },
    speed: {
      label: copy.effects.speed,
      parameters: [
        { key: 'speed', label: copy.effects.playbackSpeed, min: 0.25, max: 4, step: 0.05, format: (value) => `${value.toFixed(2)}×` },
      ],
    },
    pitch: {
      label: copy.effects.pitch,
      parameters: [
        {
          key: 'pitch',
          label: copy.effects.pitchShift,
          min: -12,
          max: 12,
          step: 1,
          format: (value) => `${signed(value)} ${copy.effects.semitones}`,
        },
      ],
    },
    amplify: {
      label: copy.effects.amplify,
      parameters: [
        { key: 'gain', label: copy.effects.amplifyGain, min: 0.25, max: 3, step: 0.05, format: (value) => `${value.toFixed(2)}×` },
      ],
      hint: copy.effects.amplifyHint,
    },
    reverb: {
      label: copy.effects.reverb,
      parameters: [
        { key: 'reverbDecay', label: copy.effects.reverbDecay, min: 0.2, max: 4, step: 0.05, format: seconds },
        { key: 'reverbMix', label: copy.effects.reverbMix, min: 0.05, max: 1, step: 0.01, format: (value) => `${Math.round(value * 100)}%` },
      ],
    },
    eq: {
      label: copy.effects.eq,
      parameters: (['low', 'mid', 'high'] as const).map((band) => ({
        key: band,
        label: copy.effects[band],
        min: -12,
        max: 12,
        step: 1,
        format: (value: number) => `${signed(value)} dB`,
      })),
    },
  };
  const tabs = Object.keys(effectsByTab) as AudioEffectTab[];
  const active = effectsByTab[activeTab];

  return (
    <section data-testid="audio-effects-panel" className="audio-panel rounded-2xl p-3 sm:p-4" aria-label={copy.effects.kicker}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="audio-segmented max-w-full flex-nowrap overflow-x-auto" role="group" aria-label={copy.effects.kicker}>
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => onTabChange(tab)}
              aria-pressed={activeTab === tab}
              className="audio-tab audio-focus-ring"
            >
              {effectsByTab[tab].label}
            </button>
          ))}
        </div>
        <p className="min-w-0 truncate text-xs text-[var(--text-tertiary)]">{targetLabel}</p>
      </div>

      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end">
        <div className="grid min-w-0 flex-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
          {active.parameters.map((parameter) => {
            const value = effects[parameter.key];
            const inputId = `audio-effect-${parameter.key}`;
            return (
              <div key={parameter.key} className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor={inputId} className="audio-range-label">
                    {parameter.label}
                  </label>
                  <span className="audio-value">{parameter.format(value)}</span>
                </div>
                <input
                  id={inputId}
                  type="range"
                  min={parameter.min}
                  max={parameter.max}
                  step={parameter.step}
                  value={value}
                  onChange={(event) => onChange({ [parameter.key]: Number(event.target.value) })}
                  style={getRangeStyle(value, parameter.min, parameter.max)}
                  className="audio-range audio-focus-ring"
                />
              </div>
            );
          })}
        </div>

        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => onPreview(activeTab)} className="audio-button-secondary audio-focus-ring h-9 px-3.5">
            <Headphones size={15} strokeWidth={1.75} />
            {copy.studio.preview}
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(activeTab);
              setAppliedTab(activeTab);
            }}
            className="audio-button-primary audio-focus-ring h-9 px-4"
          >
            <Check size={15} strokeWidth={2} />
            {appliedTab === activeTab ? copy.effects.applied : copy.studio.apply}
          </button>
        </div>
      </div>

      {active.hint ? <p className="mt-3 text-xs leading-relaxed text-[var(--text-tertiary)]">{active.hint}</p> : null}
    </section>
  );
}
