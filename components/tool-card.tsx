'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { useLocale } from '@/components/providers/locale-provider';
import { getCategoryCopy } from '@/lib/i18n';
import { getLocalizedToolCopy } from '@/lib/tool-localization';
import { getToolIcon } from '@/lib/tool-icons';
import { categoryStyles } from '@/lib/tool-presentation';
import { ToolDefinition } from '@/types/tool';

export function ToolCard({
  tool,
  categoryId,
  showCategory = false,
}: {
  tool: ToolDefinition;
  categoryId?: ToolDefinition['category'];
  /** Show the category chip — useful in mixed lists (recent/popular). */
  showCategory?: boolean;
}) {
  const { locale } = useLocale();
  const displayCategoryId = categoryId ?? tool.category;
  const Icon = getToolIcon(tool.id, displayCategoryId);
  const style = categoryStyles[displayCategoryId];
  const localizedTool = getLocalizedToolCopy(tool, locale);

  return (
    <Link href={`/tools/${displayCategoryId}/${tool.id}`} className="group block h-full rounded-2xl">
      <article className="card flex h-full items-start gap-3.5 p-4 group-hover:-translate-y-0.5 group-hover:border-border-bright group-hover:shadow-card-hover">
        <span className={`category-tile h-10 w-10 shrink-0 ${style.iconBg} ${style.icon}`}>
          <Icon size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-ink">{localizedTool.name}</h3>
            <ArrowUpRight
              size={15}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100"
            />
          </div>
          <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-muted">{localizedTool.description}</p>
          {showCategory ? (
            <span className={`badge mt-3 border ${style.badge}`}>{getCategoryCopy(locale, displayCategoryId).nav}</span>
          ) : null}
        </div>
      </article>
    </Link>
  );
}
