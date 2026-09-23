'use client';

import Link from 'next/link';
import { Home, LayoutGrid, Workflow, type LucideIcon } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { getCategoryCopy } from '@/lib/i18n';
import { categoryIcons, categoryStyles } from '@/lib/tool-presentation';
import { categories, getToolsByCategory } from '@/lib/tool-registry';
import { useLocale } from '@/components/providers/locale-provider';
import type { ToolCategory } from '@/types/tool';

const primaryItems = [
  { href: '/', key: 'home', icon: Home },
  { href: '/tools', key: 'allTools', icon: LayoutGrid },
  { href: '/pipeline', key: 'pipeline', icon: Workflow },
] as const;

const categoryCounts = Object.fromEntries(
  categories.map((category) => [category.id, getToolsByCategory(category.id, { includeHidden: false }).length]),
) as Record<ToolCategory, number>;

/** "/tools" is the directory itself: it must not light up on every category/tool page. */
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === '/' || href === '/tools') {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  count,
  category,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  count?: number;
  category?: ToolCategory;
  onNavigate?: () => void;
}) {
  const style = category ? categoryStyles[category] : null;

  return (
    <li>
      <Link
        href={href}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        className={`group flex items-center gap-3 rounded-[10px] px-2.5 py-[7px] text-sm font-medium transition-colors ${
          active ? 'bg-base-subtle text-ink' : 'text-ink-muted hover:bg-base-subtle/70 hover:text-ink'
        }`}
      >
        {style ? (
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${style.iconBg} ${style.icon}`}>
            <Icon size={14} strokeWidth={2.2} />
          </span>
        ) : (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center">
            <Icon size={17} className={active ? 'text-prime' : 'text-ink-faint transition-colors group-hover:text-ink-muted'} />
          </span>
        )}
        <span className="truncate">{label}</span>
        {typeof count === 'number' ? (
          <span className="ml-auto text-xs font-medium tabular-nums text-ink-faint">{count}</span>
        ) : null}
      </Link>
    </li>
  );
}

export function NavigationList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() ?? '';
  const { locale, messages } = useLocale();

  return (
    <nav aria-label={messages.shell.navigate} className="space-y-6">
      <ul className="space-y-0.5">
        {primaryItems.map(({ href, key, icon }) => (
          <NavItem
            key={href}
            href={href}
            label={messages.nav[key]}
            icon={icon}
            active={isNavItemActive(pathname, href)}
            onNavigate={onNavigate}
          />
        ))}
      </ul>

      <div>
        <p className="px-2.5 pb-2 text-xs font-semibold text-ink-faint">{messages.shell.categoriesLabel}</p>
        <ul className="space-y-0.5">
          {categories.map((category) => {
            const href = `/tools/${category.id}`;
            return (
              <NavItem
                key={href}
                href={href}
                label={getCategoryCopy(locale, category.id).nav}
                icon={categoryIcons[category.id]}
                category={category.id}
                count={categoryCounts[category.id]}
                active={isNavItemActive(pathname, href)}
                onNavigate={onNavigate}
              />
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
