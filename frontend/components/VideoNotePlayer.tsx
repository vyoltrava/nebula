"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useGlobalPlayer } from "@/components/GlobalPlayer";

export function VideoNotePlayer({ src, trackId, title }: { src: string; trackId?: string | number; title?: string }) {
  const gp = useGlobalPlayer();
  const id = trackId ?? src;
  const active = gp.track?.id === id && gp.track?.type === "video_note";
  const playing = active && gp.playing;
  const localRef = useRef<HTMLVideoElement>(null);
  const [dur, setDur] = useState(0);
  const [poster, setPoster] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Генерируем превью (первый кадр)
  useEffect(() => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.src = src;
    
    video.addEventListener('loadeddata', () => {
      video.currentTime = 0.1;
    });
    
    video.addEventListener('seeked', () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        setPoster(canvas.toDataURL('image/jpeg', 0.7));
      }
      video.remove();
    });
    
    video.addEventListener('error', () => {
      video.remove();
    });
    
    return () => {
      video.remove();
    };
  }, [src]);

  useEffect(() => {
    const v = localRef.current;
    if (!v) return;
    const onMeta = () => setDur(v.duration || 0);
    v.addEventListener("loadedmetadata", onMeta);
    return () => v.removeEventListener("loadedmetadata", onMeta);
  }, []);

  // Показываем лоадер когда видео грузится в панели
  useEffect(() => {
    if (active && !playing) {
      setLoading(true);
      const checkLoaded = setInterval(() => {
        if (gp.duration > 0) {
          setLoading(false);
          clearInterval(checkLoaded);
        }
      }, 100);
      return () => clearInterval(checkLoaded);
    } else {
      setLoading(false);
    }
  }, [active, playing, gp.duration]);

  function fmt(s: number) {
    if (!isFinite(s) || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  const progress = active && gp.duration ? (gp.currentTime / gp.duration) * 100 : 0;

  const handleClick = () => {
    if (active && playing) {
      gp.toggle();
    } else {
      setLoading(true);
      gp.playTrack({ id, type: "video_note", src, title: title || "🎬 Видео-квадрат" });
    }
  };

  return (
    <button
      onClick={handleClick}
      className="relative w-52 h-52 sm:w-56 sm:h-56 rounded-2xl overflow-hidden bg-black ring-1 ring-white/10 active:scale-[0.98] transition-transform shrink-0"
    >
      {/* Превью (постер) */}
      {poster && (
        <img 
          src={poster} 
          alt="" 
          className="w-full h-full object-cover"
        />
      )}
      
      {/* Скрытый video для метаданных */}
      <video 
        ref={localRef} 
        src={src} 
        muted 
        playsInline 
        preload="metadata" 
        className="absolute inset-0 w-full h-full object-cover opacity-0"
      />
      
      {/* Лоадер */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <Loader2 size={32} className="text-white animate-spin" />
        </div>
      )}
      
      {/* Длительность */}
      <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 text-[10px] font-mono text-white/80">
        {fmt(active ? gp.duration || dur : dur)}
      </span>
      
      {/* Прогресс */}
      {active && (
        <div className="absolute bottom-0 inset-x-0 h-1 bg-white/10">
          <div 
            className="h-full bg-red-500 transition-all duration-200" 
            style={{ width: `${progress}%` }} 
          />
        </div>
      )}
    </button>
  );
}