"use client";

/**
 * Провайдер темы «ZUNE PHONE DESIGN SYSTEM».
 *
 * По ТЗ класс-обёртка .zune-theme ставится на <body>.
 * Весь CSS темы скоупится этим классом, поэтому:
 *  - включили → интерфейс полностью перекрашивается;
 *  - выключили → сайт ровно как был (ни одного остаточного стиля).
 *
 * Выбор сохраняется в localStorage ("theme-preference").
 * Мерцание при загрузке убирает блокирующий скрипт в layout,
 * который ставит класс до первой отрисовки.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ZuneThemeContext,
  ZUNE_STORAGE_KEY,
  readZunePreference,
  type ZunePreference,
} from "./hooks/useZuneTheme";

const THEME_CLASS = "zune-theme";

function applyBodyClass(pref: ZunePreference) {
  if (typeof document === "undefined") return;
  document.body.classList.toggle(THEME_CLASS, pref === "zune");
}

export function ZuneThemeProvider({ children }: { children: ReactNode }) {
  /* Ленивая инициализация: на клиенте сразу читаем localStorage.
     Гидратация безопасна: провайдер не рендерит ничего от этого флага,
     а потребители (AppearanceSettings) показывают выбор только после mount. */
  const [preference, setPreferenceState] = useState<ZunePreference>(
    () => readZunePreference()
  );

  /* Держим DOM-класс согласованным (анти-FOUC скрипт из layout обычно
     уже поставил его до первой отрисовки) + слушаем другие вкладки */
  useEffect(() => {
    applyBodyClass(readZunePreference());

    const onStorage = (e: StorageEvent) => {
      if (e.key !== ZUNE_STORAGE_KEY) return;
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
      window.localStorage.setItem(ZUNE_STORAGE_KEY, pref);
    } catch {
      // приватный режим — тема применится хотя бы до перезагрузки
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setPreference(preference === "zune" ? "standard" : "zune");
  }, [preference, setPreference]);

  const value = useMemo(
    () => ({
      preference,
      zuneEnabled: preference === "zune",
      setPreference,
      toggleTheme,
    }),
    [preference, setPreference, toggleTheme]
  );

  return (
    <ZuneThemeContext.Provider value={value}>
      {children}
    </ZuneThemeContext.Provider>
  );
}
