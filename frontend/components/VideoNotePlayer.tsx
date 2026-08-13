// components/VideoNotePlayer.tsx
"use client";
import { useRef } from "react";

interface Props {
  src: string;
}

export function VideoNotePlayer({ src }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  }

  return (
    <div
      className="relative w-56 h-56 sm:w-64 sm:h-64 rounded-2xl overflow-hidden bg-black cursor-pointer select-none"
      onClick={togglePlay}
    >
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full object-cover"
        playsInline
      />
    </div>
  );
}