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
  return (
    <div className="space-y-3">
      {label ? (
        <div className="flex items-center justify-between text-xs">
          <span className="text-ink-muted">{label}</span>
          <span className="rounded-full border border-border bg-base-subtle px-2 py-1 font-mono text-ink-faint">{Math.round(value)}%</span>
        </div>
      ) : null}
      <div className="h-2.5 overflow-hidden rounded-full border border-border/60 bg-base-subtle">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ ease: 'easeOut', duration: 0.3 }}
          className={`h-full rounded-full transition-colors ${STATUS_COLOR[status]}`}
          style={status === 'running' ? { boxShadow: '0 0 16px 0 rgba(34,211,238,0.56)' } : undefined}
        />
      </div>
    </div>
  );
}
