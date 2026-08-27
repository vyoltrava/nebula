"use client";

/**
 * Провайдер темы «OLD iOS» (Skeuomorphism).
 *
 * Источник истины — мини-store над localStorage (useSyncExternalStore), как и у
 * темы Zune. Когда тема включена (choice === "ios"), монтирует движки
 * трансформации — лёгкие компоненты, помечающие живой DOM атрибутами
 * (data-ios-*), по которым CSS в ios-*.css рисует скевоморфизм. Ни один файл
 * проекта не изменяется.
 *
 *  - IosSidebar                  — помечает <aside> и активные пункты;
 *  - IosChats / IosNotifications — разметка списков под «бумажные» карточки;
 *  - SettingsThemeInjector       — переключатель из трёх тем внутри Настроек.
 *
 * Взаимоисключение с темой Zune гарантируется на записи (см. useIosTheme) и
 * дополнительно охраняется MutationObserver-ом на классе <body>.
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
  readIosPreference,
  subscribeIosPreference,
  getIosSnapshot,
  getIosServerSnapshot,
  writeIosPreference,
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
  const choice = useSyncExternalStore(
    subscribeIosPreference,
    getIosSnapshot,
    getIosServerSnapshot
  );
  const mounted = useMounted();
  const isIos = choice === "ios";

  /* Синхронизация собственного класса <body> (в т.ч. после кросс-таб-событий) */
  useEffect(() => {
    document.body.classList.toggle(IOS_CLASS, isIos);
  }, [isIos]);

  /* Охрана взаимоисключения: если тему Zune включили извне (её собственный
     переключатель), гасим iOS и согласуем наш выбор; если обе оболочки
     выключены — возвращаемся к «Стандартной». */
  useEffect(() => {
    if (typeof document === "undefined") return;

    const reconcile = () => {
      const body = document.body;
      const hasZune = body.classList.contains("zune-theme");
      const hasIos = body.classList.contains("ios-theme");

      if (hasZune) {
        /* Zune активна — iOS обязана быть выключенной */
        body.classList.remove(IOS_CLASS);
        if (readIosPreference() !== "zune") writeIosPreference("zune");
        return;
      }

      /* Zune выключена. Если iOS тоже выключена, а у нас всё ещё ‘zune’ —
         значит Zune отключили её же переключателем — уходим в «Стандартную». */
      if (!hasIos && readIosPreference() === "zune") {
        writeIosPreference("standard");
      }
    };

    reconcile();
    const mo = new MutationObserver(reconcile);
    mo.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => mo.disconnect();
  }, []);

  const setChoice = useCallback((c: ThemeChoice) => {
    writeIosPreference(c);
  }, []);

  const value = useMemo(
    () => ({ choice, isIosTheme: isIos, setChoice }),
    [choice, isIos, setChoice]
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