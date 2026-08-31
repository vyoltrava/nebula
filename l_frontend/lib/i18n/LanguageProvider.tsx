"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_STORAGE_KEY,
  isLocale,
  translate,
  type Locale,
  type MessageKey,
} from "./index";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  locales: Locale[];
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(saved)) setLocaleState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const setLocale = (next: Locale) => {
      setLocaleState(next);
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    };
    return {
      locale,
      setLocale,
      t: (key, params) => translate(locale, key, params),
      locales: LOCALES,
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside LanguageProvider");
  return ctx;
}

/* Безопасная версия: не бросает исключение, если провайдера нет
   (например, при prerender системных страниц вроде /_not-found) —
   использует локаль по умолчанию. */
export function useI18nSafe() {
  const ctx = useContext(I18nContext);
  return (
    ctx ?? {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      t: (key: MessageKey, params?: Record<string, string | number>) =>
        translate(DEFAULT_LOCALE, key, params),
      locales: LOCALES,
    }
  );
}
