'use client';

import { Play, Scissors, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocale } from '@/components/providers/locale-provider';
import { getAudioEditorCopy } from '../audio-editor-copy';
import { formatTime, parseTimeInput } from '../audio-editor-utils';

interface SelectionBarProps {
  start: number;
  end: number;
  duration: number;
  onStartChange: (nextValue: number) => void;
  onEndChange: (nextValue: number) => void;
  onPlaySelection: () => void;
  onTrimSelection: () => void;
  onRemoveSelection: () => void;
  onClearSelection: () => void;
}

export function SelectionBar({
  start,
  end,
  duration,
  onStartChange,
  onEndChange,
  onPlaySelection,
  onTrimSelection,
  onRemoveSelection,
  onClearSelection,
}: SelectionBarProps) {
  const { locale } = useLocale();
  const copy = getAudioEditorCopy(locale);
  const [startInput, setStartInput] = useState(formatTime(start));
  const [endInput, setEndInput] = useState(formatTime(end));
  const selectionLength = Math.max(0, end - start);
  const hasSelection = duration > 0 && (start > 0.001 || end < duration - 0.001);

  useEffect(() => {
    setStartInput(formatTime(start));
  }, [start]);

  useEffect(() => {
    setEndInput(formatTime(end));
  }, [end]);

  const commitStart = () => {
    onStartChange(parseTimeInput(startInput, start));
    setStartInput(formatTime(parseTimeInput(startInput, start)));
  };

  const commitEnd = () => {
    onEndChange(parseTimeInput(endInput, end));
    setEndInput(formatTime(parseTimeInput(endInput, end)));
  };

  return (
    <section
      data-testid="audio-selection-bar"
      className={`audio-panel rounded-[18px] px-4 py-3 transition-opacity ${
        hasSelection ? 'border-[var(--selection-border)]' : 'opacity-70'
      }`}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <p className="audio-section-kicker">{copy.selection.kicker}</p>
            <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
              {hasSelection ? copy.selection.activeDescription : copy.selection.inactiveDescription}
            </p>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2">
              <span className="audio-range-label">{copy.selection.start}</span>
              <input
                type="text"
                value={startInput}
                onChange={(event) => setStartInput(event.target.value)}
                onBlur={commitStart}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    commitStart();
                  }
                }}
                className="audio-field audio-focus-ring w-[7.5rem]"
                aria-label={copy.selection.start}
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="audio-range-label">{copy.selection.end}</span>
              <input
                type="text"
                value={endInput}
                onChange={(event) => setEndInput(event.target.value)}
                onBlur={commitEnd}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    commitEnd();
                  }
                }}
                className="audio-field audio-focus-ring w-[7.5rem]"
                aria-label={copy.selection.end}
              />
            </label>
            <div className="rounded-md border border-[var(--border)] bg-[rgba(255,255,255,0.02)] px-3 py-2">
              <p className="audio-range-label">{copy.selection.length}</p>
              <p className="audio-mono mt-1 text-[13px] text-[var(--text-secondary)]">{formatTime(selectionLength)}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onPlaySelection}
            disabled={!hasSelection}
            className="audio-button-secondary audio-focus-ring h-9 px-3"
          >
            <Play size={14} strokeWidth={1.5} />
            {copy.selection.playSelection}
          </button>
          <button
            type="button"
            onClick={onTrimSelection}
            disabled={!hasSelection}
            className="audio-button-secondary audio-focus-ring h-9 px-3"
          >
            <Scissors size={14} strokeWidth={1.5} />
            {copy.selection.keepSelection}
          </button>
          <button
            type="button"
            onClick={onRemoveSelection}
            disabled={!hasSelection}
            className="audio-button-danger audio-focus-ring h-9 px-3"
          >
            <Trash2 size={14} strokeWidth={1.5} />
            {copy.selection.removeSelection}
          </button>
          <button type="button" onClick={onClearSelection} className="audio-button-ghost audio-focus-ring h-9 px-3">
            <X size={14} strokeWidth={1.5} />
            {copy.selection.clear}
          </button>
        </div>
      </div>
    </section>
  );
}
