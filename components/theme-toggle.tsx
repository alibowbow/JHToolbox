'use client';

import { MoonStar, SunMedium } from 'lucide-react';
import { useTheme } from '@/components/providers/theme-provider';
import { useLocale } from '@/components/providers/locale-provider';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const { messages } = useLocale();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="topbar-button inline-flex h-11 w-11"
      aria-label={messages.topbar.toggleTheme}
      title={isDark ? messages.topbar.switchToLight : messages.topbar.switchToDark}
    >
      {isDark ? <SunMedium size={18} /> : <MoonStar size={18} />}
    </button>
  );
}
