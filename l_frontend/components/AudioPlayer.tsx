"use client";
import { useEffect, useState } from "react";
import { Play, Pause } from "lucide-react";
import { useGlobalPlayer } from "@/components/GlobalPlayer";
import { SineWaveform } from "@/components/SineWaveform";

/**
 * AudioPlayer — голосовое сообщение.
 * БЛОК 4: «ugly rectangle» заменён на плавную симметричную синусоидальную волну
 * (одна непрерывная bezier‑кривая, анимируется в реальном времени).
 */
export function AudioPlayer({ src, trackId, title }: { src: string; trackId?: string | number; title?: string }) {
  const gp = useGlobalPlayer();
  const id = trackId ?? src;
  const active = gp.track?.id === id && gp.track?.type === "audio";
  const playing = active && gp.playing;
  const currentTime = active ? gp.currentTime : 0;
  const duration = active ? gp.duration : 0;
  const progress = duration ? (currentTime / duration) * 100 : 0;
  const [dur, setDur] = useState(0);

  // узнаём длительность без воспроизведения
  useEffect(() => {
    const a = document.createElement("audio");
    a.preload = "metadata";
    a.src = src;
    const onMeta = () => {
      if (isFinite(a.duration)) setDur(a.duration || 0);
    };
    a.addEventListener("loadedmetadata", onMeta);
    return () => a.removeEventListener("loadedmetadata", onMeta);
  }, [src]);

  function toggle() {
    gp.playTrack({ id, type: "audio", src, title: title || "🎙️ Голосовое сообщение" });
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    if (!active) {
      toggle();
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    gp.seekTo(Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1));
  }

  function fmt(s: number) {
    if (!isFinite(s) || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  const total = duration || dur;

  return (
    <div className="my-1 w-[230px] select-none rounded-2xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 px-3 py-2">
      {/* кнопка + волна */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={toggle}
          className="shrink-0 w-9 h-9 rounded-full bg-[#8b5cf6] hover:bg-[#7c3aed] active:scale-90 text-white flex items-center justify-center transition-all shadow-[0_0_10px_rgba(139,92,246,0.3)]"
          title={playing ? "Пауза" : "Слушать"}
        >
          {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
        </button>

        {/* БЛОК 4: плавная симметричная синусоида — одна непрерывная линия, а не прямоугольник */}
        <div className="flex-1 h-7 cursor-pointer" onClick={seek}>
          <SineWaveform
            src={src}
            analyserRef={gp.analyserRef}
            playing={playing}
            progress={progress / 100}
            height={24}
          />
        </div>
      </div>

      {/* время: слева прошло, справа всего */}
      <div className="flex items-center justify-between mt-1 pl-[46px] text-[10px] font-mono tabular-nums text-gray-500 dark:text-white/40">
        <span className={playing ? "text-[#a78bfa]" : ""}>{fmt(currentTime)}</span>
        <span>{fmt(total)}</span>
      </div>
    </div>
  );
}
