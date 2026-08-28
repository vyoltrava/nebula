"use client";

/**
 * Провайдер темы «OLD iOS» (Skeuomorphism).
 *
 * Источник истины — собственный мини-store над localStorage (useSyncExternalStore).
 * Провайдер:
 *  - синхронизирует класс `ios-theme` на <body> (единственный эффект, БЕЗ
 *    MutationObserver — именно слежение за <body> ломало интерфейс в прошлый раз);
 *  - когда тема включена — монтирует движки трансформации (маркируют живой DOM
 *    атрибутами data-ios-*, по которым CSS рисует скевоморфизм) и звуковой
 *    движок Web Audio (клики, штампы, телеграф, отправка письма);
 *  - всегда монтирует SettingsThemeInjector — переключатель трёх тем из Настроек.
 *
 * Взаимоисключение с Zune решает сам селектор (applyThemeChoice), а не этот
 * провайдер, поэтому конфликтов и циклов перерисовки нет.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  getCachedShellSwitcherEnabled,
  SHELL_SWITCHER_EVENT,
} from "@/lib/shellSwitcher";
import {
  IosThemeContext,
  IOS_CLASS,
  subscribeIosPreference,
  getIosSnapshot,
  getIosServerSnapshot,
  applyThemeChoice,
  type ThemeChoice,
} from "./hooks/useIosTheme";
import { IosSidebar } from "./components/IosSidebar";
import { IosChats } from "./components/IosChats";
import { IosNotifications } from "./components/IosNotifications";
import { IosActions } from "./components/IosActions";
import { IosBoard } from "./components/IosBoard";
import { IosSfx } from "./components/IosSfx";
import { SettingsThemeInjector } from "./components/SettingsThemeInjector";

/* Признак завершения гидратации (без setState в эффекте) */
const emptySubscribe = () => () => {};
function useMounted(): boolean {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}

export function IosThemeProvider({ children }: { children: ReactNode }) {
  const preference = useSyncExternalStore(
    subscribeIosPreference,
    getIosSnapshot,
    getIosServerSnapshot
  );
  const mounted = useMounted();
  const isIos = preference === "ios";

  /* 🎛️ Глобальный флаг «смены оболочек»: пока выключен (темы в разработке),
     переключатель скрыт, оболочка принудительно сбрасывается в классику */
  const [shellSwitcherEnabled, setShellSwitcherEnabled] = useState(
    getCachedShellSwitcherEnabled
  );

  useEffect(() => {
    const sync = () => setShellSwitcherEnabled(getCachedShellSwitcherEnabled());
    sync();
    window.addEventListener(SHELL_SWITCHER_EVENT, sync);
    if (!shellSwitcherEnabled && preference !== "standard") {
      applyThemeChoice("standard");
    }
    return () => window.removeEventListener(SHELL_SWITCHER_EVENT, sync);
  }, [shellSwitcherEnabled, preference]);

  /* Синхронизация собственного класса <body> с текущим выбором */
  useEffect(() => {
    document.body.classList.toggle(IOS_CLASS, isIos);
  }, [isIos]);

  const apply = useCallback((c: ThemeChoice) => {
    applyThemeChoice(c);
  }, []);

  const value = useMemo(
    () => ({ preference, isIosTheme: isIos, apply }),
    [preference, isIos, apply]
  );

  return (
    <IosThemeContext.Provider value={value}>
      {children}

      {/* Движки трансформации и звука — живут только пока включена iOS-тема */}
      {mounted && isIos && (
        <>
          <IosSfx />
          <IosSidebar />
          <IosActions />
          <IosBoard />
          <IosChats />
          <IosNotifications />
        </>
      )}

      {/* Переключатель трёх тем внутри раздела «Оформление» Настроек */}
      {mounted && shellSwitcherEnabled && <SettingsThemeInjector />}
    </IosThemeContext.Provider>
  );
}
