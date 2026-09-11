"use client";

/**
 * ТУМБЛЕР «ОБОЛОЧКА OLD iOS» — встраивается во ВСЕ страницы настроек
 * (классические /settings и /nebula-settings) через React Portal.
 *
 * Отличия от полного переключателя (SettingsThemeInjector):
 *  - это отдельная секция-тумблер, а не радиогруппа тем;
 *  - НЕ зависит от серверного флага shell_switcher_enabled —
 *    включить/выключить оболочку можно в любых настройках в любой момент;
 *  - анкеры под разные страницы: классика ищет блок AppearanceSettings
 *    (radiogroup), nebula-settings — панель секций (rounded-2xl/space-y-2),
 *    универсальный фолбэк — <main>.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useIosTheme } from "../hooks/useIosTheme";

const HOST_ID = "ios-shell-toggle-host";

/** Найти контейнер-якорь для вставки (родитель получит тумблер последним ребёнком) */
function findAnchor(): HTMLElement | null {
  /* Классические настройки: блок «Внешний вид» (radiogroup тем) */
  const rg = Array.from(document.querySelectorAll<HTMLElement>(".space-y-5")).find(
    (el) => el.querySelector('[role="radiogroup"]')
  );
  if (rg) return rg;

  /* Nebula-настройки: панель секций (белая карточка со списком) */
  const main = document.querySelector("main");
  if (!main) return null;
  const panel = main.querySelector<HTMLElement>(
    "div[class*='rounded-2xl'][class*='space-y'], div[class*='space-y-2']"
  );
  return panel ?? main;
}

export function IosShellToggle() {
  const pathname = usePathname();
  const { preference, apply } = useIosTheme();
  const [mounted, setMounted] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const active = Boolean(
      pathname?.startsWith("/settings") || pathname?.startsWith("/nebula-settings")
    );
    let el = document.getElementById(HOST_ID) as HTMLDivElement | null;

    const detach = () => {
      el?.remove();
      el = null;
    };

    const ensure = () => {
      const anchor = active ? findAnchor() : null;
      if (anchor) {
        const parent = anchor.parentElement ?? anchor;
        if (!el) {
          el = document.createElement("div");
          el.id = HOST_ID;
        }
        if (el.parentElement !== parent) {
          parent.appendChild(el);
        }
        setHost(el);
      } else if (el) {
        detach();
        setHost(null);
      }
    };

    /* Однократная привязка при навигации: БЕЗ MutationObserver.
       Два других инжектора уже наблюдают за DOM — третий наблюдатель
       приводил к гонке вставок (визуально «вечный» лоадер в настройках). */
    const timers = [0, 350, 900].map((ms) => window.setTimeout(ensure, ms));

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      detach();
      setHost(null);
    };
  }, [pathname, mounted]);

  if (!mounted || !host) return null;

  const isIos = preference === "ios";

  return createPortal(
    <section className="ist-root ios-shell-toggle">
      <header className="ist-head">
        <div>
          <p className="ist-title">Оболочка Old iOS</p>
          <p className="ist-subtitle">Скевоморфный интерфейс · бумага, кожа, латунь</p>
        </div>
        <span className="ist-badge">Тема</span>
      </header>
      <div className="ios-sfx-row">
        <span className="ios-sfx-label" id="ios-shell-toggle-label">
          Включить оболочку iOS
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={isIos}
          aria-labelledby="ios-shell-toggle-label"
          className="ios-sfx-switch"
          data-state={isIos ? "on" : "off"}
          onClick={() => apply(isIos ? "standard" : "ios")}
        />
      </div>
    </section>,
    host
  );
}