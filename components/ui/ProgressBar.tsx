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
    <div className="space-y-2">
      {label ? (
        <div className="flex items-center justify-between text-xs">
          <span className="text-ink-muted">{label}</span>
          <span className="font-mono text-ink-faint">{Math.round(value)}%</span>
        </div>
      ) : null}
      <div className="h-1.5 overflow-hidden rounded-full bg-base-elevated">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ ease: 'easeOut', duration: 0.3 }}
          className={`h-full rounded-full transition-colors ${STATUS_COLOR[status]}`}
          style={status === 'running' ? { boxShadow: '0 0 8px 0 #00e5ff66' } : undefined}
        />
      </div>
    </div>
  );
}
