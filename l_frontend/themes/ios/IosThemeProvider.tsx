"use client";

/**
 * Провайдер темы «OLD iOS» (Skeuomorphism).
 *
 * Источник истины — собственный мини-store над localStorage (useSyncExternalStore).
 * Провайдер:
 *  - синхронизирует класс `ios-theme` на <body> (единственный эффект, БЕЗ
 *    MutationObserver — именно слежение за <body> ломало интерфейс в прошлый раз);
 *  - когда тема включена — монтирует движки трансформации (маркируют живой DOM
 *    атрибутами data-ios-*, по которым CSS рисует скевоморфизм);
 *  - всегда монтирует SettingsThemeInjector — переключатель трёх тем из Настроек.
 *
 * Взаимоисключение с Zune решает сам селектор (applyThemeChoice), а не этот
 * провайдер, поэтому конфликтов и циклов перерисовки нет.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
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

      {/* Движки трансформации — живут только пока включена iOS-тема */}
      {mounted && isIos && (
        <>
          <IosSidebar />
          <IosChats />
          <IosNotifications />
        </>
      )}

      {/* Переключатель трёх тем внутри раздела «Оформление» Настроек */}
      {mounted && <SettingsThemeInjector />}
    </IosThemeContext.Provider>
  );
}