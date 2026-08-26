"use client";

/**
 * САЙДБАР В СТИЛЕ WINDOWS — компактная навигационная панель.
 *
 * Компонент ничего не вставляет и не рисует сам: он лишь помечает
 * существующий <aside> атрибутом data-zune-sidebar — CSS в
 * zune-navigation.css превращает его в панель в духе WinUI
 * NavigationView (иконка + подпись, активная белая полоса слева).
 * Дополнительно повторяет стандартную логику активного пункта
 * меню (data-zune-active), включая пары маршрутов /updates ↔ /suggestions.
 * Стандартные файлы проекта не изменяются.
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function ZuneSidebar() {
  const pathname = usePathname();

  useEffect(() => {
    const aside = document.querySelector("aside") as HTMLElement | null;
    if (!aside) return;

    aside.dataset.zuneSidebar = "true";

    /* Активный пункт меню — та же логика, что у стандартного компонента */
    const stampActive = () => {
      const links = aside.querySelectorAll<HTMLAnchorElement>('a[href^="/"]');
      let matched: HTMLAnchorElement | null = null;

      for (const anchor of Array.from(links)) {
        const raw = anchor.getAttribute("href") ?? "";
        const base = raw.split("?")[0].split("#")[0] || "/";
        delete anchor.dataset.zuneActive;

        const isCurrent =
          base === pathname ||
          (base === "/updates" && pathname?.startsWith("/suggestions")) ||
          (base !== "/" && Boolean(pathname?.startsWith(`${base}/`)));

        if (isCurrent && !matched) {
          matched = anchor;
        }
      }

      if (matched) matched.dataset.zuneActive = "true";
    };

    stampActive();

    /* Переразметка после ре-рендеров React — через observer (rAF-дебаунс),
       без setState в теле эффекта */
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(stampActive);
    };
    const mo = new MutationObserver(schedule);
    mo.observe(aside, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      delete aside.dataset.zuneSidebar;
      aside
        .querySelectorAll("[data-zune-active]")
        .forEach((node) => node.removeAttribute("data-zune-active"));
    };
  }, [pathname]);

  return null;
}
