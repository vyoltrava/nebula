// components/SmartImage.tsx
"use client";
import { useState, useEffect } from "react";
import { ImageOff } from "lucide-react";
import { Shimmer } from "@/components/Skeletons";

interface Props {
  src?: string | null;
  alt?: string;
  wrapperClassName?: string; // форма/размер (rounded-full w-24 h-24 и т.д.)
  imgClassName?: string;     // для самой картинки
  fallback?: React.ReactNode; // что показать вместо кнопки повтора
}

export function SmartImage({ src, alt = "", wrapperClassName = "", imgClassName = "h-full w-full object-cover", fallback }: Props) {
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => { setStatus("loading"); setAttempt(0); }, [src]);

  return (
    <div className={`relative overflow-hidden bg-gray-100 dark:bg-white/5 ${wrapperClassName}`}>
      {status !== "error" && src && (
        <img
          key={attempt}
          src={src}
          alt={alt}
          onLoad={() => setStatus("ok")}
          onError={() => setStatus("error")}
          className={`${imgClassName} transition-opacity duration-300 ${status === "ok" ? "opacity-100" : "opacity-0"}`}
        />
      )}

      {status === "loading" && src && <Shimmer />}

      {(status === "error" || !src) && (
        <div className="absolute inset-0 flex items-center justify-center">
          {fallback ?? (
            <button
              onClick={() => { setStatus("loading"); setAttempt((a) => a + 1); }}
              className="flex flex-col items-center gap-1 text-gray-500 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60 transition-colors"
              title="Повторить"
            >
              <ImageOff size={18} />
              <span className="text-[9px] font-bold">не загрузилось</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}