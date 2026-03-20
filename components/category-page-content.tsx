'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { ToolPageLayout } from '@/components/ToolPageLayout';
import { ToolCard } from '@/components/tool-card';
import { useLocale } from '@/components/providers/locale-provider';
import { formatToolCount, getCategoryCopy } from '@/lib/i18n';
import { categoryIcons, categoryStyles } from '@/lib/tool-presentation';
import { ToolCategoryDefinition, ToolDefinition } from '@/types/tool';

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
