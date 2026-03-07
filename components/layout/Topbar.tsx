'use client';

import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, Search, Sparkles, X } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { NavigationList } from '@/components/layout/navigation-list';
import { useLocale } from '@/components/providers/locale-provider';
import { getCategoryCopy } from '@/lib/i18n';
import { getLocalizedToolCopy } from '@/lib/tool-localization';
import { categoryIcons, categoryStyles } from '@/lib/tool-presentation';
import { tools } from '@/lib/tool-registry';
import { ThemeToggle } from '@/components/theme-toggle';
import { LocaleToggle } from '@/components/ui/LocaleToggle';

export function Topbar() {
  const { locale, messages } = useLocale();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }

      if (event.key === 'Escape') {
        setSearchOpen(false);
        setMenuOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!searchOpen) {
      setQuery('');
    }
  }, [searchOpen]);

  const searchResults = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return tools.slice(0, 10);
    }

    return tools
      .filter((tool) => {
        const categoryLabel = getCategoryCopy(locale, tool.category).nav.toLowerCase();
        const localizedTool = getLocalizedToolCopy(tool, locale);
        return (
          tool.name.toLowerCase().includes(normalizedQuery) ||
          tool.description.toLowerCase().includes(normalizedQuery) ||
          localizedTool.name.toLowerCase().includes(normalizedQuery) ||
          localizedTool.description.toLowerCase().includes(normalizedQuery) ||
          tool.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery)) ||
          categoryLabel.includes(normalizedQuery)
        );
      })
      .slice(0, 12);
  }, [deferredQuery, locale]);

  return (
    <>
      <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-border bg-base-subtle/80 px-4 backdrop-blur-md sm:px-6 lg:px-8">
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-base-elevated text-ink-muted transition-colors hover:text-ink md:hidden"
            aria-label={messages.topbar.menu}
          >
            <Menu size={18} />
          </button>
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-base-elevated text-ink-muted transition-colors hover:border-border-bright hover:text-ink sm:hidden"
            aria-label={messages.topbar.searchLabel}
          >
            <Search size={16} />
          </button>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="group hidden min-w-0 items-center gap-2 rounded-xl border border-border bg-base-elevated px-3 py-2 text-sm text-ink-muted transition-colors hover:border-border-bright hover:text-ink sm:inline-flex sm:w-56 lg:w-72"
          >
            <Search size={14} className="shrink-0 text-ink-faint transition-colors group-hover:text-prime" />
            <span className="truncate">{messages.topbar.searchLabel}</span>
            <kbd className="ml-auto rounded border border-border bg-base px-1.5 py-0.5 font-mono text-[10px] text-ink-faint">
              {messages.topbar.shortcut}
            </kbd>
          </button>
          <LocaleToggle />
          <ThemeToggle />
        </div>
      </header>

      <AnimatePresence>
        {menuOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={() => setMenuOpen(false)}
          >
            <motion.div
              initial={{ x: -24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -24, opacity: 0 }}
              className="h-full w-72 border-r border-border bg-base-subtle px-4 py-4"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-6 flex items-center justify-between">
                <p className="font-display text-xl font-semibold text-ink">
                  JH<span className="text-prime">Toolbox</span>
                </p>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-base-elevated text-ink-muted"
                  aria-label="Close menu"
                >
                  <X size={18} />
                </button>
              </div>
              <NavigationList onNavigate={() => setMenuOpen(false)} />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {searchOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/65 p-4 backdrop-blur-sm"
            onClick={() => setSearchOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              className="mx-auto mt-16 max-w-2xl overflow-hidden rounded-xl3 border border-border bg-base-elevated shadow-card"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                <Search size={16} className="text-prime" />
                <input
                  autoFocus
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={messages.topbar.searchPlaceholder}
                  className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
                />
                <button type="button" onClick={() => setSearchOpen(false)} className="text-ink-faint transition-colors hover:text-ink">
                  <X size={16} />
                </button>
              </div>

              <div className="max-h-[70vh] overflow-y-auto p-3">
                {searchResults.length === 0 ? (
                  <div className="card flex items-center gap-3 p-4 text-sm text-ink-muted">
                    <Sparkles size={16} className="text-prime" />
                    {messages.topbar.searchEmpty}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {searchResults.map((tool) => {
                      const Icon = categoryIcons[tool.category];
                      const category = getCategoryCopy(locale, tool.category);
                      const localizedTool = getLocalizedToolCopy(tool, locale);
                      const style = categoryStyles[tool.category];

                      return (
                        <Link
                          key={tool.id}
                          href={`/tools/${tool.category}/${tool.id}`}
                          onClick={() => setSearchOpen(false)}
                          className="block"
                        >
                          <motion.div
                            whileHover={{ y: -1 }}
                            className="card flex items-start gap-3 p-4 transition-colors hover:border-border-bright"
                          >
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border ${style.iconBg} ${style.icon}`}>
                              <Icon size={18} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold text-ink">{localizedTool.name}</p>
                                <span className={`badge border ${style.badge}`}>{category.nav}</span>
                              </div>
                              <p className="mt-1 text-xs leading-relaxed text-ink-muted">{localizedTool.description}</p>
                            </div>
                          </motion.div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
