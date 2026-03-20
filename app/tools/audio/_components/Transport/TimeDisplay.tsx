'use client';

import { useLocale } from '@/components/providers/locale-provider';
import { formatTime } from '../audio-editor-utils';
import { getAudioEditorCopy } from '../audio-editor-copy';

interface TimeDisplayProps {
  currentTime: number;
  duration: number;
}

export function TimeDisplay({ currentTime, duration }: TimeDisplayProps) {
  const { locale } = useLocale();
  const copy = getAudioEditorCopy(locale);

  return (
    <div className="rounded-xl border border-border bg-base-subtle/80 px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.18em] text-ink-faint">{copy.time.label}</p>
      <p className="mt-1 text-sm font-semibold text-ink">
        {formatTime(currentTime)} / {formatTime(duration)}
      </p>
    </div>
  );
}
