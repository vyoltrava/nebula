"use client";
import { useEffect, useRef, useState } from "react";
import { useGlobalPlayer } from "@/components/GlobalPlayer";
import { Video, VideoOff } from "lucide-react";

export function VideoNotePlayer({ src, trackId, title }: { src: string; trackId?: string | number; title?: string }) {
  const gp = useGlobalPlayer();
  const id = trackId ?? src;
  const active = gp.track?.id === id && gp.track?.type === "video_note";
  const playing = active && gp.playing;
  const localRef = useRef<HTMLVideoElement>(null);
  const [dur, setDur] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const v = localRef.current;
    if (!v) return;
    const onMeta = () => {
      setDur(v.duration || 0);
      try {
        if (v.paused && v.currentTime === 0) v.currentTime = 0.01;
      } catch {}
    };
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
      <video
        ref={localRef}
        src={src}
        playsInline
        preload="metadata"
        onLoadedData={() => setLoaded(true)}
        onPlaying={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
      {/* Длительность */}
      <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 text-[10px] font-mono text-white/80">
        {fmt(active ? gp.duration || dur : dur)}
      </span>

      {/* Прогресс-бар снизу */}
      {active && (
        <div className="absolute bottom-0 inset-x-0 h-1 bg-white/10">
          <div className="h-full bg-[#8b5cf6] transition-all duration-200" style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* 🦴 Скелет, пока видео грузится */}
      {!loaded && !failed && (
        <div className="absolute inset-0 bg-[#0d0d10]">
          <div className="absolute inset-0 skeleton-shimmer" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <div className="w-11 h-11 rounded-full bg-white/10 animate-pulse flex items-center justify-center">
              <Video size={18} className="text-[#a78bfa]" />
            </div>
            <span className="text-[10px] font-medium text-white/30">Загрузка…</span>
          </div>
        </div>
      )}

      {/* ❌ Видео не загрузилось */}
      {failed && (
        <div className="absolute inset-0 bg-[#0d0d10] flex flex-col items-center justify-center gap-1.5 text-white/30">
          <VideoOff size={20} />
          <span className="text-[10px] font-bold">видео недоступно</span>
        </div>
      )}
    </button>
  );
}