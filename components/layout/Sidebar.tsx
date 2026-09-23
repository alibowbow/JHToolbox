'use client';

import { ShieldCheck } from 'lucide-react';
import { BrandLink } from '@/components/layout/Brand';
import { NavigationList } from '@/components/layout/navigation-list';
import { useLocale } from '@/components/providers/locale-provider';

export function Sidebar() {
  const { messages } = useLocale();

  return (
    <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-border bg-base-elevated md:flex">
      <div className="flex h-14 shrink-0 items-center px-5">
        <BrandLink />
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-6 pt-3">
        <NavigationList />
      </div>

      <div className="shrink-0 border-t border-border px-5 py-4">
        <div className="flex items-start gap-2.5">
          <ShieldCheck size={16} className="mt-px shrink-0 text-ok" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-ink-muted">{messages.shell.privacyNote}</p>
        </div>
        <p className="mt-2.5 font-mono text-[11px] text-ink-faint">{messages.common.versionLine}</p>
      </div>
    </aside>
  );
}
