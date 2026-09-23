'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, CornerDownLeft, Menu, Search, SearchX, X } from 'lucide-react';
import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { ToolDefinition } from '@/types/tool';
import { BrandLink } from '@/components/layout/Brand';
import { NavigationList } from '@/components/layout/navigation-list';
import { useFocusTrap } from '@/components/layout/useFocusTrap';
import { OPEN_TOOL_SEARCH_EVENT } from '@/lib/search-events';
import { useLocale } from '@/components/providers/locale-provider';
import { getCategoryCopy } from '@/lib/i18n';
import { getLocalizedToolCopy } from '@/lib/tool-localization';
import { getToolIcon } from '@/lib/tool-icons';
import { categoryStyles } from '@/lib/tool-presentation';
import { categories, getBrowsableTools, getToolById } from '@/lib/tool-registry';
import { getRecentTools } from '@/lib/recent-tools';
import { buildSearchEntries, searchTools } from '@/lib/tool-search';
import { ThemeToggle } from '@/components/theme-toggle';
import { LocaleToggle } from '@/components/ui/LocaleToggle';

/** Common starting points, shown before the user types. */
const SUGGESTED_TOOL_IDS = [
  'pdf-merge',
  'image-compress',
  'pdf-reduce-size',
  'image-resize',
  'video-convert',
  'ocr-image-to-text',
  'pdf-to-hwpx',
  'qr-generator',
];

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
  const searchDialogRef = useRef<HTMLDivElement>(null);
  const menuDrawerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(searchDialogRef, searchOpen);
  useFocusTrap(menuDrawerRef, menuOpen);

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

    const onOpenSearch = () => {
      setMenuOpen(false);
      setSearchOpen(true);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener(OPEN_TOOL_SEARCH_EVENT, onOpenSearch);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(OPEN_TOOL_SEARCH_EVENT, onOpenSearch);
    };
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

  const searchEntries = useMemo(
    () =>
      buildSearchEntries(browseTools, getLocalizedToolCopy, (tool) => [
        getCategoryCopy('en', tool.category).nav,
        getCategoryCopy('ko', tool.category).nav,
      ]),
    [browseTools],
  );
  const [recentIds, setRecentIds] = useState<string[]>([]);

  useEffect(() => {
    if (searchOpen) {
      setRecentIds(getRecentTools());
    }
  }, [searchOpen]);

  // Before typing: the user's recent tools, then common starting points.
  const suggestions = useMemo(() => {
    const browsable = new Set(browseTools.map((tool) => tool.id));
    const recent = recentIds.filter((id) => browsable.has(id)).slice(0, 4);
    const suggested = SUGGESTED_TOOL_IDS.filter((id) => browsable.has(id) && !recent.includes(id)).slice(0, 8 - recent.length);
    return {
      recentCount: recent.length,
      tools: [...recent, ...suggested].map((id) => getToolById(id)).filter((tool): tool is ToolDefinition => Boolean(tool)),
    };
  }, [browseTools, recentIds]);

  const searchResults = useMemo(() => {
    if (!deferredQuery.trim()) {
      return suggestions.tools;
    }
    return searchTools(searchEntries, deferredQuery, { recentIds, popularIds: SUGGESTED_TOOL_IDS }).slice(0, 12);
  }, [deferredQuery, recentIds, searchEntries, suggestions]);

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

  const isQueryEmpty = deferredQuery.trim().length === 0;

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-base/85 px-4 backdrop-blur-md sm:px-6 lg:px-10">
        <button
          type="button"
          onClick={() => {
            setSearchOpen(false);
            setMenuOpen(true);
          }}
          data-testid="mobile-menu-button"
          className="topbar-button h-9 w-9 md:hidden"
          aria-label={messages.topbar.menu}
        >
          <Menu size={18} />
        </button>
        <div className="md:hidden">
          <BrandLink />
        </div>
        <Breadcrumbs />

        <div className="ml-auto flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setSearchOpen(true);
            }}
            className="topbar-button h-9 w-9 sm:hidden"
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
            className="group hidden h-9 min-w-0 items-center gap-2.5 rounded-[10px] border border-border bg-base-elevated px-3 text-sm text-ink-faint transition hover:border-border-bright hover:text-ink-muted sm:flex sm:w-56 lg:w-72"
          >
            <Search size={15} className="shrink-0" />
            <span className="truncate">{messages.topbar.searchLabel}</span>
            <kbd className="ml-auto rounded-md border border-border bg-base-subtle px-1.5 py-0.5 font-mono text-[10px] font-medium text-ink-faint">
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
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={() => setMenuOpen(false)}
          >
            <motion.div
              ref={menuDrawerRef}
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              data-testid="mobile-menu-drawer"
              role="dialog"
              aria-modal="true"
              aria-label={messages.shell.menuTitle}
              className="flex h-full w-[284px] max-w-[85vw] flex-col border-r border-border bg-base-elevated shadow-pop"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
                <BrandLink onNavigate={() => setMenuOpen(false)} />
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="topbar-button h-9 w-9"
                  aria-label={messages.common.close}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-4">
                <NavigationList onNavigate={() => setMenuOpen(false)} />
              </div>
              <p className="shrink-0 border-t border-border px-5 py-4 text-xs leading-relaxed text-ink-muted">
                {messages.shell.privacyNote}
              </p>
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
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-black/40 px-4 pt-[10vh] backdrop-blur-[2px]"
            onClick={() => setSearchOpen(false)}
          >
            <motion.div
              ref={searchDialogRef}
              initial={{ opacity: 0, y: -8, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.985 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              role="dialog"
              aria-modal="true"
              aria-label={messages.topbar.searchLabel}
              className="mx-auto flex max-h-[76vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-base-elevated shadow-pop"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center gap-3 border-b border-border px-4">
                <Search size={18} className="shrink-0 text-ink-faint" aria-hidden="true" />
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
                  className="h-14 w-full min-w-0 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint [&::-webkit-search-cancel-button]:hidden"
                />
                <button
                  type="button"
                  onClick={() => setSearchOpen(false)}
                  aria-label={messages.common.close}
                  className="shrink-0 rounded-md border border-border bg-base-subtle px-1.5 py-0.5 font-mono text-[10px] font-medium text-ink-faint transition-colors hover:text-ink"
                >
                  Esc
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {searchResults.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 px-4 py-10 text-center text-sm text-ink-muted">
                    <SearchX size={22} className="text-ink-faint" aria-hidden="true" />
                    {messages.topbar.searchEmpty}
                  </div>
                ) : (
                  <>
                    <div role="listbox" id="tool-search-results" aria-label={messages.topbar.searchLabel}>
                      {searchResults.map((tool, index) => {
                        const Icon = getToolIcon(tool.id, tool.category);
                        const category = getCategoryCopy(locale, tool.category);
                        const localizedTool = getLocalizedToolCopy(tool, locale);
                        const style = categoryStyles[tool.category];
                        const isActive = index === Math.min(activeIndex, searchResults.length - 1);

                        const sectionTitle = !isQueryEmpty
                          ? null
                          : index === 0 && suggestions.recentCount > 0
                            ? messages.topbar.searchRecent
                            : index === suggestions.recentCount
                              ? messages.topbar.searchSuggested
                              : null;

                        return (
                          <Fragment key={tool.id}>
                            {sectionTitle ? (
                              <p role="presentation" className="px-3 pb-1.5 pt-2.5 text-xs font-semibold text-ink-faint">
                                {sectionTitle}
                              </p>
                            ) : null}
                            <Link
                              ref={(element) => {
                                itemRefs.current[index] = element;
                              }}
                              id={`tool-search-option-${index}`}
                              role="option"
                              aria-selected={isActive}
                              href={`/tools/${tool.category}/${tool.id}`}
                              onClick={() => setSearchOpen(false)}
                              onMouseEnter={() => setActiveIndex(index)}
                              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                                isActive ? 'bg-base-subtle' : ''
                              }`}
                            >
                              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${style.iconBg} ${style.icon}`}>
                                <Icon size={17} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-ink">{localizedTool.name}</span>
                                <span className="block truncate text-xs text-ink-muted">{localizedTool.description}</span>
                              </span>
                              <span className="hidden shrink-0 text-xs text-ink-faint sm:block">{category.nav}</span>
                              <CornerDownLeft
                                size={14}
                                aria-hidden="true"
                                className={`shrink-0 text-ink-faint ${isActive ? 'opacity-100' : 'opacity-0'}`}
                              />
                            </Link>
                          </Fragment>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              <div className="hidden items-center gap-4 border-t border-border px-4 py-2.5 text-xs text-ink-faint sm:flex">
                <span className="flex items-center gap-1.5">
                  <kbd className="rounded border border-border bg-base-subtle px-1 font-mono text-[10px]">↑↓</kbd>
                  {messages.topbar.searchHintNavigate}
                </span>
                <span className="flex items-center gap-1.5">
                  <kbd className="rounded border border-border bg-base-subtle px-1 font-mono text-[10px]">↵</kbd>
                  {messages.topbar.searchHintOpen}
                </span>
                <span className="flex items-center gap-1.5">
                  <kbd className="rounded border border-border bg-base-subtle px-1 font-mono text-[10px]">Esc</kbd>
                  {messages.topbar.searchHintClose}
                </span>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function Breadcrumbs() {
  const pathname = usePathname() ?? '/';
  const { locale, messages } = useLocale();

  const crumbs = useMemo(() => {
    const items: Array<{ label: string; href?: string }> = [];
    if (pathname === '/') {
      items.push({ label: messages.nav.home });
    } else if (pathname.startsWith('/pipeline')) {
      items.push({ label: messages.nav.pipeline });
    } else if (pathname.startsWith('/tools')) {
      const [, categoryId, toolId] = pathname.split('/').filter(Boolean);
      const category = categories.find((entry) => entry.id === categoryId);
      const tool = toolId ? getToolById(toolId) : undefined;
      items.push({ label: messages.nav.allTools, href: category ? '/tools' : undefined });
      if (category) {
        items.push({ label: getCategoryCopy(locale, category.id).nav, href: tool ? `/tools/${category.id}` : undefined });
      }
      if (category && tool) {
        items.push({ label: getLocalizedToolCopy(tool, locale).name });
      }
    }
    return items;
  }, [locale, messages, pathname]);

  if (crumbs.length === 0) {
    return null;
  }

  return (
    <nav aria-label={messages.shell.breadcrumb} className="hidden min-w-0 md:block">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
              {index > 0 ? <ChevronRight size={14} className="shrink-0 text-ink-faint" aria-hidden="true" /> : null}
              {crumb.href && !isLast ? (
                <Link href={crumb.href} className="truncate text-ink-muted transition-colors hover:text-ink">
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current={isLast ? 'page' : undefined} className="truncate font-medium text-ink">
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
