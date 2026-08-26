"use client";

/**
 * Провайдер темы «ZUNE».
 *
 * Источник истины — мини-store над localStorage (useSyncExternalStore):
 * без мигания при гидратации и без setState-в-эффекте. Когда тема активна,
 * монтирует движки трансформации (все они — самостоятельные компоненты,
 * которые встраивают новую структуру В ЖИВОЙ DOM стандартных компонентов,
 * не изменяя ни одного файла проекта):
 *
 *  - ZuneSidebar       — «ZUNE» 48px, разделитель, пункты только текстом,
 *                        белая полоса активного пункта, встроенный плеер;
 *  - ZunePanorama      — фиксированный гигантский заголовок раздела,
 *                        уходящий за левый край, со сжатием при скролле;
 *  - ZuneChats / ZuneNotifications — разметка списков под плитки Metro;
 *  - плавающая кнопка возврата к стандартной теме;
 *  - переключатель WP-стиля внутри Настроек (SettingsThemeInjector).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
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
import { ZuneMusicPlayer } from "./components/ZuneMusicPlayer";
import { ZunePanorama } from "./components/ZunePanorama";
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
          <ZuneMusicPlayer />
          <ZunePanorama />
          <ZuneChats />
          <ZuneNotifications />
        </>
      )}

      {/* Плавающие кнопки поверх UI:
          тема выключена + Настройки → приглашение попробовать Zune;
          тема включена → возврат к стандартной из любого места */}
      {mounted && !isZune && onSettingsRoute && (
        <ZuneThemeToggle floating variant="invite" />
      )}
      {mounted && isZune && <ZuneThemeToggle floating />}

      {/* Переключатель темы внутри раздела «Оформление» настроек */}
      {mounted && <SettingsThemeInjector />}
    </ZuneThemeContext.Provider>
  );
}
