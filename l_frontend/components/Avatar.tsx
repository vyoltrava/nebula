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
  id?: number;
  size?: number;
  className?: string;
  online?: boolean;
}) {
  const dotSize = Math.max(6, Math.round(size * 0.13));
  const imageUrl = src ? mediaUrl(src) : null;

  return (
    <div
      className={`relative shrink-0 inline-block ${className}`}
      style={{ width: size, height: size }}
    >
      <div
        className="w-full h-full rounded-xl overflow-hidden bg-white/[0.08]"
        style={{ width: size, height: size }}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="w-full h-full object-cover"
            onError={(e) => {
              // Если картинка не загрузилась — показываем заглушку
              e.currentTarget.style.display = 'none';
              e.currentTarget.parentElement!.innerHTML = `
                <div class="w-full h-full flex items-center justify-center text-white/40 select-none">
                  <img src="/default-avatar.svg" alt="" class="opacity-60" style="width: ${size * 0.55}px; height: ${size * 0.55}px;" />
                </div>
              `;
            }}
          />
        ) : (
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

      {online && (
        <span
          className="absolute rounded-full bg-green-500 border-2 border-[#171717] shadow-[0_0_4px_rgba(34,197,94,0.6)]"
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