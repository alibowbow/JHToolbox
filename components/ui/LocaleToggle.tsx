'use client';

import { useLocale } from '@/components/providers/locale-provider';

export function LocaleToggle() {
  const { locale, setLocale } = useLocale();

  return (
    <div className="inline-flex items-center rounded-2xl border border-border bg-base-elevated p-1 shadow-card">
      {(['en', 'ko'] as const).map((entry) => {
        const active = locale === entry;
        return (
          <button
            key={entry}
            type="button"
            onClick={() => setLocale(entry)}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] transition-colors ${
              active ? 'bg-base text-ink shadow-card' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {entry}
          </button>
        );
      })}
    </div>
  );
}
