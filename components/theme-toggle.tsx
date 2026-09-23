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
      className="topbar-button h-9 w-9"
      aria-label={messages.topbar.toggleTheme}
      title={isDark ? messages.topbar.switchToLight : messages.topbar.switchToDark}
    >
      {isDark ? <SunMedium size={17} /> : <MoonStar size={17} />}
    </button>
  );
}
