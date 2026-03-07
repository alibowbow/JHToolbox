'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AppDictionary, Locale, dictionaries } from '@/lib/i18n';

const STORAGE_KEY = 'jhtoolbox.locale';

interface LocaleContextValue {
  locale: Locale;
  setLocale: (nextLocale: Locale) => void;
  toggleLocale: () => void;
  messages: AppDictionary;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function detectLocale(): Locale {
  if (typeof navigator === 'undefined') {
    return 'en';
  }

  return navigator.language.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const nextLocale = saved === 'ko' || saved === 'en' ? saved : detectLocale();
      setLocaleState(nextLocale);
    } catch {
      setLocaleState(detectLocale());
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    localStorage.setItem(STORAGE_KEY, locale);
  }, [locale]);

  const value = useMemo<LocaleContextValue>(() => {
    return {
      locale,
      setLocale: setLocaleState,
      toggleLocale: () => setLocaleState((currentLocale) => (currentLocale === 'en' ? 'ko' : 'en')),
      messages: dictionaries[locale],
    };
  }, [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used inside LocaleProvider.');
  }

  return context;
}
