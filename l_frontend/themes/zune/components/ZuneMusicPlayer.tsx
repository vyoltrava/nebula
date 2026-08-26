"use client";

/**
 * Декоративный виджет «Zune Music Player» (как в Zune HD):
 * чёрный фон, квадратная обложка, трек белым / исполнитель серым,
 * белая линия прогресса с круглым ползунком, кнопки ◄ ►► ▶ глифами.
 * Плейлист захардкожен (5 треков) — только для атмосферы.
 */

import { useEffect, useState } from "react";

const PLAYLIST = [
  { title: "Songs for the Metro", artist: "Kinect Orchestra", duration: 214 },
  { title: "Tile by Tile", artist: "Live Tiles", duration: 179 },
  { title: "Magenta Static", artist: "Zune HD", duration: 258 },
  { title: "Scroll Parallax", artist: "Sticky Headers", duration: 147 },
  { title: "Bleed the Edge", artist: "Overscan Collective", duration: 301 },
];

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface ZuneMusicPlayerProps {
  className?: string;
}

export function ZuneMusicPlayer({ className }: ZuneMusicPlayerProps) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(18);

  const track = PLAYLIST[index];

  /* Прогресс крутится быстрее реального времени — для наглядности */
  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          setIndex((i) => (i + 1) % PLAYLIST.length);
          return 0;
        }
        return p + 100 / track.duration / 2;
      });
    }, 500);
    return () => window.clearInterval(timer);
  }, [playing, track.duration]);

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setProgress(
      Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100))
    );
  };

  return (
    <section
      className={`zune-player ${className ?? ""}`}
      aria-label="Zune Music Player (декоративный)"
    >
      <div className="zune-player-label">
        <span aria-hidden>{playing ? "\uE768" : "\uE769"}</span> СЕЙЧАС ИГРАЕТ
      </div>

      <div className="zune-player-cover" role="img" aria-label="Обложка альбома" />

      <div className="zune-player-title" title={track.title}>
        {track.title}
      </div>
      <div className="zune-player-artist">{track.artist}</div>

      <div
        className="zune-progress"
        onClick={seek}
        role="slider"
        aria-label={`Позиция трека: ${fmt((progress / 100) * track.duration)}`}
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="zune-progress-line">
          <div className="zune-progress-fill" style={{ width: `${progress}%` }} />
          <div className="zune-progress-thumb" style={{ left: `${progress}%` }} />
        </div>
      </div>
      <div className="zune-player-times">
        <span>{fmt((progress / 100) * track.duration)}</span>
        <span>{fmt(track.duration)}</span>
      </div>

      <div className="zune-player-controls">
        <button
          type="button"
          className="zune-player-btn"
          aria-label="Назад"
          onClick={() => {
            setIndex((i) => (i - 1 + PLAYLIST.length) % PLAYLIST.length);
            setProgress(0);
          }}
        >
          ◄
        </button>
        <button
          type="button"
          className="zune-player-btn zune-player-btn--play"
          aria-label={playing ? "Пауза" : "Воспроизвести"}
          onClick={() => setPlaying((v) => !v)}
        >
          {playing ? "\uE769" : "\uE768"}
        </button>
        <button
          type="button"
          className="zune-player-btn"
          aria-label="Вперёд"
          onClick={() => {
            setIndex((i) => (i + 1) % PLAYLIST.length);
            setProgress(0);
          }}
        >
          ►►
        </button>
      </div>
    </section>
  );
}
