'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown, ArrowUp, File as FileIcon, Plus, Upload, X } from 'lucide-react';
import { formatMegaBytes } from '@/lib/i18n';
import { partitionByAccept } from '@/lib/file-accept';
import { useLocale } from '@/components/providers/locale-provider';
import { toast } from '@/components/ui/Toast';

interface DropZoneProps {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  label?: string;
  files?: File[];
  disabled?: boolean;
  /** Show move buttons on file rows (the order is meaningful, e.g. merging). */
  reorderable?: boolean;
}

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

/** Thumbnails and pixel sizes for image files, so users see what they picked. */
function useImageDetails(files: File[]) {
  const [details, setDetails] = useState<Record<string, { url: string; width?: number; height?: number }>>({});

  useEffect(() => {
    const images = files.filter((file) => file.type.startsWith('image/')).slice(0, 24);
    const next: Record<string, { url: string; width?: number; height?: number }> = {};
    const urls: string[] = [];
    let cancelled = false;

    images.forEach((file) => {
      const url = URL.createObjectURL(file);
      urls.push(url);
      next[fileKey(file)] = { url };
    });
    setDetails(next);

    images.forEach((file) => {
      const image = new Image();
      image.onload = () => {
        if (cancelled) {
          return;
        }
        setDetails((current) => {
          const entry = current[fileKey(file)];
          return entry ? { ...current, [fileKey(file)]: { ...entry, width: image.naturalWidth, height: image.naturalHeight } } : current;
        });
      };
      image.src = next[fileKey(file)].url;
    });

    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  return details;
}

export function DropZone({ onFiles, accept, multiple = false, label, files, disabled = false, reorderable = false }: DropZoneProps) {
  const { messages } = useLocale();
  const inputId = useId();
  const [isDragging, setIsDragging] = useState(false);
  const [internalFiles, setInternalFiles] = useState<File[]>([]);
  const currentFiles = useMemo(() => files ?? internalFiles, [files, internalFiles]);
  const imageDetails = useImageDetails(currentFiles);
  const hasFiles = currentFiles.length > 0;

  const inputRef = useRef<HTMLInputElement | null>(null);

  const pushFiles = (nextFiles: File[]) => {
    if (files === undefined) {
      setInternalFiles(nextFiles);
    }
    onFiles(nextFiles);
  };

  // Drag-and-drop bypasses `accept`, and the picker's "All files" option can too.
  const addFiles = (incoming: File[]) => {
    const { accepted, rejected } = partitionByAccept(incoming, accept);
    if (rejected.length > 0) {
      toast.error(`${messages.workbench.unsupportedFilesSkipped}: ${rejected.map((file) => file.name).join(', ')}`);
    }
    if (accepted.length === 0) {
      return;
    }
    pushFiles(multiple ? [...currentFiles, ...accepted] : accepted.slice(0, 1));
  };

  // Files picked before the page finished loading its scripts sit in the
  // input without a change event having been handled; take them now.
  useEffect(() => {
    const input = inputRef.current;
    if (input?.files && input.files.length > 0) {
      addFiles(Array.from(input.files));
      input.value = '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, []);

  const moveFile = (from: number, to: number) => {
    const next = [...currentFiles];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    pushFiles(next);
  };

  const dragHandlers = {
    onDragOver: (event: React.DragEvent) => {
      event.preventDefault();
      if (!disabled) setIsDragging(true);
    },
    onDragLeave: (event: React.DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        setIsDragging(false);
      }
    },
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      addFiles(Array.from(event.dataTransfer.files));
    },
  };

  const fileInput = (
    <input
      ref={inputRef}
      id={inputId}
      type="file"
      accept={accept}
      multiple={multiple}
      disabled={disabled}
      className="sr-only"
      onChange={(event) => {
        addFiles(Array.from(event.target.files ?? []));
        event.target.value = '';
      }}
    />
  );

  const focusRing =
    'has-[:focus-visible]:border-prime has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-prime';

  if (!hasFiles) {
    return (
      <label
        htmlFor={inputId}
        {...dragHandlers}
        className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors sm:py-12 ${
          disabled
            ? 'cursor-not-allowed border-border-bright opacity-50'
            : `cursor-pointer ${isDragging ? 'border-prime bg-prime/5' : 'border-border-strong bg-base-subtle/40 hover:border-prime/50 hover:bg-prime/[0.03]'}`
        } ${focusRing}`}
      >
        <motion.div
          animate={isDragging ? { y: -4 } : { y: 0 }}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-prime/10 text-prime"
        >
          <Upload size={21} aria-hidden="true" />
        </motion.div>
        <div className="space-y-1.5">
          <p className="text-[15px] font-semibold text-ink">{label}</p>
          <p className="text-xs text-ink-faint">
            {multiple ? messages.workbench.batchReady : messages.workbench.singleFile}
            {accept ? (
              <>
                <span aria-hidden="true"> · </span>
                <span className="font-mono">{accept}</span>
              </>
            ) : null}
          </p>
        </div>
        {fileInput}
      </label>
    );
  }

  return (
    <div {...dragHandlers} className={`space-y-2 rounded-2xl transition-shadow ${isDragging ? 'ring-2 ring-prime ring-offset-2 ring-offset-base-elevated' : ''}`}>
      <ul className="space-y-1.5">
        <AnimatePresence initial={false}>
          {currentFiles.map((file, index) => {
            const detail = imageDetails[fileKey(file)];
            return (
              <motion.li
                key={`${fileKey(file)}-${index}`}
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-3 rounded-xl border border-border bg-base-elevated px-3 py-2"
              >
                {detail ? (
                  <img src={detail.url} alt="" className="h-9 w-9 shrink-0 rounded-lg border border-border object-cover" />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-base-subtle text-ink-muted">
                    <FileIcon size={16} aria-hidden="true" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{file.name}</p>
                  <p className="text-xs tabular-nums text-ink-faint">
                    {formatMegaBytes(file.size)}
                    {detail?.width && detail.height ? ` · ${detail.width}×${detail.height}` : ''}
                  </p>
                </div>
                {reorderable && currentFiles.length > 1 ? (
                  <div className="flex shrink-0 gap-0.5">
                    <button
                      type="button"
                      onClick={() => moveFile(index, index - 1)}
                      disabled={disabled || index === 0}
                      aria-label={`${messages.workbench.moveUp}: ${file.name}`}
                      className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-base-subtle hover:text-ink disabled:opacity-30"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveFile(index, index + 1)}
                      disabled={disabled || index === currentFiles.length - 1}
                      aria-label={`${messages.workbench.moveDown}: ${file.name}`}
                      className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-base-subtle hover:text-ink disabled:opacity-30"
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => pushFiles(currentFiles.filter((_, fileIndex) => fileIndex !== index))}
                  disabled={disabled}
                  className="shrink-0 rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-30"
                  aria-label={`${messages.workbench.removeFile}: ${file.name}`}
                >
                  <X size={15} />
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      <label
        htmlFor={inputId}
        className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong px-3 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:border-prime/50 hover:text-ink ${
          disabled ? 'pointer-events-none opacity-50' : ''
        } ${focusRing}`}
      >
        <Plus size={15} aria-hidden="true" />
        {multiple ? messages.workbench.addFiles : messages.workbench.replaceFile}
        <span className="hidden text-xs font-normal text-ink-faint sm:inline">· {messages.workbench.orDropHere}</span>
        {fileInput}
      </label>
    </div>
  );
}
