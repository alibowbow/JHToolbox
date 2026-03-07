'use client';

import { ToolCard } from '@/components/tool-card';
import { Tabs } from '@/components/ui/Tabs';
import { useLocale } from '@/components/providers/locale-provider';
import { formatToolCount, getCategoryCopy } from '@/lib/i18n';
import { categories, getToolsByCategory, tools } from '@/lib/tool-registry';

export function ToolsDirectory() {
  const { locale, messages } = useLocale();
  const tabs = [
    { id: 'all', label: messages.directory.allTab },
    ...categories.map((category) => ({
      id: category.id,
      label: getCategoryCopy(locale, category.id).nav,
    })),
  ];

  const renderCategorySection = (categoryId: (typeof categories)[number]['id']) => {
    const category = categories.find((item) => item.id === categoryId);
    if (!category) {
      return null;
    }

    const items = getToolsByCategory(category.id);
    const copy = getCategoryCopy(locale, category.id);

    return (
      <section key={category.id} className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight text-ink">{copy.title}</h2>
            <p className="mt-1 text-sm text-ink-muted">{copy.description}</p>
          </div>
          <span className="badge border border-border bg-base-subtle text-ink-muted">{formatToolCount(locale, items.length)}</span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-8">
      <section className="card p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="badge border border-prime/20 bg-prime/10 text-prime">{formatToolCount(locale, tools.length)}</span>
          <span className="badge border border-border bg-base-subtle text-ink-muted">{messages.directory.categorySummary}</span>
        </div>
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink">{messages.directory.title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">{messages.directory.description}</p>
      </section>

      <Tabs tabs={tabs}>
        {(activeTab) => {
          if (activeTab === 'all') {
            return <div className="space-y-10">{categories.map((category) => renderCategorySection(category.id))}</div>;
          }

          return renderCategorySection(activeTab as (typeof categories)[number]['id']);
        }}
      </Tabs>
    </div>
  );
}
