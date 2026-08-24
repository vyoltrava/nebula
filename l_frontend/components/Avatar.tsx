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
  // Онлайн-индикатор: маленький зелёный уголок (L-линия вдоль нижней и правой грани)
  const cornerLength = Math.max(10, Math.round(size * 0.22));
  const lineWidth = Math.max(2, Math.round(size * 0.02));
  const cornerInset = Math.max(1, Math.round(size * 0.02));
  const cornerGlow = "rgba(34,197,94,0.55)";
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
          className="absolute pointer-events-none"
          style={{
            width: cornerLength,
            height: cornerLength,
            right: cornerInset,
            bottom: cornerInset,
            zIndex: 5,
          }}
        >
          {/* Вертикальная линия — вдоль правой грани */}
          <span
            className="absolute rounded-full"
            style={{
              top: 0,
              bottom: 0,
              right: 0,
              width: lineWidth,
              background: "#22c55e",
              boxShadow: `0 0 6px ${cornerGlow}`,
            }}
          />
          {/* Горизонтальная линия — вдоль нижней грани */}
          <span
            className="absolute rounded-full"
            style={{
              left: 0,
              right: 0,
              bottom: 0,
              height: lineWidth,
              background: "#22c55e",
              boxShadow: `0 0 6px ${cornerGlow}`,
            }}
          />
        </span>
      )}
    </div>
  );
}