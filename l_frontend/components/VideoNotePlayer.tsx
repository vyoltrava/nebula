"use client";
import { useEffect, useRef, useState } from "react";
import { VideoOff, Volume2, VolumeX } from "lucide-react";
import { useGlobalPlayer } from "@/components/GlobalPlayer";
import { prepareVideoPreview, VideoPreview } from "@/lib/mediaConfig";

/**
 * VideoNotePlayer - превью видеокружка в чате.
 * БЛОК 2: кружок НЕ открывается в оверлее — он остаётся на своём месте в
 *   сообщении и при воспроизведении плавно слегка увеличивается
 *   (transition width/height), занимая больше места, как в Telegram.
 * БЛОК 3: аудио-трек буферизуется preload="auto", звук играет с видимого
 *   <video> в жесте пользователя (без блокировки autoplay).
 */
export function VideoNotePlayer({ src, trackId, title }: { src: string; trackId?: string | number; title?: string }) {
  const gp = useGlobalPlayer();
  const id = trackId ?? src;
  const active = gp.track?.id === id && gp.track?.type === "video_note";
  const localRef = useRef<HTMLVideoElement | null>(null);
  const [preview, setPreview] = useState<VideoPreview | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [muted, setMuted] = useState(false);

  // Колбэк-реф: регистрирует <video> в глобальном плеере при любом маунте
  // (в т.ч. когда кадр переезжает в оверлей) и снимает при анмаунте.
  const attachVideo = (n: HTMLVideoElement | null) => {
    localRef.current = n;
    if (n) {
      gp.registerVideoPlayer(n);
      n.muted = muted;
      n.preload = "auto";
    } else {
      gp.registerVideoPlayer(null);
    }
  };

  // I-frame poster (веб-аналог prepareAsync()) - кешируется в mediaConfig
  useEffect(() => {
    let ok = true;
    prepareVideoPreview(src).then((p) => { if (ok) setPreview(p); });
    return () => { ok = false; };
  }, [src]);

  // БЛОК 3: mute синхронизируем с состоянием спикера
  useEffect(() => {
    const v = localRef.current;
    if (v) v.muted = muted;
  }, [muted]);

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (active && gp.playing) {
      gp.toggle();
      const v = localRef.current;
      if (v) v.pause();
      return;
    }
    gp.playTrack({ id, type: "video_note", src, title: title || "🎬 Видео-квадрат" });
    const v = localRef.current;
    if (v) { v.muted = muted; v.play().catch(() => {}); }
  };

  const fmt = (x: number) => {
    if (!isFinite(x) || isNaN(x)) return "0:00";
    const m = Math.floor(x / 60);
    return `${m}:${Math.floor(x % 60).toString().padStart(2, "0")}`;
  };
  const progress = active && gp.duration ? (gp.currentTime / gp.duration) * 100 : 0;
  const dur = active ? gp.duration || preview?.duration || 0 : preview?.duration || 0;

  return (
    <div
      // БЛОК 2: остаёмся на своём месте, при воспроизведении плавно
      // увеличиваемся в размерах потока (без оверлея и position:fixed)
      style={{ zIndex: active ? 9999 : undefined }}
      className={`relative shrink-0 rounded-2xl bg-black ring-1 ring-white/10 overflow-visible transition-[width,height] duration-300 ease-out ${
        active
          ? "w-64 h-64 sm:w-72 sm:h-72 z-[9999]"
          : "w-52 h-52 sm:w-56 sm:h-56"
      }`}
    >
      <button
        onClick={handlePlay}
        className="absolute inset-0 w-full h-full rounded-2xl overflow-hidden bg-black"
        title="Видео-квадрат"
      >
        <video
          ref={attachVideo}
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