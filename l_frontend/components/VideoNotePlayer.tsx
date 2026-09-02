"use client";
import { useEffect, useRef, useState } from "react";
import { VideoOff, Volume2, VolumeX } from "lucide-react";
import { useGlobalPlayer } from "@/components/GlobalPlayer";
import { prepareVideoPreview, VideoPreview } from "@/lib/mediaConfig";
import { useSpringScale } from "@/lib/useSpringScale";

/**
 * VideoNotePlayer — превью видеокружка в чате.
 * БЛОК 2: spring‑увеличение ровно в 2.0× (damping 12, stiffness 100, zIndex 9999, overflow visible).
 * БЛОК 3: аудио‑трек буферизуется preload="auto" и держится на паузе до клика «Слушать»,
 *         звук играет с видимого <video> (в жесте пользователя — без блокировки autoplay).
 */
export function VideoNotePlayer({ src, trackId, title }: { src: string; trackId?: string | number; title?: string }) {
  const gp = useGlobalPlayer();
  const id = trackId ?? src;
  const active = gp.track?.id === id && gp.track?.type === "video_note";
  const playing = active && gp.playing;
  const localRef = useRef<HTMLVideoElement>(null);
  const [preview, setPreview] = useState<VideoPreview | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [muted, setMuted] = useState(false);

  // БЛОК 2: пружина (web‑эквивалент Reanimated withSpring)
  const zoom = useSpringScale(1, { stiffness: 100, damping: 12 });
  const [expanded, setExpanded] = useState(false);

  // Регистрируем ВИДИМЫЙ <video> как глобальный плеер: один элемент отвечает за
  // кадры И звук (БЛОК 3) — вместо скрытого muted‑видео.
  useEffect(() => {
    const v = localRef.current;
    if (v) gp.registerVideoPlayer(v);
    return () => { gp.registerVideoPlayer(null); };
  }, [gp]);

  // I‑frame poster (веб‑аналог prepareAsync()) — кешируется в mediaConfig
  useEffect(() => {
    let ok = true;
    prepareVideoPreview(src).then((p) => { if (ok) setPreview(p); });
    return () => { ok = false; };
  }, [src]);

  // БЛОК 2: масштаб 2.0× при воспроизведении, zIndex 9999, overflow visible — не обрезается
  useEffect(() => {
    if (active && playing) { setExpanded(true); zoom.animateTo(2); }
    else { setExpanded(false); zoom.animateTo(1); }
  }, [active, playing, zoom]);

  // БЛОК 3: аудио‑буфер готов (preload="auto"), держим muted‑флагом спикера
  useEffect(() => {
    const v = localRef.current;
    if (!v) return;
    v.muted = muted;
    v.preload = "auto";
  }, [muted]);

  const fmt = (s: number) => {
    if (!isFinite(s) || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    return `${m}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
  };
  const progress = active && gp.duration ? (gp.currentTime / gp.duration) * 100 : 0;
  const dur = active ? gp.duration || preview?.duration || 0 : preview?.duration || 0;

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    gp.playTrack({ id, type: "video_note", src, title: title || "🎬 Видео-квадрат" });
    // воспроизводим с звуком внутри жеста (autoplay policy для unmuted)
    const v = localRef.current;
    if (v) { v.muted = muted; v.play().catch(() => {}); }
  };

  return (
    // overflow-visible + zIndex 9999 во время анимации — не обрезается родителем
    <div
      ref={zoom.ref as any}
      style={zoom.style}
      className={`${expanded ? "relative z-[9999]" : "relative"} overflow-visible shrink-0 w-52 h-52 sm:w-56 sm:h-56 rounded-2xl bg-black ring-1 ring-white/10`}
    >
      <button
        onClick={handlePlay}
        className="absolute inset-0 w-full h-full rounded-2xl overflow-hidden bg-black"
        title="Видео-квадрат"
      >
        <video
          ref={localRef}
          src={src}
          poster={preview?.poster || undefined}
          playsInline
          preload="auto"
          onLoadedData={() => setLoaded(true)}
          onPlaying={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        />

        {/* Спикер: активный / перечеркнутый (БЛОК 3) */}
        <button
          onClick={(e) => { e.stopPropagation(); setMuted((m) => !m); }}
          className="absolute top-1.5 right-1.5 z-10 p-1 rounded-full bg-black/60 hover:bg-black/80 text-white/80 hover:text-white transition-colors"
          title={muted ? "Включить звук" : "Выключить звук"}
        >
          {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>

        <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 text-[10px] font-mono text-gray-800 dark:text-white/80">
          {fmt(dur)}
        </span>

        {active && (
          <div className="absolute bottom-0 inset-x-0 h-1 bg-gray-100 dark:bg-white/10">
            <div className="h-full bg-[#8b5cf6] transition-all duration-200" style={{ width: `${progress}%` }} />
          </div>
        )}

        {!loaded && !failed && (
          <div className="absolute inset-0 bg-gray-50 dark:bg-[#0d0d10]">
            <div className="absolute inset-0 skeleton-shimmer" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <div className="w-11 h-11 rounded-full bg-gray-100 dark:bg-white/10 animate-pulse flex items-center justify-center">
                <Volume2 size={18} className="text-[#a78bfa]" />
              </div>
              <span className="text-[10px] font-medium text-gray-500 dark:text-white/30">Загрузка…</span>
            </div>
          </div>
        )}

        {failed && (
          <div className="absolute inset-0 bg-gray-50 dark:bg-[#0d0d10] flex flex-col items-center justify-center gap-1.5 text-gray-500 dark:text-white/30">
            <VideoOff size={20} />
            <span className="text-[10px] font-bold">видео недоступно</span>
          </div>
        )}
      </button>
    </div>
  );
}
