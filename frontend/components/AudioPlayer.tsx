"use client";
import { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";

export function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setCurrentTime(audio.currentTime);

    const onMeta = () => {
      // 🛠 Фикс бага Chrome: записи с MediaRecorder отдают duration = Infinity
      if (audio.duration === Infinity || isNaN(audio.duration)) {
        const fix = () => {
          setDuration(audio.duration);
          audio.currentTime = 0;
          audio.removeEventListener("timeupdate", fix);
        };
        audio.addEventListener("timeupdate", fix);
        audio.currentTime = 1e7;
      } else {
        setDuration(audio.duration || 0);
      }
    };

    const onEnd = () => {
      setPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnd);
      audio.pause();
    };
  }, []);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play();
      setPlaying(true);
    }
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    audio.currentTime = ratio * duration;
    setCurrentTime(audio.currentTime);
  }

  function fmt(s: number) {
    if (!isFinite(s) || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  const progress = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="mt-2 flex items-center gap-3 w-full max-w-sm select-none">
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Кнопка Play/Pause */}
      <button
        onClick={toggle}
        className="shrink-0 w-10 h-10 rounded-full bg-[#8b5cf6] hover:bg-[#7c3aed] active:scale-90 text-white flex items-center justify-center transition-all shadow-[0_0_14px_rgba(139,92,246,0.35)]"
        title={playing ? "Пауза" : "Слушать"}
      >
        {playing ? (
          <Pause size={15} fill="currentColor" />
        ) : (
          <Play size={15} fill="currentColor" className="ml-0.5" />
        )}
      </button>

      {/* Прогресс-бар + время */}
      <div className="flex-1 min-w-0">
        <div className="h-1.5 bg-white/10 rounded-full cursor-pointer group" onClick={seek}>
          <div
            className="h-full bg-gradient-to-r from-[#8b5cf6] to-[#a78bfa] rounded-full relative"
            style={{ width: `${progress}%` }}
          >
            <span className="absolute -right-1 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-white/40 font-mono">
          <span>{fmt(currentTime)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>

      {/* Эквалайзер при воспроизведении */}
      {playing && (
        <div className="flex items-end gap-[2px] h-4 shrink-0">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="eq-bar w-[3px] bg-[#8b5cf6] rounded-full"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      )}

      <style jsx>{`
        .eq-bar {
          height: 5px;
          animation: eqWave 0.8s ease-in-out infinite;
        }
        @keyframes eqWave {
          0%, 100% { height: 5px; }
          50% { height: 15px; }
        }
      `}</style>
    </div>
  );
}