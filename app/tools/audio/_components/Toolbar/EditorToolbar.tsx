'use client';

import Link from 'next/link';
import { Download, FolderOpen, MoreHorizontal, Repeat, RotateCcw, SlidersHorizontal, Waves } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocale } from '@/components/providers/locale-provider';
import { getAudioEditorCopy } from '../audio-editor-copy';

interface EditorToolbarProps {
  fileName: string | null;
  effectsOpen: boolean;
  loopEnabled: boolean;
  onOpenFiles: () => void;
  onExportWav: () => void;
  onExportMp3: () => void;
  onReset: () => void;
  onToggleEffects: () => void;
  onToggleLoop: () => void;
}

export function EditorToolbar({
  fileName,
  effectsOpen,
  loopEnabled,
  onOpenFiles,
  onExportWav,
  onExportMp3,
  onReset,
  onToggleEffects,
  onToggleLoop,
}: EditorToolbarProps) {
  const { locale } = useLocale();
  const copy = getAudioEditorCopy(locale);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  return (
    <header className="audio-topbar relative z-30 flex h-14 items-center justify-between gap-3 px-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--accent)]">
          <Waves size={14} strokeWidth={1.5} />
        </div>
        <button
          type="button"
          onClick={onOpenFiles}
          className="audio-button-secondary audio-focus-ring h-9 px-3"
          aria-label={copy.toolbar.openFiles}
        >
          <FolderOpen size={14} strokeWidth={1.5} />
          <span>{copy.toolbar.openFiles}</span>
        </button>
      </div>

      {fileName ? (
        <div className="hidden min-w-0 flex-1 px-4 text-center sm:block">
          <p className="truncate text-[13px] font-medium text-[var(--text-secondary)]">{fileName}</p>
        </div>
      ) : (
        <div className="hidden flex-1 sm:block" />
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onExportWav}
          className="audio-button-primary audio-focus-ring hidden h-9 px-3 sm:inline-flex"
          aria-label={copy.toolbar.exportWav}
        >
          <Download size={14} strokeWidth={1.5} />
          <span>{copy.toolbar.exportWav}</span>
        </button>
        <button
          type="button"
          onClick={onExportMp3}
          className="audio-button-primary audio-focus-ring hidden h-9 px-3 sm:inline-flex"
          aria-label={copy.toolbar.exportMp3}
        >
          <Download size={14} strokeWidth={1.5} />
          <span>{copy.toolbar.exportMp3}</span>
        </button>

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((currentValue) => !currentValue)}
            className="audio-button-secondary audio-focus-ring h-9 w-9 p-0"
            aria-label={copy.toolbar.more}
          >
            <MoreHorizontal size={16} strokeWidth={1.5} />
          </button>

          {menuOpen ? (
            <div className="audio-menu absolute right-0 top-[calc(100%+0.5rem)] z-50 min-w-[220px] p-2">
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    onExportWav();
                    setMenuOpen(false);
                  }}
                  className="audio-menu-item sm:hidden"
                >
                  <Download size={14} strokeWidth={1.5} />
                  {copy.toolbar.exportWav}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onExportMp3();
                    setMenuOpen(false);
                  }}
                  className="audio-menu-item sm:hidden"
                >
                  <Download size={14} strokeWidth={1.5} />
                  {copy.toolbar.exportMp3}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onToggleEffects();
                    setMenuOpen(false);
                  }}
                  className="audio-menu-item"
                >
                  <SlidersHorizontal size={14} strokeWidth={1.5} />
                  {effectsOpen ? copy.toolbar.hideEffects : copy.toolbar.showEffects}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onToggleLoop();
                    setMenuOpen(false);
                  }}
                  className="audio-menu-item"
                >
                  <Repeat size={14} strokeWidth={1.5} />
                  {loopEnabled ? copy.toolbar.loopOn : copy.toolbar.loopOff}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onReset();
                    setMenuOpen(false);
                  }}
                  className="audio-menu-item"
                >
                  <RotateCcw size={14} strokeWidth={1.5} />
                  {copy.toolbar.reset}
                </button>
                <Link href="/tools/audio/batch" className="audio-menu-item" onClick={() => setMenuOpen(false)}>
                  <FolderOpen size={14} strokeWidth={1.5} />
                  {copy.toolbar.batch}
                </Link>
              </div>
              <div className="mt-2 border-t border-[var(--border)] px-2 pt-2">
                <p className="audio-section-kicker">{copy.toolbar.shortcuts}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-secondary)]">{copy.toolbar.shortcutHint}</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
