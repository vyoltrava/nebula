"use client";

/**
 * САЙДБАР WINDOWS PHONE — новая структура поверх существующего компонента
 * (стандартные файлы не изменяются: структура встраивается в живой DOM):
 *
 *  - ширина колонки 360px (контролируется CSS по [data-zune-sidebar]);
 *  - блок бренда «ZUNE» (48px, тонкое начертание) + линия-разделитель
 *    в самое начало колонки;
 *  - пункты меню без иконок (иконки скрывает CSS), активный пункт
 *    отмечается data-zune-active → белая вертикальная полоса слева;
 *    логика активности повторяет стандартную (включая пары маршрутов
 *    вида /updates ↔ /suggestions);
 *  - навигация тянется flex:1, освобождая низ колонки под встроенный
 *    плеер (его ставит ZuneMusicPlayer последним элементом).
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export const BRAND_HOST_ID = "zune-brand";
export const PLAYER_HOST_ID = "zune-player-host";

export function ZuneSidebar() {
  const pathname = usePathname();

  useEffect(() => {
    const aside = document.querySelector("aside") as HTMLElement | null;
    if (!aside) return;

    /* Разметка нового каркаса */
    aside.dataset.zuneSidebar = "true";

    let brand = document.getElementById(
      BRAND_HOST_ID
    ) as HTMLDivElement | null;
    if (!brand) {
      brand = document.createElement("div");
      brand.id = BRAND_HOST_ID;
      brand.className = "zune-brand";
      brand.innerHTML =
        '<span class="zune-brand-word">ZUNE</span>' +
        '<span class="zune-brand-line" aria-hidden="true"></span>';
    }
    if (aside.firstElementChild !== brand) {
      aside.insertBefore(brand, aside.firstChild);
    }

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
      brand?.remove();
      aside
        .querySelectorAll("[data-zune-active]")
        .forEach((node) => node.removeAttribute("data-zune-active"));
    };
  }, [pathname]);

  return null;
}
