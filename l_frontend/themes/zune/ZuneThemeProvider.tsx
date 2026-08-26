"use client";

/**
 * Провайдер темы «ZUNE PHONE DESIGN SYSTEM».
 *
 * Принцип (жёсткое правило №1): стандартные файлы не изменяются.
 * Провайдер:
 *  - ставит/снимает класс .zune-theme на <body> — весь CSS темы
 *    скоупится этим классом;
 *  - хранит выбор в localStorage ("zune-theme-preference");
 *  - когда тема активна, показывает плавающий переключатель
 *    (чтобы вернуться к стандартной теме можно было из любого места,
 *     не трогая стандартные Настройки);
 *  - синхронизируется между вкладками через storage-событие.
 *
 * Мерцание при загрузке убирает блокирующий скрипт в layout.tsx
 * (единственное разрешённое касание корневого файла).
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ZuneThemeContext,
  ZUNE_STORAGE_KEY,
  readZunePreference,
  type ZunePreference,
} from "./hooks/useZuneTheme";
import { ZuneThemeToggle } from "./components/ZuneThemeToggle";

const THEME_CLASS = "zune-theme";

function applyBodyClass(pref: ZunePreference) {
  if (typeof document === "undefined") return;
  document.body.classList.toggle(THEME_CLASS, pref === "zune");
}

export function ZuneThemeProvider({ children }: { children: ReactNode }) {
  /* Ленивая инициализация из localStorage (SSR → "standard").
     Гидратация безопасна: сам провайдер не рендерит контент от флага,
     кроме плавающего тумблера (он появляется только после mount). */
  const [preference, setPreferenceState] = useState<ZunePreference>(() =>
    readZunePreference()
  );

  useEffect(() => {
    /* Гарантия согласованности DOM-класса с хранилищем */
    applyBodyClass(readZunePreference());

    const onStorage = (e: StorageEvent) => {
      if (e.key !== ZUNE_STORAGE_KEY && e.key !== "theme-preference") return;
      const next: ZunePreference = e.newValue === "zune" ? "zune" : "standard";
      applyBodyClass(next);
      setPreferenceState(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setPreference = useCallback((pref: ZunePreference) => {
    setPreferenceState(pref);
    applyBodyClass(pref);
    try {
      // пишем только в новый ключ; старый подчищаем
      window.localStorage.setItem(ZUNE_STORAGE_KEY, pref);
      window.localStorage.removeItem("theme-preference");
    } catch {
      // приватный режим — тема применится хотя бы до перезагрузки
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setPreference(readZunePreference() === "zune" ? "standard" : "zune");
  }, [setPreference]);

  const value = useMemo(
    () => ({
      preference,
      isZuneTheme: preference === "zune",
      setPreference,
      toggleTheme,
    }),
    [preference, setPreference, toggleTheme]
  );

  return (
    <ZuneThemeContext.Provider value={value}>
      {children}
      {/* Плавающая кнопка возврата к стандартной теме */}
      {preference === "zune" ? <ZuneThemeToggle floating /> : null}
    </ZuneThemeContext.Provider>
  );
}
