"use client";

/**
 * САЙДБАР В СТИЛЕ OLD iOS — помечает существующий <aside> атрибутом
 * data-ios-sidebar: CSS в ios-navigation.css превращает его в «панель из
 * тёмного дерева/кожи» со «физическими» кнопками-пунктами и бликом у активного
 * пункта. Ничего не рисует сам, стандартные файлы проекта не изменяет.
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function IosSidebar() {
  const pathname = usePathname();

  useEffect(() => {
    const aside = document.querySelector("aside") as HTMLElement | null;
    if (!aside) return;

    aside.dataset.iosSidebar = "true";

    /* Активный пункт меню — та же логика, что у стандартного компонента */
    const stampActive = () => {
      const links = aside.querySelectorAll<HTMLAnchorElement>('a[href^="/"]');
      let matched: HTMLAnchorElement | null = null;

      for (const anchor of Array.from(links)) {
        const raw = anchor.getAttribute("href") ?? "";
        const base = raw.split("?")[0].split("#")[0] || "/";
        delete anchor.dataset.iosActive;

        const isCurrent =
          base === pathname ||
          (base === "/updates" && pathname?.startsWith("/suggestions")) ||
          (base !== "/" && Boolean(pathname?.startsWith(`${base}/`)));

        if (isCurrent && !matched) {
          matched = anchor;
        }
      }

      if (matched) matched.dataset.iosActive = "true";
    };

    stampActive();

    /* Переразметка после ре-рендеров React — через observer (rAF-дебаунс) */
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
      delete aside.dataset.iosSidebar;
      aside
        .querySelectorAll("[data-ios-active]")
        .forEach((node) => node.removeAttribute("data-ios-active"));
    };
  }, [pathname]);

  return null;
}