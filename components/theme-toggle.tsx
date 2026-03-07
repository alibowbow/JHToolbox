'use client';

import { MoonStar, SunMedium } from 'lucide-react';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'jhtoolbox.theme';

export function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const enabled = saved ? saved === 'dark' : true;
    document.documentElement.classList.toggle('dark', enabled);
    setDark(enabled);
  }, []);

  const toggle = () => {
    setDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
      return next;
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-base-elevated text-ink-muted transition-colors hover:border-border-bright hover:text-ink"
      aria-label="Toggle theme"
    >
      {dark ? <SunMedium size={18} /> : <MoonStar size={18} />}
    </button>
  );
}
