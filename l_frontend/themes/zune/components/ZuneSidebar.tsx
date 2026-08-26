"use client";

/**
 * Боковое меню в стиле стартового экрана Windows Phone:
 * цветные плитки «иконка + текст». Активный раздел подсвечивается
 * белой рамкой снизу (аналог activeRoute; в Next.js путь даёт usePathname).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

export interface ZuneNavItem {
  href: string;
  label: string;
  icon?: LucideIcon;
  /** Цвет плитки; по умолчанию чередуются акценты Zune */
  color?: string;
}

const DEFAULT_COLORS = ["#ff00ff", "#ff6600", "#00aba9", "#a4c400", "#e51400"];

function tileColor(items: ZuneNavItem[], index: number): string {
  if (items[index]?.color) return items[index].color as string;
  return DEFAULT_COLORS[index % DEFAULT_COLORS.length];
}

interface ZuneSidebarProps {
  items: ZuneNavItem[];
  /** Заголовок над плитками */
  title?: string;
  className?: string;
}

export function ZuneSidebar({ items, title = "МЕНЮ", className }: ZuneSidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  return (
    <nav className={`zt-sidebar ${className ?? ""}`} aria-label="Разделы Zune">
      <h2 className="zt-giant" style={{ position: "static" }}>
        {title}
      </h2>
      <div className="zt-tiles">
        {items.map((item, i) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="zt-tile"
              data-active={active}
              aria-current={active ? "page" : undefined}
              style={{ backgroundColor: tileColor(items, i) }}
            >
              {Icon ? <Icon size={20} aria-hidden /> : null}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
