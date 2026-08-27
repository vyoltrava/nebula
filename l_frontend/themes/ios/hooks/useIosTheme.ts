"use client";

/**
 * Ядро темы «OLD iOS» (Skeuomorphism): контекст + мини-store над localStorage
 * для useSyncExternalStore — без setState-в-эффекте и без мигания при
 * гидратации (сервер и первый клиентский рендер получают одно значение
 * "standard", реальный выбор подхватывается сразу после монтирования).
 *
 * Единый переключатель из трёх состояний: "standard" | "zune" | "ios".
 *
 * Гарантия взаимоисключения тем: запись здесь синхронизируется со store темы
 * Zune (через его же `writePreference`), поэтому классы `zune-theme` и
 * `ios-theme` никогда не висят на <body> одновременно.
 */

import { createContext, useContext } from "react";
import { writePreference as writeZunePreference } from "@/themes/zune/hooks/useZuneTheme";

export type ThemeChoice = "standard" | "zune" | "ios";

export interface IosThemeContextValue {
  choice: ThemeChoice;
  /** true, когда активна именно тема Old iOS */
  isIosTheme: boolean;
  /** Выбор одного из трёх вариантов (interchangeably with zune provider) */
  setChoice: (c: ThemeChoice) => void;
}

export const IOS_STORAGE_KEY = "ios-theme-preference";
export const ZUNE_STORAGE_KEY = "zune-theme-preference";
export const IOS_CLASS = "ios-theme";

export const IosThemeContext = createContext<IosThemeContextValue | null>(null);

/** Синхронное чтение выбора (SSR-safe: вне window → "standard") */
export function readIosPreference(): ThemeChoice {
  if (typeof window === "undefined") return "standard";
  try {
    const v = window.localStorage.getItem(IOS_STORAGE_KEY);
    if (v === "ios" || v === "zune") return v;
    return "standard";
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
  if (e.key === IOS_STORAGE_KEY || e.key === ZUNE_STORAGE_KEY) {
    emitChanged();
  }
}

/** Подписка для useSyncExternalStore (+ синхронизация вкладок) */
export function subscribeIosPreference(listener: Listener): () => void {
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
export function getIosSnapshot(): ThemeChoice {
  return readIosPreference();
}

/** Серверный снимок: до гидратации тема всегда стандартная */
export function getIosServerSnapshot(): ThemeChoice {
  return "standard";
}

/**
 * Запись выбора. Согласованно с темой Zune:
 *  - "zune"  → включаем Zune, выключаем iOS;
 *  - "ios"   → включаем iOS, выключаем Zune;
 *  - "standard" → обе оболочки отключены.
 */
export function writeIosPreference(choice: ThemeChoice): void {
  if (typeof document !== "undefined") {
    document.body.classList.toggle(IOS_CLASS, choice === "ios");
  }

  /* Синхронизируем тему Zuse: она либо включается (при выборе "zune"),
     либо выключается (все прочие варианты). Это гарантирует взаимоисключение. */
  writeZunePreference(choice === "zune" ? "zune" : "standard");

  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(IOS_STORAGE_KEY, choice);
    }
  } catch {
    /* приватный режим — тема применится хотя бы до перезагрузки */
  }
  emitChanged();
}

/* ------------------------------------------------------------------
   Контекстный хук
   ------------------------------------------------------------------ */

export function useIosTheme(): IosThemeContextValue {
  const ctx = useContext(IosThemeContext);
  if (!ctx) {
    throw new Error("useIosTheme должен использоваться внутри <IosThemeProvider>");
  }
  return ctx;
}