"use client";
import { useEffect, useState } from "react";
import { Play, Pause } from "lucide-react";
import { useGlobalPlayer } from "@/components/GlobalPlayer";

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
    if (!active) { toggle(); return; }
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
    <div className="my-0.5 w-[230px] select-none rounded-2xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 px-3 py-2.5">
      {/* кнопка + линия */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={toggle}
          className="shrink-0 w-9 h-9 rounded-full bg-[#8b5cf6] hover:bg-[#7c3aed] active:scale-90 text-white flex items-center justify-center transition-all shadow-[0_0_10px_rgba(139,92,246,0.3)]"
          title={playing ? "Пауза" : "Слушать"}
        >
          {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
        </button>

        <div className="flex-1 h-1 bg-gray-100 dark:bg-white/15 rounded-full cursor-pointer group" onClick={seek}>
          <div
            className={`h-full rounded-full relative ${playing ? "audio-line-live" : "bg-[#8b5cf6]"}`}
            style={{ width: `${progress}%` }}
          >
            <span
              className={`absolute -right-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[#a78bfa] shadow-[0_0_6px_rgba(139,92,246,0.8)] transition-opacity ${
                playing ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              }`}
            />
          </div>
        </div>
      </div>

      {/* время: слева прошло, справа всего */}
      <div className="flex items-center justify-between mt-1.5 pl-[46px] text-[10px] font-mono tabular-nums text-gray-500 dark:text-white/40">
        <span className={playing ? "text-[#a78bfa]" : ""}>{fmt(currentTime)}</span>
        <span>{fmt(total)}</span>
      </div>
    </div>
  );
}