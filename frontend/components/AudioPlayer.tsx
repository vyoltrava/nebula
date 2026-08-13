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
    <div className="mt-2 flex items-center gap-3 w-full max-w-sm select-none">
      <button
        onClick={toggle}
        className="shrink-0 w-10 h-10 rounded-full bg-[#8b5cf6] hover:bg-[#7c3aed] active:scale-90 text-white flex items-center justify-center transition-all shadow-[0_0_14px_rgba(139,92,246,0.35)]"
        title={playing ? "Пауза" : "Слушать"}
      >
        {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className="ml-0.5" />}
      </button>

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

      {playing && (
        <div className="flex items-end gap-[2px] h-4 shrink-0">
          {[0, 1, 2].map((i) => (
            <span key={i} className="eq-bar w-[3px] bg-[#8b5cf6] rounded-full" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      )}
    </div>
  );
}