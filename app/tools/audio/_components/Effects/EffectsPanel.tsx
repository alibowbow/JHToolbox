'use client';

import { ChevronDown, Mic2, SlidersHorizontal, Waves, type LucideIcon } from 'lucide-react';
import { useLocale } from '@/components/providers/locale-provider';
import { AudioEffectTab, AudioEffectsState } from '../audio-editor-utils';
import { getAudioEditorCopy } from '../audio-editor-copy';
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
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export function EffectsPanel({
  activeTab,
  effects,
  onTabChange,
  onChange,
  onPreview,
  onApply,
  collapsed = false,
  onToggleCollapsed,
}: EffectsPanelProps) {
  const { locale } = useLocale();
  const copy = getAudioEditorCopy(locale);
  const tabs: Array<{ id: AudioEffectTab; label: string; icon: LucideIcon }> = [
    { id: 'fade', label: copy.effects.fade, icon: Waves },
    { id: 'speed', label: copy.effects.speed, icon: SlidersHorizontal },
    { id: 'pitch', label: copy.effects.pitch, icon: Mic2 },
    { id: 'amplify', label: copy.effects.amplify, icon: Waves },
    { id: 'eq', label: copy.effects.eq, icon: SlidersHorizontal },
  ];

  return (
    <section className="workspace-panel p-4">
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div>
          <p className="workspace-kicker">{copy.effects.kicker}</p>
          <h2 className="mt-2 text-base font-semibold text-ink">{copy.effects.title}</h2>
        </div>
        {onToggleCollapsed ? <ChevronDown size={18} className={collapsed ? 'rotate-180 transition' : 'transition'} /> : null}
      </button>

      {collapsed ? null : (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className={active ? 'btn-primary px-3 py-2 text-xs' : 'btn-ghost px-3 py-2 text-xs'}
                >
                  <Icon size={14} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl border border-border bg-base-subtle/70 p-4">
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
              <div className="space-y-4">
                <label className="block text-xs uppercase tracking-[0.18em] text-ink-faint">
                  {copy.effects.low}
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    step={1}
                    value={effects.low}
                    onChange={(event) => onChange({ low: Number(event.target.value) })}
                    className="mt-2 w-full accent-cyan-400"
                  />
                </label>
                <label className="block text-xs uppercase tracking-[0.18em] text-ink-faint">
                  {copy.effects.mid}
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    step={1}
                    value={effects.mid}
                    onChange={(event) => onChange({ mid: Number(event.target.value) })}
                    className="mt-2 w-full accent-cyan-400"
                  />
                </label>
                <label className="block text-xs uppercase tracking-[0.18em] text-ink-faint">
                  {copy.effects.high}
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    step={1}
                    value={effects.high}
                    onChange={(event) => onChange({ high: Number(event.target.value) })}
                    className="mt-2 w-full accent-cyan-400"
                  />
                </label>
                <div className="rounded-xl border border-border bg-base-elevated px-3 py-2 text-xs text-ink-muted">
                  {copy.effects.eqHint}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => onPreview('eq')} className="btn-ghost px-3 py-2 text-xs">
                    {copy.effects.previewEq}
                  </button>
                  <button type="button" onClick={() => onApply('eq')} className="btn-primary px-3 py-2 text-xs">
                    {copy.effects.applyEq}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
