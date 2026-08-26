"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ZuneNavigation from "@/components/ZuneNavigation";
import ZuneGiantHeader from "@/components/zune/ZuneGiantHeader";
import "@/components/zune/zune-theme.css";

/* ============================================================
   ZUNE PHONE DESIGN SYSTEM — демо-экран «Overscan / Bleed»
   /zune — изолированная тема, стили основного приложения
   не затрагиваются (всё внутри .zune-theme).
   ============================================================ */

type SectionId = "playlists" | "albums" | "artists";

interface Track {
  id: number;
  title: string;
  meta: string;
  duration: string;
}

const SECTIONS: { id: SectionId; title: string; accent: string }[] = [
  { id: "playlists", title: "PLAY", accent: "LISTS" },
  { id: "albums", title: "AL", accent: "BUMS" },
  { id: "artists", title: "ART", accent: "ISTS" },
];

const LIBRARY: Record<SectionId, Track[]> = {
  playlists: [
    { id: 1, title: "Zune Origins — Mixtape", meta: "24 трека", duration: "1:42" },
    { id: 2, title: "Metro Night Drive", meta: "18 треков", duration: "3:07" },
    { id: 3, title: "Squircle & Squares", meta: "12 треков", duration: "4:15" },
    { id: 4, title: "Pink & Orange", meta: "31 трек", duration: "0:58" },
    { id: 5, title: "Segoe Dreams", meta: "9 треков", duration: "5:23" },
    { id: 6, title: "Overscan Anthems", meta: "16 треков", duration: "2:46" },
    { id: 7, title: "HD Radio Sessions", meta: "21 трек", duration: "3:33" },
    { id: 8, title: "Butterfly Effect", meta: "14 треков", duration: "4:02" },
  ],
  albums: [
    { id: 1, title: "Songs for the Metro", meta: "Kinect Orchestra", duration: "3:41" },
    { id: 2, title: "Tile by Tile", meta: "Live Tiles", duration: "2:59" },
    { id: 3, title: "Magenta Static", meta: "Zune HD", duration: "4:18" },
    { id: 4, title: "Brown Bag Special", meta: "Original Firmware", duration: "3:05" },
    { id: 5, title: "Scroll Parallax", meta: "Sticky Headers", duration: "2:27" },
    { id: 6, title: "Bleed the Edge", meta: "Overscan Collective", duration: "5:01" },
  ],
  artists: [
    { id: 1, title: "The Pins & Needles", meta: "7 альбомов", duration: "—" },
    { id: 2, title: "Marquee Type", meta: "3 альбома", duration: "—" },
    { id: 3, title: "Flat Squares", meta: "12 альбомов", duration: "—" },
    { id: 4, title: "Chromium Bloom", meta: "5 альбомов", duration: "—" },
    { id: 5, title: "Vector Youth", meta: "9 альбомов", duration: "—" },
  ],
};

const TOTAL_SECONDS = 214; // длительность «трека» для прогресс-ленты

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function ZunePage() {
  const [section, setSection] = useState<SectionId>("playlists");
  const [activeTrack, setActiveTrack] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(35);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const active = useMemo(
    () => SECTIONS.find((s) => s.id === section) ?? SECTIONS[0],
    [section]
  );
  const tracks = LIBRARY[section];

  /* «Проигрывание»: лента прогресса ползёт сама */
  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setInterval(() => {
      setProgress((p) => (p >= 100 ? 0 : p + 100 / TOTAL_SECONDS));
    }, 500);
    return () => window.clearInterval(timer);
  }, [playing]);

  const step = (dir: 1 | -1) => {
    const idx = SECTIONS.findIndex((s) => s.id === section);
    const next = SECTIONS[(idx + dir + SECTIONS.length) % SECTIONS.length];
    setSection(next.id);
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
  };

  return (
    <div className="zune-theme">
      {/* Скроллящаяся область: sticky-гигант + контент */}
      <div className="zt-scroll" ref={scrollerRef}>
        <ZuneGiantHeader title={active.title} accent={active.accent} scrollRef={scrollerRef} />

        {/* Переключатель разделов */}
        <div className="zt-tabs" role="tablist" aria-label="Разделы библиотеки">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={s.id === section}
              data-active={s.id === section}
              className="zt-tab"
              onClick={() => {
                setSection(s.id);
                if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
              }}
            >
              {s.title}
              {s.accent}
            </button>
          ))}
        </div>

        {/* Список: вся ширина + воздух справа (--zune-content-pad-right) */}
        <section className="zt-section" aria-label="Список раздела">
          {tracks.map((t) => (
            <button
              key={t.id}
              type="button"
              className="zt-track"
              data-active={t.id === activeTrack}
              onClick={() => {
                setActiveTrack(t.id);
                setPlaying(true);
                setProgress(0);
              }}
            >
              <span className="zt-track-num">{String(t.id).padStart(2, "0")}</span>
              <span>
                <span className="zt-track-title">{t.title}</span>
                <br />
                <span className="zt-track-meta">{t.meta}</span>
              </span>
              <span className="zt-track-meta">
                {playing && t.id === activeTrack ? "▶" : t.duration}
              </span>
            </button>
          ))}
        </section>

        <div className="zt-spacer" />
      </div>

      {/* Ползунок-«бесконечная лента»: дорожка от левого края экрана */}
      <div className="zt-ribbon">
        <input
          type="range"
          className="zt-range"
          min={0}
          max={100}
          step={0.5}
          value={progress}
          aria-label="Прогресс трека"
          onChange={(e) => setProgress(Number(e.target.value))}
          style={{ "--zune-fill": `${progress}%` } as React.CSSProperties}
        />
        <div className="zt-range-labels">
          <span>{formatTime((progress / 100) * TOTAL_SECONDS)}</span>
          <span>{formatTime(TOTAL_SECONDS)}</span>
        </div>
      </div>

      {/* Кнопки-бесконечность */}
      <ZuneNavigation
        onBack={() => step(-1)}
        onPlay={() => setPlaying((v) => !v)}
        onNext={() => step(1)}
        playing={playing}
      />
    </div>
  );
}

