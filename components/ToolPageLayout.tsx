'use client';

import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface ToolPageLayoutProps {
  title: string;
  description: string;
  icon: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  /** Right-aligned header content, e.g. a tool count. */
  meta?: React.ReactNode;
  children: React.ReactNode;
}

export function ToolPageLayout({
  title,
  description,
  icon: Icon,
  iconColor = 'text-prime',
  iconBg = 'bg-prime/10',
  meta,
  children,
}: ToolPageLayoutProps) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 lg:gap-8">
      <motion.header
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="flex items-start gap-4"
      >
        <span className={`category-tile h-12 w-12 shrink-0 sm:h-14 sm:w-14 ${iconBg} ${iconColor}`}>
          <Icon size={24} />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem] sm:leading-tight">{title}</h1>
          <p className="mt-1.5 max-w-3xl text-[15px] leading-relaxed text-ink-muted">{description}</p>
        </div>
        {meta ? <div className="hidden shrink-0 pt-1 sm:block">{meta}</div> : null}
      </motion.header>

      {children}
    </div>
  );
}
