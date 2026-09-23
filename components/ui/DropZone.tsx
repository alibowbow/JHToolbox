'use client';

import { useId, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { File, Upload, X } from 'lucide-react';
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
}

export function DropZone({ onFiles, accept, multiple = false, label, files, disabled = false }: DropZoneProps) {
  const { messages } = useLocale();
  const inputId = useId();
  const [isDragging, setIsDragging] = useState(false);
  const [internalFiles, setInternalFiles] = useState<File[]>([]);
  const currentFiles = useMemo(() => files ?? internalFiles, [files, internalFiles]);

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

  return (
    <div className="space-y-3">
      <motion.label
        htmlFor={inputId}
        animate={{ scale: isDragging ? 1.01 : 1 }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (disabled) return;
          addFiles(Array.from(event.dataTransfer.files));
        }}
        className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors sm:py-12 ${
          disabled
            ? 'cursor-not-allowed border-border-bright opacity-50'
            : `cursor-pointer ${isDragging ? 'border-prime bg-prime/5' : 'border-border-strong bg-base-subtle/40 hover:border-prime/50 hover:bg-prime/[0.03]'}`
        } has-[:focus-visible]:border-prime has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-prime`}
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
        <input
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
      </motion.label>

      <AnimatePresence initial={false}>
        {currentFiles.map((file, index) => (
          <motion.div
            key={`${file.name}-${index}`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-3 rounded-xl border border-border bg-base-elevated px-3 py-2.5"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-base-subtle text-ink-muted">
              <File size={16} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{file.name}</p>
              <p className="text-xs tabular-nums text-ink-faint">{formatMegaBytes(file.size)}</p>
            </div>
            <button
              type="button"
              onClick={() => pushFiles(currentFiles.filter((_, fileIndex) => fileIndex !== index))}
              className="rounded-lg p-2 text-ink-faint transition-colors hover:bg-danger/10 hover:text-danger"
              aria-label={`${messages.workbench.removeFile}: ${file.name}`}
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
