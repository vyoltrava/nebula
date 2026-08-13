"use client";

import { useRef, useState, useEffect } from "react";
import { Play } from "lucide-react";
import { mediaUrl } from "@/lib/media";

interface VideoPlayerProps {
  src: string;
  className?: string;
}

export function VideoPlayer({
  src,
  className = "",
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [seekLabel, setSeekLabel] = useState("");
  const [hasError, setHasError] = useState(false);

  const clickTimeout = useRef<NodeJS.Timeout | null>(null);

  const seek = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;

    video.currentTime = Math.max(
      0,
      Math.min(video.duration || 0, video.currentTime + seconds)
    );

    setSeekLabel(seconds > 0 ? "+5" : "-5");

    setTimeout(() => {
      setSeekLabel("");
    }, 600);
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().then(() => {
        setIsPlaying(true);
      }).catch((err) => {
        console.error("Autoplay/Play error:", err);
        setIsPlaying(false);
      });
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const handleClick = (
    e: React.MouseEvent<HTMLDivElement>
  ) => {
    e.stopPropagation(); // Предотвращаем всплытие события

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;

    if (clickTimeout.current) {
      clearTimeout(clickTimeout.current);
      clickTimeout.current = null;

      if (x < rect.width / 2) {
        seek(-5);
      } else {
        seek(5);
      }
      return;
    }

    // Вызываем прямое действие сразу для избежания блокировки браузером Autoplay
    togglePlay();

    clickTimeout.current = setTimeout(() => {
      clickTimeout.current = null;
    }, 250);
  };

  return (
    <div
      onClick={handleClick}
      className={`
        relative
        aspect-square
        w-full
        overflow-hidden
        rounded-2xl
        bg-black
        cursor-pointer
        select-none
        ${className}
      `}
    >
      <video
        ref={videoRef}
        src={mediaUrl(src)}
        className="absolute inset-0 h-full w-full object-cover"
        playsInline
        preload="metadata"
        onEnded={() => setIsPlaying(false)}
        onError={() => setHasError(true)}
      />

      {!isPlaying && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/50 backdrop-blur-md">
            <Play
              size={28}
              fill="currentColor"
              className="ml-1 text-white"
            />
          </div>
        </div>
      )}

      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-white">
          Ошибка загрузки видео
        </div>
      )}

      {seekLabel && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="rounded-full bg-black/70 px-4 py-2 text-white font-semibold backdrop-blur-md">
            {seekLabel}s
          </div>
        </div>
      )}
    </div>
  );
}