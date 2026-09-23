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
    <div className="space-y-6">
      <div className="inline-flex w-full max-w-full gap-1 overflow-x-auto rounded-2xl border border-border bg-base-subtle/90 p-1.5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => selectTab(tab.id)}
            className={`relative rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
              active === tab.id ? 'text-ink' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {active === tab.id ? (
              <motion.div
                layoutId="tab-active"
                className="absolute inset-0 rounded-xl border border-border bg-base-elevated"
                style={{ zIndex: -1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            ) : null}
            {tab.label}
          </button>
        ))}
      </div>

      <motion.div key={active} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        {active ? children(active) : null}
      </motion.div>
    </div>
  );
}
