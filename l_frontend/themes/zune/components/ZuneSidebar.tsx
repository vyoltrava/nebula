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
    /**
     * ЦЕЛЕВОЙ aside — ТОЛЬКО левая навигация оболочки (Sidebar.tsx).
     * В документе несколько <aside> (правая доска RightPanel w-80, сайдбар
     * настроек sticky, доска админки), и document.querySelector("aside")
     * на разных страницах возвращает РАЗНЫЕ элементы — отсюда «на профиле
     * ок, на остальных нет». Та же логика поиска, что в IosSidebar:
     * приоритет уже помеченному, затем aside с навигационными ссылками.
     */
    const findNavAside = (): HTMLElement | null => {
      const list = Array.from(document.querySelectorAll("aside"));
      /* 1. Уже помеченный Zune — приоритет */
      const stamped = list.find((a) => a.dataset.zuneSidebar === "true");
      if (stamped) return stamped;
      /* 2. aside, внутри которого лежат ссылки основной навигации */
      const withNav = list.find((a) =>
        a.querySelector(
          'a[href="/"], a[href^="/messages"], a[href^="/notifications"], a[href^="/bookmarks"], a[href^="/updates"]'
        )
      );
      if (withNav) return withNav;
      /* 3. Фолбэк: первый aside, не являющийся правой панелью/доской/карточкой */
      return (
        list.find(
          (a) =>
            !a.matches(
              '[class*="w-80"], [class*="backdrop-blur"], [class*="sticky"], [data-ios-board"]'
            )
        ) ??
        list[0] ??
        null
      );
    };

    const aside = findNavAside();
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
