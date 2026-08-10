import { useMemo } from "react";
import { mediaUrl } from "@/lib/media";

const GRADIENTS = [
  ["#8b5cf6", "#ec4899"],
  ["#3b82f6", "#06b6d4"],
  ["#f59e0b", "#ef4444"],
  ["#10b981", "#3b82f6"],
  ["#ec4899", "#f59e0b"],
  ["#06b6d4", "#8b5cf6"],
  ["#ef4444", "#8b5cf6"],
  ["#14b8a6", "#ec4899"],
];

export function Avatar({
  src,
  name,
  id,
  size = 40,
  className = "",
  online = false,
}: {
  src?: string | null;
  name: string;
  id?: number;
  size?: number;
  className?: string;
  online?: boolean;
}) {
  const gradient = useMemo(() => {
    const key = id ?? name.charCodeAt(0);
    return GRADIENTS[key % GRADIENTS.length];
  }, [id, name]);

  const initials = useMemo(() => {
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] || "?";
    const second = parts[1]?.[0] || "";
    return (first + second).toUpperCase();
  }, [name]);

  const dotSize = Math.max(6, Math.round(size * 0.13));

  return (
    <div
      className={`relative shrink-0 inline-block ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Контейнер самой аватарки — тут overflow-hidden */}
      <div
        className="w-full h-full rounded-full overflow-hidden"
        style={{ width: size, height: size }}
      >
        {src ? (
          <img
            src={mediaUrl(src)}
            alt={name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-white font-black tracking-wide select-none"
            style={{
              background: `linear-gradient(135deg, ${gradient[0]} 0%, ${gradient[1]} 100%)`,
              fontSize: size * 0.38,
            }}
            title={name}
          >
            {initials}
          </div>
        )}
      </div>

      {/* Индикатор онлайна — снаружи overflow-hidden, поэтому не обрезается */}
        {online && (
          <span
            className="absolute rounded-full bg-green-500 border border-[#171717] shadow-[0_0_4px_rgba(34,197,94,0.6)]"
            style={{
              width: dotSize,
              height: dotSize,
              bottom: size * 0.01,
              right: size * 0.01,
            }}
          />
        )}
    </div>
  );
}