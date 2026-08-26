"use client";

/**
 * Провайдер темы «ZUNE PHONE DESIGN SYSTEM».
 *
 * Принцип (жёсткое правило №1): стандартные файлы не изменяются.
 *
 * Источник истины — мини-store над localStorage, подключённый через
 * useSyncExternalStore: значение одинаково на сервере и при первом
 * клиентском рендере ("standard"), а реальный выбор из localStorage
 * подхватывается сразу после монтирования — без setState-в-эффекте
 * (требование eslint-правила react-hooks/set-state-in-effect).
 * Синхронизация между вкладками — событие storage внутри store.
 *
 * Поведение UI:
 *  - на странице /settings, пока тема выключена, показывает плавающее
 *    приглашение «Включить тему Zune», а после включения — плавающую
 *    кнопку возврата из любого места приложения;
 *  - встраивает полноценный WP-переключатель в раздел «Оформление»
 *    настроек через портал (SettingsThemeInjector);
 *  - мигание при загрузке убирает блокирующий скрипт в layout.tsx
 *    (единственное разрешённое касание корневого файла).
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
import { ZuneSettingsToggle } from "./components/SettingsThemeInjector";

/* Канонический признак завершения гидратации (без setState в эффекте):
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

  const pathname = usePathname();
  const onSettingsRoute = Boolean(pathname?.startsWith("/settings"));

  /* Синхронизация внешней системы (класс <body>) с текущим выбором */
  useEffect(() => {
    document.body.classList.toggle(THEME_CLASS, preference === "zune");
  }, [preference]);

  const setPreference = useCallback((pref: ZunePreference) => {
    writePreference(pref);
  }, []);

  const toggleTheme = useCallback(() => {
    writePreference(readZunePreference() === "zune" ? "standard" : "zune");
  }, []);

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

      {/* Плавающая кнопка поверх UI:
          тема выключена + настройки → приглашение её включить;
          тема включена → возврат к стандартной из любого места */}
      {mounted && preference !== "zune" && onSettingsRoute && (
        <ZuneThemeToggle floating variant="invite" />
      )}
      {mounted && preference === "zune" && <ZuneThemeToggle floating />}

      {/* Полноценный переключатель внутри раздела «Оформление» настроек */}
      {mounted && <ZuneSettingsToggle />}
    </ZuneThemeContext.Provider>
  );
}
