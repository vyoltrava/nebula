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
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { useMemo } from "react";

export interface ZuneNavItem {
  href: string;
  label: string;
  /** Unicode-символ Segoe MDL2 Assets, например "\uE80F" (Home) */
  glyph?: string;
}

/* Segoe MDL2 Assets — белые глифы вместо цветных иконок (ФИКС БАГА) */
export const MDL2 = {
  home: "\uE80F",
  message: "\uE8BD",
  contact: "\uE77B",
  favoriteStar: "\uE734",
  settings: "\uE713",
  mail: "\uE715",
  play: "\uE768",
  bell: "\uE727",
  bookmark: "\uE735",
  shield: "\uE729",
  bug: "\uE777",
  headset: "\uE767",
  palette: "\uE70F",
  logout: "\uE741",
  search: "\uE721",
  updates: "\uE791",
} as const;

/**
 * Пункты меню — синхронизированы с реальными роутами Sidebar.tsx.
 * Используем useI18n для лейблов (как в оригинале), но иконки — чистые глифы
 * Segoe MDL2 Assets, которые наследуют цвет текста и НИКОГДА не окрашиваются
 * в #FF00FF/#FF1493/pink/magenta/red (см. zune-navigation.css).
 */
export function useZuneNavItems(): ZuneNavItem[] {
  const { t } = useI18n();

  return useMemo(
    () => [
      { href: "/", label: t("nav.home"), glyph: MDL2.home },
      { href: "/messages", label: t("nav.messages"), glyph: MDL2.message },
      { href: "/notifications", label: t("nav.notifications"), glyph: MDL2.bell },
      { href: "/bookmarks", label: t("nav.bookmarks"), glyph: MDL2.bookmark },
      { href: "/updates", label: t("nav.community"), glyph: MDL2.updates },
      { href: "/settings", label: t("nav.settings"), glyph: MDL2.settings },
      { href: "/rules", label: t("nav.rules"), glyph: MDL2.shield },
      { href: "/support", label: t("nav.support"), glyph: MDL2.headset },
      { href: "/search", label: t("nav.search"), glyph: MDL2.search },
    ],
    [t]
  );
}

const DEFAULT_ITEMS: ZuneNavItem[] = [
  { href: "/", label: "ЛЕНТА", glyph: MDL2.home },
  { href: "/messages", label: "СООБЩЕНИЯ", glyph: MDL2.message },
  { href: "/notifications", label: "УВЕДОМЛЕНИЯ", glyph: MDL2.bell },
  { href: "/bookmarks", label: "ЗАКЛАДКИ", glyph: MDL2.bookmark },
  { href: "/updates", label: "СООБЩЕСТВО", glyph: MDL2.updates },
  { href: "/settings", label: "НАСТРОЙКИ", glyph: MDL2.settings },
  { href: "/rules", label: "ПРАВИЛА", glyph: MDL2.shield },
  { href: "/support", label: "ПОДДЕРЖКА", glyph: MDL2.headset },
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
