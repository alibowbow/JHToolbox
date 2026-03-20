'use client';

import { useLocale } from '@/components/providers/locale-provider';
import { formatTime } from '../audio-editor-utils';
import { getAudioEditorCopy } from '../audio-editor-copy';
import { SelectionControls } from './SelectionControls';

interface SelectionBarProps {
  start: number;
  end: number;
  duration: number;
  trimMode: 'keep' | 'remove';
  onStartChange: (nextValue: number) => void;
  onEndChange: (nextValue: number) => void;
  onTrimModeChange: (nextMode: 'keep' | 'remove') => void;
  onPlaySelection: () => void;
  onTrimSelection: () => void;
  onRemoveSelection: () => void;
  onCopySelection: () => void;
  onClearSelection: () => void;
}

export function SelectionBar({
  start,
  end,
  duration,
  trimMode,
  onStartChange,
  onEndChange,
  onTrimModeChange,
  onPlaySelection,
  onTrimSelection,
  onRemoveSelection,
  onCopySelection,
  onClearSelection,
}: SelectionBarProps) {
  const { locale } = useLocale();
  const copy = getAudioEditorCopy(locale);
  const selectionLength = Math.max(0, end - start);

  return (
    <div className="workspace-panel p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <div>
            <p className="workspace-kicker">{copy.selection.kicker}</p>
            <h2 className="mt-2 text-base font-semibold text-ink">{copy.selection.title}</h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs uppercase tracking-[0.18em] text-ink-faint">
              {copy.selection.start}
              <input
                type="number"
                min={0}
                max={duration}
                step={0.01}
                value={start.toFixed(2)}
                onChange={(event) => onStartChange(Number(event.target.value))}
                className="input-surface mt-1 w-full"
              />
            </label>
            <label className="text-xs uppercase tracking-[0.18em] text-ink-faint">
              {copy.selection.end}
              <input
                type="number"
                min={0}
                max={duration}
                step={0.01}
                value={end.toFixed(2)}
                onChange={(event) => onEndChange(Number(event.target.value))}
                className="input-surface mt-1 w-full"
              />
            </label>
            <div className="rounded-xl border border-border bg-base-subtle/80 p-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-ink-faint">{copy.selection.length}</p>
              <p className="mt-1 text-sm font-semibold text-ink">{formatTime(selectionLength)}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {(['keep', 'remove'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onTrimModeChange(mode)}
                className={trimMode === mode ? 'btn-primary px-3 py-2 text-xs' : 'btn-ghost px-3 py-2 text-xs'}
              >
                {mode === 'keep' ? copy.selection.keepMode : copy.selection.removeMode}
              </button>
            ))}
          </div>
        </div>

        <SelectionControls
          onPlaySelection={onPlaySelection}
          onTrimSelection={onTrimSelection}
          onRemoveSelection={onRemoveSelection}
          onCopySelection={onCopySelection}
          onClearSelection={onClearSelection}
        />
      </div>
    </div>
  );
}
