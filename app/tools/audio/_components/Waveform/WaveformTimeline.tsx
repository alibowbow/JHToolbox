'use client';

import { useLocale } from '@/components/providers/locale-provider';
import { formatTime } from '../audio-editor-utils';
import { getAudioEditorCopy } from '../audio-editor-copy';

interface WaveformTimelineProps {
  duration: number;
  zoom: number;
}

export function WaveformTimeline({ duration, zoom }: WaveformTimelineProps) {
  const { locale } = useLocale();
  const copy = getAudioEditorCopy(locale);
  const segments = Math.max(6, Math.min(20, Math.round(zoom * 1.6)));
  const step = duration > 0 ? duration / segments : 0;

  return (
    <div className="flex h-7 items-center border-b border-[var(--border)] bg-[var(--topbar-bg)] px-3">
      <div className="flex items-center justify-between gap-2">
        <span className="audio-section-kicker pr-3">{copy.waveform.timeline}</span>
      </div>
      <div
        className="grid flex-1 gap-1 text-[10px] text-[var(--text-tertiary)]"
        style={{ gridTemplateColumns: `repeat(${segments + 1}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: segments + 1 }, (_, index) => (
          <div key={index} className="relative">
            <span className={`block border-l ${index % 5 === 0 ? 'h-2 border-[var(--border-strong)]' : 'h-1 border-[var(--border)]'}`} />
            {index < segments ? (
              <span className={`audio-mono mt-1 block truncate ${index % 5 === 0 ? 'text-[var(--text-secondary)]' : ''}`}>
                {formatTime(step * index, false)}
              </span>
            ) : (
              <span className="audio-mono mt-1 block truncate text-[var(--text-secondary)]">{formatTime(duration, false)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
