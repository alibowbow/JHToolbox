'use client';

import { Download, FolderOpen, MoreHorizontal, Repeat, RotateCcw, Waves } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocale } from '@/components/providers/locale-provider';
import { getAudioEditorCopy } from '../audio-editor-copy';

type SaveFormat = 'wav' | 'mp3';

interface EditorToolbarProps {
  fileName: string | null;
  canSave: boolean;
  loopEnabled: boolean;
  onOpenFiles: () => void;
  onSaveAs: (options: { filename: string; format: SaveFormat }) => void;
  onReset: () => void;
  onToggleLoop: () => void;
}

function getBaseName(fileName: string | null) {
  const normalized = (fileName ?? 'audio-export').trim();
  const withoutExtension = normalized.replace(/\.[^.]+$/, '');
  return withoutExtension || 'audio-export';
}

function getInitialFormat(fileName: string | null): SaveFormat {
  return /\.mp3$/i.test(fileName ?? '') ? 'mp3' : 'wav';
}

export function EditorToolbar({
  fileName,
  canSave,
  loopEnabled,
  onOpenFiles,
  onSaveAs,
  onReset,
  onToggleLoop,
}: EditorToolbarProps) {
  const { locale } = useLocale();
  const copy = getAudioEditorCopy(locale);
  const [menuOpen, setMenuOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState(() => getBaseName(fileName));
  const [saveFormat, setSaveFormat] = useState<SaveFormat>(() => getInitialFormat(fileName));
  const menuRef = useRef<HTMLDivElement | null>(null);
  const saveRef = useRef<HTMLDivElement | null>(null);
  const saveButtonLabel = locale === 'ko' ? '다른 이름으로 저장' : 'Save as';
  const saveConfirmLabel = locale === 'ko' ? '저장' : 'Save';
  const filenameLabel = locale === 'ko' ? '파일 이름' : 'Filename';
  const formatLabel = locale === 'ko' ? '형식' : 'Format';

  useEffect(() => {
    if (!menuOpen && !saveOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (menuOpen && menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }

      if (saveOpen && saveRef.current && !saveRef.current.contains(target)) {
        setSaveOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        setSaveOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen, saveOpen]);

  const openSavePanel = () => {
    setSaveName(getBaseName(fileName));
    setSaveFormat(getInitialFormat(fileName));
    setMenuOpen(false);
    setSaveOpen(true);
  };

  const handleSaveSubmit = () => {
    onSaveAs({
      filename: saveName.trim() || getBaseName(fileName),
      format: saveFormat,
    });
    setSaveOpen(false);
  };

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
        <div ref={saveRef} className="relative">
          <button
            type="button"
            onClick={openSavePanel}
            disabled={!canSave}
            className="audio-button-primary audio-focus-ring h-9 px-3"
            aria-label={saveButtonLabel}
          >
            <Download size={14} strokeWidth={1.5} />
            <span>{saveButtonLabel}</span>
          </button>

          {saveOpen ? (
            <div className="audio-menu absolute right-0 top-[calc(100%+0.5rem)] z-50 min-w-[18rem] p-3">
              <p className="audio-section-kicker">{saveButtonLabel}</p>

              <div className="mt-3 space-y-2">
                <label className="audio-section-kicker" htmlFor="audio-save-name">
                  {filenameLabel}
                </label>
                <div className="flex items-center gap-2 rounded-[12px] border border-[var(--border)] bg-[rgba(255,255,255,0.03)] px-3 py-2">
                  <input
                    id="audio-save-name"
                    type="text"
                    value={saveName}
                    onChange={(event) => setSaveName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        handleSaveSubmit();
                      }
                    }}
                    className="audio-mono w-full bg-transparent text-sm text-[var(--text-primary)] outline-none"
                  />
                  <span className="audio-mono text-xs text-[var(--text-secondary)]">.{saveFormat}</span>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                <span className="audio-section-kicker">{formatLabel}</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSaveFormat('wav')}
                    className={`audio-focus-ring rounded-[12px] border px-3 py-2 text-sm transition ${
                      saveFormat === 'wav'
                        ? 'border-[var(--accent)] bg-[rgba(0,212,200,0.12)] text-[var(--text-primary)]'
                        : 'border-[var(--border)] bg-[rgba(255,255,255,0.02)] text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.04)]'
                    }`}
                  >
                    {copy.toolbar.exportWav}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSaveFormat('mp3')}
                    className={`audio-focus-ring rounded-[12px] border px-3 py-2 text-sm transition ${
                      saveFormat === 'mp3'
                        ? 'border-[var(--accent)] bg-[rgba(0,212,200,0.12)] text-[var(--text-primary)]'
                        : 'border-[var(--border)] bg-[rgba(255,255,255,0.02)] text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.04)]'
                    }`}
                  >
                    {copy.toolbar.exportMp3}
                  </button>
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveSubmit}
                  className="audio-button-primary audio-focus-ring h-9 px-3"
                >
                  {saveConfirmLabel}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setSaveOpen(false);
              setMenuOpen((currentValue) => !currentValue);
            }}
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
