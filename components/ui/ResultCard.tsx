'use client';

import { motion } from 'framer-motion';
import { Download, File as FileIcon, FileAudio2, FileText, FileVideo2 } from 'lucide-react';
import { useLocale } from '@/components/providers/locale-provider';

interface ResultCardProps {
  fileName: string;
  fileSize?: string;
  mimeType?: string;
  thumbnailUrl?: string;
  /** Input size, when this output maps 1:1 to an input file. */
  originalBytes?: number;
  outputBytes?: number;
  /** Size-reduction tools flag an output that came out bigger than its input. */
  warnWhenLarger?: boolean;
  primary?: boolean;
  onDownload: () => void;
  actionLabel?: string;
  /** Extra actions rendered next to the download button (e.g. "continue with"). */
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

function kindIcon(mimeType = '') {
  if (mimeType.startsWith('video/')) return FileVideo2;
  if (mimeType.startsWith('audio/')) return FileAudio2;
  if (mimeType.startsWith('text/') || mimeType.includes('json') || mimeType.includes('xml') || mimeType.includes('pdf')) return FileText;
  return FileIcon;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function ResultCard({
  fileName,
  fileSize,
  mimeType,
  thumbnailUrl,
  originalBytes,
  outputBytes,
  warnWhenLarger = false,
  primary = false,
  onDownload,
  actionLabel,
  actions,
  children,
}: ResultCardProps) {
  const { messages } = useLocale();
  const resolvedActionLabel = actionLabel ?? messages.workbench.download;
  const Icon = kindIcon(mimeType);
  const hasDelta = typeof originalBytes === 'number' && originalBytes > 0 && typeof outputBytes === 'number';
  const deltaPercent = hasDelta ? Math.round(((outputBytes! - originalBytes!) / originalBytes!) * 100) : 0;
  const grew = hasDelta && outputBytes! > originalBytes!;

  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="card overflow-hidden p-3.5 sm:p-4"
    >
      <div className="flex items-center gap-3">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg border border-border bg-base-subtle object-cover" />
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-base-subtle text-ink-muted">
            <Icon size={19} aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{fileName}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs tabular-nums text-ink-muted">
            {hasDelta ? (
              <>
                <span>{formatBytes(originalBytes!)}</span>
                <span aria-hidden="true">→</span>
                <span className="font-medium text-ink">{formatBytes(outputBytes!)}</span>
                {deltaPercent !== 0 ? (
                  <span className={grew ? (warnWhenLarger ? 'font-medium text-warn' : '') : 'font-medium text-ok'}>
                    ({deltaPercent > 0 ? '+' : ''}
                    {deltaPercent}%)
                  </span>
                ) : null}
              </>
            ) : fileSize ? (
              <span>{fileSize}</span>
            ) : null}
          </p>
          {grew && warnWhenLarger ? <p className="mt-0.5 text-xs font-medium text-warn">{messages.workbench.sizeGrew}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {actions}
          <button
            type="button"
            onClick={onDownload}
            className={primary ? 'btn-primary px-3.5 py-2 text-[13px]' : 'btn-ghost px-3 py-2 text-[13px]'}
          >
            <Download size={15} aria-hidden="true" />
            {resolvedActionLabel}
          </button>
        </div>
      </div>

      {children ? <div className="mt-3.5 space-y-3">{children}</div> : null}
    </motion.article>
  );
}
