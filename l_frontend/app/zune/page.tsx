"use client";

import { useMemo, useState } from "react";
import {
  MDL2,
  ZuneButton,
  ZuneFeedWrapper,
  ZuneHeader,
  ZuneInput,
  ZuneModal,
  ZuneMusicPlayer,
  ZuneNavigation,
  ZuneProfile,
  ZuneSidebar,
  type ZuneNavItem,
  type ZunePostData,
} from "@/themes/zune";
import { useZuneTheme } from "@/themes/zune/hooks/useZuneTheme";

/* ============================================================
   ZUNE THEME — витрина (/zune).
   Показывает все Zune-компоненты. Стандартные файлы не тронуты:
   страница — новый маршрут, подключённый через themes/zune.
   ============================================================ */

const NAV_ITEMS: ZuneNavItem[] = [
  { href: "/zune", label: "ЛЕНТА", glyph: MDL2.home },
  { href: "/messages", label: "СООБЩЕНИЯ", glyph: MDL2.message },
  { href: "/suggestions", label: "ДРУЗЬЯ", glyph: MDL2.contact },
  { href: "/settings", label: "НАСТРОЙКИ", glyph: MDL2.settings },
];

const POSTS: ZunePostData[] = [
  {
    id: 1,
    author: { name: "Metro Fan", avatarUrl: null },
    createdAt: "2 ч назад",
    text: "Content before chrome. Никаких теней — только типографика и воздух. Плитки живые, обводка пульсирует раз в 3 секунды.",
    likes: 42,
    comments: 7,
    liked: false,
  },
  {
    id: 2,
    author: { name: "Segoe UI", avatarUrl: null },
    createdAt: "5 ч назад",
    text: "Заголовок раздела уходит за левый край экрана на −20% и плавно уменьшается при скролле. Это Panorama, детка.",
    likes: 128,
    comments: 24,
    liked: true,
  },
  {
    id: 3,
    author: { name: "Zune HD", avatarUrl: null },
    createdAt: "вчера",
    text: "Пружинящая кривая cubic-bezier(0.68, -0.55, 0.27, 1.55) делает интерфейс жидким. Motion as feedback!",
    likes: 77,
    comments: 13,
    liked: false,
  },
];

const PROFILE = {
  name: "Пользователь Zune",
  handle: "@zune.fan",
  bio: "Люблю плоский дизайн, мадженту и Segoe UI Light.",
};

function fmtTotal(posts: ZunePostData[]): string {
  const likes = posts.reduce((acc, p) => acc + (p.likes ?? 0), 0);
  return `${posts.length} постов · ${likes} отметок «нравится»`;
}

export default function ZuneDemoPage() {
  const [posts, setPosts] = useState<ZunePostData[]>(POSTS);
  const [modalOpen, setModalOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const { isZuneTheme } = useZuneTheme();

  const subtitle = useMemo(() => fmtTotal(posts), [posts]);

  const like = (id: ZunePostData["id"]) =>
    setPosts((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, liked: !p.liked, likes: (p.likes ?? 0) + (p.liked ? -1 : 1) }
          : p
      )
    );

  return (
    <div className="zune-layout">
      {/* ─── САЙДБАР: белый Hub + плеер в подвале ─── */}
      <ZuneSidebar
        items={NAV_ITEMS}
        title="ZUNE"
        footer={<ZuneMusicPlayer />}
      />

      {/* ─── КОНТЕНТ ─── */}
      <main className="zune-main">
        <div className="zune-content">
          <ZuneHeader title="ЛЕНТА" subtitle={subtitle} />

          {/* Плитки-посты: каскадный slide-up + разделители */}
          <ZuneFeedWrapper posts={posts} toZune={(p) => p} onLike={like} />

          <hr className="zune-feed-sep" style={{ margin: "28px 0" }} />

          {/* ─── КНОПКИ И ИНПУТЫ ─── */}
          <section aria-label="Элементы управления">
            <h2 className="zune-modal-title" style={{ fontSize: 32 }}>
              ЭЛЕМЕНТЫ
            </h2>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
              <ZuneButton variant="primary">Маджента</ZuneButton>
              <ZuneButton variant="secondary">Обводка</ZuneButton>
              <ZuneButton variant="ghost">Только текст</ZuneButton>
            </div>
            <div style={{ display: "grid", gap: 16, maxWidth: 420 }}>
              <ZuneInput placeholder="Ваше имя" />
              <ZuneInput type="search" placeholder="Поиск в ленте" />
            </div>
          </section>

          <hr className="zune-feed-sep" style={{ margin: "28px 0" }} />

          {/* ─── ПРОФИЛЬ ─── */}
          <section aria-label="Профиль" style={{ marginTop: 8 }}>
            <ZuneProfile
              name={PROFILE.name}
              handle={PROFILE.handle}
              bio={PROFILE.bio}
              avatarUrl={null}
              stats={{ posts: 128, followers: 1024, following: 96 }}
            />
          </section>

          {/* ─── КНОПКИ-ВЫСТУПЫ ─── */}
          <div style={{ marginTop: 32 }}>
            <ZuneNavigation onPlay={() => setPlaying((v) => !v)} playing={playing} />
          </div>

          <p className="zune-post-date" style={{ marginTop: 24 }}>
            Тема: {isZuneTheme ? "Zune Windows Phone" : "стандартная"} ·
            выключить — плавающей кнопкой справа снизу.
          </p>
        </div>
      </main>

      {/* ─── МОДАЛКА ─── */}
      <ZuneModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="О ТЕМЕ"
      >
        <p className="zune-post-text">
          Windows Phone / Zune: типографика Segoe UI, плитки Metro,
          overscan-заголовки, маджента #FF00FF и пружинящие анимации.
          Стандартные файлы проекта не изменены — вся тема живёт
          в themes/zune.
        </p>
        <div style={{ marginTop: 24 }}>
          <ZuneButton variant="primary" onClick={() => setModalOpen(false)}>
            Понятно
          </ZuneButton>
        </div>
      </ZuneModal>

      {/* Кнопка открытия модалки — плавающая слева снизу */}
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="zune-floating-toggle"
        style={{ left: 16, right: "auto" }}
        aria-label="О теме"
      >
        О теме
      </button>
    </div>
  );
}

