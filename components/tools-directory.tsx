'use client';

import { ToolCard } from '@/components/tool-card';
import { Tabs } from '@/components/ui/Tabs';
import { useLocale } from '@/components/providers/locale-provider';
import { formatToolCount, getCategoryCopy } from '@/lib/i18n';
import { categories, getBrowsableTools, getToolsByBrowseGroup, getToolsByCategory } from '@/lib/tool-registry';
import { ToolBrowseGroup } from '@/types/tool';

export function ToolsDirectory() {
  const { locale, messages } = useLocale();
  const browseTools = getBrowsableTools();
  const focusGroups: Array<{
    id: ToolBrowseGroup;
    label: string;
    description: string;
  }> = [
    {
      id: 'popular',
      label: messages.directory.popularTitle,
      description: messages.directory.popularDescription,
    },
    {
      id: 'new',
      label: messages.directory.newTitle,
      description: messages.directory.newDescription,
    },
    {
      id: 'editor-enabled',
      label: messages.directory.editorEnabledTitle,
      description: messages.directory.editorEnabledDescription,
    },
    {
      id: 'convert',
      label: messages.directory.convertTitle,
      description: messages.directory.convertDescription,
    },
    {
      id: 'trim',
      label: messages.directory.trimTitle,
      description: messages.directory.trimDescription,
    },
    {
      id: 'compress',
      label: messages.directory.compressTitle,
      description: messages.directory.compressDescription,
    },
    {
      id: 'merge',
      label: messages.directory.mergeTitle,
      description: messages.directory.mergeDescription,
    },
    {
      id: 'capture',
      label: messages.directory.captureTitle,
      description: messages.directory.captureDescription,
    },
  ];

  const focusSections = focusGroups
    .map((group) => ({
      ...group,
      items: getToolsByBrowseGroup(group.id).slice(0, 6),
    }))
    .filter((section) => section.items.length > 0);

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
            <ToolCard key={tool.id} tool={tool} categoryId={category.id} />
          ))}
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-8">
      <section className="card p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="badge border border-prime/20 bg-prime/10 text-prime">{formatToolCount(locale, browseTools.length)}</span>
          <span className="badge border border-border bg-base-subtle text-ink-muted">{messages.directory.categorySummary}</span>
        </div>
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink">{messages.directory.title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">{messages.directory.description}</p>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">{messages.directory.focusTitle}</h2>
            <p className="mt-1 text-sm text-ink-muted">{messages.directory.focusDescription}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {focusSections.map((section) => (
            <section key={section.id} className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-ink">{section.label}</h3>
                  <p className="mt-1 text-sm text-ink-muted">{section.description}</p>
                </div>
                <span className="badge border border-border bg-base-subtle text-ink-muted">
                  {formatToolCount(locale, section.items.length)}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3">
                {section.items.map((tool) => (
                  <ToolCard key={`${section.id}-${tool.id}`} tool={tool} />
                ))}
              </div>
            </section>
          ))}
        </div>
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
