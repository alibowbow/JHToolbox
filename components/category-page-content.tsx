'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { ToolPageLayout } from '@/components/ToolPageLayout';
import { ToolCard } from '@/components/tool-card';
import { useLocale } from '@/components/providers/locale-provider';
import { formatToolCount, getCategoryCopy } from '@/lib/i18n';
import { categoryIcons, categoryStyles } from '@/lib/tool-presentation';
import { getCategorySections, moreSectionTitle } from '@/lib/tool-sections';
import { ToolCategoryDefinition, ToolDefinition } from '@/types/tool';

const gridVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22 } },
};

function ToolGrid({ tools, categoryId }: { tools: ToolDefinition[]; categoryId: ToolCategoryDefinition['id'] }) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={gridVariants}
      className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
    >
      {tools.map((tool) => (
        <motion.div key={tool.id} variants={cardVariants}>
          <ToolCard tool={tool} categoryId={categoryId} />
        </motion.div>
      ))}
    </motion.div>
  );
}

/** Group a category's tools into the defined sections, appending any unlisted tools under "More". */
function buildSections(categoryId: ToolCategoryDefinition['id'], items: ToolDefinition[], locale: 'en' | 'ko') {
  const sections = getCategorySections(categoryId);
  if (!sections) {
    return null;
  }

  const byId = new Map(items.map((tool) => [tool.id, tool]));
  const used = new Set<string>();

  const grouped = sections
    .map((section) => {
      const tools = section.toolIds
        .map((id) => byId.get(id))
        .filter((tool): tool is ToolDefinition => Boolean(tool));
      tools.forEach((tool) => used.add(tool.id));
      return { id: section.id, title: section.title[locale], tools };
    })
    .filter((section) => section.tools.length > 0);

  const leftovers = items.filter((tool) => !used.has(tool.id));
  if (leftovers.length > 0) {
    grouped.push({ id: 'more', title: moreSectionTitle[locale], tools: leftovers });
  }

  return grouped;
}

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
  const sections = buildSections(category.id, items, locale);

  return (
    <ToolPageLayout title={copy.title} description={copy.description} icon={Icon} iconColor={style.icon}>
      <div className="space-y-6">
        <section className={`card ${style.border} bg-gradient-to-br ${style.gradient} p-5 sm:p-6`}>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`badge border ${style.badge}`}>{messages.categoryPage.summaryLabel}</span>
            <span className="badge border border-border bg-base-subtle text-ink-muted">{formatToolCount(locale, items.length)}</span>
            <Link href="/tools" className="badge border border-border bg-base-subtle text-ink-muted transition-colors hover:border-prime/30 hover:text-prime">
              {messages.directory.allTab}
            </Link>
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-ink-muted">{copy.shortDescription}</p>
        </section>

        {sections ? (
          <div className="space-y-8">
            {sections.map((section) => (
              <section key={section.id} className="space-y-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-semibold text-ink">{section.title}</h2>
                  <span className="badge border border-border bg-base-subtle text-ink-faint">
                    {formatToolCount(locale, section.tools.length)}
                  </span>
                  <span className="h-px flex-1 bg-border/60" />
                </div>
                <ToolGrid tools={section.tools} categoryId={category.id} />
              </section>
            ))}
          </div>
        ) : (
          <ToolGrid tools={items} categoryId={category.id} />
        )}
      </div>
    </ToolPageLayout>
  );
}
