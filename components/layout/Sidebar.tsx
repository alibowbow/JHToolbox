'use client';

import { NavigationList } from '@/components/layout/navigation-list';
import { useLocale } from '@/components/providers/locale-provider';

export function Sidebar() {
  const { messages } = useLocale();

  return (
    <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-base-subtle/90 backdrop-blur md:flex">
      <div className="flex h-16 items-center border-b border-border px-5">
        <span className="font-display text-xl font-semibold tracking-tight text-ink">
          JH<span className="text-prime">Toolbox</span>
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <NavigationList />
      </div>

      <div className="border-t border-border px-5 py-4">
        <p className="text-xs font-mono text-ink-faint">{messages.common.versionLine}</p>
      </div>
    </aside>
  );
}
