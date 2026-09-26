'use client';

import Link from 'next/link';
import { Smartphone } from 'lucide-react';
import { useLocale } from '@/components/providers/locale-provider';
import type { RecordingSettings, RecordingSource } from '@/lib/processors/audio-recording';
import { getAudioEditorCopy } from '../audio-editor-copy';

function isPhone() {
  if (typeof navigator === 'undefined') {
    return false;
  }
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

/**
 * What to record (microphone, device sound or both), which microphone, and
 * whether to clean the voice up. Where device sound cannot be recorded it
 * says why, and on phones how to get it with the phone's screen recorder.
 */
export function RecordingSettingsPanel({
  settings,
  onChange,
  microphones,
  deviceSupported,
}: {
  settings: RecordingSettings;
  onChange: (next: RecordingSettings) => void;
  microphones: Array<{ id: string; label: string }>;
  deviceSupported: boolean;
}) {
  const { locale } = useLocale();
  const copy = getAudioEditorCopy(locale).recorder;
  const phone = isPhone();
  const sources: Array<{ id: RecordingSource; label: string; hint: string }> = [
    { id: 'mic', label: copy.sourceMic, hint: copy.sourceMicHint },
    { id: 'device', label: copy.sourceDevice, hint: copy.sourceDeviceHint },
    { id: 'both', label: copy.sourceBoth, hint: copy.sourceBothHint },
  ];
  const active = sources.find((source) => source.id === settings.source) ?? sources[0];
  const usesMic = settings.source !== 'device';

  return (
    <div className="space-y-4 text-left" data-testid="audio-recording-settings">
      <div className="space-y-2">
        <p className="audio-range-label">{copy.source}</p>
        <div className="audio-segmented w-full flex-nowrap" role="group" aria-label={copy.source}>
          {sources.map((source) => {
            const disabled = source.id !== 'mic' && !deviceSupported;
            return (
              <button
                key={source.id}
                type="button"
                disabled={disabled}
                aria-pressed={settings.source === source.id}
                onClick={() => onChange({ ...settings, source: source.id })}
                className="audio-tab audio-focus-ring min-w-0 flex-1 px-2 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {source.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs leading-relaxed text-[var(--text-tertiary)]">{active.hint}</p>
        {!deviceSupported && !phone ? (
          <p className="text-xs leading-relaxed text-[var(--status-warning)]">{copy.deviceUnsupported}</p>
        ) : null}
      </div>

      {!deviceSupported && phone ? (
        <details className="group rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5 text-sm" open>
          <summary className="flex cursor-pointer select-none items-center gap-2 font-medium text-[var(--text-primary)]">
            <Smartphone size={15} strokeWidth={1.75} aria-hidden="true" />
            {copy.phoneTitle}
          </summary>
          <ol className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-[var(--text-secondary)]">
            {copy.phoneSteps.map((step, index) => (
              <li key={step} className={index === 0 ? '' : 'flex gap-2'}>
                {index === 0 ? step : (
                  <>
                    <span className="audio-mono shrink-0 text-[var(--text-tertiary)]">{index}.</span>
                    <span>{step}</span>
                  </>
                )}
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">
            <Link href="/tools/video/extract-audio" className="underline underline-offset-2 hover:text-[var(--text-primary)]">
              {copy.phoneFallback}
            </Link>
          </p>
        </details>
      ) : null}

      {usesMic ? (
        <div className="space-y-3">
          {microphones.length > 1 ? (
            <label className="block space-y-1.5">
              <span className="audio-range-label">{copy.mic}</span>
              <select
                value={microphones.some((mic) => mic.id === settings.micId) ? settings.micId : ''}
                onChange={(event) => onChange({ ...settings, micId: event.target.value })}
                className="audio-field audio-focus-ring w-full font-sans"
              >
                <option value="">{copy.micDefault}</option>
                {microphones.map((mic, index) => (
                  <option key={mic.id} value={mic.id}>
                    {mic.label || copy.micUnnamed(index + 1)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={settings.voiceEnhance}
              onChange={(event) => onChange({ ...settings, voiceEnhance: event.target.checked })}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-[var(--bg-overlay)] transition peer-checked:bg-[var(--accent)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)] after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-[var(--text-primary)]">{copy.voiceEnhance}</span>
              <span className="block text-xs leading-relaxed text-[var(--text-tertiary)]">{copy.voiceEnhanceHint}</span>
            </span>
          </label>
        </div>
      ) : null}
    </div>
  );
}
