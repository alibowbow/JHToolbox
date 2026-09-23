'use client';

import { motion } from 'framer-motion';
import { CheckCircle2, Download } from 'lucide-react';
import { useLocale } from '@/components/providers/locale-provider';

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
  title,
  actionLabel,
  children,
}: ResultCardProps) {
  const { messages } = useLocale();
  const resolvedTitle = title ?? messages.workbench.resultReady;
  const resolvedActionLabel = actionLabel ?? messages.workbench.download;

  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="card overflow-hidden p-4 sm:p-5"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ok/10 text-ok">
          <CheckCircle2 size={19} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{fileName}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
            <span className="truncate">{resolvedTitle}</span>
            {fileSize ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="shrink-0 tabular-nums">{fileSize}</span>
              </>
            ) : null}
          </p>
        </div>
        <button type="button" onClick={onDownload} className="btn-primary shrink-0 px-3.5 py-2 text-[13px]">
          <Download size={15} aria-hidden="true" />
          {resolvedActionLabel}
        </button>
      </div>

      {children ? <div className="mt-4 space-y-4">{children}</div> : null}
    </motion.article>
  );
}
