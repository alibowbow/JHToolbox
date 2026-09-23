'use client';

import { MotionConfig } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { BottomNav } from '@/components/layout/BottomNav';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { PageTransition } from '@/components/PageTransition';
import { useLocale } from '@/components/providers/locale-provider';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { messages } = useLocale();

  return (
    <MotionConfig reducedMotion="user">
      <a
        href="#main-content"
        className="sr-only z-[60] rounded-[10px] bg-base-elevated px-4 py-2 text-sm font-medium text-ink shadow-pop focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
      >
        {messages.shell.skipToContent}
      </a>
      <div className="flex min-h-screen bg-base">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main id="main-content" tabIndex={-1} className="flex-1 px-4 pb-28 pt-6 outline-none sm:px-6 md:pb-14 lg:px-10 lg:pt-9">
            <PageTransition routeKey={pathname ?? 'app'}>{children}</PageTransition>
          </main>
          <BottomNav />
        </div>
      </div>
    </MotionConfig>
  );
}
