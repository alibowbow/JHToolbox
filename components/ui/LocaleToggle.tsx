'use client';

import { useLocale } from '@/components/providers/locale-provider';

export function LocaleToggle() {
  const { locale, setLocale, messages } = useLocale();

  return (
    <div role="group" aria-label={messages.topbar.locale} className="inline-flex h-9 items-center rounded-[10px] border border-border bg-base-subtle p-0.5">
      {(['en', 'ko'] as const).map((entry) => {
        const active = locale === entry;
        return (
          <button
            key={entry}
            type="button"
            onClick={() => setLocale(entry)}
            aria-pressed={active}
            className={`h-full rounded-lg px-2.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
              active ? 'bg-base-elevated text-ink shadow-[0_1px_2px_rgba(16,24,40,0.08)]' : 'text-ink-faint hover:text-ink'
            }`}
          >
            {entry}
          </button>
        );
      })}
    </div>
  );
}
