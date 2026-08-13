"use client";
import { useEffect, useRef, useState } from "react";
import { useGlobalPlayer } from "@/components/GlobalPlayer";

export function VideoNotePlayer({ src, trackId, title }: { src: string; trackId?: string | number; title?: string }) {
  const gp = useGlobalPlayer();
  const id = trackId ?? src;
  const active = gp.track?.id === id && gp.track?.type === "video_note";
  const playing = active && gp.playing;
  const localRef = useRef<HTMLVideoElement>(null);
  const [dur, setDur] = useState(0);

  useEffect(() => {
    const v = localRef.current;
    if (!v) return;
    const onMeta = () => setDur(v.duration || 0);
    v.addEventListener("loadedmetadata", onMeta);
    return () => v.removeEventListener("loadedmetadata", onMeta);
  }, []);

  function fmt(s: number) {
    if (!isFinite(s) || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  const progress = active && gp.duration ? (gp.currentTime / gp.duration) * 100 : 0;

  return (
    <button
      onClick={() => gp.playTrack({ id, type: "video_note", src, title: title || "🎬 Видео-квадрат" })}
      className="relative w-52 h-52 sm:w-56 sm:h-56 rounded-2xl overflow-hidden bg-black ring-1 ring-white/10 active:scale-[0.98] transition-transform shrink-0"
    >
      <video ref={localRef} src={src} muted playsInline preload="auto" crossOrigin="anonymous" className="w-full h-full object-cover" />

      {/* длительность */}
      <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 text-[10px] font-mono text-white/80">
        {fmt(active ? gp.duration || dur : dur)}
      </span>

      {/* прогресс — только когда играет в панели */}
      {active && (
        <div className="absolute bottom-0 inset-x-0 h-1 bg-white/10">
          <div className="h-full bg-red-500 transition-all duration-200" style={{ width: `${progress}%` }} />
        </div>
      )}
    </button>
  );
}