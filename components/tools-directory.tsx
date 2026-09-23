'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ToolCard } from '@/components/tool-card';
import { Tabs } from '@/components/ui/Tabs';
import { useLocale } from '@/components/providers/locale-provider';
import { formatToolCount, getCategoryCopy } from '@/lib/i18n';
import { getRecentTools } from '@/lib/recent-tools';
import { categoryIcons, categoryStyles } from '@/lib/tool-presentation';
import { categories, getBrowsableTools, getToolsByCategory, getToolById } from '@/lib/tool-registry';
import { ToolDefinition } from '@/types/tool';

function isToolDefinition(tool: ToolDefinition | undefined): tool is ToolDefinition {
  return Boolean(tool);
}

export function ToolsDirectory() {
  const { locale, messages } = useLocale();
  const browseTools = getBrowsableTools();
  const [recentToolIds, setRecentToolIds] = useState<string[]>([]);

  useEffect(() => {
    setRecentToolIds(getRecentTools());
  }, []);

  const recentTools = recentToolIds.map((toolId) => getToolById(toolId)).filter(isToolDefinition);

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

    const items = getToolsByCategory(category.id, { includeHidden: false });
    const copy = getCategoryCopy(locale, category.id);
    const Icon = categoryIcons[category.id];
    const style = categoryStyles[category.id];

    return (
      <section key={category.id} className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`category-tile h-8 w-8 ${style.iconBg} ${style.icon}`}>
            <Icon size={16} />
          </span>
          <h2 className="section-title">{copy.title}</h2>
          <span className="text-sm tabular-nums text-ink-faint">{items.length}</span>
          <Link
            href={`/tools/${category.id}`}
            className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
          >
            {messages.home.viewAll}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((tool) => (
            <ToolCard key={tool.id} tool={tool} categoryId={category.id} />
          ))}
        </div>
      </section>
    );
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight text-ink">{messages.directory.title}</h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-muted">{messages.directory.description}</p>
        </div>
        <span className="badge border border-border bg-base-elevated text-ink-muted">{formatToolCount(locale, browseTools.length)}</span>
      </header>

      {recentTools.length > 0 ? (
        <section className="space-y-4">
          <div>
            <h2 className="section-title">{messages.home.recentTitle}</h2>
            <p className="mt-1 text-sm text-ink-muted">{messages.home.recentDescription}</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {recentTools.map((tool) => (
              <ToolCard key={`recent-${tool.id}`} tool={tool} showCategory />
            ))}
          </div>
        </section>
      ) : null}

      <Tabs tabs={tabs} storageKey="jhtoolbox.directory.activeTab">
        {(activeTab) => {
          if (activeTab === 'all') {
            return <div className="space-y-12">{categories.map((category) => renderCategorySection(category.id))}</div>;
          }

          return renderCategorySection(activeTab as (typeof categories)[number]['id']);
        }}
      </Tabs>
    </div>
  );
}
