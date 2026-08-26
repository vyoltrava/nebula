"use client";

/**
 * Сайдбар в стиле Windows Phone Hub — Zune-версия навигации.
 *
 * ★ ФИКС БАГА С ИКОНКАМИ ★
 * Иконки — символы Segoe MDL2 (Unicode) БЕЛОГО цвета:
 *   неактивные rgba(255,255,255,0.7), активные #FFFFFF.
 * Никаких #FF00FF/#FF1493/pink/magenta/red на иконках нет
 * (проверяется в zune-navigation.css).
 *
 * Активный пункт подсвечивается белой линией снизу.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface ZuneNavItem {
  href: string;
  label: string;
  /** Unicode-символ Segoe MDL2 Assets, например "\uE80F" (Home) */
  glyph?: string;
}

/* Стандартные глифы Segoe MDL2 */
export const MDL2 = {
  home: "\uE80F",
  message: "\uE8BD",
  contact: "\uE77B",
  favoriteStar: "\uE734",
  settings: "\uE713",
  mail: "\uE715",
  play: "\uE768",
} as const;

const DEFAULT_ITEMS: ZuneNavItem[] = [
  { href: "/", label: "ЛЕНТА", glyph: MDL2.home },
  { href: "/messages", label: "СООБЩЕНИЯ", glyph: MDL2.message },
  { href: "/suggestions", label: "ДРУЗЬЯ", glyph: MDL2.contact },
  { href: "/bookmarks", label: "ЗАКЛАДКИ", glyph: MDL2.favoriteStar },
  { href: "/settings", label: "НАСТРОЙКИ", glyph: MDL2.settings },
];

interface ZuneSidebarProps {
  items?: ZuneNavItem[];
  title?: string;
  /** Дополнительный контент внизу сайдбара (например, плеер) */
  footer?: React.ReactNode;
}

export function ZuneSidebar({
  items = DEFAULT_ITEMS,
  title = "МЕНЮ",
  footer,
}: ZuneSidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="zune-sidebar">
      <div className="zune-sidebar-title">{title}</div>
      <nav className="zune-sidebar-list" aria-label="Основная навигация">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="zune-sidebar-item"
              data-active={active}
              aria-current={active ? "page" : undefined}
            >
              <span
                className={`zune-sidebar-icon${active ? " active" : ""}`}
                aria-hidden="true"
              >
                {item.glyph ?? "\uE80F"}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      {footer ? <div style={{ marginTop: "auto" }}>{footer}</div> : null}
    </aside>
  );
}
