"use client";

/**
 * Профиль — Zune-версия (стандартный профиль не тронут):
 *  - аватар 120px с обводкой #FF00FF;
 *  - имя 48px, тонкое начертание;
 *  - статистика: плитки в 3 колонки с белой рамкой, текст по центру;
 *  - кнопка «Редактировать»: плоская с обводкой.
 */

import { ZuneButton } from "./ZuneButton";
import { ZuneMusicPlayer } from "./ZuneMusicPlayer";

export interface ZuneProfileStats {
  posts: number;
  followers: number;
  following: number;
}

interface ZuneProfileProps {
  name: string;
  handle?: string;
  bio?: string;
  avatarUrl?: string | null;
  stats: ZuneProfileStats;
  onEdit?: () => void;
  withPlayer?: boolean;
}

const STAT_LABELS: Record<keyof ZuneProfileStats, string> = {
  posts: "постов",
  followers: "подписчиков",
  following: "подписок",
};

export function ZuneProfile({
  name,
  handle,
  bio,
  avatarUrl,
  stats,
  onEdit,
  withPlayer = false,
}: ZuneProfileProps) {
  return (
    <section className="zune-profile" aria-label={`Профиль ${name}`}>
      <header
        style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={name}
            width={120}
            height={120}
            className="zune-avatar zune-avatar-pulse"
            style={{ width: 120, height: 120 }}
          />
        ) : (
          <span
            className="zune-avatar zune-avatar-pulse"
            aria-hidden="true"
            style={{
              width: 120,
              height: 120,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#1a1a1a",
              fontSize: 44,
            }}
          >
            {"\uE77B"}
          </span>
        )}

        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 48,
              fontWeight: 300,
              lineHeight: 1.05,
              color: "#fff",
            }}
          >
            {name}
          </h1>
          {handle ? (
            <div className="zune-post-date" style={{ marginTop: 6 }}>
              {handle}
            </div>
          ) : null}
          {bio ? <p className="zune-post-text">{bio}</p> : null}
          <div style={{ marginTop: 16 }}>
            <ZuneButton variant="secondary" onClick={onEdit}>
              Редактировать
            </ZuneButton>
          </div>
        </div>
      </header>

      {/* Статистика: плитки 3 колонки */}
      <div
        className="zune-stats"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 10,
          margin: "24px 0 8px",
        }}
      >
        {(Object.keys(stats) as (keyof ZuneProfileStats)[]).map((key) => (
          <div
            key={key}
            className="zune-stat-tile zune-hoverable"
            style={{
              border: "1px solid rgba(255,255,255,0.3)",
              padding: "16px 8px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 26, fontWeight: 300 }}>{stats[key]}</div>
            <div className="zune-post-date">{STAT_LABELS[key]}</div>
          </div>
        ))}
      </div>

      {withPlayer ? <ZuneMusicPlayer /> : null}
    </section>
  );
}
