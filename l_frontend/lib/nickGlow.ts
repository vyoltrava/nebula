import type { CSSProperties } from "react";

/**
 * 🌗 Утилиты цветных никнеймов (Founder / Moderator / роли из БД).
 *
 * Семантика инверсии, согласованная с плашками RoleBadge:
 *  - ТЁМНАЯ тема: цвет как в БД (Founder — белый), свечение тем же цветом;
 *  - СВЕТЛАЯ тема: слишком светлые цвета (#ffffff, #e4e4e7 у trelod и т.п.)
 *    инвертируются в «чернила» #26221a — ник читаем, свечение тёмное,
 *    в тон чёрной плашке.
 */

export function parseHexColor(color: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((color || "").trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function isLightColor(color: string): boolean {
  const rgb = parseHexColor(color);
  if (!rgb) return false;
  return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2] > 200;
}

/** Итоговый цвет ника для текущей темы (null — обычный цвет из классов) */
export function resolveNickColor(
  color: string | null | undefined,
  theme?: string | null
): string | null {
  const c = (color || "").trim();
  if (!c) return null;
  const isDark = theme !== "light"; // до гидратации считаем тёмной (defaultTheme)
  if (!isDark && isLightColor(c)) return "#26221a";
  return c;
}

function glowShadow(color: string): string | undefined {
  return /^#?[0-9a-f]{6}$/i.test(color.trim())
    ? `0 0 6px ${color}B3, 0 0 14px ${color}66`
    : undefined;
}

/** Inline-стиль для ника: цвет + свечение под цвет «плашки» с учётом темы */
export function nickGlowStyle(
  color: string | null | undefined,
  theme?: string | null
): CSSProperties | undefined {
  const c = resolveNickColor(color, theme);
  if (!c) return undefined;
  const textShadow = glowShadow(c);
  return textShadow ? { color: c, textShadow } : { color: c };
}

/** Стандартный цвет роли из объекта пользователя */
export function roleColorOf(user: any): string | null {
  if (!user) return null;
  if (user.is_admin) return "#ffffff";
  if (user.is_moderator) return "#3b82f6";
  return user.role?.color ?? null;
}
