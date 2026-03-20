'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { FileUp, Music4 } from 'lucide-react';
import { useLocale } from '@/components/providers/locale-provider';
import { getAudioEditorCopy } from './audio-editor-copy';
import { AUDIO_ACCEPT, formatFileSize } from './audio-editor-utils';

interface FileDropZoneProps {
  title: string;
  description: string;
  helperText: string;
  files: File[];
  multiple?: boolean;
  inputRef?: RefObject<HTMLInputElement>;
  maxFileSizeBytes?: number;
  warningFileSizeBytes?: number;
  onError?: (message: string) => void;
  onWarning?: (message: string | null) => void;
  onFiles: (nextFiles: File[]) => void;
}

export function FileDropZone({
  title,
  description,
  helperText,
  files,
  multiple = false,
  inputRef: externalInputRef,
  maxFileSizeBytes = 500 * 1024 * 1024,
  warningFileSizeBytes = 100 * 1024 * 1024,
  onError,
  onWarning,
  onFiles,
}: FileDropZoneProps) {
  const { locale } = useLocale();
  const copy = getAudioEditorCopy(locale);
  const internalInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const resolvedInputRef = externalInputRef ?? internalInputRef;

  useEffect(() => {
    return () => {
      setIsDragging(false);
    };
  }, []);

  const openPicker = () => resolvedInputRef.current?.click();

  const handleFiles = (nextList: FileList | File[] | null) => {
    if (!nextList || nextList.length === 0) {
      return;
    }

    const nextFiles = Array.from(nextList);
    const oversized = nextFiles.find((file) => file.size > maxFileSizeBytes);
    if (oversized) {
      onError?.(copy.fileDrop.fileTooLarge(oversized.name));
      return;
    }

    const largeFiles = nextFiles.filter((file) => file.size > warningFileSizeBytes);
    onWarning?.(largeFiles.length > 0 ? copy.fileDrop.largeFileWarning : null);
    onFiles(multiple ? nextFiles : nextFiles.slice(0, 1));
  };

  return (
    <div className="space-y-4">
      <input
        ref={resolvedInputRef}
        type="file"
        accept={AUDIO_ACCEPT}
        multiple={multiple}
        onChange={(event) => handleFiles(event.target.files)}
        className="hidden"
      />

      <button
        type="button"
        onClick={openPicker}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
        className={`group w-full rounded-[18px] border border-dashed p-6 text-left transition ${
          isDragging
            ? 'border-[var(--accent)] bg-[rgba(0,212,200,0.08)]'
            : 'border-[var(--border-strong)] bg-[rgba(30,32,35,0.92)] hover:border-[var(--accent-muted)]'
        }`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-[10px] border border-[var(--border)] bg-[rgba(255,255,255,0.03)] text-[var(--accent)]">
              <FileUp size={18} strokeWidth={1.5} />
            </div>
            <div className="space-y-2">
              <p className="audio-section-kicker">{title}</p>
              <p className="text-sm font-medium text-[var(--text-primary)]">{description}</p>
              <p className="text-sm text-[var(--text-secondary)]">{helperText}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
            <Music4 size={16} strokeWidth={1.5} />
            <span>{multiple ? copy.fileDrop.dragMultiple : copy.fileDrop.dragSingle}</span>
          </div>
        </div>
      </button>

      {files.length > 0 ? (
        <div className="space-y-2 rounded-[14px] border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-3">
          <p className="audio-section-kicker">{copy.fileDrop.loadedFiles}</p>
          <div className="space-y-2">
            {files.map((file) => (
              <div
                key={`${file.name}-${file.size}`}
                className="flex items-center justify-between gap-3 rounded-[10px] border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-[var(--text-primary)]">{file.name}</p>
                  <p className="audio-mono text-xs text-[var(--text-secondary)]">{formatFileSize(file.size)}</p>
                </div>
                <span className="rounded-full border border-[var(--border)] bg-[rgba(255,255,255,0.02)] px-2 py-1 text-[10px] text-[var(--text-secondary)]">
                  {file.type || copy.fileDrop.defaultMime}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
