'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { ToolPageLayout } from '@/components/ToolPageLayout';
import { ToolCard } from '@/components/tool-card';
import { useLocale } from '@/components/providers/locale-provider';
import { formatToolCount, getCategoryCopy } from '@/lib/i18n';
import { getLocalizedToolCopy } from '@/lib/tool-localization';
import { categoryIcons, categoryStyles } from '@/lib/tool-presentation';
import { ToolCategoryDefinition, ToolDefinition } from '@/types/tool';
import { getBrowseGroupSections } from '@/lib/tool-presentation';

export function CategoryPageContent({
  category,
  items,
}: {
  category: ToolCategoryDefinition;
  items: ToolDefinition[];
}) {
  const { locale, messages } = useLocale();
  const copy = getCategoryCopy(locale, category.id);
  const Icon = categoryIcons[category.id];
  const style = categoryStyles[category.id];
  const browseGroups = getBrowseGroupSections(messages.directory);
  const focusSections = browseGroups
    .map((group) => ({
      ...group,
      items: items.filter((tool) => tool.browseGroups?.includes(group.id)).slice(0, 3),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <ToolPageLayout title={copy.title} description={copy.description} icon={Icon} iconColor={style.icon}>
      <div className="space-y-6">
        <section className={`card border ${style.border} bg-gradient-to-br ${style.gradient} p-5 sm:p-6`}>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`badge border ${style.badge}`}>{messages.categoryPage.summaryLabel}</span>
            <span className="badge border border-border bg-base-subtle text-ink-muted">{formatToolCount(locale, items.length)}</span>
            <Link href="/tools" className="badge border border-border bg-base-subtle text-ink-muted transition-colors hover:border-prime/30 hover:text-prime">
              {messages.directory.allTab}
            </Link>
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-ink-muted">{copy.shortDescription}</p>
        </section>

        {focusSections.length > 0 ? (
          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="font-display text-xl font-semibold tracking-tight text-ink">{messages.directory.focusTitle}</h3>
                <p className="mt-1 text-sm text-ink-muted">{messages.directory.focusDescription}</p>
              </div>
              <Link href="/tools" className="btn-ghost">
                {messages.home.primaryCta}
                <ArrowRight size={16} />
              </Link>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {focusSections.map((section) => (
                <section key={section.id} className={`card border ${style.border} bg-base-elevated p-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{section.label}</p>
                      <p className="mt-1 text-xs leading-relaxed text-ink-muted">{section.description}</p>
                    </div>
                    <span className="badge border border-border bg-base-subtle text-ink-muted">{formatToolCount(locale, section.items.length)}</span>
                  </div>

                  <div className="mt-3 space-y-2">
                    {section.items.map((tool) => {
                      const localizedTool = getLocalizedToolCopy(tool, locale);

                      return (
                        <Link
                          key={`${section.id}-${tool.id}`}
                          href={`/tools/${category.id}/${tool.id}`}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-base-subtle/70 px-3 py-2 text-xs text-ink-muted transition-colors hover:border-prime/30 hover:text-ink"
                        >
                          <span className="truncate">{localizedTool.name}</span>
                          <ArrowRight size={12} className="shrink-0" />
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </section>
        ) : null}

        <motion.div
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.04 } },
          }}
          className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
        >
          {items.map((tool) => (
            <motion.div
              key={tool.id}
              variants={{
                hidden: { opacity: 0, y: 12 },
                show: { opacity: 1, y: 0, transition: { duration: 0.22 } },
              }}
            >
              <ToolCard tool={tool} categoryId={category.id} />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </ToolPageLayout>
  );
}
