'use client';

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
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={onPlaySelection} className="btn-ghost px-3 py-2 text-xs">
        Play selection
      </button>
      <button type="button" onClick={onTrimSelection} className="btn-primary px-3 py-2 text-xs">
        Keep selection
      </button>
      <button type="button" onClick={onRemoveSelection} className="btn-ghost px-3 py-2 text-xs">
        Remove selection
      </button>
      <button type="button" onClick={onCopySelection} className="btn-ghost px-3 py-2 text-xs">
        Copy times
      </button>
      <button type="button" onClick={onClearSelection} className="btn-ghost px-3 py-2 text-xs">
        Clear
      </button>
    </div>
  );
}
