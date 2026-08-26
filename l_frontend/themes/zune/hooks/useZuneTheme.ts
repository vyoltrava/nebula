"use client";

/**
 * Хук и контекст темы «ZUNE PHONE DESIGN SYSTEM».
 *
 * Значения preference: "standard" | "zune".
 * Хранение: localStorage, ключ "zune-theme-preference" (по спецификации).
 * Для обратной совместимости читается и старый ключ "theme-preference".
 */

import { createContext, useContext } from "react";

export type ZunePreference = "standard" | "zune";

export const ZUNE_STORAGE_KEY = "zune-theme-preference";
/** Старый ключ (до рефакторинга) — читаем для бесшовной миграции */
export const ZUNE_LEGACY_KEY = "theme-preference";

export interface ZuneThemeContextValue {
  /** Текущий выбор ("standard" | "zune") */
  preference: ZunePreference;
  /** Активна ли Zune-тема сейчас */
  isZuneTheme: boolean;
  /** Установить тему явно */
  setPreference: (pref: ZunePreference) => void;
  /** Переключить стандарт ↔ zune */
  toggleTheme: () => void;
}

export const ZuneThemeContext = createContext<ZuneThemeContextValue | null>(
  null
);

function readStored(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return (
      window.localStorage.getItem(ZUNE_STORAGE_KEY) ??
      window.localStorage.getItem(ZUNE_LEGACY_KEY)
    );
  } catch {
    return null;
  }
}

export function readZunePreference(): ZunePreference {
  return readStored() === "zune" ? "zune" : "standard";
}

export function useZuneTheme(): ZuneThemeContextValue {
  const ctx = useContext(ZuneThemeContext);
  if (!ctx) {
    throw new Error(
      "useZuneTheme должен использоваться внутри <ZuneThemeProvider>"
    );
  }
  return ctx;
}
