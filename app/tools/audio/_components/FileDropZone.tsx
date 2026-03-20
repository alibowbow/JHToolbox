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
        className={`group w-full rounded-2xl border border-dashed p-6 text-left transition ${
          isDragging ? 'border-prime bg-prime/10' : 'border-border bg-base-elevated hover:border-border-bright'
        }`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-base-subtle text-accent">
              <FileUp size={20} />
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.24em] text-ink-faint">{title}</p>
              <p className="text-sm font-semibold text-ink">{description}</p>
              <p className="text-sm text-ink-muted">{helperText}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm text-ink-muted">
            <Music4 size={16} />
            <span>{multiple ? copy.fileDrop.dragMultiple : copy.fileDrop.dragSingle}</span>
          </div>
        </div>
      </button>

      {files.length > 0 ? (
        <div className="space-y-2 rounded-2xl border border-border bg-base-subtle/70 p-3">
          <p className="text-xs uppercase tracking-[0.24em] text-ink-faint">{copy.fileDrop.loadedFiles}</p>
          <div className="space-y-2">
            {files.map((file) => (
              <div
                key={`${file.name}-${file.size}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-base-elevated px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{file.name}</p>
                  <p className="text-xs text-ink-muted">{formatFileSize(file.size)}</p>
                </div>
                <span className="badge border border-border bg-base-subtle text-ink-muted">
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
