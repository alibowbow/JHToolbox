'use client';

import { AudioLines, Download, FolderOpen, Keyboard, MoreHorizontal, Redo2, RotateCcw, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale } from '@/components/providers/locale-provider';
import { AUDIO_SESSION_EXTENSION } from '../audio-session';
import { getAudioEditorCopy } from '../audio-editor-copy';

type SaveFormat = 'wav' | 'mp3';
type SaveTarget = 'track' | 'mix' | 'session';

interface EditorToolbarProps {
  title: string;
  subtitle?: string | null;
  fileName: string | null;
  /** Nothing loaded yet: Open and Save live in the start screen instead. */
  empty: boolean;
  canSaveTrack: boolean;
  canSaveMix: boolean;
  canSaveSession: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string | null;
  redoLabel?: string | null;
  onUndo: () => void;
  onRedo: () => void;
  onOpenFiles: () => void;
  onSaveAs: (options: { filename: string; format: SaveFormat; target: SaveTarget }) => void;
  onReset: () => void;
  onShowShortcuts?: () => void;
}

function getBaseName(fileName: string | null) {
  const normalized = (fileName ?? 'audio-project').trim();
  const withoutExtension = normalized.replace(/\.[^.]+$/, '');
  return withoutExtension || 'audio-project';
}

function getInitialFormat(fileName: string | null): SaveFormat {
  return /\.mp3$/i.test(fileName ?? '') ? 'mp3' : 'wav';
}

function getInitialTarget(canSaveTrack: boolean, canSaveMix: boolean, canSaveSession: boolean): SaveTarget {
  if (canSaveTrack) {
    return 'track';
  }

  if (canSaveMix) {
    return 'mix';
  }

  return canSaveSession ? 'session' : 'track';
}

