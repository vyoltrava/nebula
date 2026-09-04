import Image from "next/image";
import { useState, useEffect } from "react";
import { mediaUrl } from "@/lib/media";

export function Avatar({
  src,
  name,
  size = 40,
  className = "",
  online = false,
  round = false,
}: {
  src?: string | null;
  name: string;
  id?: number;
  size?: number;
  className?: string;
  online?: boolean;
  round?: boolean; // 📢 круглый аватар (для каналов)
}) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => setImgError(false), [src]);

  // Онлайн-индикатор: грань по скруглённому углу аватарки (как у rounded-xl)
  const cornerR = 12; // радиус совпадает со скруглением аватарки (rounded-xl)
  const arm = Math.max(14, Math.round(size * 0.24)); // длина линии вдоль граней
  const lineWidth = Math.max(2, Math.round(size * 0.022)); // чуть шире
  const cornerBox = cornerR + arm; // размер охватывающей области у правого нижнего угла
  const lineColor = "#16a34a"; // чуть более тёмный зелёный (green-600)
  const cornerGlow = "rgba(22,163,74,0.45)";
  const imageUrl = src ? mediaUrl(src) : null;

  return (
    <div
      className={`relative shrink-0 inline-block ${className}`}
      style={{ width: size, height: size }}
    >
      {/* 🆕 ЗАМЕНИЛ bg-white/[0.08] НА bg-transparent, чтобы не было ложной обводки */}
      <div
        className={`w-full h-full ${round ? "rounded-full" : "rounded-xl"} overflow-hidden bg-transparent`}
        style={{ width: size, height: size }}
      >
        {imageUrl && !imgError ? (
          <Image
            src={imageUrl}
            alt={name}
            width={size}
            height={size}
            sizes={`${size}px`}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
            loading={size > 100 ? "eager" : "lazy"}
          />
        ) : imgError ? (
          <div className="w-full h-full flex items-center justify-center bg-[#1a1a1a] select-none">
            <img
              src="/default-avatar.svg"
              alt=""
              className="opacity-60"
              style={{ width: size * 0.55, height: size * 0.55 }}
            />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[#1a1a1a] select-none">
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
        <svg
          className="absolute right-0 bottom-0 pointer-events-none select-none"
          width={cornerBox}
          height={cornerBox}
          viewBox={`0 0 ${cornerBox} ${cornerBox}`}
          style={{ zIndex: 5 }}
        >
          {/* Грань по скруглённому углу аватарки: штрих вдоль правой и нижней кромки */}
          <path
            d={`M ${cornerBox} 0 L ${cornerBox} ${arm} A ${cornerR} ${cornerR} 0 0 1 ${arm} ${cornerBox} L 0 ${cornerBox}`}
            fill="none"
            stroke={lineColor}
            strokeWidth={lineWidth}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 ${lineWidth}px ${cornerGlow})` }}
          />
        </svg>
      )}
    </div>
  );
}