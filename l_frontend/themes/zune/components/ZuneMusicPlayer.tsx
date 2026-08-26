"use client";

/**
 * Декоративный виджет «Zune Music Player» (как в Zune HD).
 * Ничего не проигрывает по-настоящему: листает захардкоженный
 * плейлист из 5 треков, крутит прогресс-ленту. Ставится в профиль
 * или сайдбар — чисто для атмосферы.
 */

import { useEffect, useState } from "react";
import { Music2 } from "lucide-react";

const PLAYLIST = [
  { title: "Kinect Orchestra — Songs for the Metro", duration: 214 },
  { title: "Live Tiles — Tile by Tile", duration: 179 },
  { title: "Zune HD — Magenta Static", duration: 258 },
  { title: "Sticky Headers — Scroll Parallax", duration: 147 },
  { title: "Overscan Collective — Bleed the Edge", duration: 301 },
];

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ZuneMusicPlayer({ className }: { className?: string }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);

  const track = PLAYLIST[index];

  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          setIndex((i) => (i + 1) % PLAYLIST.length); // следующий трек
          return 0;
        }
        return p + 100 / track.duration / 2; // ускоренно, для наглядности
      });
    }, 500);
    return () => window.clearInterval(timer);
  }, [playing, track.duration]);

  return (
    <aside
      className={`zt-player ${className ?? ""}`}
      data-zune-tile
      data-zune-animate
      aria-label="Zune Music Player (декоративный)"
    >
      <header>
        {playing ? <span className="zt-playing-dot" aria-hidden /> : <Music2 size={16} aria-hidden />}
        <span>СЕЙЧАС ИГРАЕТ</span>
      </header>

      <div className="zt-marquee" aria-live="polite">
        <span>{track.title}</span>
      </div>

      <input
        type="range"
        className="zt-range"
        min={0}
        max={100}
        step={0.5}
        value={progress}
        onChange={(e) => setProgress(Number(e.target.value))}
        style={{ "--zune-fill": `${progress}%` } as React.CSSProperties}
        aria-label={`Прогресс: ${track.title}`}
      />
      <div className="zt-range-labels">
        <span>{fmt((progress / 100) * track.duration)}</span>
        <span>{fmt(track.duration)}</span>
      </div>

      <div className="zt-nav" style={{ padding: "6px 0 0" }}>
        <button
          type="button"
          className="zt-nav-btn zt-nav-btn--bleed-left"
          onClick={() => {
            setIndex((i) => (i - 1 + PLAYLIST.length) % PLAYLIST.length);
            setProgress(0);
          }}
          aria-label="Предыдущий трек"
        >
          ◄◄
        </button>
        <button
          type="button"
          className="zt-nav-btn zt-nav-btn--center"
          onClick={() => setPlaying((v) => !v)}
          aria-pressed={playing}
        >
          {playing ? "❚❚ Пауза" : "▶ Играть"}
        </button>
        <button
          type="button"
          className="zt-nav-btn zt-nav-btn--bleed-right"
          onClick={() => {
            setIndex((i) => (i + 1) % PLAYLIST.length);
            setProgress(0);
          }}
          aria-label="Следующий трек"
        >
          ►►
        </button>
      </div>
    </aside>
  );
}
