'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, Search, Sparkles, X } from 'lucide-react';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { ToolDefinition } from '@/types/tool';
import { NavigationList } from '@/components/layout/navigation-list';
import { useLocale } from '@/components/providers/locale-provider';
import { getCategoryCopy } from '@/lib/i18n';
import { getLocalizedToolCopy } from '@/lib/tool-localization';
import { categoryIcons, categoryStyles } from '@/lib/tool-presentation';
import { getBrowsableTools } from '@/lib/tool-registry';
import { ThemeToggle } from '@/components/theme-toggle';
import { LocaleToggle } from '@/components/ui/LocaleToggle';

export function Topbar() {
  const { locale, messages } = useLocale();
  const browseTools = useMemo(() => getBrowsableTools(), []);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const deferredQuery = useDeferredValue(query);
  const router = useRouter();
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);

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

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    if (menuOpen || searchOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = previousOverflow;
    }

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen, searchOpen]);

  const searchResults = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return browseTools.slice(0, 10);
    }

    return browseTools
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
  }, [browseTools, deferredQuery, locale]);

  useEffect(() => {
    setActiveIndex(0);
  }, [deferredQuery, searchOpen]);

  useEffect(() => {
    itemRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const openTool = useCallback(
    (tool: ToolDefinition) => {
      setSearchOpen(false);
      router.push(`/tools/${tool.category}/${tool.id}`);
    },
    [router],
  );

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (searchResults.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % searchResults.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + searchResults.length) % searchResults.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const tool = searchResults[Math.min(activeIndex, searchResults.length - 1)];
      if (tool) {
        openTool(tool);
      }
    }
  };

  return (
    <>
      <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-border bg-base-subtle/80 px-4 backdrop-blur-md sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setSearchOpen(false);
              setMenuOpen(true);
            }}
            data-testid="mobile-menu-button"
            className="topbar-button inline-flex h-11 w-11 md:hidden"
            aria-label={messages.topbar.menu}
          >
            <Menu size={18} />
          </button>
          <div className="hidden lg:block">
            <p className="workspace-kicker">{messages.shell.commandCenter}</p>
            <p className="mt-1 text-sm font-semibold text-ink">{messages.shell.commandCenterSub}</p>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setSearchOpen(true);
            }}
            className="topbar-button inline-flex h-11 w-11 sm:hidden"
            aria-label={messages.topbar.searchLabel}
          >
            <Search size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setSearchOpen(true);
            }}
            className="group hidden min-w-0 items-center gap-3 rounded-2xl border border-border bg-base-elevated px-4 py-2.5 text-sm text-ink-muted transition-colors hover:border-border-bright hover:text-ink sm:inline-flex sm:w-64 lg:w-80"
          >
            <Search size={14} className="shrink-0 text-ink-faint transition-colors group-hover:text-prime" />
            <div className="min-w-0 text-left">
              <span className="block truncate font-medium text-ink">{messages.topbar.searchLabel}</span>
              <span className="block truncate text-[11px] uppercase tracking-[0.18em] text-ink-faint">{messages.shell.searchScope}</span>
            </div>
            <kbd className="ml-auto rounded-lg border border-border bg-base px-1.5 py-0.5 font-mono text-[10px] text-ink-faint">
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
              data-testid="mobile-menu-drawer"
              role="dialog"
              aria-modal="true"
              aria-label={messages.shell.menuTitle}
              className="pointer-events-auto h-full w-80 border-r border-border bg-base-subtle px-4 py-4 shadow-card"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="workspace-panel mb-6 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="workspace-kicker">{messages.shell.menuTitle}</p>
                    <p className="mt-1 font-display text-xl font-semibold text-ink">
                      JH<span className="text-prime">Toolbox</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMenuOpen(false)}
                    className="topbar-button inline-flex h-10 w-10"
                    aria-label={messages.common.close}
                  >
                    <X size={18} />
                  </button>
                </div>
                <p className="mt-3 text-sm text-ink-muted">{messages.shell.menuDescription}</p>
              </div>
              <div className="workspace-section p-3">
                <NavigationList onNavigate={() => setMenuOpen(false)} activeIndicatorId="sidebar-mobile-active" />
              </div>
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
              role="dialog"
              aria-modal="true"
              aria-label={messages.topbar.searchLabel}
              className="workspace-panel mx-auto mt-16 max-w-2xl overflow-hidden"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                <Search size={16} className="text-prime" />
                <input
                  autoFocus
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder={messages.topbar.searchPlaceholder}
                  aria-controls="tool-search-results"
                  aria-autocomplete="list"
                  aria-activedescendant={
                    searchResults.length > 0
                      ? `tool-search-option-${Math.min(activeIndex, searchResults.length - 1)}`
                      : undefined
                  }
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
                  <div className="space-y-2" role="listbox" id="tool-search-results" aria-label={messages.topbar.searchLabel}>
                    {searchResults.map((tool, index) => {
                      const Icon = categoryIcons[tool.category];
                      const category = getCategoryCopy(locale, tool.category);
                      const localizedTool = getLocalizedToolCopy(tool, locale);
                      const style = categoryStyles[tool.category];
                      const isActive = index === Math.min(activeIndex, searchResults.length - 1);

                      return (
                        <Link
                          key={tool.id}
                          ref={(element) => {
                            itemRefs.current[index] = element;
                          }}
                          id={`tool-search-option-${index}`}
                          role="option"
                          aria-selected={isActive}
                          href={`/tools/${tool.category}/${tool.id}`}
                          onClick={() => setSearchOpen(false)}
                          onMouseEnter={() => setActiveIndex(index)}
                          className="block"
                        >
                          <motion.div
                            whileHover={{ y: -1 }}
                            className={`card flex items-start gap-3 p-4 transition-colors ${
                              isActive ? 'border-prime/60 ring-1 ring-prime/40' : 'hover:border-border-bright'
                            }`}
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
