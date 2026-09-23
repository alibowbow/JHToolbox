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
        className={`editor-stage flex flex-col items-center justify-center gap-4 border-2 border-dashed p-8 text-center transition-colors sm:p-10 ${
          disabled
            ? 'cursor-not-allowed opacity-50'
            : `cursor-pointer ${isDragging ? 'border-prime bg-prime/10' : 'border-border-bright hover:border-prime/40'}`
        } has-[:focus-visible]:border-prime has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-prime`}
      >
        <motion.div
          animate={isDragging ? { y: -4 } : { y: 0 }}
          className="flex h-14 w-14 items-center justify-center rounded-[1.2rem] border border-border bg-base-elevated text-prime shadow-card"
        >
          <Upload size={22} />
        </motion.div>
        <div className="space-y-1">
          <p className="text-base font-semibold text-ink">{label}</p>
          <p className="text-xs uppercase tracking-[0.18em] text-ink-faint">
            {multiple ? messages.workbench.batchReady : messages.workbench.singleFile}
          </p>
          {accept ? <p className="text-sm text-ink-muted">{accept}</p> : null}
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
            className="workspace-section flex items-center gap-3 px-4 py-3"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl2 bg-base-subtle text-prime">
              <File size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{file.name}</p>
              <p className="text-xs font-mono text-ink-muted">{formatMegaBytes(file.size)}</p>
            </div>
            <button
              type="button"
              onClick={() => pushFiles(currentFiles.filter((_, fileIndex) => fileIndex !== index))}
              className="rounded-lg p-2 text-ink-faint transition-colors hover:bg-danger/10 hover:text-danger"
              aria-label={messages.workbench.removeFile}
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
