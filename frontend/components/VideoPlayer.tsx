"use client";

import { useRef, useState } from "react";
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

  const tapTimeout = useRef<NodeJS.Timeout | null>(null);

  const showSeek = (text: string) => {
    setSeekLabel(text);

    setTimeout(() => {
      setSeekLabel("");
    }, 700);
  };

  const seek = (seconds: number) => {
    const video = videoRef.current;

    if (!video) return;

    video.currentTime = Math.max(
      0,
      Math.min(video.duration, video.currentTime + seconds)
    );

    showSeek(seconds > 0 ? "+5s" : "-5s");
  };

  const togglePlay = () => {
    const video = videoRef.current;

    if (!video) return;

    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const handleTap = (
    e: React.MouseEvent<HTMLDivElement>
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;

    if (tapTimeout.current) {
      clearTimeout(tapTimeout.current);
      tapTimeout.current = null;

      if (x < rect.width / 2) {
        seek(-5);
      } else {
        seek(5);
      }

      return;
    }

    tapTimeout.current = setTimeout(() => {
      togglePlay();
      tapTimeout.current = null;
    }, 220);
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLDivElement>
  ) => {
    if (e.key === "ArrowLeft") {
      seek(-5);
    }

    if (e.key === "ArrowRight") {
      seek(5);
    }

    if (e.key === " ") {
      e.preventDefault();
      togglePlay();
    }
  };

  return (
    <div
      tabIndex={0}
      onClick={handleTap}
      onKeyDown={handleKeyDown}
      className={`
        relative
        aspect-square
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
      />

      {!isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <div className="rounded-full bg-white/90 p-5 backdrop-blur">
            <Play
              size={34}
              fill="currentColor"
              className="ml-1 text-black"
            />
          </div>
        </div>
      )}

      {seekLabel && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="rounded-full bg-black/70 px-5 py-3 text-lg font-semibold text-white backdrop-blur">
            {seekLabel}
          </div>
        </div>
      )}
    </div>
  );
}