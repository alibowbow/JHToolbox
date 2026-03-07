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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-start gap-4"
      >
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl2 border border-border bg-base-elevated shadow-card ${iconColor}`}
        >
          <Icon size={24} />
        </div>
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted sm:text-base">{description}</p>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12 }}>
        {children}
      </motion.div>
    </div>
  );
}
