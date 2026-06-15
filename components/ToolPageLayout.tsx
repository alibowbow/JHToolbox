'use client';

import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface ToolPageLayoutProps {
  title: string;
  description: string;
  icon: LucideIcon;
  iconColor?: string;
  children: React.ReactNode;
}

export function ToolPageLayout({
  title,
  description,
  icon: Icon,
  iconColor = 'text-prime',
  children,
}: ToolPageLayoutProps) {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="workspace-panel overflow-hidden p-6 sm:p-7"
      >
        <div className="flex items-start gap-4">
          <div
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.25rem] border border-border/70 bg-base-elevated shadow-card ${iconColor}`}
          >
            <Icon size={26} />
          </div>
          <div className="min-w-0">
            <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{title}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted sm:text-base">{description}</p>
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12 }}>
        {children}
      </motion.div>
    </div>
  );
}
