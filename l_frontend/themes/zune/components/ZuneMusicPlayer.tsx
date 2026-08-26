"use client";

/**
 * ВСТРОЕННЫЙ ПЛЕЕР ZUNE HD — живёт внизу сайдбара (портал в колонку,
 * которую ZuneSidebar отдала под него через flex-каретку навигации).
 *
 * Плейлист захардкожен намеренно (атмосферный виджет): пять треков
 * эпохи Zune. Управление ◄◄ ▶ ►► глифами, тонкий белый прогресс,
 * квадратная обложка-градиент. На мобильных скрыт (CSS).
 *
 * Позиция воспроизведения — один атом { index, sec }: смена трека
 * и сброс времени происходят в одном setState, поэтому ни refs,
 * ни эффектов-сбросов не требуется.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PLAYER_HOST_ID } from "./ZuneSidebar";

interface Track {
  title: string;
  artist: string;
  duration: number; // сек
  cover: string; // css-градиент обложки
}

const PLAYLIST: Track[] = [
  {
    title: "Slip Into Something",
    artist: "Kinobe",
    duration: 372,
    cover: "linear-gradient(135deg,#f10da2,#ff6600)",
  },
  {
    title: "Midnight City",
    artist: "M83",
    duration: 243,
    cover: "linear-gradient(135deg,#00bfff,#26243e)",
  },
  {
    title: "La Femme d'Argent",
    artist: "Air",
    duration: 428,
    cover: "linear-gradient(135deg,#ffb400,#d43b3b)",
  },
  {
    title: "Night By Night",
    artist: "Chromeo",
    duration: 219,
    cover: "linear-gradient(135deg,#00e88f,#00796b)",
  },
  {
    title: "Get Free",
    artist: "Major Lazer",
    duration: 281,
    cover: "linear-gradient(135deg,#8b5cf6,#f10da2)",
  },
];

function fmt(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Атомарная позиция в плейлисте */
interface PlayerPos {
  index: number;
  sec: number;
}

export function ZuneMusicPlayer() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [{ index, sec }, setPos] = useState<PlayerPos>({ index: 0, sec: 0 });
  const [playing, setPlaying] = useState(false);

  const track = PLAYLIST[index];

  /* Портал в нижнюю часть сайдбара (после бренда и навигации) */
  useEffect(() => {
    let el = document.getElementById(PLAYER_HOST_ID) as HTMLElement | null;
    let attached = false; /* флаг в замыкании эффекта — стабилен, без ref */

    const ensure = (): boolean => {
      const aside = document.querySelector<HTMLElement>(
        "aside[data-zune-sidebar]"
      );
      if (!aside) return false;
      if (!el) {
        el = document.createElement("aside");
        el.id = PLAYER_HOST_ID;
        el.setAttribute("data-zune-player", "");
      }
      if (!aside.contains(el)) aside.appendChild(el);
      attached = true;
      setHost(el);
      return true;
    };

    /* Первичная попытка — асинхронно (setState не из тела эффекта),
       дальше наблюдатель перепривязывает host, только если он потерян */
    const t = window.setTimeout(ensure, 60);
    const mo = new MutationObserver(() => {
      if (!attached) {
        ensure();
        return;
      }
      const aside = document.querySelector("aside[data-zune-sidebar]");
      if (!aside || !el || !aside.contains(el)) {
        attached = false;
        setHost(null);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.clearTimeout(t);
      mo.disconnect();
      el?.remove();
      el = null;
      setHost(null);
    };
  }, []);

  /* Тик плеера: внешняя система «время» оповещает колбэком интервала.
     Автопереход на следующий трек — часть того же атомарного апдейта. */
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setPos((pos) => {
        const nextSec = pos.sec + 1;
        if (nextSec >= PLAYLIST[pos.index].duration) {
          return { index: (pos.index + 1) % PLAYLIST.length, sec: 0 };
        }
        return { ...pos, sec: nextSec };
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [playing]);

  const gotoTrack = (dir: 1 | -1) =>
    setPos((p) => ({
      index: (p.index + dir + PLAYLIST.length) % PLAYLIST.length,
      sec: 0,
    }));

  if (!host) return null;

  const progress = Math.min(100, (sec / track.duration) * 100);

  return createPortal(
    <section className="zp-player" aria-label="Zune музыкальный плеер">
      <div className="zp-cover" style={{ background: track.cover }}>
        <span className="zp-cover-glyph" aria-hidden>
          ♪
        </span>
      </div>

      <p className="zp-title">{track.title}</p>
      <p className="zp-artist">{track.artist}</p>

      <div className="zp-progress" aria-hidden>
        <div className="zp-progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <div className="zp-times">
        <span>{fmt(sec)}</span>
        <span>{fmt(track.duration)}</span>
      </div>

      <div className="zp-controls">
        <button
          type="button"
          className="zp-btn"
          onClick={() => gotoTrack(-1)}
          aria-label="Предыдущий трек"
        >
          ◄◄
        </button>
        <button
          type="button"
          className="zp-btn zp-play"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Пауза" : "Воспроизвести"}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <button
          type="button"
          className="zp-btn"
          onClick={() => gotoTrack(1)}
          aria-label="Следующий трек"
        >
          ►►
        </button>
      </div>
    </section>,
    host
  );
}
