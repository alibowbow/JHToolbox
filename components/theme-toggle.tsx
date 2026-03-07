'use client';

import { Moon, SunMedium } from 'lucide-react';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'tinywow.theme';

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const enabled = saved ? saved === 'dark' : prefersDark;
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
      className="rounded-lg border border-border p-2 text-muted transition hover:border-accent hover:text-accent"
      aria-label="Toggle theme"
    >
      {dark ? <SunMedium size={18} /> : <Moon size={18} />}
    </button>
  );
}