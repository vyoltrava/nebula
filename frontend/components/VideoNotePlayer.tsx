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

  // Синхронизация локального видео с глобальным состоянием
  useEffect(() => {
    const v = localRef.current;
    if (!v) return;
    
    if (active && playing) {
      // Если это активный трек и он играет — запускаем локальное видео
      if (v.paused) v.play().catch(() => {});
      // Синхронизируем время, если рассинхронизировалось
      if (Math.abs(v.currentTime - gp.currentTime) > 0.3) {
        v.currentTime = gp.currentTime;
      }
    } else {
      // Если не активный или на паузе — останавливаем
      if (!v.paused) v.pause();
    }
  }, [active, playing, gp.currentTime]);

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
      {/* Видео всегда здесь, играет inline */}
      <video ref={localRef} src={src} playsInline preload="metadata" className="w-full h-full object-cover" />
      {/* Длительность */}
      <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 text-[10px] font-mono text-white/80">
        {fmt(active ? gp.duration || dur : dur)}
      </span>

      {/* Прогресс-бар снизу */}
      {active && (
        <div className="absolute bottom-0 inset-x-0 h-1 bg-white/10">
          <div className="h-full bg-red-500 transition-all duration-200" style={{ width: `${progress}%` }} />
        </div>
      )}
    </button>
  );
}