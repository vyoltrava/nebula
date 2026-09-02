"use client";
import { useEffect, useRef, useState } from "react";
import { VideoOff, Volume2, VolumeX, X } from "lucide-react";
import { useGlobalPlayer } from "@/components/GlobalPlayer";
import { prepareVideoPreview, VideoPreview } from "@/lib/mediaConfig";
import { useSpringScale } from "@/lib/useSpringScale";

/**
 * VideoNotePlayer - превью видеокружка в чате.
 * БЛОК 2: «пузырь» с видео при просмотре увеличивается ровно в 2.0× пружиной
 *   (damping 12, stiffness 100) и показывается в fixed-оверлее поверх всех
 *   элементов (zIndex 9999), поэтому родительский overflow-hidden не обрезает.
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
  const [expanded, setExpanded] = useState(false);

  // БЛОК 2: пружина (web-эквивалент Reanimated withSpring)
  const zoom = useSpringScale(1, { stiffness: 100, damping: 12 });

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

  useEffect(() => {
    if (expanded) zoom.animateTo(2);
    else zoom.animateTo(1);
  }, [expanded, zoom]);

  const fmt = (x: number) => {
    if (!isFinite(x) || isNaN(x)) return "0:00";
    const m = Math.floor(x / 60);
    return `${m}:${Math.floor(x % 60).toString().padStart(2, "0")}`;
  };
  const progress = active && gp.duration ? (gp.currentTime / gp.duration) * 100 : 0;
  const dur = active ? gp.duration || preview?.duration || 0 : preview?.duration || 0;

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    gp.playTrack({ id, type: "video_note", src, title: title || "🎬 Видео-квадрат" });
    setExpanded(true);
    const v = localRef.current;
    if (v) { v.muted = muted; v.play().catch(() => {}); }
  };

  const closeExpand = () => {
    setExpanded(false);
    const v = localRef.current;
    if (v) v.pause();
  };// Сам «пузырь» (одна и та же разметка для инлайна и оверлея)
  const bubble = (
    <div
      ref={zoom.ref as React.Ref<HTMLDivElement>}
      style={zoom.style}
      className="relative overflow-visible shrink-0 w-52 h-52 sm:w-56 sm:h-56 rounded-2xl bg-black ring-1 ring-white/10"
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

  if (expanded) {
    return (
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        onClick={closeExpand}
        role="dialog"
        aria-modal="true"
      >
        <button
          onClick={closeExpand}
          className="absolute top-4 right-4 p-2 rounded-full bg-gray-200 dark:bg-white/10 text-gray-800 dark:text-white hover:bg-gray-300 dark:hover:bg-white/20 active:scale-90 transition-all"
          title="Закрыть"
        >
          <X size={20} />
        </button>
        <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-center">
          {bubble}
        </div>
      </div>
    );
  }

  return bubble;
}