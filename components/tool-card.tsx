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
  const { locale, messages } = useLocale();
  const displayCategoryId = categoryId ?? tool.category;
  const Icon = categoryIcons[displayCategoryId];
  const style = categoryStyles[displayCategoryId];
  const category = getCategoryCopy(locale, displayCategoryId);
  const localizedTool = getLocalizedToolCopy(tool, locale);

  return (
    <Link href={`/tools/${displayCategoryId}/${tool.id}`} className="block h-full">
      <motion.article
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.98 }}
        className={`card group flex h-full flex-col gap-4 border ${style.border} bg-gradient-to-br ${style.gradient} p-4 transition-all`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl border border-border ${style.iconBg} ${style.icon}`}>
            <Icon size={18} />
          </div>
          <span className={`badge border ${style.badge}`}>{category.nav}</span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-ink">{localizedTool.name}</p>
            <ArrowUpRight size={14} className="text-ink-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-prime" />
          </div>
          <p className="text-xs leading-relaxed text-ink-muted">{localizedTool.description}</p>
        </div>

        <div className="mt-auto flex flex-wrap gap-2">
          {tool.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="badge border border-border bg-base-subtle text-ink-faint">
              {tag}
            </span>
          ))}
          <span className="badge border border-border bg-base-subtle text-ink-muted">{messages.common.open}</span>
        </div>
      </motion.article>
    </Link>
  );
}
