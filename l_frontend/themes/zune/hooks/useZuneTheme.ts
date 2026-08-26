"use client";

/**
 * Хук и контекст темы «ZUNE PHONE DESIGN SYSTEM».
 * Значения preference: "standard" | "zune".
 * Хранение: localStorage, ключ "theme-preference" (по ТЗ).
 */

import { createContext, useContext } from "react";

export type ZunePreference = "standard" | "zune";

export const ZUNE_STORAGE_KEY = "theme-preference";

export interface ZuneThemeContextValue {
  /** Текущий выбор ("standard" | "zune"); до гидратации — "standard" */
  preference: ZunePreference;
  /** Тема Zune сейчас активна? */
  zuneEnabled: boolean;
  /** Установить тему: добавляет/снимает .zune-theme с <body> + сохраняет выбор */
  setPreference: (pref: ZunePreference) => void;
  /** Переключить стандарт <-> zune */
  toggleTheme: () => void;
}

export const ZuneThemeContext = createContext<ZuneThemeContextValue | null>(null);

export function readZunePreference(): ZunePreference {
  if (typeof window === "undefined") return "standard";
  try {
    return window.localStorage.getItem(ZUNE_STORAGE_KEY) === "zune"
      ? "zune"
      : "standard";
  } catch {
    return "standard";
  }
}

export function useZuneTheme(): ZuneThemeContextValue {
  const ctx = useContext(ZuneThemeContext);
  if (!ctx) {
    throw new Error("useZuneTheme должен использоваться внутри <ZuneThemeProvider>");
  }
  return ctx;
}
