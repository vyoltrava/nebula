"use client";

/**
 * Встраивает переключатель «Стандартная ↔ Zune Windows Phone» прямо в
 * существующую страницу настроек (раздел «Оформление») БЕЗ изменения
 * стандартных файлов — через React Portal.
 *
 *  - активен только на маршруте /settings;
 *  - AppearanceSettings монтируется лишь после открытия вкладки
 *    «Оформление», поэтому момент её появления ловит MutationObserver;
 *  - якорь — корневой блок .space-y-5, содержащий role="radiogroup"
 *    (переключатель Светлая/Тёмная/Системная): точный признак раздела;
 *  - уход с маршрута аккуратно снимает портал.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useZuneTheme } from "../hooks/useZuneTheme";
import { ZuneThemeToggle } from "./ZuneThemeToggle";

const HOST_ID = "zune-settings-toggle-host";

export function SettingsThemeInjector() {
  const pathname = usePathname();
  const { isZuneTheme } = useZuneTheme();
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const isActive = Boolean(pathname?.startsWith("/settings"));

  useEffect(() => {
    let host: HTMLDivElement | null =
      document.getElementById(HOST_ID) as HTMLDivElement | null;

    const detach = () => {
      host?.remove();
      host = null;
    };

    /** Корень AppearanceSettings: списочный блок с radiogroup тем */
    const findAnchor = (): HTMLElement | null =>
      Array.from(document.querySelectorAll<HTMLElement>(".space-y-5")).find(
        (el) => el.querySelector('[role="radiogroup"]') !== null
      ) ?? null;

    const ensure = () => {
      const anchor = isActive ? findAnchor() : null;
      const parent = anchor?.parentElement ?? null;

      if (anchor && parent) {
        if (!host) {
          host = document.createElement("div");
          host.id = HOST_ID;
        }
        /* держим host строго сразу после блока «Оформления» */
        if (anchor.nextElementSibling !== host) {
          parent.insertBefore(host, anchor.nextSibling);
        }
        setRoot(host);
      } else {
        detach();
        setRoot(null);
      }
    };

    /* Первичная привязка асинхронно (микрозадачей): setState не вызывается
       синхронно в теле эффекта (react-hooks/set-state-in-effect). */
    const firstRun = setTimeout(ensure, 0);

    const observer = new MutationObserver(ensure);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      clearTimeout(firstRun);
      observer.disconnect();
      detach();
      setRoot(null);
    };
  }, [isActive]);

  if (!isActive || !root) return null;

  return createPortal(
    <section className="zst-root">
      <header className="zst-head">
        <div>
          <p className="zst-title">Тема оформления</p>
          <p className="zst-subtitle">Windows Phone / Zune</p>
        </div>
        <span className={`zst-badge${isZuneTheme ? " is-on" : ""}`}>
          {isZuneTheme ? "ВКЛЮЧЕНА" : "ВЫКЛЮЧЕНА"}
        </span>
      </header>
      <ZuneThemeToggle />
    </section>,
    root
  );
}
