import { mediaUrl } from "@/lib/media";

export function Avatar({
  src,
  name,
  size = 40,
  className = "",
  online = false,
}: {
  src?: string | null;
  name: string;
  id?: number; // оставлен для совместимости пропсов, но больше не используется
  size?: number;
  className?: string;
  online?: boolean;
}) {
  const dotSize = Math.max(6, Math.round(size * 0.13));

  return (
    <div
      className={`relative shrink-0 inline-block ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Контейнер аватарки */}
      <div
        className="w-full h-full rounded-full overflow-hidden bg-white/[0.08]"
        style={{ width: size, height: size }}
      >
        {src ? (
          <img
            src={mediaUrl(src)}
            alt={name}
            className="w-full h-full object-cover"
          />
        ) : (
          /* Стандартная SVG-заглушка вместо градиента */
          <div className="w-full h-full flex items-center justify-center text-white/40 select-none">
            <img 
              src="/default-avatar.svg" 
              alt="" 
              className="opacity-60"
              style={{ width: size * 0.55, height: size * 0.55 }}
            />
          </div>
        )}
      </div>

      {/* Индикатор онлайна */}
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