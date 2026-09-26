'use client';

import { Copy, Play, Scissors, SquareDashed, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocale } from '@/components/providers/locale-provider';
import { getAudioEditorCopy } from '../audio-editor-copy';
import { formatTime, parseTimeInput } from '../audio-editor-utils';

interface SelectionBarProps {
  start: number;
  end: number;
  onStartChange: (nextValue: number) => void;
  onEndChange: (nextValue: number) => void;
  onPlaySelection: () => void;
  onTrimSelection: () => void;
  onRemoveSelection: () => void;
  onCutSelection: () => void;
  onCopySelection: () => void;
  onClearSelection: () => void;
}

/** What to do with the selected range, docked just above the transport. */
export function SelectionBar({
  start,
  end,
  onStartChange,
  onEndChange,
  onPlaySelection,
  onTrimSelection,
  onRemoveSelection,
  onCutSelection,
  onCopySelection,
  onClearSelection,
}: SelectionBarProps) {
  const { locale } = useLocale();
  const copy = getAudioEditorCopy(locale);
  const [startInput, setStartInput] = useState(formatTime(start));
  const [endInput, setEndInput] = useState(formatTime(end));
  const selectionLength = Math.max(0, end - start);

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

  const action = 'audio-button-ghost audio-focus-ring h-8 px-2.5';
  const actions = [
    { label: copy.selection.playSelection, icon: Play, onClick: onPlaySelection },
    { label: copy.selection.keepSelection, icon: SquareDashed, onClick: onTrimSelection },
    { label: copy.selection.cutSelection, icon: Scissors, onClick: onCutSelection },
    { label: copy.selection.copySelection, icon: Copy, onClick: onCopySelection },
  ];

  return (
    <div data-testid="audio-selection-bar" className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--border)] px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--selection-border)]" aria-hidden="true" />
        <span className="text-[13px] font-semibold text-[var(--text-primary)]">{copy.selection.kicker}</span>
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
          className="audio-field audio-focus-ring h-7 w-[6.25rem] px-2 py-0 text-[12px]"
          aria-label={copy.selection.start}
        />
        <span className="text-[var(--text-tertiary)]">–</span>
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
          className="audio-field audio-focus-ring h-7 w-[6.25rem] px-2 py-0 text-[12px]"
          aria-label={copy.selection.end}
        />
        <span className="audio-mono hidden text-[12px] text-[var(--text-tertiary)] sm:inline" title={copy.selection.length}>
          {formatTime(selectionLength)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-0.5 sm:ml-auto">
        {actions.map(({ label, icon: Icon, onClick }) => (
          <button key={label} type="button" onClick={onClick} className={action} aria-label={label} title={label}>
            <Icon size={15} strokeWidth={1.75} />
            <span className="hidden lg:inline">{label}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={onRemoveSelection}
          className="audio-button-danger audio-focus-ring h-8 px-2.5"
          aria-label={copy.selection.removeSelection}
          title={copy.selection.removeSelection}
        >
          <Trash2 size={15} strokeWidth={1.75} />
          <span className="hidden lg:inline">{copy.selection.removeSelection}</span>
        </button>
        <button
          type="button"
          onClick={onClearSelection}
          className="audio-icon-button audio-focus-ring h-8 w-8"
          aria-label={copy.selection.clear}
          title={copy.selection.clear}
        >
          <X size={15} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
