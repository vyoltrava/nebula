"use client";

/**
 * Ядро темы «ZUNE»: контекст + мини-store над localStorage для
 * useSyncExternalStore (без setState-в-эффекте и без проблем гидратации:
 * сервер и первый клиентский рендер получают одно значение "standard",
 * реальный выбор подхватывается сразу после монтирования).
 */

import { createContext, useContext } from "react";

export type ZunePreference = "standard" | "zune";

export interface ZuneThemeContextValue {
  preference: ZunePreference;
  isZuneTheme: boolean;
  setPreference: (pref: ZunePreference) => void;
  toggleTheme: () => void;
}

export const ZUNE_STORAGE_KEY = "zune-theme-preference";
export const ZUNE_LEGACY_KEY = "theme-preference";
export const THEME_CLASS = "zune-theme";

export const ZuneThemeContext = createContext<ZuneThemeContextValue | null>(
  null
);

/** Синхронное чтение выбора (SSR-safe: вне window → "standard") */
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

/* ------------------------------------------------------------------
   Мини-store поверх localStorage
   ------------------------------------------------------------------ */

type Listener = () => void;

const listeners = new Set<Listener>();

function emitChanged() {
  listeners.forEach((listener) => listener());
}

function onCrossTabStorage(e: StorageEvent) {
  if (e.key === ZUNE_STORAGE_KEY || e.key === ZUNE_LEGACY_KEY) emitChanged();
}

/** Подписка для useSyncExternalStore (+ синхронизация вкладок) */
export function subscribePreference(listener: Listener): () => void {
  const isFirst = listeners.size === 0;
  listeners.add(listener);
  if (isFirst && typeof window !== "undefined") {
    window.addEventListener("storage", onCrossTabStorage);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("storage", onCrossTabStorage);
    }
  };
}

/** Снимок клиента (стабильный строковый литерал — безопасен для ===) */
export function getPreferenceSnapshot(): ZunePreference {
  return readZunePreference();
}

/** Серверный снимок: до гидратации тема всегда стандартная */
export function getPreferenceServerSnapshot(): ZunePreference {
  return "standard";
}

/** Запись выбора: класс на <body> + localStorage + оповещение подписчиков */
export function writePreference(pref: ZunePreference): void {
  if (typeof document !== "undefined") {
    document.body.classList.toggle(THEME_CLASS, pref === "zune");
  }
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ZUNE_STORAGE_KEY, pref);
      window.localStorage.removeItem(ZUNE_LEGACY_KEY);
    }
  } catch {
    /* приватный режим — тема применится хотя бы до перезагрузки */
  }
  emitChanged();
}

/* ------------------------------------------------------------------
   Контекстный хук
   ------------------------------------------------------------------ */

export function useZuneTheme(): ZuneThemeContextValue {
  const ctx = useContext(ZuneThemeContext);
  if (!ctx) {
    throw new Error(
      "useZuneTheme должен использоваться внутри <ZuneThemeProvider>"
    );
  }
  return ctx;
}
