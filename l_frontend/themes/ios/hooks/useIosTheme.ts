"use client";

/**
 * Ядро темы «OLD iOS» (Skeuomorphism): контекст + мини-store над localStorage
 * для useSyncExternalStore — без setState-в-эффекте и без мигания при
 * гидратации (сервер и первый клиентский рендер получают "standard").
 *
 * Управление ТОЛЬКО собственным классом `ios-theme` и своим ключом
 * `ios-theme-preference`. Взаимоисключение с темой Zune НЕ строится через
 * слежение за <body> (это и вызывало «зависание»): единой точкой
 * переключения является трёхпозиционный селектор `applyThemeChoice`,
 * который на клик пишет оба store — свой и Zune — гарантируя, что оболочки
 * никогда не включены одновременно.
 */

import { createContext, useContext } from "react";
import { writePreference as writeZunePreference } from "@/themes/zune/hooks/useZuneTheme";

export type ThemeChoice = "standard" | "zune" | "ios";
export type IosPreference = "ios" | "standard";

export interface IosThemeContextValue {
  preference: IosPreference;
  isIosTheme: boolean;
  /** Применить один из трёх вариантов (пишет и iOS, и Zune store) */
  apply: (c: ThemeChoice) => void;
}

export const IOS_STORAGE_KEY = "ios-theme-preference";
export const ZUNE_STORAGE_KEY = "zune-theme-preference";
export const IOS_CLASS = "ios-theme";

export const IosThemeContext = createContext<IosThemeContextValue | null>(null);

/** Синхронное чтение (SSR-safe: вне window → "standard") */
export function readIosPreference(): IosPreference {
  if (typeof window === "undefined") return "standard";
  try {
    return window.localStorage.getItem(IOS_STORAGE_KEY) === "ios"
      ? "ios"
      : "standard";
  } catch {
    return "standard";
  }
}

/* ------------------------------------------------------------------
   Мини-store поверх localStorage (свой, независимый от Zune)
   ------------------------------------------------------------------ */

type Listener = () => void;
const listeners = new Set<Listener>();

function emitChanged() {
  listeners.forEach((listener) => listener());
}

function onCrossTabStorage(e: StorageEvent) {
  if (e.key === IOS_STORAGE_KEY || e.key === ZUNE_STORAGE_KEY) emitChanged();
}

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

export function getIosSnapshot(): IosPreference {
  return readIosPreference();
}

export function getIosServerSnapshot(): IosPreference {
  return "standard";
}

/** Запись только своего выбора: класс <body> + localStorage + подписчики */
export function writeIosPreference(pref: IosPreference): void {
  if (typeof document !== "undefined") {
    document.body.classList.toggle(IOS_CLASS, pref === "ios");
  }
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(IOS_STORAGE_KEY, pref);
    }
  } catch {
    /* приватный режим — тема применится хотя бы до перезагрузки */
  }
  emitChanged();
}

/**
 * ЕДИНАЯ точка выбора темы. Пишет оба store («свой» и Zune), чтобы ровно
 * одна оболочка была активна. Никакого наблюдения за <body> — только
 * координированная запись.
 */
export function applyThemeChoice(choice: ThemeChoice): void {
  switch (choice) {
    case "ios":
      writeIosPreference("ios");
      writeZunePreference("standard");
      break;
    case "zune":
      writeIosPreference("standard");
      writeZunePreference("zune");
      break;
    case "standard":
    default:
      writeIosPreference("standard");
      writeZunePreference("standard");
      break;
  }
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