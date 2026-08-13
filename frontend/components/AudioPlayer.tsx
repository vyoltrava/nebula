"use client";
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

  return (
    <div className="mt-2 w-full max-w-sm select-none flex items-center gap-2.5 rounded-2xl bg-[#171717] border border-[#8b5cf6]/60 px-3 py-2.5">
      {/* Кнопка play/pause — квадратная как на макете */}
      <button
        onClick={toggle}
        className="shrink-0 w-9 h-9 rounded-xl bg-[#8b5cf6] hover:bg-[#7c3aed] active:scale-90 text-white flex items-center justify-center transition-all"
        title={playing ? "Пауза" : "Слушать"}
      >
        {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
      </button>

      {/* Слева — сколько прошло */}
      <span className={`shrink-0 w-9 text-right text-[10px] font-mono tabular-nums ${playing ? "text-[#a78bfa]" : "text-white/50"}`}>
        {fmt(currentTime)}
      </span>

      {/* Живая линия */}
      <div className="flex-1 h-[3px] bg-white/10 rounded-full cursor-pointer group" onClick={seek}>
        <div
          className={`h-full rounded-full relative ${playing ? "audio-line-live" : "bg-[#8b5cf6]"}`}
          style={{ width: `${progress}%` }}
        >
          {/* пульсирующая головка */}
          <span
            className={`absolute -right-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[#a78bfa] shadow-[0_0_8px_rgba(139,92,246,0.9)] transition-opacity ${
              playing ? "opacity-100 animate-pulse" : "opacity-0 group-hover:opacity-100"
            }`}
          />
        </div>
      </div>

      {/* Справа — общая длительность */}
      <span className="shrink-0 w-9 text-[10px] font-mono tabular-nums text-white/50">
        {fmt(duration)}
      </span>
    </div>
  );
}