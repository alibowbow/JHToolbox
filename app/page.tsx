'use client';

import { useEffect, useMemo, useState } from 'react';
import { ToolCard } from '@/components/tool-card';
import { getRecentTools } from '@/lib/recent-tools';
import { categories, tools } from '@/lib/tool-registry';
import { ToolDefinition } from '@/types/tool';

function isToolDefinition(tool: ToolDefinition | undefined): tool is ToolDefinition {
  return Boolean(tool);
}

export default function HomePage() {
  const [query, setQuery] = useState('');
  const [recentIds, setRecentIds] = useState<string[]>([]);

  useEffect(() => {
    setRecentIds(getRecentTools());
  }, []);

  const recents = useMemo(
    () => recentIds.map((id) => tools.find((tool) => tool.id === id)).filter(isToolDefinition),
    [recentIds],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return tools;
    }

    return tools.filter((tool) => {
      return (
        tool.name.toLowerCase().includes(normalizedQuery) ||
        tool.description.toLowerCase().includes(normalizedQuery) ||
        tool.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery))
      );
    });
  }, [query]);

  return (
    <div className="space-y-8">
      <section className="panel p-5 sm:p-7">
        <h1 className="text-2xl font-semibold sm:text-3xl">Browser-only file tools</h1>
        <p className="mt-2 text-sm text-muted sm:text-base">
          Upload files, process them locally, and download the results without sending data to a server.
        </p>
        <div className="mt-5">
          <input
            type="search"
            placeholder="Search tools (e.g. PDF Merge, Video to GIF)"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full rounded-xl border border-border bg-transparent px-4 py-3 text-sm outline-none transition focus:border-accent"
          />
        </div>
      </section>

      {recents.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Recently used</h2>
          <div className="tool-grid">
            {recents.map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted">
          {categories.map((category) => (
            <span key={category.id} className="rounded-full border border-border px-3 py-1">
              {category.label}
            </span>
          ))}
        </div>
        <div className="tool-grid">
          {filtered.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </div>
      </section>
    </div>
  );
}
