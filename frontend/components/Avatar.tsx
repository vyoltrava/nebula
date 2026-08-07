import { useMemo } from "react";
import { mediaUrl } from "@/lib/media";

// Палитра градиентов — каждому ID свой цвет
const GRADIENTS = [
  ["#8b5cf6", "#ec4899"], // фиолетово-розовый
  ["#3b82f6", "#06b6d4"], // сине-голубой
  ["#f59e0b", "#ef4444"], // оранжево-красный
  ["#10b981", "#3b82f6"], // зелёно-синий
  ["#ec4899", "#f59e0b"], // розово-оранжевый
  ["#06b6d4", "#8b5cf6"], // голубо-фиолетовый
  ["#ef4444", "#8b5cf6"], // красно-фиолетовый
  ["#14b8a6", "#ec4899"], // бирюзово-розовый
];

export function Avatar({
  src,
  name,
  id,
  size = 40,
  className = "",
  noLink = false,  // ← ДОБАВЛЕНО
}: {
  src?: string | null;
  name: string;
  id?: number;
  size?: number;
  className?: string;
  noLink?: boolean;  // ← ДОБАВЛЕНО
}) {
  // Определяем градиент по ID (или по имени, если ID нет)
  const gradient = useMemo(() => {
    const key = id ?? name.charCodeAt(0);
    return GRADIENTS[key % GRADIENTS.length];
  }, [id, name]);

  // Берём инициалы: первая буква имени + первая буква фамилии (если есть)
  const initials = useMemo(() => {
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] || "?";
    const second = parts[1]?.[0] || "";
    return (first + second).toUpperCase();
  }, [name]);

  const borderClass = "border border-white/20";

  if (src) {
    return (
      <img
        src={mediaUrl(src)}
        alt={name}
        style={{ width: size, height: size }}
        className={`rounded-full ${borderClass} object-cover shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${gradient[0]} 0%, ${gradient[1]} 100%)`,
        fontSize: size * 0.38,
      }}
      className={`rounded-full ${borderClass} shrink-0 flex items-center justify-center text-white font-black tracking-wide select-none ${className}`}
      title={name}
    >
      {initials}
    </div>
  );
}