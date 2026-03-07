'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

interface Tab {
  id: string;
  label: string;
}

export function Tabs({
  tabs,
  children,
}: {
  tabs: Tab[];
  children: (activeId: string) => React.ReactNode;
}) {
  const [active, setActive] = useState(tabs[0]?.id);

  return (
    <div className="space-y-6">
      <div className="inline-flex w-full max-w-full gap-1 overflow-x-auto rounded-xl border border-border bg-base-subtle p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className={`relative rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              active === tab.id ? 'text-ink' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {active === tab.id ? (
              <motion.div
                layoutId="tab-active"
                className="absolute inset-0 rounded-lg bg-base-elevated"
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
