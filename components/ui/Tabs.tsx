'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface Tab {
  id: string;
  label: string;
}

export function Tabs({
  tabs,
  children,
  storageKey,
}: {
  tabs: Tab[];
  children: (activeId: string) => React.ReactNode;
  storageKey?: string;
}) {
  const [active, setActive] = useState(tabs[0]?.id);

  // Restore the saved tab (localStorage is unavailable during static render) and
  // keep the selection valid when the tab list changes. This must not depend on
  // `active`: re-reading storage on every selection change would race the write
  // and bounce the view between the old and new tab indefinitely.
  useEffect(() => {
    if (!tabs.length) {
      return;
    }

    let saved: string | null = null;
    if (storageKey) {
      try {
        saved = localStorage.getItem(storageKey);
      } catch {
        // Ignore storage errors and fall back to the current or first tab.
      }
    }

    setActive((current) => {
      if (saved && tabs.some((tab) => tab.id === saved)) {
        return saved;
      }
      return current && tabs.some((tab) => tab.id === current) ? current : tabs[0].id;
    });
  }, [storageKey, tabs]);

  const selectTab = (id: string) => {
    setActive(id);
    if (!storageKey) {
      return;
    }
    try {
      localStorage.setItem(storageKey, id);
    } catch {
      // Ignore persistence errors in private browsing or locked storage.
    }
  };

  return (
    <div className="space-y-8">
      <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-1.5">
          {tabs.map((tab) => {
            const selected = active === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                aria-pressed={selected}
                onClick={() => selectTab(tab.id)}
                className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  selected
                    ? 'border-transparent bg-ink text-[rgb(var(--color-base-elevated))]'
                    : 'border-border bg-base-elevated text-ink-muted hover:border-border-bright hover:text-ink'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <motion.div key={active} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
        {active ? children(active) : null}
      </motion.div>
    </div>
  );
}