/** Project title, undo/redo, open, save, more. */
export function EditorToolbar({
  title,
  subtitle,
  fileName,
  empty,
  canSaveTrack,
  canSaveMix,
  canSaveSession,
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  onUndo,
  onRedo,
  onOpenFiles,
  onSaveAs,
  onReset,
  onShowShortcuts,
}: EditorToolbarProps) {
  const { locale } = useLocale();
  const copy = getAudioEditorCopy(locale);
  const [menuOpen, setMenuOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState(() => getBaseName(fileName));
  const [saveFormat, setSaveFormat] = useState<SaveFormat>(() => getInitialFormat(fileName));
  const [saveTarget, setSaveTarget] = useState<SaveTarget>(() => getInitialTarget(canSaveTrack, canSaveMix, canSaveSession));
  const menuRef = useRef<HTMLDivElement | null>(null);
  const saveRef = useRef<HTMLDivElement | null>(null);
  const canSaveAny = canSaveTrack || canSaveMix || canSaveSession;
  const saveButtonLabel = locale === 'ko' ? '다른 이름으로 저장' : 'Save as';
  const saveConfirmLabel = locale === 'ko' ? '저장' : 'Save';
  const filenameLabel = locale === 'ko' ? '파일 이름' : 'Filename';
  const formatLabel = locale === 'ko' ? '형식' : 'Format';
  const targetLabel = locale === 'ko' ? '저장 대상' : 'Save target';
  const targetLabels = useMemo(
    () =>
      locale === 'ko'
        ? { track: '선택 트랙', mix: '전체 믹스', session: '세션 파일' }
        : { track: 'Selected track', mix: 'Full mix', session: 'Session file' },
    [locale],
  );

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

  useEffect(() => {
    setSaveTarget((currentTarget) => {
      if (
        (currentTarget === 'track' && !canSaveTrack) ||
        (currentTarget === 'mix' && !canSaveMix) ||
        (currentTarget === 'session' && !canSaveSession)
      ) {
        return getInitialTarget(canSaveTrack, canSaveMix, canSaveSession);
      }
      return currentTarget;
    });
  }, [canSaveMix, canSaveSession, canSaveTrack]);

  const openSavePanel = () => {
    setSaveName(getBaseName(fileName));
    setSaveFormat(getInitialFormat(fileName));
    setSaveTarget(getInitialTarget(canSaveTrack, canSaveMix, canSaveSession));
    setMenuOpen(false);
    setSaveOpen((open) => !open);
  };

  const handleSaveSubmit = () => {
    onSaveAs({ filename: saveName.trim() || getBaseName(fileName), format: saveFormat, target: saveTarget });
    setSaveOpen(false);
  };

  const saveExtension = saveTarget === 'session' ? AUDIO_SESSION_EXTENSION.replace(/^\./, '') : saveFormat;
  const targets: Array<{ id: SaveTarget; enabled: boolean }> = [
    { id: 'track', enabled: canSaveTrack },
    { id: 'mix', enabled: canSaveMix },
    { id: 'session', enabled: canSaveSession },
  ];

  return (
    <header className="audio-topbar relative z-40 flex h-14 items-center gap-2 px-3 sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-dim)] text-[var(--accent)] sm:inline-flex">
          <AudioLines size={18} strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold leading-tight text-[var(--text-primary)]">{title}</p>
          {subtitle ? <p className="audio-mono truncate text-[11px] leading-tight text-[var(--text-tertiary)]">{subtitle}</p> : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {empty ? null : (
          <>
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className="audio-icon-button audio-focus-ring h-9 w-9"
              aria-label={copy.transport.undo}
              title={undoLabel ? `${copy.transport.undo}: ${undoLabel}` : copy.transport.undo}
            >
              <Undo2 size={16} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className="audio-icon-button audio-focus-ring h-9 w-9"
              aria-label={copy.transport.redo}
              title={redoLabel ? `${copy.transport.redo}: ${redoLabel}` : copy.transport.redo}
            >
              <Redo2 size={16} strokeWidth={1.75} />
            </button>
            <span className="audio-divider mx-1 h-6" />
            <button
              type="button"
              onClick={onOpenFiles}
              className="audio-button-ghost audio-focus-ring h-9 px-2.5"
              aria-label={copy.toolbar.openFiles}
              title={copy.toolbar.openFiles}
            >
              <FolderOpen size={16} strokeWidth={1.75} />
              <span className="hidden md:inline">{copy.toolbar.openFiles}</span>
            </button>

            <div ref={saveRef} className="relative">
              <button
                type="button"
                onClick={openSavePanel}
                disabled={!canSaveAny}
                className="audio-button-primary audio-focus-ring h-9 px-3"
                aria-label={saveButtonLabel}
                aria-expanded={saveOpen}
              >
                <Download size={15} strokeWidth={2} />
                <span className="hidden sm:inline">{saveButtonLabel}</span>
              </button>

              {saveOpen ? (
                <div className="audio-menu absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(22rem,calc(100vw-1.5rem))] space-y-4 p-4">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{saveButtonLabel}</p>

                  <div className="space-y-1.5">
                    <p className="audio-range-label">{targetLabel}</p>
                    <div className="audio-segmented w-full" role="group" aria-label={targetLabel}>
                      {targets.map((target) => (
                        <button
                          key={target.id}
                          type="button"
                          onClick={() => setSaveTarget(target.id)}
                          disabled={!target.enabled}
                          aria-pressed={saveTarget === target.id}
                          className="audio-tab audio-focus-ring flex-1 disabled:opacity-35"
                        >
                          {targetLabels[target.id]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="audio-range-label" htmlFor="audio-save-name">
                      {filenameLabel}
                    </label>
                    <div className="flex items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 focus-within:border-[var(--accent)]">
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
                        className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none"
                      />
                      <span className="audio-mono text-xs text-[var(--text-tertiary)]">.{saveExtension}</span>
                    </div>
                  </div>

                  {saveTarget !== 'session' ? (
                    <div className="space-y-1.5">
                      <p className="audio-range-label">{formatLabel}</p>
                      <div className="audio-segmented w-full" role="group" aria-label={formatLabel}>
                        {(['wav', 'mp3'] as const).map((format) => (
                          <button
                            key={format}
                            type="button"
                            onClick={() => setSaveFormat(format)}
                            aria-pressed={saveFormat === format}
                            className="audio-tab audio-focus-ring flex-1"
                          >
                            {format === 'wav' ? copy.toolbar.exportWav : copy.toolbar.exportMp3}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="flex justify-end">
                    <button type="button" onClick={handleSaveSubmit} className="audio-button-primary audio-focus-ring h-9 px-4">
                      {saveConfirmLabel}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        )}

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setSaveOpen(false);
              setMenuOpen((currentValue) => !currentValue);
            }}
            className="audio-icon-button audio-focus-ring h-9 w-9"
            aria-label={copy.toolbar.more}
            aria-expanded={menuOpen}
          >
            <MoreHorizontal size={17} strokeWidth={1.75} />
          </button>

          {menuOpen ? (
            <div className="audio-menu absolute right-0 top-[calc(100%+0.5rem)] z-50 min-w-[220px] p-1.5">
              {onShowShortcuts ? (
                <button
                  type="button"
                  onClick={() => {
                    onShowShortcuts();
                    setMenuOpen(false);
                  }}
                  className="audio-menu-item"
                >
                  <Keyboard size={15} strokeWidth={1.75} />
                  {copy.toolbar.shortcuts}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  onReset();
                  setMenuOpen(false);
                }}
                className="audio-menu-item"
              >
                <RotateCcw size={15} strokeWidth={1.75} />
                {copy.toolbar.reset}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
