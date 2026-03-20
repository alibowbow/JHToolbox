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

  useEffect(() => {
    if (!tabs.length) {
      return;
    }

    if (storageKey) {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved && tabs.some((tab) => tab.id === saved)) {
          setActive(saved);
          return;
        }
      } catch {
        // Ignore storage errors and fall back to the first tab.
      }
    }

    if (!active || !tabs.some((tab) => tab.id === active)) {
      setActive(tabs[0].id);
    }
  }, [active, storageKey, tabs]);

  useEffect(() => {
    if (!storageKey || !active) {
      return;
    }

    try {
      localStorage.setItem(storageKey, active);
    } catch {
      // Ignore persistence errors in private browsing or locked storage.
    }
  }, [active, storageKey]);

  return (
    <div className="space-y-6">
      <div className="inline-flex w-full max-w-full gap-1 overflow-x-auto rounded-2xl border border-border bg-base-subtle/90 p-1.5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className={`relative rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
              active === tab.id ? 'text-ink' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {active === tab.id ? (
              <motion.div
                layoutId="tab-active"
                className="absolute inset-0 rounded-xl border border-border/60 bg-base-elevated"
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
