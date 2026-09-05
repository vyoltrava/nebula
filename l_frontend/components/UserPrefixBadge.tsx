"use client";
// 🏷️ Префикс пользователя — круглая плашка с обводкой (bg_color), внутри только
// иконка (color), фон прозрачный. Ставится после ника, до плашек роли.
// Данные приходят в любом user_out (поле `prefix`), в сообщениях — `sender_prefix`.
import { PREFIX_ICONS } from "./prefixIcons";

export function UserPrefixBadge({
  prefix,
  size = 16,
  className = "",
}: {
  prefix?: { icon: string; color: string; bg_color: string } | null;
  size?: number;
  className?: string;
}) {
  if (!prefix) return null;
  const icon = PREFIX_ICONS[prefix.icon] || "★";
  const borderW = Math.max(1.5, Math.round(size * 0.12));
  return (
    <span
      title="Префикс"
      className={`inline-flex items-center justify-center shrink-0 align-middle select-none rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        color: prefix.color,
        border: `${borderW}px solid ${prefix.bg_color}`,
        backgroundColor: "transparent",
        fontSize: size * 0.5,
        lineHeight: 1,
      }}
    >
      {icon}
    </span>
  );
}
