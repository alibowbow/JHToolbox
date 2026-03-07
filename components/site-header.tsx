'use client';

import Link from 'next/link';
import { Search, Wrench } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { categories, tools } from '@/lib/tool-registry';

export function SiteHeader() {
  const [query, setQuery] = useState('');

  const quickResults = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return [];
    }

    return tools
      .filter((tool) => {
        return (
          tool.name.toLowerCase().includes(normalizedQuery) ||
          tool.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery))
        );
      })
      .slice(0, 6);
  }, [query]);

  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-bg/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Wrench size={18} className="text-accent" />
          JH Toolbox
        </Link>

        <div className="relative ml-auto hidden w-full max-w-lg md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Quick search"
            className="w-full rounded-xl border border-border bg-transparent py-2 pl-9 pr-3 text-sm outline-none transition focus:border-accent"
          />
          {quickResults.length > 0 && (
            <div className="panel absolute left-0 right-0 top-[calc(100%+8px)] overflow-hidden p-2">
              {quickResults.map((tool) => (
                <Link
                  key={tool.id}
                  href={`/tools/${tool.category}/${tool.id}`}
                  className="block rounded-md px-2 py-2 text-sm hover:bg-accent/10"
                  onClick={() => setQuery('')}
                >
                  {tool.name}
                </Link>
              ))}
            </div>
          )}
        </div>

        <nav className="hidden items-center gap-2 text-sm md:flex">
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/tools/${category.id}`}
              className="rounded-md px-2 py-1 text-muted transition hover:bg-accent/10 hover:text-text"
            >
              {category.label}
            </Link>
          ))}
        </nav>

        <ThemeToggle />
      </div>
    </header>
  );
}
