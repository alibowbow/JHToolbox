'use client';

import { NavigationList } from '@/components/layout/navigation-list';
import { useLocale } from '@/components/providers/locale-provider';

export function Sidebar() {
  const { messages } = useLocale();

  return (
    <aside className="glass-outline hidden h-screen w-[280px] shrink-0 flex-col border-r md:flex">
      <div className="border-b border-border/10 px-5 pb-5 pt-6">
        <div className="workspace-panel overflow-hidden p-5">
          <p className="workspace-kicker">Workspace</p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="font-display text-2xl font-semibold tracking-tight text-ink">
              JH<span className="text-prime">Toolbox</span>
            </span>
            <span className="editor-chip border-prime/25 bg-prime/10 text-prime">Local</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            Browser-based editing, conversion, and capture tools in one focused workspace.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5">
        <p className="workspace-kicker px-3 pb-3">Navigate</p>
        <NavigationList activeIndicatorId="sidebar-desktop-active" />
      </div>

      <div className="border-t border-border/10 px-5 py-4">
        <div className="workspace-toolbar justify-between">
          <span className="text-xs font-mono text-ink-faint">{messages.common.versionLine}</span>
          <span className="editor-chip px-2.5 py-1">SaaS shell</span>
        </div>
      </div>
    </aside>
  );
}
