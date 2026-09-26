'use client';

import { AudioLines, FolderOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import { useLocale } from '@/components/providers/locale-provider';
import { getAudioEditorCopy } from './audio-editor-copy';

/**
 * The editor before anything is loaded: record or open, with the recording
 * settings right there. Files can also be dropped anywhere.
 */
export function EmptyStart({
  prompt,
  recordingSettings,
  onRecord,
  onOpen,
}: {
  prompt: string;
  recordingSettings: ReactNode;
  onRecord: () => void;
  onOpen: () => void;
}) {
  const { locale } = useLocale();
  const copy = getAudioEditorCopy(locale);

  return (
    <div data-testid="audio-empty-dropzone" className="flex flex-1 items-start justify-center py-4 sm:items-center sm:py-10">
      <div className="w-full max-w-lg">
        <div className="text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-dim)] text-[var(--accent)]">
            <AudioLines size={28} strokeWidth={1.75} />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-[var(--text-primary)] sm:text-xl">{copy.studio.startTitle}</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">{prompt}</p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onRecord}
            className="audio-focus-ring group flex flex-col items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/[0.06] px-4 py-5 text-sm font-semibold text-[var(--text-primary)] transition hover:border-red-500/60 hover:bg-red-500/10"
            aria-label={copy.toolbar.startRecording}
          >
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-red-500 text-white shadow-[0_0_0_5px_rgba(239,68,68,0.15)] transition group-hover:scale-105">
              <span className="h-3.5 w-3.5 rounded-full bg-white" />
            </span>
            {copy.toolbar.startRecording}
          </button>
          <button
            type="button"
            onClick={onOpen}
            className="audio-focus-ring group flex flex-col items-center gap-2 rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-4 py-5 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent)]"
            aria-label={copy.toolbar.openFiles}
          >
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--bg-overlay)] text-[var(--text-primary)] transition group-hover:scale-105">
              <FolderOpen size={20} strokeWidth={1.75} />
            </span>
            {copy.toolbar.openFiles}
          </button>
        </div>

        <div className="audio-panel mt-4 rounded-2xl p-4">
          <p className="mb-3 text-sm font-semibold text-[var(--text-primary)]">{copy.recorder.settings}</p>
          {recordingSettings}
        </div>

        <p className="mt-4 text-center text-xs leading-relaxed text-[var(--text-tertiary)]">{copy.studio.startHint}</p>
      </div>
    </div>
  );
}
