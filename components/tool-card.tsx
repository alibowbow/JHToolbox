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
        whileHover={{ y: -4 }}
        whileTap={{ scale: 0.98 }}
        className={`card group flex h-full flex-col gap-5 border ${style.border} bg-gradient-to-br ${style.gradient} p-5 transition-all`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className={`flex h-12 w-12 items-center justify-center rounded-[1.1rem] border border-border ${style.iconBg} ${style.icon}`}>
            <Icon size={18} />
          </div>
          <span className={`badge border ${style.badge}`}>{category.nav}</span>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-base font-semibold text-ink">{localizedTool.name}</p>
            <ArrowUpRight size={14} className="text-ink-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-prime" />
          </div>
          <p className="text-sm leading-relaxed text-ink-muted">{localizedTool.description}</p>
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-border/50 pt-4 text-[11px] uppercase tracking-[0.18em] text-ink-faint">
          <span>Open workspace</span>
          <span className="text-prime">Ready</span>
        </div>
      </motion.article>
    </Link>
  );
}
