'use client';

import { motion } from 'framer-motion';
import { CheckCircle2, Download, File } from 'lucide-react';

interface ResultCardProps {
  fileName: string;
  fileSize?: string;
  onDownload: () => void;
  title?: string;
  actionLabel?: string;
  children?: React.ReactNode;
}

export function ResultCard({
  fileName,
  fileSize,
  onDownload,
  title = 'Ready',
  actionLabel = 'Download',
  children,
}: ResultCardProps) {
  return (
    <motion.article
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="card overflow-hidden border-ok/20 bg-ok/5 p-5"
    >
      <div className="mb-4 flex items-center gap-3">
        <CheckCircle2 size={18} className="text-ok" />
        <p className="text-sm font-semibold text-ink">{title}</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-base-subtle text-ink-muted">
          <File size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{fileName}</p>
          {fileSize ? <p className="mt-0.5 text-xs font-mono text-ink-muted">{fileSize}</p> : null}
        </div>
        <button type="button" onClick={onDownload} className="btn-primary px-4 py-2 text-xs">
          <Download size={14} />
          {actionLabel}
        </button>
      </div>

      {children ? <div className="mt-4 space-y-4">{children}</div> : null}
    </motion.article>
  );
}
