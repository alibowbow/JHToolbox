'use client';

import { Check, SlidersHorizontal, Sparkles, Volume2, Waves, X, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocale } from '@/components/providers/locale-provider';
import { AudioEffectTab, AudioEffectsState } from '../audio-editor-utils';
import { getAudioEditorCopy } from '../audio-editor-copy';
import { getRangeStyle } from '../audio-editor-utils';
import { AmplifyControls } from './AmplifyControls';
import { FadeControls } from './FadeControls';
import { PitchControls } from './PitchControls';
import { SpeedControls } from './SpeedControls';

interface EffectsPanelProps {
  activeTab: AudioEffectTab;
  effects: AudioEffectsState;
  onTabChange: (tab: AudioEffectTab) => void;
  onChange: (nextEffects: Partial<AudioEffectsState>) => void;
  onPreview: (tab: AudioEffectTab) => void;
  onApply: (tab: AudioEffectTab) => void;
  onClose?: () => void;
}

export function EffectsPanel({
  activeTab,
  effects,
  onTabChange,
  onChange,
  onPreview,
  onApply,
  onClose,
}: EffectsPanelProps) {
  const { locale } = useLocale();
  const copy = getAudioEditorCopy(locale);
  const [eqApplied, setEqApplied] = useState(false);

  useEffect(() => {
    if (!eqApplied) {
      return;
    }

    const timeoutId = window.setTimeout(() => setEqApplied(false), 800);
    return () => window.clearTimeout(timeoutId);
  }, [eqApplied]);

  const tabs: Array<{ id: AudioEffectTab; label: string; icon: LucideIcon }> = [
    { id: 'fade', label: copy.effects.fade, icon: Waves },
    { id: 'speed', label: copy.effects.speed, icon: SlidersHorizontal },
    { id: 'pitch', label: copy.effects.pitch, icon: Sparkles },
    { id: 'amplify', label: copy.effects.amplify, icon: Volume2 },
    { id: 'eq', label: copy.effects.eq, icon: SlidersHorizontal },
  ];

  return (
    <section className="audio-panel flex h-full min-h-[18rem] flex-col rounded-[20px] p-4">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] pb-4">
        <div>
          <p className="audio-section-kicker">{copy.effects.kicker}</p>
          <h2 className="mt-1 text-sm font-medium text-[var(--text-primary)]">{copy.effects.title}</h2>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="audio-icon-button audio-focus-ring"
            aria-label={copy.effects.close}
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`audio-tab audio-focus-ring ${active ? 'audio-tab-active' : ''}`}
            >
              <Icon size={13} strokeWidth={1.5} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex-1 rounded-[14px] border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-4">
        {activeTab === 'fade' ? (
          <FadeControls
            fadeIn={effects.fadeIn}
            fadeOut={effects.fadeOut}
            onChange={onChange}
            onPreview={() => onPreview('fade')}
            onApply={() => onApply('fade')}
          />
        ) : null}
        {activeTab === 'speed' ? (
          <SpeedControls
            speed={effects.speed}
            onChange={(nextSpeed) => onChange({ speed: nextSpeed })}
            onPreview={() => onPreview('speed')}
            onApply={() => onApply('speed')}
          />
        ) : null}
        {activeTab === 'pitch' ? (
          <PitchControls
            pitch={effects.pitch}
            onChange={(nextPitch) => onChange({ pitch: nextPitch })}
            onPreview={() => onPreview('pitch')}
            onApply={() => onApply('pitch')}
          />
        ) : null}
        {activeTab === 'amplify' ? (
          <AmplifyControls
            gain={effects.gain}
            onChange={(nextGain) => onChange({ gain: nextGain })}
            onPreview={() => onPreview('amplify')}
            onApply={() => onApply('amplify')}
          />
        ) : null}
        {activeTab === 'eq' ? (
          <div className="space-y-5">
            {[
              { id: 'low', label: copy.effects.low, value: effects.low },
              { id: 'mid', label: copy.effects.mid, value: effects.mid },
              { id: 'high', label: copy.effects.high, value: effects.high },
            ].map((band) => (
              <div key={band.id} className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="audio-range-label">{band.label}</label>
                  <span className="audio-value">{band.value > 0 ? `+${band.value}` : band.value} dB</span>
                </div>
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={1}
                  value={band.value}
                  onChange={(event) => onChange({ [band.id]: Number(event.target.value) })}
                  style={getRangeStyle(band.value, -12, 12)}
                  className="audio-range audio-focus-ring"
                  aria-label={band.label}
                />
              </div>
            ))}
            <div className="audio-surface-muted rounded-[10px] px-3 py-2 text-xs leading-relaxed text-[var(--text-secondary)]">
              {copy.effects.eqHint}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => onPreview('eq')} className="audio-button-secondary audio-focus-ring h-9 px-3">
                <SlidersHorizontal size={14} strokeWidth={1.5} />
                {copy.effects.previewEq}
              </button>
              <button
                type="button"
                onClick={() => {
                  onApply('eq');
                  setEqApplied(true);
                }}
                className="audio-button-primary audio-focus-ring h-9 px-3"
              >
                <Check size={14} strokeWidth={1.5} />
                {eqApplied ? copy.effects.applied : copy.effects.applyEq}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
