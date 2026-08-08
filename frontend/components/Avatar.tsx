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

  const borderClass = "border border-white/20";
  const dotSize = Math.max(8, Math.round(size * 0.28));

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {src ? (
        <img
          src={mediaUrl(src)}
          alt={name}
          style={{ width: size, height: size }}
          className={`rounded-full ${borderClass} object-cover ${className}`}
        />
      ) : (
        <div
          style={{
            width: size,
            height: size,
            background: `linear-gradient(135deg, ${gradient[0]} 0%, ${gradient[1]} 100%)`,
            fontSize: size * 0.38,
          }}
          className={`rounded-full ${borderClass} flex items-center justify-center text-white font-black tracking-wide select-none ${className}`}
          title={name}
        >
          {initials}
        </div>
      )}
      {online && (
        <span
          className="absolute bottom-0 right-0 rounded-full bg-green-500 border-2 border-[#171717] shadow-[0_0_6px_rgba(34,197,94,0.8)]"
          style={{ width: dotSize, height: dotSize }}
        />
      )}
    </div>
  );
}