// components/VideoNotePlayer.tsx
"use client";
import { useRef, useState } from "react";
import { Play, Pause } from "lucide-react";

interface Props {
  src: string;
}

export function VideoNotePlayer({ src }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  function togglePlay() {
    if (!videoRef.current) return;
    if (playing) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setPlaying(!playing);
  }

  return (
    <div className="relative w-56 h-56 sm:w-64 sm:h-64 rounded-2xl overflow-hidden bg-black">
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full object-cover"
        onEnded={() => setPlaying(false)}
        playsInline
      />
      <button
        onClick={togglePlay}
        className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/40 transition-colors"
      >
        {playing ? (
          <Pause size={32} className="text-white" />
        ) : (
          <Play size={32} className="text-white" />
        )}
      </button>
    </div>
  );
}