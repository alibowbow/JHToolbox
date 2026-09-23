'use client';

import { motion } from 'framer-motion';

interface ProgressBarProps {
  value: number;
  label?: string;
  status?: 'idle' | 'running' | 'done' | 'error';
}

const STATUS_COLOR = {
  idle: 'bg-border',
  running: 'bg-prime',
  done: 'bg-ok',
  error: 'bg-danger',
};

export function ProgressBar({ value, label, status = 'idle' }: ProgressBarProps) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <div className="space-y-2.5">
      {label ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="min-w-0 truncate text-ink-muted">{label}</span>
          <span className="shrink-0 font-medium tabular-nums text-ink">{percent}%</span>
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={label}
        className="h-2 overflow-hidden rounded-full bg-base-subtle"
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ ease: 'easeOut', duration: 0.3 }}
          className={`h-full rounded-full transition-colors ${STATUS_COLOR[status]}`}
        />
      </div>
    </div>
  );
}
