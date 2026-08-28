"use client";

/**
 * САЙДБАР В СТИЛЕ OLD iOS (Skeuomorphism) — помечает существующий <aside>
 * атрибутом data-ios-sidebar и ИНЪЕКТИРУЕТ в каждую пункт-меню физическую
 * 3D-иконку (фотоальбом, конверт, бронзовый колокольчик, кресала, антенна,
 * шестерёнка, поляроид). Плоский lucide-SVG прячется — на его месте рисуется
 * настоящий объект. Движок CSS — ios-navigation.css.
 *
 * MutationObserver висит ТОЛЬКО на <aside> (никогда на <body>), так что
 * он не конфликтует с Zune и не вызывает циклов перерисовки.
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type IconKey =
  | "feed"
  | "messages"
  | "notifications"
  | "bookmarks"
  | "updates"
  | "settings"
  | "profile"
  | "rules"
  | "bug"
  | "support";

const ICON_CLASS: Record<IconKey, string> = {
  feed:          "ios-3d-feed",
  messages:      "ios-3d-messages",
  notifications: "ios-3d-notifications",
  bookmarks:     "ios-3d-bookmarks",
  updates:       "ios-3d-updates",
  settings:      "ios-3d-settings",
  profile:       "ios-3d-profile",
  rules:         "ios-3d-rules",
  bug:           "ios-3d-bug",
  support:       "ios-3d-support",
};

/** Возвращает CSS-класс 3D-иконки для пункта меню */
function resolveIcon(base: string): string | null {
  if (base === "/" || base === "") return ICON_CLASS.feed;
  if (base.startsWith("/messages"))      return ICON_CLASS.messages;
  if (base.startsWith("/notifications")) return ICON_CLASS.notifications;
  if (base.startsWith("/bookmarks"))     return ICON_CLASS.bookmarks;
  if (base.startsWith("/updates") || base.startsWith("/suggestions")) return ICON_CLASS.updates;
  if (base.startsWith("/settings"))      return ICON_CLASS.settings;
  if (base.startsWith("/rules"))         return ICON_CLASS.rules;
  if (base.startsWith("/support"))       return ICON_CLASS.support;
  if (base.startsWith("#bug") || base.startsWith("/bug")) return ICON_CLASS.bug;

  // /<username> — профиль (один сегмент, не системный путь)
  const seg = base.replace(/^\//, "");
  const isSingleSegment = seg.length > 0 && !seg.includes("/") && !seg.startsWith("#");
  if (isSingleSegment && !base.startsWith("/admin")) {
    return ICON_CLASS.profile;
  }
  return null;
}

export function IosSidebar() {
  const pathname = usePathname();

  useEffect(() => {
    const aside = document.querySelector("aside") as HTMLElement | null;
    if (!aside) return;

    aside.dataset.iosSidebar = "true";

    /** Инъекция физических 3D-иконок перед плоским lucide-SVG */
    const mountIcons = () => {
      const links = aside.querySelectorAll<HTMLAnchorElement>("a[href]");
      links.forEach((anchor) => {
        const href = anchor.getAttribute("href") ?? "";
        const base = href.split("?")[0].split("#")[0];
        const cls = resolveIcon(base);
        if (!cls) return;
        if (anchor.querySelector(":scope > .ios-3d-icon")) {
          anchor.classList.add("ios-has-3d");
          return;
        }

        const icon = document.createElement("span");
        icon.className = `ios-3d-icon ${cls}`;
        icon.setAttribute("aria-hidden", "true");
        const inner = document.createElement("span");
        inner.className = "ios-3d-inner";
        icon.appendChild(inner);
        anchor.classList.add("ios-has-3d");
        anchor.insertBefore(icon, anchor.firstChild);
      });
    };

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

    mountIcons();
    stampActive();

    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        mountIcons();
        stampActive();
      });
    };
    const mo = new MutationObserver(schedule);
    mo.observe(aside, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      delete aside.dataset.iosSidebar;
      aside.querySelectorAll(".ios-3d-icon").forEach((node) => node.remove());
      aside
        .querySelectorAll("[data-ios-active]")
        .forEach((node) => node.removeAttribute("data-ios-active"));
    };
  }, [pathname]);

  return null;
}
