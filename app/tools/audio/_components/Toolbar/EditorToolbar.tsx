'use client';

import Link from 'next/link';
import { FileAudio2, FolderOpen, Mic, RotateCcw, RotateCw, SlidersHorizontal, Undo2 } from 'lucide-react';
import { useLocale } from '@/components/providers/locale-provider';
import { getAudioEditorCopy } from '../audio-editor-copy';

interface EditorToolbarProps {
  title: string;
  subtitle: string;
  modeLabel: string;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string | null;
  redoLabel?: string | null;
  effectsOpen: boolean;
  isRecording?: boolean;
  onOpenFiles: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onExportWav: () => void;
  onExportMp3: () => void;
  onReset: () => void;
  onToggleEffects: () => void;
  onRecordToggle?: () => void;
}

export function EditorToolbar({
  title,
  subtitle,
  modeLabel,
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  effectsOpen,
  isRecording = false,
  onOpenFiles,
  onUndo,
  onRedo,
  onExportWav,
  onExportMp3,
  onReset,
  onToggleEffects,
  onRecordToggle,
}: EditorToolbarProps) {
  const { locale } = useLocale();
  const copy = getAudioEditorCopy(locale);

  return (
    <div className="workspace-panel p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <p className="workspace-kicker">{modeLabel}</p>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-base-subtle text-accent">
              <FileAudio2 size={18} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-ink sm:text-2xl">{title}</h1>
              <p className="text-sm text-ink-muted">{subtitle}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onOpenFiles} className="btn-primary px-4 py-2 text-sm">
            <FolderOpen size={16} />
            {copy.toolbar.openFiles}
          </button>
          {onRecordToggle ? (
            <button type="button" onClick={onRecordToggle} className="btn-primary px-4 py-2 text-sm">
              <Mic size={16} />
              {isRecording ? copy.toolbar.stopRecording : copy.toolbar.startRecording}
            </button>
          ) : null}
          <button
            type="button"
            title={undoLabel ? `${copy.toolbar.undo}: ${undoLabel}` : undefined}
            onClick={onUndo}
            disabled={!canUndo}
            className="btn-ghost px-4 py-2 text-sm"
          >
            <Undo2 size={16} />
            {copy.toolbar.undo}
          </button>
          <button
            type="button"
            title={redoLabel ? `${copy.toolbar.redo}: ${redoLabel}` : undefined}
            onClick={onRedo}
            disabled={!canRedo}
            className="btn-ghost px-4 py-2 text-sm"
          >
            <RotateCcw size={16} />
            {copy.toolbar.redo}
          </button>
          <button type="button" onClick={onToggleEffects} className="btn-ghost px-4 py-2 text-sm">
            <SlidersHorizontal size={16} />
            {effectsOpen ? copy.toolbar.hideEffects : copy.toolbar.showEffects}
          </button>
          <button type="button" onClick={onExportWav} className="btn-ghost px-4 py-2 text-sm">
            <RotateCw size={16} />
            {copy.toolbar.exportWav}
          </button>
          <button type="button" onClick={onExportMp3} className="btn-ghost px-4 py-2 text-sm">
            <RotateCw size={16} />
            {copy.toolbar.exportMp3}
          </button>
          <button type="button" onClick={onReset} className="btn-ghost px-4 py-2 text-sm">
            {copy.toolbar.reset}
          </button>
          <Link href="/tools/audio/batch" className="btn-primary px-4 py-2 text-sm">
            {copy.toolbar.batch}
          </Link>
        </div>
      </div>
    </div>
  );
}
