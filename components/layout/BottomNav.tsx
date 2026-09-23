'use client';

import Link from 'next/link';
import { Home, LayoutGrid, Workflow } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useLocale } from '@/components/providers/locale-provider';
import { isNavItemActive } from '@/components/layout/navigation-list';
import { getCategoryCopy } from '@/lib/i18n';
import { categoryIcons } from '@/lib/tool-presentation';
import { categories } from '@/lib/tool-registry';

const primaryItems = [
  { href: '/', key: 'home', icon: Home },
  { href: '/tools', key: 'allTools', icon: LayoutGrid },
  { href: '/pipeline', key: 'pipeline', icon: Workflow },
] as const;

export function BottomNav() {
  const pathname = usePathname() ?? '';
  const { locale, messages } = useLocale();

  const items = [
    ...primaryItems.map(({ href, key, icon }) => ({ href, icon, label: messages.nav[key] })),
    ...categories.map((category) => ({
      href: `/tools/${category.id}`,
      icon: categoryIcons[category.id],
      label: getCategoryCopy(locale, category.id).nav,
    })),
  ];

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-base-elevated/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
      <div
        data-testid="mobile-bottom-nav-scroll"
        className="overflow-x-auto px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <nav aria-label={messages.shell.navigate} className="flex min-w-max gap-1">
          {items.map(({ href, icon: Icon, label }) => {
            const active = isNavItemActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-w-[64px] shrink-0 flex-col items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                  active ? 'bg-base-subtle text-ink' : 'text-ink-muted'
                }`}
              >
                <Icon size={19} className={active ? 'text-prime' : undefined} />
                <span className="max-w-[72px] truncate">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
