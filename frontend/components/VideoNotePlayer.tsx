"use client";
import { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
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
      <video ref={localRef} src={src} muted playsInline preload="metadata" className="w-full h-full object-cover" />

      {/* оверлей play/pause */}
      <div className={`absolute inset-0 flex items-center justify-center transition-colors ${playing ? "bg-black/10" : "bg-black/30"}`}>
        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white transition-all ${playing ? "bg-black/40 opacity-0 hover:opacity-100" : "bg-black/50"}`}>
          {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
        </div>
      </div>

      {/* длительность */}
      <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 text-[10px] font-mono text-white/80">
        {fmt(active ? gp.duration || dur : dur)}
      </span>

      {/* индикатор что играет в панели */}
      {active && (
        <div className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/60">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[9px] font-bold text-white/80">в панели</span>
        </div>
      )}

      {/* прогресс */}
      {active && (
        <div className="absolute bottom-0 inset-x-0 h-1 bg-white/10">
          <div className="h-full bg-red-500 transition-all duration-200" style={{ width: `${progress}%` }} />
        </div>
      )}
    </button>
  );
}