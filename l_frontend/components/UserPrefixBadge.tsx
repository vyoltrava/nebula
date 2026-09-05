"use client";
// 🏷️ Префикс пользователя — многоугольная (шестиугольная) плашка только с иконкой.
// Данные приходят в любом user_out (поле `prefix`), а в сообщениях — `sender_prefix`.
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
  return (
    <span
      title="Префикс"
      className={`inline-flex items-center justify-center shrink-0 align-middle select-none ${className}`}
      style={{
        width: size,
        height: size * 0.9,
        backgroundColor: prefix.bg_color,
        color: prefix.color,
        clipPath:
          "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)",
        fontSize: size * 0.55,
        lineHeight: 1,
      }}
    >
      <span style={{ transform: "translateY(-1px)" }}>{icon}</span>
    </span>
  );
}
