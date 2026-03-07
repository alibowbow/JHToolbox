'use client';

import { useId, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { File, Upload, X } from 'lucide-react';
import { formatMegaBytes } from '@/lib/i18n';

interface DropZoneProps {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  label?: string;
  files?: File[];
}

export function DropZone({ onFiles, accept, multiple = false, label, files }: DropZoneProps) {
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

  return (
    <div className="space-y-3">
      <motion.label
        htmlFor={inputId}
        animate={
          isDragging
            ? { borderColor: '#00e5ff', backgroundColor: '#00e5ff08', scale: 1.01 }
            : { borderColor: '#ffffff14', backgroundColor: '#18181f', scale: 1 }
        }
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          const droppedFiles = Array.from(event.dataTransfer.files);
          pushFiles(multiple ? [...currentFiles, ...droppedFiles] : droppedFiles.slice(0, 1));
        }}
        className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl2 border-2 border-dashed p-8 text-center transition-colors sm:p-10"
      >
        <motion.div
          animate={isDragging ? { y: -4 } : { y: 0 }}
          className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-base-subtle text-prime"
        >
          <Upload size={22} />
        </motion.div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-ink">{label}</p>
          {accept ? <p className="text-xs text-ink-muted">{accept}</p> : null}
        </div>
        <input
          id={inputId}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(event) => {
            const nextFiles = Array.from(event.target.files ?? []);
            pushFiles(multiple ? [...currentFiles, ...nextFiles] : nextFiles.slice(0, 1));
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
            className="card flex items-center gap-3 px-4 py-3"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-base-subtle text-prime">
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
              aria-label="Remove file"
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
