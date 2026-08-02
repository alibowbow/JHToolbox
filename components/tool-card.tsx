'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { useLocale } from '@/components/providers/locale-provider';
import { getCategoryCopy } from '@/lib/i18n';
import { getLocalizedToolCopy } from '@/lib/tool-localization';
import { categoryIcons, categoryStyles } from '@/lib/tool-presentation';
import { ToolDefinition } from '@/types/tool';

export function ToolCard({ tool, categoryId }: { tool: ToolDefinition; categoryId?: ToolDefinition['category'] }) {
  const { locale } = useLocale();
  const displayCategoryId = categoryId ?? tool.category;
  const Icon = categoryIcons[displayCategoryId];
  const style = categoryStyles[displayCategoryId];
  const category = getCategoryCopy(locale, displayCategoryId);
  const localizedTool = getLocalizedToolCopy(tool, locale);

  return (
    <Link href={`/tools/${displayCategoryId}/${tool.id}`} className="block h-full">
      <motion.article
        whileHover={{ y: -6, scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className={`card group flex h-full flex-col gap-5 rounded-[1.5rem] border border-border/40 hover:border-border/80 bg-base-elevated hover:shadow-panel hover:bg-gradient-to-br ${style.gradient} p-6 transition-all duration-300`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border border-border/50 bg-base-subtle ${style.icon} transition-colors duration-300 group-hover:${style.iconBg}`}>
            <Icon size={20} />
          </div>
          <span className={`badge border border-border/40 bg-transparent group-hover:${style.badge} transition-colors duration-300`}>{category.nav}</span>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-base font-semibold text-ink">{localizedTool.name}</p>
            <ArrowUpRight size={14} className="text-ink-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-prime" />
          </div>
          <p className="text-sm leading-relaxed text-ink-muted">{localizedTool.description}</p>
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-border/30 pt-4 text-[11px] uppercase tracking-[0.18em] text-ink-faint">
          <span>Open workspace</span>
          <span className="text-prime">Ready</span>
        </div>
      </motion.article>
    </Link>
  );
}
