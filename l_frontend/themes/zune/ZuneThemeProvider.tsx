"use client";

/**
 * Провайдер темы «ZUNE».
 *
 * Источник истины — мини-store над localStorage (useSyncExternalStore):
 * без мигания при гидратации и без setState-в-эффекте. Когда тема активна,
 * монтирует движки трансформации (самостоятельные компоненты поверх живого
 * DOM, ни один файл проекта не изменяется):
 *
 *  - ZuneSidebar                  — помечает <aside>; CSS превращает его
 *                                   в компактную панель в стиле Windows;
 *  - ZuneChats / ZuneNotifications — разметка списков под плитки Metro;
 *  - плавающая кнопка возврата к стандартной теме;
 *  - переключатель WP-стиля внутри Настроек (SettingsThemeInjector).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  getCachedShellSwitcherEnabled,
  SHELL_SWITCHER_EVENT,
} from "@/lib/shellSwitcher";
import {
  ZuneThemeContext,
  THEME_CLASS,
  readZunePreference,
  subscribePreference,
  getPreferenceSnapshot,
  getPreferenceServerSnapshot,
  writePreference,
  type ZunePreference,
} from "./hooks/useZuneTheme";
import { ZuneThemeToggle } from "./components/ZuneThemeToggle";
import { SettingsThemeInjector } from "./components/SettingsThemeInjector";
import { ZuneSidebar } from "./components/ZuneSidebar";
import { ZuneChats } from "./components/ZuneChats";
import { ZuneNotifications } from "./components/ZuneNotifications";

/* Признак завершения гидратации (канонический, без setState в эффекте):
   сервер → false, клиент после монтирования → true */
const emptySubscribe = () => () => {};
function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

export function ZuneThemeProvider({ children }: { children: ReactNode }) {
  const preference = useSyncExternalStore(
    subscribePreference,
    getPreferenceSnapshot,
    getPreferenceServerSnapshot
  );
  const mounted = useMounted();
  const isZune = preference === "zune";

  /* 🎛️ Глобальный флаг «смены оболочек»: пока выключен (темы в разработке),
     переключатели скрыты, а Zune принудительно сбрасывается в классику */
  const [shellSwitcherEnabled, setShellSwitcherEnabled] = useState(
    getCachedShellSwitcherEnabled
  );

  useEffect(() => {
    const sync = () => setShellSwitcherEnabled(getCachedShellSwitcherEnabled());
    sync();
    window.addEventListener(SHELL_SWITCHER_EVENT, sync);
    if (!shellSwitcherEnabled && preference === "zune") {
      writePreference("standard");
    }
    return () => window.removeEventListener(SHELL_SWITCHER_EVENT, sync);
  }, [shellSwitcherEnabled, preference]);

  const pathname = usePathname();
  const onSettingsRoute = Boolean(pathname?.startsWith("/settings"));

  /* Синхронизация внешней системы (класс <body>) с текущим выбором */
  useEffect(() => {
    document.body.classList.toggle(THEME_CLASS, isZune);
  }, [isZune]);

  const setPreference = useCallback((pref: ZunePreference) => {
    writePreference(pref);
  }, []);

  const toggleTheme = useCallback(() => {
    writePreference(readZunePreference() === "zune" ? "standard" : "zune");
  }, []);

  const value = useMemo(
    () => ({
      preference,
      isZuneTheme: isZune,
      setPreference,
      toggleTheme,
    }),
    [preference, isZune, setPreference, toggleTheme]
  );

  return (
    <ZuneThemeContext.Provider value={value}>
      {children}

      {/* Движки трансформации — живут только пока тема включена */}
      {mounted && isZune && (
        <>
          <ZuneSidebar />
          <ZuneChats />
          <ZuneNotifications />
        </>
      )}

      {/* Плавающие кнопки поверх UI:
          тема выключена + Настройки → приглашение попробовать Zune.
          (Кнопки возврата к стандартной теме ВЕЗДЕ больше нет — в неё нет
          смысла, переключатель живёт в Настройках. Она только мешала.) */}
      {mounted && !isZune && onSettingsRoute && shellSwitcherEnabled && (
        <ZuneThemeToggle floating variant="invite" />
      )}

      {/* Переключатель темы внутри раздела «Оформление» настроек */}
      {mounted && shellSwitcherEnabled && <SettingsThemeInjector />}
    </ZuneThemeContext.Provider>
  );
}
