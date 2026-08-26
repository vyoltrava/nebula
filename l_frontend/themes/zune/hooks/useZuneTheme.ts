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

/* ------------------------------------------------------------------
   Мини-store поверх localStorage для useSyncExternalStore.
   Читает выбор темы синхронно и оповещает подписчиков при изменении
   (локальном или из другой вкладки). Благодаря этому тема читается
   БЕЗ setState-в-эффекте и без проблем гидратации: сервер и первый
   клиентский рендер получают одно и то же значение ("standard"),
   а реальный выбор подхватывается сразу после монтирования.
   ------------------------------------------------------------------ */

export const THEME_CLASS = "zune-theme";

type PreferenceListener = () => void;

const preferenceListeners = new Set<PreferenceListener>();

function emitPreferenceChanged() {
  preferenceListeners.forEach((listener) => listener());
}

function onCrossTabStorage(e: StorageEvent) {
  if (e.key === ZUNE_STORAGE_KEY || e.key === ZUNE_LEGACY_KEY) {
    emitPreferenceChanged();
  }
}

/** Подписка для useSyncExternalStore (+ синхронизация между вкладками) */
export function subscribePreference(listener: PreferenceListener): () => void {
  const isFirst = preferenceListeners.size === 0;
  preferenceListeners.add(listener);
  if (isFirst && typeof window !== "undefined") {
    window.addEventListener("storage", onCrossTabStorage);
  }
  return () => {
    preferenceListeners.delete(listener);
    if (
      preferenceListeners.size === 0 &&
      typeof window !== "undefined"
    ) {
      window.removeEventListener("storage", onCrossTabStorage);
    }
  };
}

/** Снимок для useSyncExternalStore (строковый литерал — стабилен для ===) */
export function getPreferenceSnapshot(): ZunePreference {
  return readZunePreference();
}

/** Серверный снимок: до гидратации тема всегда стандартная */
export function getPreferenceServerSnapshot(): ZunePreference {
  return "standard";
}

/** Записать выбор: localStorage + класс на <body> + оповещение подписчиков */
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
  emitPreferenceChanged();
}
