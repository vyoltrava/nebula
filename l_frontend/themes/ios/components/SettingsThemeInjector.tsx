"use client";

/**
 * Встраивает переключатель трёх тем («Стандартная / Zune / Old iOS») в раздел
 * «Внешний вид» страницы Настроек БЕЗ изменения стандартных файлов — через
 * React Portal.
 *
 * ВАЖНО (избегаем бага прошлой версии): якорь — блок .space-y-5 с
 * role="radiogroup" (AppearanceSettings). Наш host добавляется как ПОСЛЕДНИЙ
 * ДОЧЕРНИЙ элемент родителя этого блока (appendChild), а не вставляется в
 * anchor.nextSibling, как это делает Zune-инжектор. Поэтому два инжектора не
 * «перегоняют» друг друга — никакого цикла вставки и падения UI.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { IosThemeSelector } from "./IosThemeSelector";

const HOST_ID = "ios-settings-toggle-host";

export function SettingsThemeInjector() {
  const pathname = usePathname();
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
        /* Добавляем в КОНЕЦ родителя (не в nextSibling якоря) — без гонки
           с Zune-инжектором, который вставляет только сразу после якоря. */
        if (host.parentElement !== parent) {
          parent.appendChild(host);
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
    <section className="ist-root">
      <header className="ist-head">
        <div>
          <p className="ist-title">Тема оформления</p>
          <p className="ist-subtitle">Стандарт · Zune · Old iOS</p>
        </div>
        <span className="ist-badge">Оболочки</span>
      </header>
      <IosThemeSelector />
    </section>,
    root
  );
}