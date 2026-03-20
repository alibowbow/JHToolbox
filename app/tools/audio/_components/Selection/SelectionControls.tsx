'use client';

import { useLocale } from '@/components/providers/locale-provider';
import { getAudioEditorCopy } from '../audio-editor-copy';

interface SelectionControlsProps {
  onPlaySelection: () => void;
  onTrimSelection: () => void;
  onRemoveSelection: () => void;
  onCopySelection: () => void;
  onClearSelection: () => void;
}

export function SelectionControls({
  onPlaySelection,
  onTrimSelection,
  onRemoveSelection,
  onCopySelection,
  onClearSelection,
}: SelectionControlsProps) {
  const { locale } = useLocale();
  const copy = getAudioEditorCopy(locale);

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={onPlaySelection} className="btn-ghost px-3 py-2 text-xs">
        {copy.selection.playSelection}
      </button>
      <button type="button" onClick={onTrimSelection} className="btn-primary px-3 py-2 text-xs">
        {copy.selection.keepSelection}
      </button>
      <button type="button" onClick={onRemoveSelection} className="btn-ghost px-3 py-2 text-xs">
        {copy.selection.removeSelection}
      </button>
      <button type="button" onClick={onCopySelection} className="btn-ghost px-3 py-2 text-xs">
        {copy.selection.copyTimes}
      </button>
      <button type="button" onClick={onClearSelection} className="btn-ghost px-3 py-2 text-xs">
        {copy.selection.clear}
      </button>
    </div>
  );
}
