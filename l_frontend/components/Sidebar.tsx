"use client";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useTheme } from "next-themes";
import { resolveNickColor } from "@/lib/nickGlow";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Home, Bell, Settings, LogOut, Heart, MessageCircle, UserPlus,
  AtSign, X, Shield, ShieldCheck, MessageSquare, Palette,
  Bug, Orbit, Search, Megaphone, Bookmark, ShieldAlert, Wrench, RefreshCw, Quote, ChevronLeft,
  ChevronRight, History, BookOpen, Headphones, Satellite, Crown
} from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { mediaUrl } from "@/lib/media";
import { UserRowSkeleton } from "@/components/Skeletons";
import { getToken, clearToken } from "@/lib/auth";
import { AccountSwitcher } from "@/components/AccountSwitcher";

import { BugReportModal } from "@/components/BugReportModal";
import { getCachedUser, setCachedUser, clearCachedUser, isCachedUserFresh } from "@/lib/authCache";
import { apiFetch } from "@/lib/apiFetch";
import { useUnreadCounts } from "@/lib/UnreadCountsContext";
import { useWebSocket } from "@/src/hooks/useWebSocket";
import { setLikedCache } from "@/lib/postCache";
import { useLastReadPost } from "@/src/hooks/useLastReadPost";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { useNebulaMode } from "@/lib/useNebula";
import type { MessageKey } from "@/lib/i18n";
import { BrandIcon } from "@/components/BrandIcon"; 
import { CommunityTabs } from "@/components/CommunityTabs";
import { getNotifsCache, setNotifsCache, invalidateNotifsCache } from "@/lib/notifsCache";


// НННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННН
// 🎯 КОНСТАНТЫ ОРБИТЫ
// НННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННН
const INNER_RADIUS     = 135;
const OUTER_RADIUS     = 215;
// 🆕 Радиусы для СВОБОДНОЙ орбиты (полный круг вокруг точки зажима):
// меньше базовых, чтобы круг гарантированно влезал в экран телефона
const FREE_INNER_RADIUS = 95;
const FREE_OUTER_RADIUS = 150;
const SNAP_RADIUS      = 48;
const LONG_PRESS_MS    = 250;

// 🆕 ЖЕСТЫ ОТТЯГИВАНИЯ
const PULL_BACK_THRESHOLD = 80;        // 80px влево = назад (меньше = быстрее отклик)
const SCROLL_DEAD_ZONE    = 15;        // 15px мёртвая зона
const SCROLL_MAX_SPEED = 14;
const SCROLL_SENSITIVITY = 0.06;  // максимум за ~230px
const DRAG_ACTIVATION     = 20;        // 🆕 после 20px движения — режим оттягивания

const ARC_SPAN     = Math.PI / 2;
const ARC_CENTER   = Math.PI;
const ARC_START    = ARC_CENTER - ARC_SPAN;
const ARC_END      = ARC_CENTER + ARC_SPAN;
const ARC_OFFSET_X = -40;

const FEED_MEMORY_KEY = "trelod_feed_memory";
const FEED_TOOLTIP_KEY = "trelod_feed_tooltip";

// 🛡 Блокировка выделения текста, пока открыта дуга орбиты.
// Оверлей дуги pointer-events-none, поэтому выделение надо глушить на <body>:
// иначе зажим (orbit2/Ctrl) начинает выделять текст ПОД дугой.
function setBodySelectionLock(lock: boolean) {
  if (typeof document === "undefined") return;
  const b = document.body;
  b.style.userSelect = lock ? "none" : "";
  (b.style as unknown as { webkitUserSelect?: string }).webkitUserSelect = lock ? "none" : "";
  (b.style as unknown as { WebkitTouchCallout?: string }).WebkitTouchCallout = lock ? "none" : "";
}

// НННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННН
//  Админский dropdown (desktop classic)
// НННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННН


// НННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННН
//  Мобильный админ-лист (bottom sheet)
// НННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННН


function MobileSearch({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { t } = useI18n();

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (!q.trim()) { setUsers([]); setPosts([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const token = getToken();
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/search?q=${encodeURIComponent(q)}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} }
        );
        if (res.ok) {
          const data = await res.json();
          setUsers(data.users ?? []);
          setPosts(data.posts ?? []);
        }
      } finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="fixed inset-0 z-[250] bg-paper dark:bg-[#171717] flex flex-col md:hidden">
      <div className="flex items-center gap-2 p-3 border-b border-line dark:border-white/10 shrink-0">
        <div className="flex-1 flex items-center gap-2 bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 rounded-xl px-3 py-2">
          <Search size={16} className="text-gray-500 dark:text-white/40" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("nav.peoplePostsTags")}
            className="flex-1 bg-transparent text-gray-900 dark:text-white text-sm focus:outline-none placeholder-gray-400 dark:placeholder-white/40"
          />
        </div>
        <button onClick={onClose} className="p-2 text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {users.length > 0 && (
          <div className="p-3 pb-1">
            <p className="text-[11px] font-bold uppercase text-gray-500 dark:text-white/40 mb-2">{t("search.people")}</p>
            {users.map((u) => (
              <Link key={u.id} href={`/${u.username}`} onClick={onClose}
                className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
                <Avatar src={u.avatar_url} name={u.display_name} id={u.id} size={40} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{u.display_name}</p>
                  <p className="text-xs text-gray-500 dark:text-white/40">@{u.username}</p>
                </div>
              </Link>
            ))}
          </div>
        )}

        {posts.length > 0 && (
          <div className="p-3 pt-1">
            <p className="text-[11px] font-bold uppercase text-gray-500 dark:text-white/40 mb-2">{t("search.posts")}</p>
            {posts.map((p) => (
              <button
                key={p.id}
                onClick={() => { onClose(); router.push(`/post/${p.id}`); }}
                className="w-full text-left p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 transition-colors border-b border-line dark:border-white/5"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Avatar src={p.author_avatar} name={p.author} id={p.author_id} size={24} />
                  <span className="text-xs font-bold text-gray-900 dark:text-white truncate">{p.author}</span>
                  <span className="text-[10px] text-gray-500 dark:text-white/40">{p.handle}</span>
                </div>
                <p className="text-sm text-gray-800 dark:text-white/80 line-clamp-3 whitespace-pre-wrap break-words">{p.text}</p>
                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-500 dark:text-white/40">
                  <span>❤️ {p.likes_count}</span>
                  <span>💬 {p.replies_count}</span>
                  <span>👁 {p.views_count ?? 0}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {loading && <div className="p-3"><UserRowSkeleton /><UserRowSkeleton /><UserRowSkeleton /></div>}
        {!loading && q.trim() && users.length === 0 && posts.length === 0 && (
          <p className="text-center text-gray-500 dark:text-white/40 text-sm mt-10">{t("search.nothing")}</p>
        )}
        {!q.trim() && (
          <p className="text-center text-gray-500 dark:text-white/30 text-sm mt-10">{t("search.startTypingNames")}</p>
        )}
      </div>
    </div>
  );
}


// НННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННН
// 🎛 ВАРИАНТЫ САЙДБАРА
// НННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННН
export type SidebarLayout = "classic" | "orbit" | "dock" | "orbit2" | "dock2" | "horizontal-swipe";
const LAYOUT_KEY = "trelod_sidebar_layout";

export function getSidebarLayout(): SidebarLayout {
  if (typeof window === "undefined") return "classic";
  const v = localStorage.getItem(LAYOUT_KEY);
  return v === "orbit" || v === "dock" || v === "orbit2" || v === "dock2" || v === "horizontal-swipe" ? v : "classic";
}

export function setSidebarLayout(v: SidebarLayout) {
  localStorage.setItem(LAYOUT_KEY, v);
  window.dispatchEvent(new CustomEvent("sidebar-layout-change", { detail: v }));
}


function LayoutPreview({ kind }: { kind: SidebarLayout }) {
  return (
    <div className="w-full h-16 rounded-md bg-gray-50 dark:bg-[#111114] border border-line dark:border-white/10 overflow-hidden flex">
      {kind === "classic" && (
        <>
          <div className="w-7 bg-gray-100 dark:bg-[#22222a] border-r border-line dark:border-white/10 p-1 space-y-1">
            <div className="h-1.5 w-full rounded bg-gray-200 dark:bg-white/25" />
            <div className="h-1.5 w-3/4 rounded bg-gray-100 dark:bg-white/15" />
            <div className="h-1.5 w-full rounded bg-gray-100 dark:bg-white/15" />
          </div>
          <div className="flex-1 p-1.5 space-y-1">
            <div className="h-1.5 w-full rounded bg-gray-100 dark:bg-white/10" />
            <div className="h-1.5 w-3/4 rounded bg-gray-100 dark:bg-white/10" />
          </div>
        </>
      )}
      {kind === "orbit" && (
        <div className="relative flex-1 p-1.5 space-y-1">
          <div className="absolute right-2 bottom-2 w-4 h-4 rounded-full bg-[#8b5cf6]" />
          <div className="h-1.5 w-full rounded bg-gray-100 dark:bg-white/10" />
          <div className="h-1.5 w-3/4 rounded bg-gray-100 dark:bg-white/10" />
        </div>
      )}
      {kind === "orbit2" && (
        <div className="relative flex-1 p-1.5 space-y-1">
          <div className="h-1.5 w-full rounded bg-gray-100 dark:bg-white/10" />
          <div className="h-1.5 w-3/4 rounded bg-gray-100 dark:bg-white/10" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[#8b5cf6] ring-4 ring-[#8b5cf6]/25" />
        </div>
      )}
      {kind === "dock2" && (
        <>
          <div className="w-6 bg-gray-100 dark:bg-[#22222a] border-r border-line dark:border-white/10 flex flex-col items-center justify-center gap-1">
            <div className="w-1.5 h-1.5 rounded-sm bg-[#8b5cf6] scale-125" />
            <div className="w-1.5 h-1.5 rounded-sm bg-gray-200 dark:bg-white/25" />
            <div className="w-1.5 h-1.5 rounded-sm bg-gray-100 dark:bg-white/15" />
          </div>
          <div className="flex-1 p-1.5 space-y-1">
            <div className="h-1.5 w-full rounded bg-gray-100 dark:bg-white/10" />
            <div className="h-1.5 w-3/4 rounded bg-gray-100 dark:bg-white/10" />
          </div>
        </>
      )}
      {kind === "horizontal-swipe" && (
        <div className="relative flex-1 p-1.5">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2/3 h-5 rounded-full bg-gray-100 dark:bg-[#22222a] border border-line dark:border-white/10 flex items-center justify-around px-1">
            <span className="w-2 h-2 rounded-full bg-[#8b5cf6]" />
            <span className="w-2 h-2 rounded-full bg-gray-200 dark:bg-white/25" />
            <span className="w-2 h-2 rounded-full bg-gray-200 dark:bg-white/25" />
            <span className="w-2 h-2 rounded-full bg-gray-200 dark:bg-white/25" />
          </div>
        </div>
      )}
      {kind === "dock" && (
        <>
          <div className="w-4 bg-gray-100 dark:bg-[#22222a] border-r border-line dark:border-white/10 flex flex-col items-center gap-1 py-1">
            <div className="w-2 h-2 rounded bg-gray-200 dark:bg-white/25" />
            <div className="w-2 h-2 rounded bg-gray-100 dark:bg-white/15" />
            <div className="w-2 h-2 rounded bg-gray-100 dark:bg-white/15" />
          </div>
          <div className="flex-1 p-1.5 space-y-1">
            <div className="h-1.5 w-full rounded bg-gray-100 dark:bg-white/10" />
            <div className="h-1.5 w-3/4 rounded bg-gray-100 dark:bg-white/10" />
          </div>
        </>
      )}
    </div>
  );
}

function LayoutPicker({ current, onClose, isMobile }: { current: SidebarLayout; onClose: () => void; isMobile?: boolean }) {
  const { t } = useI18n();
  // 📱 На телефоне компьютерные виды (Орбита-кнопка / Док) НЕ показываем —
  //    там всё равно мобильная версия интерфейса. Только «Классика» и «Орбита 2».
  const variants: { key: SidebarLayout; name: string; desc: string }[] = [
    { key: "classic", name: t("nav.layoutClassic"), desc: t("nav.layoutClassicDesc") },
    ...(isMobile ? [] : [
      { key: "orbit" as SidebarLayout, name: t("nav.layoutOrbit"), desc: t("nav.layoutOrbitDesc") },
      { key: "dock" as SidebarLayout, name: t("nav.layoutDock"), desc: t("nav.layoutDockDesc") },
    ]),
    { key: "orbit2", name: t("nav.layoutOrbit2"), desc: t("nav.layoutOrbit2Desc") },
    ...(isMobile ? [
      { key: "dock2" as SidebarLayout, name: t("nav.layoutDock2"), desc: t("nav.layoutDock2Desc") },
      { key: "horizontal-swipe" as SidebarLayout, name: "Horizontal Swipe", desc: "Свайп слева направо → меню замирает" },
    ] : []),
  ];
  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[310]" onClick={onClose} />
      <div className="fixed z-[311] w-[270px] max-w-[calc(100vw-24px)] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 md:left-auto md:right-3 md:translate-x-0 bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-2xl shadow-2xl p-3">
        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-sm font-black text-gray-900 dark:text-white">{t("nav.layout")}</p>
          <button onClick={onClose} className="text-gray-600 dark:text-white/50 hover:text-gray-900 dark:hover:text-white p-1"><X size={16} /></button>
        </div>
        <div className="space-y-2">
          {variants.map((v) => (
            <button
              key={v.key}
              onClick={() => setSidebarLayout(v.key)}
              className={`w-full text-left rounded-xl border p-2 transition-all ${
                current === v.key ? "border-[#8b5cf6] bg-[#8b5cf6]/10" : "border-line dark:border-white/10 bg-gray-100 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10"
              }`}
            >
              <LayoutPreview kind={v.key} />
              <p className="mt-1.5 text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                {v.name}
                {current === v.key && <span className="text-[9px] text-[#a78bfa] font-black uppercase">{t("nav.layoutActive")}</span>}
              </p>
              <p className="text-[10px] text-gray-600 dark:text-white/50 mt-0.5 leading-snug">{v.desc}</p>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-gray-500 dark:text-white/40 text-center">{t("nav.layoutHint")}</p>
        <p className="mt-1 text-[10px] text-[#8b5cf6] dark:text-[#a78bfa] text-center leading-snug">{t("nav.layoutCtrlHint")}</p>
      </div>
    </>
  );
}

// НННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННН
// 🎯 DOCK2 — «исключительно жестовый» режим (мобильные):
//    квадрат-индикатор + удержание (long press) + свайп. БЕЗ кликов.
//    Свайп вверх/вниз по квадрату → переключение страниц,
//    удержание и ведение пальца в сторону → выбор иконки,
//    отпускание → переход / закрытие.
// НННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННН
type Dock2User = {
  username?: string;
  avatar_url?: string;
  is_admin?: boolean;
  is_moderator?: boolean;
  permissions?: string[];
} | null;

type Dock2Icon = React.ComponentType<{ size?: number | string; className?: string }>;
type Dock2Item = { href: string; icon: Dock2Icon; label: string; avatar?: string };
const DOCK2_PAGE_SWIPE   = 30; // px вертикального свайпа для смены страницы
const DOCK2_SELECT_ENTER = 56; // ушёл пальцем в сторону от кнопки → режим выбора иконки
const DOCK2_PICK_DIST    = 60; // радиус «попадания» в иконку

// 🧮 Геометрия панели: ВСЕГДА по центру экрана (clamp от краёв — никогда не вылезает).
type Dock2Geom = {
  left: number; top: number; w: number; h: number;
  itemW: number; itemH: number; cols: number; rows: number;
  gap: number; pad: number; header: number;
};
function dock2GeomFor(items: Dock2Item[]): Dock2Geom | null {
  if (typeof window === "undefined") return null;
  const cols = 2;
  const rows = Math.max(1, Math.ceil(items.length / cols));
  const itemW = 84, itemH = 78, gap = 6, pad = 12, header = 34;
  const w = cols * itemW + gap * (cols - 1) + pad * 2;
  const h = rows * itemH + gap * (rows - 1) + pad * 2 + header;
  const left = Math.max(12, Math.round((window.innerWidth - w) / 2));
  const top = Math.max(12, Math.round((window.innerHeight - h) / 2));
  return { left, top, w, h, itemW, itemH, cols, rows, gap, pad, header };
}

function Dock2Wheel({
  user,
  router,
  setShowBugModal,
  setShowLayoutPicker,
  hasContinue,
  onContinue,
}: {
  user: Dock2User;
  router: ReturnType<typeof useRouter>;
  setShowBugModal: (v: boolean) => void;
  setShowLayoutPicker: (v: boolean) => void;
  hasContinue?: boolean;   // 📖 есть незаконченный пост → подсветка кнопки
  onContinue?: () => void; // 📖 двойной тап/клик → продолжить чтение
}) {
  const { t } = useI18n();
  const squareRef = useRef<HTMLDivElement>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selModeRef = useRef(false);      // 🖐 режим выбора иконки (ушёл в сторону от кнопки)
  const geomRef = useRef<Dock2Geom | null>(null); // геометрия панели для hit-теста в жестах
  const movedRef = useRef(false);        // был свайп (перемотка/выбор) — не считать тапом
  const dblTapRef = useRef(0);           // время последнего тапа (двойной тап → продолжить чтение)

  const [currentPage, setCurrentPage] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [selectedItem, setSelectedItem] = useState<number | null>(null);
  const [geom, setGeom] = useState<Dock2Geom | null>(null); // для рендера (центр экрана)

  // НННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННН
  // 🧩 Страницы-меню. Страница «Админ» добавляется только для администраторов.
  // НННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННН
  const pages = useMemo<Dock2Item[][]>(() => {
    const main: Dock2Item[] = [
      { href: "/", icon: Home, label: t("nav.home") },
      { href: "/messages", icon: MessageSquare, label: t("nav.messages") },
      { href: "/notifications", icon: Bell, label: t("nav.notifications") },
      { href: "/bookmarks", icon: Bookmark, label: t("nav.bookmarks") },
    ];

    const social: Dock2Item[] = [
      { href: "/updates", icon: Satellite, label: t("nav.community") },
      { href: "/search", icon: Search, label: t("nav.search") },
    ];
    if (user) social.push({ href: `/${user.username}`, icon: Home, label: t("nav.profile"), avatar: user.avatar_url });
    social.push({ href: "/settings", icon: Settings, label: t("nav.settings") });

    const tools: Dock2Item[] = [
      { href: "/rules", icon: Shield, label: t("nav.rules") },
      { href: "#bug", icon: Bug, label: t("nav.bugs") },
      { href: "/support", icon: Headphones, label: t("nav.support") },
      { href: "#layout", icon: Palette, label: t("nav.layout") },
    ];

    // 👑 Страница «Админ» — только для админов/модераторов.
    const admin: Dock2Item[] = [];
    if (user?.is_admin || user?.is_moderator || user?.permissions?.includes("manage_users")) {
      admin.push({
        href: "/adminnew",
        icon: user?.is_admin ? ShieldAlert : ShieldCheck,
        label: user?.is_admin ? t("nav.admin") : t("nav.moderation"),
      });
    }

    return [main, social, tools, admin].filter((p) => p.length > 0);
  }, [user, t]);

  // 🔄 Перемотка страниц (работает и ДО открытия, и В РЕЖИМЕ УДЕРЖАНИЯ)
  const flipPage = (forward: boolean) => {
    const len = Math.max(1, pages.length);
    const next = forward ? (currentPage + 1) % len : (currentPage - 1 + len) % len;
    setCurrentPage(next);
    setSelectedItem(null); // сброс выбора — иконки другой группы
    if (isActive) {
      const g = dock2GeomFor(pages[next]);
      geomRef.current = g;
      setGeom(g);
    }
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try { navigator.vibrate(10); } catch { /* noop */ }
    }
  };

  // ЖЕСТ: УДЕРЖАНИЕ → панель по центру экрана
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    startPos.current = { x: touch.clientX, y: touch.clientY };
    selModeRef.current = false;
    movedRef.current = false; // новый жест — пока не свайп
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      const g = dock2GeomFor(pages[currentPage]);
      geomRef.current = g;
      setGeom(g);
      setIsActive(true);
    }, LONG_PRESS_MS);
  };

  // ЖЕСТ: ДВИЖЕНИЕ
  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!startPos.current) return;
    const dx = touch.clientX - startPos.current.x;
    const dy = touch.clientY - startPos.current.y;

    // ── До открытия: свайп вверх/вниз по кнопке листает группы ──
    if (!isActive) {
      if (Math.abs(dy) > DOCK2_PAGE_SWIPE && Math.abs(dy) > Math.abs(dx)) {
        movedRef.current = true; // это свайп, а не тап
        flipPage(dy > 0);
        startPos.current = { x: touch.clientX, y: touch.clientY }; // сброс для следующего свайпа
      }
      return;
    }

    // ── В РЕЖИМЕ УДЕРЖАНИЯ: перемотка тоже работает, пока палец у кнопки ──
    if (!selModeRef.current) {
      if (Math.abs(dy) > DOCK2_PAGE_SWIPE && Math.abs(dy) > Math.abs(dx)) {
        movedRef.current = true;
        flipPage(dy > 0);
        startPos.current = { x: touch.clientX, y: touch.clientY };
        return;
      }
      // Ушёл в сторону от кнопки → переключаемся на выбор иконки
      if (Math.abs(dx) > DOCK2_SELECT_ENTER) { selModeRef.current = true; movedRef.current = true; }
      else return;
    }

    // ── Выбор иконки: ближайшая ячейка ЦЕНТРИРОВАННОЙ панели ──
    const g = geomRef.current;
    if (!g) return;
    let nearest = -1;
    let minDist = Infinity;
    pages[currentPage].forEach((_: Dock2Item, idx: number) => {
      const col = idx % g.cols;
      const row = Math.floor(idx / g.cols);
      const ix = g.left + g.pad + col * (g.itemW + g.gap) + g.itemW / 2;
      const iy = g.top + g.pad + g.header + row * (g.itemH + g.gap) + g.itemH / 2;
      const d = Math.sqrt((touch.clientX - ix) ** 2 + (touch.clientY - iy) ** 2);
      if (d < minDist) { minDist = d; nearest = idx; }
    });
    setSelectedItem(minDist < DOCK2_PICK_DIST ? nearest : null);
  };

  // ЖЕСТ: ОТПУСКАНИЕ (переход по выбранной иконке ИЛИ закрытие)
  const handleTouchEnd = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }

    // 📖 Двойной тап по кнопке (панель НЕ открывалась, свайпа не было) → продолжить чтение
    if (!isActive && !movedRef.current && onContinue) {
      const now = Date.now();
      if (now - dblTapRef.current < 300) {
        dblTapRef.current = 0;
        onContinue();
      } else {
        dblTapRef.current = now;
      }
    }

    if (isActive && selectedItem !== null) {
      const item = pages[currentPage][selectedItem];
      if (item) {
        if (item.href === "#bug") {
          setShowBugModal(true);
        } else if (item.href === "#layout") {
          setShowLayoutPicker(true);
        } else if (!item.href.startsWith("#")) {
          router.push(item.href);
        }
      }
    }

    setIsActive(false);
    setSelectedItem(null);
    selModeRef.current = false;
    startPos.current = null;
  };

  // ЖЕСТ: ОТМЕНА касания (жест прерван системой)
  const handleTouchCancel = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    setIsActive(false);
    setSelectedItem(null);
    selModeRef.current = false;
    startPos.current = null;
  };

  // 🏷 Заголовки групп страниц (что с чем сгруппировано)
  const groupTitles = useMemo(() => ([
    t("nav.dock2Main"),
    t("nav.dock2Content"),
    t("nav.dock2Tools"),
    t("nav.dock2Admin"),
  ]), [t]);

  return (
    <>
      {/* 🛡 Защита: при удержании перехватываем ВСЕ касания —
          объекты под панелью не реагируют на случайные тапы */}
      {isActive && (
        <div
          className="fixed inset-0 z-[98] pointer-events-auto"
          style={{ touchAction: "none" } as React.CSSProperties}
        />
      )}

      {/* Узкая вертикальная кнопка-индикатор (ВПЛОТНУЮ к правому краю, по центру высоты) */}
      <div
        ref={squareRef}
        className={`fixed z-[100] right-0 top-1/2 -translate-y-1/2 w-[16px] h-[88px] rounded-l-full border border-r-0 flex flex-col items-center justify-center gap-[5px] transition-all duration-200 ${
          isActive
            ? "border-[#8b5cf6] bg-[#8b5cf6]/25 shadow-[0_0_14px_rgba(139,92,246,0.5)]"
            : hasContinue
              ? "border-[#8b5cf6]/50 bg-[#8b5cf6]/15 shadow-[0_0_12px_rgba(139,92,246,0.45)]" // 📖 «круги на воде» — есть что дочитать
              : "border-line dark:border-white/10 bg-paper/90 dark:bg-[#171717]/90 backdrop-blur-sm shadow-sm"
        }`}
        onDoubleClick={() => { if (onContinue) onContinue(); }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        style={{
          touchAction: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
        } as React.CSSProperties}
      >
        {pages.map((page, idx) => (
          <div
            key={`pg-${idx}`}
            className={`w-1 h-1 rounded-full transition-all duration-300 ${
              currentPage === idx
                ? "bg-[#8b5cf6] scale-125"
                : "bg-gray-300 dark:bg-white/30"
            }`}
          />
        ))}
      </div>

      {/* Панель — ТОЛЬКО при удержании, ВСЕГДА по центру экрана */}
      <div
        className="fixed z-[101] pointer-events-none transition-all duration-200"
        style={{
          opacity: isActive ? 1 : 0,
          transform: isActive ? "scale(1)" : "scale(0.85)",
          left: geom?.left ?? 0,
          top: geom?.top ?? 0,
        } as React.CSSProperties}
      >
        {isActive && geom && (
          <div
            className="rounded-2xl bg-paper dark:bg-[#171717]/95 backdrop-blur-md border border-line dark:border-white/10 shadow-2xl pointer-events-none overflow-hidden"
            style={{ width: geom.w }}
          >
            {/* Заголовок группы + точки страниц */}
            <div
              className="flex items-center justify-center gap-2 border-b border-line dark:border-white/5"
              style={{ height: geom.header }}
            >
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-white/50">
                {groupTitles[currentPage] ?? ""}
              </span>
              <span className="flex gap-1">
                {pages.map((_, i) => (
                  <span
                    key={`hd-${i}`}
                    className={`w-1 h-1 rounded-full transition-all ${
                      currentPage === i ? "bg-[#8b5cf6]" : "bg-gray-300 dark:bg-white/25"
                    }`}
                  />
                ))}
              </span>
            </div>
            {/* Сетка иконок */}
            <div
              className="grid"
              style={{
                gridTemplateColumns: `repeat(${geom.cols}, ${geom.itemW}px)`,
                gap: geom.gap,
                padding: geom.pad,
                paddingTop: geom.pad - 2,
              }}
            >
              {pages[currentPage].map((item, idx) => (
                <div
                  key={item.href + idx}
                  className={`flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all duration-150 ${
                    selectedItem === idx ? "bg-[#8b5cf6]/20 scale-105" : ""
                  }`}
                  style={{ width: geom.itemW, height: geom.itemH }}
                >
                  {item.avatar ? (
                    <img
                      src={mediaUrl(item.avatar)}
                      alt=""
                      className="w-7 h-7 rounded-full object-cover ring-1 ring-line dark:ring-white/15"
                    />
                  ) : (
                    <item.icon size={24} className="text-gray-700 dark:text-white/80" />
                  )}
                  <span className="text-[9px] text-gray-600 dark:text-white/60 text-center leading-tight">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННН
// 🆕 Horizontal Swipe Nav
//    Мобильное горизонтальное меню:
//    • ОТКРЫТИЕ  — быстрый свайп слева направо в правом нижнем углу
//                  (нижние 40% экрана И правые 50%) → меню ЗАМИРАЕТ открытым.
//    • ЗАКРЫТИЕ  — быстрый свайп справа налево в любой части экрана.
//    • Пока открыто: overlay блокирует фон (скролл запрещён).
//    Используется ТОЛЬКО на мобильных (isMobile), на ПК не рендерится.
// НННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННН
const OPEN_ZONE_BOTTOM  = 0.40; // зона открытия: нижние 40% экрана
const OPEN_ZONE_RIGHT   = 0.50; // зона открытия: правые 50% экрана
const SWIPE_THRESHOLD   = 80;   // минимальная дистанция свайпа (px)
const SWIPE_VELOCITY    = 0.3;  // минимальная скорость (px/ms) — «быстрый» свайп

function HorizontalSwipeNav({ pathname, user, counts }: { pathname: string; user: any; counts: any }) {
  const router = useRouter();

  // ── Пункты меню (макс 6) ────────────────────────────────────────────
  const items = useMemo(() => {
    const base = [
      { href: "/",           icon: Home,      label: "Home" },
      { href: "/channels",   icon: Satellite, label: "Community" },
      ...(user ? [{ href: "/messages", icon: MessageSquare, label: "Messages", badge: counts?.messages }] : []),
      ...(user ? [{ href: "/notifications", icon: Bell, label: "Notifications", badge: counts?.notifications }] : []),
      { href: "/bookmarks",  icon: Bookmark,  label: "Bookmarks" },
      user
        ? { href: `/u/${user.username}`, icon: UserPlus, label: "Profile" }
        : { href: "/login", icon: UserPlus, label: "Login" },
    ];
    return base.slice(0, 6);
  }, [user, counts]);

  // ── Состояния / рефы ────────────────────────────────────────────────
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const startPos  = useRef<{ x: number; y: number } | null>(null);
  const startTime = useRef<number | null>(null);
  const isOpenRef = useRef(false); // актуальный флаг внутри слушателей документа
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 🛡 Блокировка фона: скролл + выделение + long-press контекстное меню
  const lockBody = useCallback(() => {
    if (typeof document === "undefined") return;
    const b = document.body;
    b.style.overflow = "hidden";
    b.style.userSelect = "none";
    (b.style as unknown as { webkitUserSelect?: string }).webkitUserSelect = "none";
    (b.style as unknown as { WebkitTouchCallout?: string }).WebkitTouchCallout = "none";
  }, []);

  const unlockBody = useCallback(() => {
    if (typeof document === "undefined") return;
    const b = document.body;
    b.style.overflow = "";
    b.style.userSelect = "";
    (b.style as unknown as { webkitUserSelect?: string }).webkitUserSelect = "";
    (b.style as unknown as { WebkitTouchCallout?: string }).WebkitTouchCallout = "";
  }, []);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    setSelectedIndex(null);
    isOpenRef.current = false;
    unlockBody();
  }, [unlockBody]);

  // ── ЖЕСТЫ (на document, touchmove — passive: false) ─────────────────
  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      startPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      startTime.current = Date.now();
    };

    const onTouchMove = (e: TouchEvent) => {
      // Меню открыто → не даём странице скроллиться под оверлеем.
      // Меню закрыто → НЕ мешаем скроллу (страница скроллится как обычно).
      if (isOpenRef.current) e.preventDefault();
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!startPos.current || startTime.current == null) return;
      const endPos = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
      const endTime = Date.now();
      const dx = endPos.x - startPos.current.x;
      const dy = endPos.y - startPos.current.y;
      const duration = Math.max(1, endTime - startTime.current);
      const distance = Math.sqrt(dx * dx + dy * dy);
      const velocity = distance / duration; // px per ms

      if (!isOpenRef.current) {
        // ОТКРЫТИЕ: старт в зоне правого нижнего угла + быстрый свайп вправо
        const inOpenZone =
          startPos.current.y > window.innerHeight * (1 - OPEN_ZONE_BOTTOM) &&
          startPos.current.x > window.innerWidth * (1 - OPEN_ZONE_RIGHT);
        if (inOpenZone && dx > SWIPE_THRESHOLD && velocity >= SWIPE_VELOCITY) {
          setIsOpen(true);
          isOpenRef.current = true;
          lockBody();
          if (typeof navigator !== "undefined" && navigator.vibrate) {
            try { navigator.vibrate(15); } catch { /* noop */ }
          }
        }
      } else {
        // ЗАКРЫТИЕ: свайп влево в любой части экрана
        if (dx < -SWIPE_THRESHOLD) closeMenu();
      }
      startPos.current = null;
      startTime.current = null;
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [closeMenu, lockBody]);

  // 🧹 Unmount: вернуть body в исходное состояние
  useEffect(() => {
    return () => {
      isOpenRef.current = false;
      unlockBody();
    };
  }, [unlockBody]);

  // 🧭 Смена страницы тоже закрывает меню
  useEffect(() => { closeMenu(); }, [pathname, closeMenu]);

  const handleNavigate = (href: string) => {
    closeMenu();
    router.push(href);
  };

  // ── Рендер ──────────────────────────────────────────────────────────
  return (
    <>
      {/* Индикатор зоны открытия (виден только когда меню ЗАКРЫТО) */}
      {!isOpen && (
        <div className="fixed bottom-6 right-6 z-[98] pointer-events-none">
          <span className="bg-[#8b5cf6]/80 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg animate-pulse inline-flex items-center gap-1">
            → Свайп
          </span>
        </div>
      )}

      {/* Открытое меню: overlay + горизонтальный ряд кнопок */}
      {isOpen && (
        <>
          {/* 🛡 Защита фона — рендерится ТОЛЬКО при isOpen === true */}
          <div
            className="fixed inset-0 z-[99] bg-black/40 backdrop-blur-[2px] pointer-events-auto"
            style={{ touchAction: "none" }}
            onTouchMove={(e) => e.preventDefault()}
            onClick={closeMenu}
          />
          {/* Горизонтальная панель кнопок — ЗАМИРАЕТ по центру экрана */}
          <div
            ref={containerRef}
            className="fixed left-4 right-4 top-1/2 -translate-y-1/2 z-[100] flex items-center justify-around"
          >
            {items.map((item, i) => {
              const active = pathname === item.href;
              const badge = (item as { badge?: number }).badge;
              return (
                <button
                  key={item.href}
                  onClick={() => handleNavigate(item.href)}
                  onTouchStart={() => setSelectedIndex(i)}
                  onTouchEnd={() => setTimeout(() => setSelectedIndex(null), 250)}
                  className="flex flex-col items-center"
                  style={{
                    animation: "hswipe-pop 300ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
                    animationDelay: `${i * 40}ms`,
                  }}
                >
                  <span
                    className={`relative w-14 h-14 rounded-full flex items-center justify-center border shadow-lg transition-all duration-150 ${
                      selectedIndex === i
                        ? "scale-110 bg-[#8b5cf6] text-white shadow-[0_0_20px_rgba(139,92,246,0.5)] border-[#8b5cf6]"
                        : active
                          ? "bg-[#8b5cf6]/15 text-[#8b5cf6] border-[#8b5cf6]/40"
                          : "bg-white/90 dark:bg-[#1a1a1f]/90 border-line dark:border-white/10 text-gray-700 dark:text-white/80"
                    }`}
                  >
                    <item.icon size={22} />
                    {!!badge && badge > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#ef4444] text-white text-[10px] font-black flex items-center justify-center border-2 border-white dark:border-[#1a1a1f]">
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] font-semibold mt-1 text-gray-600 dark:text-white/70">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}


// НННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННН
//  САЙДБАР
// НННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННН
export function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const { t, locale } = useI18n();
  // 🚫 Nebula: классический сайдбар НЕ должен срабатывать (жесты, орбита, смена аккаунта),
  // его место занимает NebulaSidebar через NebulaGate.
  const { isNebula } = useNebulaMode();
  const [user, setUser]               = useState<any>(() => getCachedUser());
  // 🚫 Железобетонная проверка Nebula: берём и React-состояние, и класс DOM
  //    («nebula-mode» вешает NebulaGate на <html>). Даже если стейт не успел
  //    обновиться — класс уже на месте, поэтому классическая орбита/жесты
  //    гарантированно отключатся в режиме Nebula.
  const nebulaOff = isNebula ||
    (typeof document !== "undefined" && document.documentElement.classList.contains("nebula-mode"));
  const [showNotifs, setShowNotifs]   = useState(false);
  const [notifs, setNotifs]           = useState<any[]>([]);
  const [notifsLoading, setNotifsLoading] = useState(false);
  const [showBugModal, setShowBugModal] = useState(false);
  const [showSearch, setShowSearch]     = useState(false);
  // НННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННН
// 🧠 ПАМЯТЬ ЛЕНТЫ (Logic) — ОБЪЯВЛЯЕМ РАНЬШЕ, ЧЕМ ИСПОЛЬЗУЕМ
// НННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННННН
const [hasFeedMemory, setHasFeedMemory] = useState(false);
const [showTooltip, setShowTooltip] = useState(false);
const lastTapRef = useRef(0);

useEffect(() => {
  const checkMemory = () => {
    const mem = localStorage.getItem(FEED_MEMORY_KEY);
    setHasFeedMemory(!!mem);
  };
  checkMemory();
  
  const onStorage = (e: StorageEvent) => {
    if (e.key === FEED_MEMORY_KEY) checkMemory();
  };
  
  window.addEventListener("feed-memory-save", checkMemory);
  window.addEventListener("feed-memory-clear", checkMemory);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("feed-memory-save", checkMemory);
    window.removeEventListener("feed-memory-clear", checkMemory);
    window.removeEventListener("storage", onStorage);
  };
}, []);

const triggerRestore = useCallback(() => {
  window.dispatchEvent(new CustomEvent("restore-feed-position"));
}, []);

useEffect(() => {
  if (hasFeedMemory) {
    const shown = parseInt(localStorage.getItem(FEED_TOOLTIP_KEY) || "0", 10);
    if (shown < 3) {
      setShowTooltip(true);
      const timer = setTimeout(() => {
        setShowTooltip(false);
        localStorage.setItem(FEED_TOOLTIP_KEY, String(shown + 1));
      }, 5000);
      return () => clearTimeout(timer);
    }
  } else {
    setShowTooltip(false);
  }
}, [hasFeedMemory]);

// 🆕 ННН ПОСЛЕДНИЙ ЧИТАЕМЫЙ ПОСТ ННН
const { post: lastReadPost, clear: clearLastRead } = useLastReadPost();

// 🎯 УНИВЕРСАЛЬНАЯ ФУНКЦИЯ "ПРОДОЛЖИТЬ" (приоритет: пост > память ленты)
const handleContinueClick = useCallback(() => {
  if (lastReadPost) {
    // 🎯 Клик по "Продолжить чтение" — ведём на пост с флагом ?continue=1
    // PostPage увидит флаг и почистит запись
    router.push(`/post/${lastReadPost.post_id}?continue=1`);
    // Сразу чистим локально, чтобы кнопка исчезла мгновенно (без ожидания ответа сервера)
    clearLastRead();
  } else if (hasFeedMemory) {
    triggerRestore();
  }
}, [lastReadPost, hasFeedMemory, router, clearLastRead, triggerRestore]);

// Показывать ли кнопку вообще
const showContinueButton = !!lastReadPost || hasFeedMemory;

// Конфиг кнопки (текст, иконка, тип)
const continueConfig = lastReadPost
  ? {
      icon: BookOpen,
      label: t("nav.continueReading"),
      sublabel: `${lastReadPost.author_name}: ${lastReadPost.text_preview}`,
      isPost: true,
    }
  : {
      icon: History,
      label: t("nav.continueReading"),
      sublabel: t("nav.feedPlace"),
      isPost: false,
    };

  const [wheelOpen, setWheelOpen]   = useState(false);
  const [wheelReady, setWheelReady] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [fingerPos, setFingerPos]   = useState<{ x: number; y: number } | null>(null);
  const [closing, setClosing]       = useState(false);
  // 🎯 ВСЕ жесты через ref — синхронные, без задержек React state
  const [pullingBack, setPullingBack] = useState(false);
  const [scrollVelocity, setScrollVelocity] = useState(0);
  
  const pullingBackRef = useRef(false);
  const scrollVelocityRef = useRef(0);
  const isDraggingRef = useRef(false);
  const scrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const smoothVelocityRef = useRef(0);          // 🆕 сглаженная скорость
  const scrollTargetRef = useRef<HTMLElement | null>(null); // 🆕 кэш элемента скролла
  const scrollRafRef = useRef<number>(0);       // 🆕 для requestAnimationFrame






  const buttonRef        = useRef<HTMLButtonElement>(null);
  const longPressTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressed    = useRef(false);
  const startPos         = useRef<{ x: number; y: number } | null>(null);
  const arcCenterRef     = useRef({ x: 0, y: 0 });

  const { counts, refresh } = useUnreadCounts();

  useWebSocket("post_liked", (data: any) => {
    window.dispatchEvent(new CustomEvent("like-sync", {
      detail: { post_id: data.post_id, likes_count: data.likes_count, dislikes_count: data.dislikes_count, disliked: data.disliked, liked: data.liked },
    }));
    const me = getCachedUser();
    if (me && data.liker_id === me.id) {
      setLikedCache(data.post_id, !!data.liked);
      window.dispatchEvent(new CustomEvent("like-state-sync", {
        detail: { post_id: data.post_id, liked: !!data.liked },
      }));
    }
  });

  useWebSocket("post_disliked", (data: any) => {
    window.dispatchEvent(new CustomEvent("dislike-sync", {
      detail: { post_id: data.post_id, dislikes_count: data.dislikes_count, likes_count: data.likes_count, disliked: data.disliked, liked: data.liked },
    }));
    const me = getCachedUser();
    if (me && data.disliker_id === me.id) {
      window.dispatchEvent(new CustomEvent("dislike-state-sync", {
        detail: { post_id: data.post_id, disliked: !!data.disliked },
      }));
    }
  });

  // 🆕 Реакции на посты: WS → window-событие для компонентов ленты
  useWebSocket("post_reaction", (data: any) => {
    window.dispatchEvent(new CustomEvent("reaction-sync", {
      detail: { post_id: data.post_id, reactions: data.reactions },
    }));
  });

  const [layout, setLayout] = useState<SidebarLayout>(() => getSidebarLayout());
  const [showLayoutPicker, setShowLayoutPicker] = useState(false);
  const [showOrbitSwitcher, setShowOrbitSwitcher] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    // 🔄 Поворот / resize: сбрасываем открытую орбиту — иначе координаты
    // дуги и точка касания перестают соответствовать новому вьюпорту
    const resetOrbit = () => {
      update();
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      isLongPressed.current = false;
      isDraggingRef.current = false;
      setWheelOpen(false);
      setWheelReady(false);
      setClosing(false);
      setHoveredIdx(null);
      setFingerPos(null);
      setPullingBack(false);
      setScrollVelocity(0);
      scrollVelocityRef.current = 0;
      smoothVelocityRef.current = 0;
      try { setBodySelectionLock(false); } catch {}
    };
    update();
    mq.addEventListener("change", update);
    window.addEventListener("orientationchange", resetOrbit);
    window.addEventListener("resize", resetOrbit);
    return () => {
      mq.removeEventListener("change", update);
      window.removeEventListener("orientationchange", resetOrbit);
      window.removeEventListener("resize", resetOrbit);
    };
  }, []);


  const arcParamsRef = useRef({ start: 0, end: 0, offsetX: 0, offsetY: 0, fullCircle: false });

  useEffect(() => {
    const on = (e: Event) => setLayout((e as CustomEvent).detail as SidebarLayout);
    window.addEventListener("sidebar-layout-change", on);
    return () => window.removeEventListener("sidebar-layout-change", on);
  }, []);

  type WheelItem = { href: string; icon: any; label: string; isProfile?: boolean; count?: number };

  const innerItems: WheelItem[] = [
    { href: "/", icon: Home, label: t("nav.home") },
  ];

  
  if (user) innerItems.push({ href: "/messages", icon: MessageSquare, label: t("nav.messages"), count: counts.chats });
  if (user) innerItems.push({ href: "/notifications", icon: Bell, label: t("nav.notifications"), count: counts.notifications });
  innerItems.push({ href: "/bookmarks", icon: Bookmark, label: t("nav.bookmarks") });
  if (isMobile) {
    innerItems.push({ href: "#search", icon: Search, label: t("nav.search") });
    // 🆕 Выбор вида интерфейса доступен и с телефона — прямо из орбиты
    innerItems.push({ href: "#layout", icon: Palette, label: t("nav.layout") });
  }
innerItems.push({ href: "/updates", icon: Satellite, label: t("nav.community"), count: counts.updates });
  if (user) innerItems.push({ href: `/${user.username}`, icon: Home, label: t("nav.profile"), isProfile: true });

    const outerItems: WheelItem[] = [
      { href: "/settings", icon: Settings, label: t("nav.settings") },
      { href: "/rules", icon: Shield, label: t("nav.rules") },
      { href: "#bug", icon: Bug, label: t("nav.bugs") },
      { href: "/support", icon: Headphones, label: t("nav.support") },
    ];
    if (!isMobile) {
      outerItems.push({ href: "#layout", icon: Palette, label: t("nav.layout") });
    }
  
  if (user?.is_admin || user?.is_moderator || user?.permissions?.includes("manage_users")) {
    outerItems.push({
      href: "/adminnew",
      icon: user?.is_admin ? ShieldAlert : user?.is_moderator ? ShieldCheck : Shield,
      label: user?.is_admin ? t("nav.admin") : user?.is_moderator ? t("nav.moderation") : t("nav.adminPanel"),
    });
  }
  if (user?.permissions?.includes("access_owner_panel")) {
    // 🚫 owner-panel больше не в сидебаре — вход только напрямую из админки
  }
  if (user) {
    outerItems.push({ href: "#logout", icon: LogOut, label: t("nav.logout") });
  } else {
    outerItems.push({ href: "/login", icon: Home, label: t("nav.login") });
  }

  const wheelItems = [...innerItems, ...outerItems];
  const itemLayerMap = new Map<number, { layer: "inner" | "outer"; localIdx: number }>();
  innerItems.forEach((_, i) => itemLayerMap.set(i, { layer: "inner", localIdx: i }));
  outerItems.forEach((_, i) => itemLayerMap.set(i + innerItems.length, { layer: "outer", localIdx: i }));

  const nav = [
    { href: "/",          icon: Home,      label: t("nav.home") },
    { href: "/bookmarks", icon: Bookmark,  label: t("nav.bookmarks") },
    { href: "/updates",    icon: Satellite,    label: t("nav.community") },  
    { href: "/rules",     icon: Shield,    label: t("nav.rules") },
  ];

  useEffect(() => { refresh(); }, [pathname]);

    useEffect(() => {
    const token = getToken();
    if (!token) return;
    const controller = new AbortController();
    const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");
    if (!apiUrl) return;
    // 🔄 apiFetch: при 401 сам тихо обновит access-токен через refresh-cookie
    // и повторит запрос. Раньше был голый fetch — после долгой неактивности
    // вкладки токен истекал, запрос молча падал, и сайдбар навсегда оставался
    // в виде «не залогинен».
    // Теперь: если всё-таки 401 и refresh не помог — используем кэш,
    // а не выкидываем пользователя (может быть проблема с сетью).
    apiFetch(`${apiUrl}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) {
          if (r.status === 401) {
            // Не удаляем сразу — пробуем кэш
            const cached = getCachedUser();
            if (cached) setUser(cached);
            else { clearCachedUser(); setUser(null); }
          }
          return;
        }
        const data = await r.json();
        setUser(data);
        setCachedUser(data);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.error("Failed to load user:", err);
          const cached = getCachedUser();
          if (cached) setUser(cached);
        }
      });
    return () => controller.abort();
  }, []);

  // 🔄 Возврат на вкладку после неактивности: обновляем профиль в фоне
  // (кэш мог устареть, access-токен — истечь). Стабильный колбэк — почти
  // всегда нетворк-чтение из localStorage-кэша, лишний запрос не идёт.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (isCachedUserFresh()) return;         // кэш свежий — сеть не трогаем
      if (!getToken()) return;
      apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => { if (data) { setUser(data); setCachedUser(data); } })
        .catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  function loadNotifications() {
    setShowNotifs(true); // открываем модалку сразу, данные грузятся в фоне
    const token = getToken();
    if (!token) return;
    // Мгновенно показываем закешированный список, если он свежий
    const cached = getNotifsCache();
    if (cached) {
      setNotifs(cached);
      setNotifsLoading(false);
    } else {
      setNotifsLoading(true);
    }
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (Array.isArray(data)) {
          setNotifs(data);
          setNotifsCache(data);
        }
      })
      .catch(() => {})
      .finally(() => setNotifsLoading(false));
  }

  async function markRead(id: number) {
    const token = getToken();
    if (!token) return;
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/notifications/${id}/read`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    });
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    invalidateNotifsCache();
    refresh();
  }

  async function markAllRead() {
    const token = getToken();
    if (!token) return;
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/notifications/read-all`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    });
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    invalidateNotifsCache();
    refresh();
  }

  function getNotifLink(n: any): string {
    switch (n.type) {
      case "message": return "/messages";
      case "follow": case "like": case "reply": case "mention":
        return n.actor?.id ? `/user/${n.actor.id}` : "/";
      default: return n.actor?.id ? `/user/${n.actor.id}` : "/";
    }
  }

  const getIconPos = useCallback((globalIdx: number) => {
    const info = itemLayerMap.get(globalIdx);
    if (!info) return { x: arcCenterRef.current.x, y: arcCenterRef.current.y };

    const ap    = arcParamsRef.current;
    const items  = info.layer === "inner" ? innerItems : outerItems;
    const n = items.length;

    // 🆕 Свободная орбита (полный круг) — компактные радиусы,
    //    обычная кнопка — прежние радиусы полудуги
    const radius = info.layer === "inner"
      ? (ap.fullCircle ? FREE_INNER_RADIUS : INNER_RADIUS)
      : (ap.fullCircle ? FREE_OUTER_RADIUS : OUTER_RADIUS);

    // 🔄 Полный круг: шаг 2π/n — пункты РАВНОМЕРНО ВОКРУГ зажима,
    //     первый сверху, без склейки первого и последнего.
    //    Полудуга от кнопки: как раньше — (end−start)/(n−1).
    const step  = ap.fullCircle
      ? (Math.PI * 2) / Math.max(n, 1)
      : (ap.end - ap.start) / Math.max(n - 1, 1);
    const angle = ap.start + info.localIdx * step;

    return {
      x: arcCenterRef.current.x + radius * Math.cos(angle),
      y: arcCenterRef.current.y + radius * Math.sin(angle),
    };
  }, [innerItems.length, outerItems.length]);

  const openWheelAt = useCallback((cx?: number, cy?: number) => {
    // 🚫 Nebula — классическая дуга не открывается (свежее чтение класса DOM,
    //    не зависит от устаревшего стейта в deps)
    if (typeof document !== "undefined" && document.documentElement.classList.contains("nebula-mode")) return;
    let centerX: number;
    let centerY: number;
    // 🆕 Свободное открытие (orbit2 / Ctrl): ПОЛНЫЙ КРУГ вокруг точки зажима
    const freeForm = typeof cx === "number" && typeof cy === "number";
    if (freeForm) {
      centerX = cx as number;
      centerY = cy as number;
      // Круг не должен вылезать за края экрана — поджимаем центр к вьюпорту
      if (typeof window !== "undefined") {
        const pad = FREE_OUTER_RADIUS + 12;
        centerX = Math.min(Math.max(centerX, pad), window.innerWidth - pad);
        centerY = Math.min(Math.max(centerY, pad), window.innerHeight - pad);
      }
    } else {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      centerX = rect.left + rect.width / 2 + ARC_OFFSET_X;
      centerY = rect.top + rect.height / 2;
    }

    arcParamsRef.current = freeForm
      ? {
          // 🔄 Полный круг: старт сверху, шаг 2π/n считается в getIconPos
          start: -Math.PI / 2,
          end: -Math.PI / 2 + Math.PI * 2,
          offsetX: 0,
          offsetY: 0,
          fullCircle: true,
        }
      : {
          start: ARC_START,
          end: ARC_END,
          offsetX: ARC_OFFSET_X,
          offsetY: 0,
          fullCircle: false,
        };
    arcCenterRef.current = { x: centerX, y: centerY };

    isLongPressed.current = true;
    // 🛡 Защита от выделения: снимаем уже начатое выделение и блокируем новое,
    // пока дуга открыта (возвращаем в closeWheel)
    try { window.getSelection()?.removeAllRanges(); } catch {}
    setBodySelectionLock(true);
    setWheelOpen(true);
    setClosing(false);
    setPullingBack(false);
    setScrollVelocity(0);
    isDraggingRef.current = false;
    scrollVelocityRef.current = 0;
    smoothVelocityRef.current = 0; // 🆕
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { setWheelReady(true); });
    });
  }, []);

  const closeWheel = useCallback((doAction: boolean) => {
    // 🚫 Nebula — дополнительная защита: если режим включился во время открытой дуги,
    //    просто схлопываем её без выполнения действий
    const nebulaNow = typeof document !== "undefined" && document.documentElement.classList.contains("nebula-mode");
    if (nebulaNow) { setWheelOpen(false); setWheelReady(false); setClosing(false); return; }
    // 🆕 Если тянул ВЛЕВО → router.back()
    if (pullingBack) {
      setPullingBack(false);
      setScrollVelocity(0);
      router.back();
    }
    // 🆕 Иначе обычная логика выбора пункта меню
    else if (doAction && hoveredIdx !== null) {
      const item = wheelItems[hoveredIdx];
        if (item) {
          if (item.href === "#logout") {
            // 🆕 Открываем модалку смены аккаунта вместо мгновенного выхода.
            // ⚠️ ВАЖНО: не делаем return — дуга обязана закрыться (анимация ниже),
            // иначе её touch-обработчики остаются активными и перехватывают
            // тапы по модалке (симптом: при выборе аккаунта открывается LayoutPicker
            // и меняется раскладка орбита1 → орбита2).
            setShowOrbitSwitcher(true);
          } else if (item.href === "#bug") {
            setShowBugModal(true);
          } else if (item.href === "#search") {
            setShowSearch(true);
          } else if (item.href === "#layout") {
            setShowLayoutPicker(true);
          } else {
            router.push(item.href);
          }
        }
    }
    setWheelReady(false);
    setClosing(true);
    setHoveredIdx(null);
    setFingerPos(null);
    setScrollVelocity(0);
    isDraggingRef.current = false;
    scrollVelocityRef.current = 0;
    smoothVelocityRef.current = 0; // 🆕
    setTimeout(() => {
      setWheelOpen(false);
      setClosing(false);
      isLongPressed.current = false;
      setBodySelectionLock(false); // 🛡 выделение снова разрешено
    }, 280);
  }, [hoveredIdx, wheelItems, router, pullingBack]);

  const findNearest = useCallback((px: number, py: number): number | null => {
    let minDist = Infinity;
    let nearest: number | null = null;
    for (let i = 0; i < wheelItems.length; i++) {
      const pos = getIconPos(i);
      const dx = px - pos.x;
      const dy = py - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) { minDist = dist; nearest = i; }
    }
    return minDist <= SNAP_RADIUS ? nearest : null;
  }, [wheelItems.length, getIconPos]);

  // 🆕 Ищем скроллящийся элемент (вызывается 1 раз при нажатии, не 60 раз/сек)
  const findScrollTarget = (): HTMLElement => {
    const se = document.scrollingElement as HTMLElement | null;
    if (se && se.scrollHeight > se.clientHeight) return se;
    const all = document.querySelectorAll<HTMLElement>("*");
    for (const el of all) {
      const st = window.getComputedStyle(el);
      if ((st.overflowY === "auto" || st.overflowY === "scroll") && el.scrollHeight > el.clientHeight) {
        return el;
      }
    }
    return document.documentElement;
  };

  // 🆕 ННН РЕФСЫ ДЛЯ СВОБОДНОЙ ОРБИТЫ И CTRL-РЕЖИМА ННН
  const lastMouseRef = useRef({ x: 0, y: 0 });      // последняя позиция курсора (для Ctrl)
  const suppressClickRef = useRef(false);           // гасим клик «сквозь» открытую дугу

  // 🎯 Общая точка входа жеста: кнопка орбиты, свободная орбита и Ctrl.
  // centerAtPress:
  //   false (по умолчанию) — жест с КНОПКИ: дуга-полукруг от кнопки (как было);
  //   true — orbit2 / Ctrl: ПОЛНЫЙ КРУГ вокруг точки зажима.
  const startGestureAt = useCallback((px: number, py: number, centerAtPress = false) => {
    // 🚫 Nebula — любой вход жеста классики блокируем
    if (typeof document !== "undefined" && document.documentElement.classList.contains("nebula-mode")) return;
    startPos.current = { x: px, y: py };
    // 🆕 нашли элемент скролла ОДИН раз — дальше только лёгкий scrollBy
    scrollTargetRef.current = findScrollTarget();

    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      if (centerAtPress) {
        openWheelAt(px, py);              // 🔄 полный круг вокруг точки зажима
      } else {
        openWheelAt();                    // ◗ полудуга от кнопки (прежнее поведение)
      }
      suppressClickRef.current = true;    // отпускание не должно «нажать» то, что под ним
      const idx = findNearest(px, py);
      setHoveredIdx(idx);
      setFingerPos({ x: px, y: py });
    }, LONG_PRESS_MS);
  }, [openWheelAt, findNearest]);

  const handleStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const px = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const py = "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    startGestureAt(px, py);
  }, [startGestureAt]);

  // 🖥 Следим за курсором — нужно для открытия дуги у курсора по Ctrl
  useEffect(() => {
    const track = (e: MouseEvent) => { lastMouseRef.current = { x: e.clientX, y: e.clientY }; };
    document.addEventListener("mousemove", track);
    return () => document.removeEventListener("mousemove", track);
  }, []);

  // 🛡 Страховка: если компонент размонтировали с открытой дугой — вернуть выделение
  useEffect(() => {
    return () => setBodySelectionLock(false);
  }, []);

  // 🛡 Клик «сквозь» открытую дугу гасим ОДИН раз (capture),
  //    чтобы отпускание пальца/кнопки не активировало ссылку под точкой зажима
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!suppressClickRef.current) return;
      suppressClickRef.current = false;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // 🆕 ORBIT2 («свободная орбита»): зажал В ЛЮБОМ месте экрана → выбрал → отпустил.
  //    Работает и на ПК, и на телефоне. Поля ввода исключены.
  useEffect(() => {
    if (layout !== "orbit2") return;
    const isExcluded = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      !!t.closest("input, textarea, select, [contenteditable='true'], [data-orbit-ignore]");
    const onDown = (e: MouseEvent | TouchEvent) => {
      // 🚫 Nebula — жесты классической орбиты не работают (стейт + класс DOM)
      const nebulaNow = typeof document !== "undefined" && document.documentElement.classList.contains("nebula-mode");
      if (isNebula || nebulaNow) return;
      if (wheelOpen || isLongPressed.current || longPressTimer.current) return;
      const pt = "touches" in e ? e.touches[0] : (e as MouseEvent);
      if (!pt) return;
      if (isExcluded(e.target)) return;
      startGestureAt(pt.clientX, pt.clientY, true);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [layout, wheelOpen, startGestureAt, isNebula]);

  // 🆕 CTRL-ОРБИТА НА ПК (только для вида «Орбита 2»):
  //    зажал Ctrl → меню (полный круг, как вторая орбита) ОТКРЫВАЕТСЯ СРАЗУ у курсора;
  //    просто кликаешь по пункту — выбираешь; отпустил Ctrl / Esc — закрылось.
  //    🔒 Не срабатывает над полями ввода и элементами с [data-orbit-ignore] (бары и пр.).
  useEffect(() => {
    if (isMobile) return;
    // 🎛 Ctrl-орбита имеет смысл только для «Орбиты 2» (свободная орбита);
    //    в остальных видах (классика, док) Ctrl не должен ничего открывать
    if (layout !== "orbit2") return;
    // 🚫 Nebula — Ctrl-орбита классики не работает
    const nebulaNow = () => typeof document !== "undefined" && document.documentElement.classList.contains("nebula-mode");
    const isExcludedUnderMouse = () => {
      const { x, y } = lastMouseRef.current;
      const el = document.elementFromPoint(x, y);
      return el instanceof HTMLElement &&
        !!el.closest("input, textarea, select, [contenteditable='true'], [data-orbit-ignore]");
    };
    const cancelPending = () => {
      if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isLongPressed.current) { closeWheel(false); return; }
      if (e.key !== "Control") return;
      if (e.repeat || wheelOpen || isLongPressed.current || longPressTimer.current) return;
      if (nebulaNow()) return;    // 🚫 Nebula — отключаем Ctrl-орбиту
      if (isExcludedUnderMouse()) return;   // 🔒 над полем ввода/баром — не открываем
      // Открываем СРАЗУ (без таймера долгого зажатия) — полный круг у курсора
      const { x, y } = lastMouseRef.current;
      startPos.current = { x, y };
      scrollTargetRef.current = findScrollTarget();
      openWheelAt(x, y);
      setHoveredIdx(findNearest(x, y));
      setFingerPos({ x, y });
      // ВАЖНО: suppressClickRef НЕ ставим — жест начинался без зажатия мыши,
      // поэтому обычный клик по пункту («нажал и выбрал») дойдёт до кнопки.
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== "Control") return;
      cancelPending();
      if (isLongPressed.current) closeWheel(hoveredIdx !== null);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [isMobile, layout, wheelOpen, hoveredIdx, closeWheel, openWheelAt, findNearest]);

  useEffect(() => {
    // 🚫 Nebula — глобальные обработчики жестов классики не вешаем вовсе
    const nebulaNow = typeof document !== "undefined" && document.documentElement.classList.contains("nebula-mode");
    if (isNebula || nebulaNow) return;
    const cancelTimer = () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    };

    const updateGesture = (dx: number, dy: number) => {
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      // 🎯 Горизонталь доминирует → назад
      if (dx < -PULL_BACK_THRESHOLD && absDx >= absDy * 0.7) {
        pullingBackRef.current = true;
        scrollVelocityRef.current = 0;
        setPullingBack(true);
        setScrollVelocity(0);
        return;
      }

      // 🎯 Вертикаль доминирует → скролл
      if (absDy > SCROLL_DEAD_ZONE && absDy >= absDx * 0.6) {
        pullingBackRef.current = false;
        const speed = Math.min(absDy * SCROLL_SENSITIVITY, SCROLL_MAX_SPEED);
        const velocity = dy > 0 ? -speed : speed;
        scrollVelocityRef.current = velocity;
        setPullingBack(false);
        setScrollVelocity(velocity);
        return;
      }

      // 🎯 Мёртвая зона
      pullingBackRef.current = false;
      scrollVelocityRef.current = 0;
      setPullingBack(false);
      setScrollVelocity(0);
    };

    const handleMove = (px: number, py: number) => {
      const start = startPos.current;
      if (!start) return;
      const dx = px - start.x;
      const dy = py - start.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // ННН ФАЗА 1: Таймер ещё тикает ННН
      if (longPressTimer.current) {
        if (dist > DRAG_ACTIVATION) {
          cancelTimer();
          isDraggingRef.current = true;
          updateGesture(dx, dy);
        }
        return;
      }

      // ННН ФАЗА 2: Дуга открыта — свайпы ВЫКЛЮЧЕНЫ, только выбор пункта ННН
      if (isLongPressed.current) {
        const idx = findNearest(px, py);
        setHoveredIdx(idx);
        setFingerPos({ x: px, y: py });
        return;
      }

      // ННН ФАЗА 3: Drag (меню не открывалось) ННН
      if (isDraggingRef.current) {
        updateGesture(dx, dy);
      }
    };

    const handleEnd = () => {
      cancelTimer();

      if (isDraggingRef.current) {
        if (pullingBackRef.current) {
          try {
            if (typeof window !== 'undefined' && window.history.length > 1) {
              window.history.back();
            } else {
              router.push("/");
            }
          } catch {
            router.push("/");
          }
        }
        isDraggingRef.current = false;
        pullingBackRef.current = false;
        scrollVelocityRef.current = 0;
        smoothVelocityRef.current = 0; // 🆕 — плавно остановится
        setPullingBack(false);
        setScrollVelocity(0);
        startPos.current = null;
        scrollTargetRef.current = null;
        return;
      }

      if (isLongPressed.current) {
        closeWheel(hoveredIdx !== null);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isLongPressed.current && !longPressTimer.current && !isDraggingRef.current) return;
      if (e.cancelable && (isDraggingRef.current || isLongPressed.current)) {
        e.preventDefault();
      }
      if (e.touches.length > 0) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    const onTouchEnd = () => handleEnd();
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
    const onMouseUp = () => handleEnd();

    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    document.addEventListener("touchcancel", onTouchEnd);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    return () => {
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [hoveredIdx, closeWheel, findNearest, router, isNebula]);

  // 🎯 ПЛАВНЫЙ скролл: rAF + сглаживание (нет дрожания, мягкое дотормаживание)
  useEffect(() => {
    const loop = () => {
      const target = scrollVelocityRef.current;
      const cur = smoothVelocityRef.current;
      // плавно разгоняемся/тормозим к целевой скорости (0.12 = мягкость)
      const next = cur + (target - cur) * 0.12;
      smoothVelocityRef.current = Math.abs(next) < 0.05 ? 0 : next;

      if (smoothVelocityRef.current !== 0 && scrollTargetRef.current) {
        scrollTargetRef.current.scrollBy(0, smoothVelocityRef.current);
      }
      scrollRafRef.current = requestAnimationFrame(loop);
    };
    scrollRafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(scrollRafRef.current);
  }, []);




  const icons = {
    like: <Heart size={12} fill="currentColor" />,
    reply: <MessageCircle size={12} />,
    follow: <UserPlus size={12} />,
    mention: <AtSign size={12} />,
    message: <MessageSquare size={12} />,
    login_alert: <ShieldAlert size={12} />,
    repost: <RefreshCw size={12} />,
    quote: <Quote size={12} />,
  };
  const iconBg: Record<string, string> = {
    like: "bg-pink-500/20 text-pink-600 dark:text-pink-400",
    reply: "bg-blue-500/20 text-blue-600 dark:text-blue-400",
    follow: "bg-purple-500/20 text-purple-600 dark:text-purple-400",
    mention: "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400",
    message: "bg-green-500/20 text-green-600 dark:text-green-400",
    login_alert: "bg-red-500/20 text-red-600 dark:text-red-400",
    repost: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400",
    quote: "bg-cyan-500/20 text-cyan-600 dark:text-cyan-400",
  };
  const notifKeys: Record<string, MessageKey> = {
    like: "notif.like",
    reply: "notif.reply",
    follow: "notif.follow",
    mention: "notif.mention",
    message: "notif.message",
    login_alert: "notif.loginAlert",
    repost: "notif.repost",
    quote: "notif.quote",
  };

  const glow = !user
    ? null
    : (user.role?.color && (user.role?.level ?? 0) >= 8 ? user.role.color : null) // 🆕 роль 8-11 перекрывает флаги
    ?? (user.is_admin ? "#ffffff"
    : user.is_moderator ? "#3b82f6"
    : user.role?.color ?? null);

  // 🌗 Цвет ника и свечения с учётом темы:
  //  dark — цвет роли как есть (#ffffff у Founder светится белым),
  //  light — светлые цвета инвертируются в «чернила», свечение тёмное.
  const { resolvedTheme } = useTheme();
  const displayNickColor = resolveNickColor(glow, resolvedTheme);
  const nickGlowStyle = displayNickColor
    ? ({ color: displayNickColor, textShadow: `0 0 6px ${displayNickColor}B3, 0 0 14px ${displayNickColor}66` } as React.CSSProperties)
    : undefined;
  // Свечение аватарки тем же цветом, что и ник (в light — тёмный ореол)
  const avatarGlowStyle = displayNickColor
    ? ({ filter: `drop-shadow(0 0 8px ${displayNickColor})` } as React.CSSProperties)
    : undefined;


  const hasAdminAccess = user?.is_admin || user?.is_moderator || user?.permissions?.includes("manage_users");

  const isDock = layout === "dock";
  const isMessagesPage = pathname?.startsWith("/messages") ?? false;
  const orbitDesktopPos = "bottom-56 right-0 rounded-l-full";
  const orbitRowPos = "bottom-[228px] right-[68px]";
  const iconClass = isDock ? "w-6 h-6 mx-auto shrink-0" : "w-[18px] h-[18px]";
  const textClass = isDock ? "hidden" : "block";
  const containerClass = isDock ? "justify-center px-0 py-3" : "items-center gap-3 px-4 py-3";

  const handleOrbitDoubleClick = useCallback(() => {
    handleContinueClick();
  }, [handleContinueClick]);

  const handleOrbitTouchEnd = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      handleContinueClick();
    }
    lastTapRef.current = now;
  }, [handleContinueClick]);
  
  const desktopSidebarContent = (
    <>
      <div className={`flex ${isDock ? "justify-center" : "items-center gap-2"}`}>
        <BrandIcon className={isDock ? "w-8 h-8" : "w-9 h-9"} />
        {!isDock && <h1 className="font-logo text-4xl text-[#3D1F6D] dark:text-[#8b5cf6]">trelod</h1>}
      </div>
      
      <nav className="flex flex-col flex-1">

        {nav.map(({ href, icon: Icon, label }) => {
        const active = pathname === href || (href === "/updates" && pathname.startsWith("/suggestions"));
        const showUpdatesBadge = href === "/updates" && (counts.updates || 0) > 0;
          return (
            <Link key={href} href={href}
              className={`flex ${containerClass} font-medium transition-all border-b border-line dark:border-white/5 last:border-none group relative ${
                active ? "bg-[#8b5cf6]/15 text-[#a78bfa]" : "text-gray-500 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/[0.03] hover:text-gray-600 dark:hover:text-white/60"
              }`}>
              <Icon size={18} className={`${iconClass} ${active ? "text-[#8b5cf6]" : "text-gray-700 dark:text-white/80 group-hover:text-gray-500 dark:group-hover:text-[#e0e0e0]!"}`} />
              <span className={textClass}>{label}</span>
              
              {showUpdatesBadge && (
                <span className={`${isDock ? "absolute top-2 right-2" : "ml-auto"} bg-[#8b5cf6] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-sm`}>
                  {counts.updates}
                </span>
              )}
            </Link>
          );
        })}

        {user && (
          <Link href="/messages"
            className={`flex ${containerClass} font-medium transition-all relative border-b border-line dark:border-white/5 group ${
              pathname?.startsWith("/messages") ? "bg-[#8b5cf6]/15 text-[#a78bfa]" : "text-gray-500 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/[0.03] hover:text-gray-600 dark:hover:text-white/60"
            }`}>
            <MessageSquare size={18} className={`${iconClass} ${pathname?.startsWith("/messages") ? "text-[#8b5cf6]" : "text-gray-700 dark:text-white/80 group-hover:text-gray-500 dark:group-hover:text-[#e0e0e0]!"}`} />
            <span className={textClass}>{t("nav.messages")}</span>
            {counts.chats > 0 && (
              <span className={`${isDock ? "absolute top-2 right-2" : "ml-auto"} bg-[#8b5cf6] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-sm`}>
                {counts.chats}
              </span>
            )}
          </Link>
        )}

        <button onClick={loadNotifications}
          className={`flex ${containerClass} font-medium transition-all relative border-b border-line dark:border-white/5 group ${
            pathname === "/notifications" ? "bg-[#8b5cf6]/15 text-[#a78bfa]" : "text-gray-500 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/[0.03] hover:text-gray-600 dark:hover:text-white/60"
          }`}>
          <Bell size={18} className={`${iconClass} ${pathname === "/notifications" ? "text-[#8b5cf6]" : "text-gray-700 dark:text-white/80 group-hover:text-gray-500 dark:group-hover:text-[#e0e0e0]!"}`} />
          <span className={textClass}>{t("nav.notifications")}</span>
          {counts.notifications > 0 && (
            <span className={`${isDock ? "absolute top-2 right-2" : "ml-auto"} bg-[#8b5cf6] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-sm`}>
              {counts.notifications}
            </span>
          )}
        </button>

        {/* Настройки — сразу над Админ-панелью */}
        <Link href="/settings"
          className={`flex ${containerClass} font-medium transition-all border-b border-line dark:border-white/5 group ${
            pathname === "/settings" ? "bg-[#8b5cf6]/15 text-[#a78bfa]" : "text-gray-500 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/[0.03] hover:text-gray-600 dark:hover:text-white/60"
          }`}>
          <Settings size={18} className={`${iconClass} ${pathname === "/settings" ? "text-[#8b5cf6]" : "text-gray-700 dark:text-white/80 group-hover:text-gray-500 dark:group-hover:text-[#e0e0e0]!"}`} />
          <span className={textClass}>{t("nav.settings")}</span>
        </Link>

        {hasAdminAccess && !isDock && (
          <Link href="/adminnew"
            className={`flex ${containerClass} font-medium transition-all border-b border-line dark:border-white/5 group ${
              pathname?.startsWith("/adminnew") ? "bg-[#8b5cf6]/15 text-[#a78bfa]" : "text-gray-500 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/[0.03] hover:text-gray-600 dark:hover:text-white/60"
            }`}>
            <ShieldAlert size={18} className={`${iconClass} ${pathname?.startsWith("/adminnew") ? "text-[#8b5cf6]" : "text-gray-700 dark:text-white/80 group-hover:text-gray-500 dark:group-hover:text-[#e0e0e0]!"}`} />
            <span className={textClass}>{t("nav.adminPanel")}</span>
          </Link>
        )}

        {hasAdminAccess && isDock && (
           <Link href="/adminnew" className={`flex ${containerClass} font-medium transition-all border-b border-line dark:border-white/5 group text-gray-500 dark:text-white/40 hover:bg-white/[0.03] hover:text-gray-600 dark:hover:text-white/60`}>
              <ShieldAlert size={18} className={iconClass} />
           </Link>
        )}
      </nav>

      {/* ННННННН FOOTER (без лишних линий) ННННННН */}
      <div className={`mt-auto pt-4 ${isDock ? "flex flex-col items-center gap-3" : ""}`}>
        
{/* Сервисные кнопки */}
{!isDock && (
  <div className="px-4 flex items-center gap-2 mb-4">
    {showContinueButton && continueConfig.isPost && (
      <button onClick={handleContinueClick}
        className="p-2.5 rounded-xl text-[#8b5cf6]/80 hover:text-[#8b5cf6] hover:bg-[#8b5cf6]/10 transition-all relative"
        title={continueConfig.sublabel}>
        <BookOpen size={18} />
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#8b5cf6] shadow-[0_0_6px_#8b5cf6]"></span>
      </button>
    )}
    <button onClick={() => setShowBugModal(true)}
      className="p-2.5 rounded-xl text-orange-400/80 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-500/10 transition-all" title={t("nav.reportProblem")}>
      <Bug size={18} />
    </button>
    <button onClick={() => router.push("/support")} // 🆕 Замените "/support" на открытие модалки, если нужно
      className="p-2.5 rounded-xl text-cyan-400/80 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-500/10 transition-all" title={t("nav.supportChat")}>
      <Headphones size={18} />
    </button>
    <button onClick={() => setShowLayoutPicker(true)}
      className="p-2.5 rounded-xl text-[#8b5cf6]/80 hover:text-[#8b5cf6] hover:bg-[#8b5cf6]/10 transition-all" title={t("nav.layoutSettings")}>
      <Palette size={18} />
    </button>
  </div>
)}

{isDock && (
  <div className="flex flex-col items-center gap-2 mb-2">
    {showContinueButton && continueConfig.isPost && (
      <button onClick={handleContinueClick}
        className="p-2 rounded-lg text-[#8b5cf6]/80 hover:text-[#8b5cf6] hover:bg-[#8b5cf6]/10 transition-all shrink-0 relative"
        title={continueConfig.sublabel}>
        <BookOpen size={20} className="shrink-0" />
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#8b5cf6] shadow-[0_0_6px_#8b5cf6]"></span>
      </button>
    )}
    <button onClick={() => setShowBugModal(true)}
      className="p-2 rounded-lg text-orange-400/80 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-500/10 transition-all shrink-0" title={t("nav.bugs")}>
      <Bug size={20} className="shrink-0" />
    </button>
    <button onClick={() => router.push("/support")}
      className="p-2 rounded-lg text-cyan-400/80 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-500/10 transition-all shrink-0" title={t("nav.support")}>
      <Headphones size={20} className="shrink-0" />
    </button>
    <button onClick={() => setShowLayoutPicker(true)}
      className="p-2 rounded-lg text-[#8b5cf6]/80 hover:text-[#8b5cf6] hover:bg-[#8b5cf6]/10 transition-all shrink-0" title={t("nav.layout")}>
      <Palette size={20} className="shrink-0" />
    </button>
  </div>
)}


         {/* Профиль с кнопкой выхода внутри (справа) */}
        {user ? (
          <div className={isDock ? "flex flex-col items-center gap-2 px-2" : "px-2"}>
            {/* Ссылка на профиль + кнопка выхода внутри */}
            <div className={`flex ${isDock ? "justify-center" : "items-center gap-3"} px-2 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition-all group w-full`}>
              <Link href={`/${user.username}`} className="flex items-center gap-3 flex-1 min-w-0">
                <div className="shrink-0" style={avatarGlowStyle}>
                  <Avatar src={user.avatar_url} name={user.display_name} id={user.id} />
                </div>
                {!isDock && (
                  <div className="leading-tight min-w-0 flex-1">
                    <p className={`font-semibold text-sm truncate transition-all ${nickGlowStyle ? "group-hover:opacity-80" : "text-gray-900 dark:text-white group-hover:text-[#8b5cf6]"}`}
                      style={nickGlowStyle}>

                      {user.display_name}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-white/40 truncate">@{user.username}</p>
                  </div>
                )}
              </Link>
              
              {/* 🆕 КНОПКА ВЫХОДА СПРАВА ВНУТРИ БЛОКА */}
              {!isDock && (
                <button 
                  onClick={() => setShowOrbitSwitcher(true)}
                  className="p-2 rounded-lg text-gray-500 dark:text-white/40 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0"
                  title={t("account.accounts")}
                >
                  <LogOut size={18} />
                </button>
              )}
            </div>
          </div>
        ) : (
          !isDock && (
            <div className="px-2">
              <Link href="/login"
                className="flex items-center justify-center bg-[#8b5cf6]/15 border border-[#8b5cf6]/30 rounded-lg px-4 py-2.5 font-medium text-[#a78bfa] hover:bg-[#8b5cf6]/25 transition-all w-full">
                {t("nav.login")}
              </Link>
            </div>
          )
        )}
      </div>
    </>
  );

  const buttonCx = useRef(0);
  const buttonCy = useRef(0);




  useEffect(() => {
    if (!wheelOpen) return;
    if (buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect();
      // Кнопка видима → пункты разлетаются из неё (классическая орбита)
      if (r.width > 0 || r.height > 0) {
        buttonCx.current = r.left + r.width / 2;
        buttonCy.current = r.top + r.height / 2;
        return;
      }
    }
    // 🆕 orbit2 / Ctrl: кнопки нет или она скрыта —
    // точка входа анимации = место зажима (центр круга)
    buttonCx.current = arcCenterRef.current.x;
    buttonCy.current = arcCenterRef.current.y;
  }, [wheelOpen]);

  const renderWheel = () => {
    if (!wheelOpen) return null;
    const activePos = hoveredIdx !== null ? getIconPos(hoveredIdx) : null;

    return (
      <div
        className="fixed inset-0 z-[100] pointer-events-none"
        style={{
          touchAction: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
        } as React.CSSProperties}
      >
        {wheelItems.map((item, i) => {
          const finalPos = getIconPos(i);
          const isActive = i === hoveredIdx;
          const isOuter  = itemLayerMap.get(i)?.layer === "outer";
          const x = (wheelReady && !closing) ? finalPos.x : buttonCx.current;
          const y = (wheelReady && !closing) ? finalPos.y : buttonCy.current;

          return (
            <div
              key={`wheel-${item.href}-${i}`}
              className="absolute"
              style={{
                left: x,
                top: y,
                transform: `translate(-50%, -50%) scale(${closing ? 0 : isActive ? 1.35 : wheelReady ? 1 : 0})`,
                opacity: closing ? 0 : wheelReady ? (isActive ? 1 : 0.8) : 0,
                transition: `
                  left 300ms cubic-bezier(0.34, 1.56, 0.64, 1),
                  top 300ms cubic-bezier(0.34, 1.56, 0.64, 1),
                  transform 200ms ease,
                  opacity 200ms ease
                `,
                transitionDelay: `${i * 25}ms`,
                zIndex: isActive ? 20 : 10,
              }}
            >
              <div className="relative">
              <div className={`
                relative flex items-center justify-center rounded-full overflow-hidden
                transition-all duration-150
                ${isActive
                  ? "w-14 h-14 bg-[#8b5cf6] shadow-[0_0_28px_rgba(139,92,246,0.55)]"
                  : isOuter
                    ? "w-11 h-11 bg-ivory/95 dark:bg-[#1a1a1f]/95 border border-line dark:border-white/15 shadow-lg shadow-gray-400/40 dark:shadow-black/40"
                    : "w-12 h-12 bg-gray-100 dark:bg-[#22222a]/95 border border-line dark:border-white/20 shadow-lg shadow-gray-400/40 dark:shadow-black/40"
                }
              `}>
                {item.isProfile && user ? (
                  user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt=""
                      draggable={false}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <span className={`font-bold ${isActive ? "text-gray-900 dark:text-white" : "text-gray-800 dark:text-white/70"}`}>
                      {(user.display_name || "?")[0]?.toUpperCase()}
                    </span>
                  )
                ) : (
                  <item.icon size={isActive ? 26 : isOuter ? 19 : 21} className={isActive ? "text-gray-900 dark:text-white" : "text-gray-800 dark:text-white/70"} />
                )}
                  </div>
                {!!item.count && item.count > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#8b5cf6] border-2 border-paper dark:border-[#171717] text-white text-[9px] font-bold flex items-center justify-center">
                    {item.count > 9 ? "9+" : item.count}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {hoveredIdx !== null && activePos && (
          <div
            className="absolute w-16 h-16 rounded-full"
            style={{ left: activePos.x, top: activePos.y, transform: "translate(-50%, -50%)", zIndex: 9 }}
          >
            <div className="w-full h-full rounded-full border-2 border-[#8b5cf6]/30 animate-ping" />
          </div>
        )}

        {/* 🆕 Индикатор "тянешь назад" */}
        {pullingBack && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: arcCenterRef.current.x - 100,
              top: arcCenterRef.current.y,
              transform: "translate(-50%, -50%)",
              zIndex: 30,
            }}
          >
            <div className="flex items-center gap-2 bg-[#8b5cf6] text-white px-4 py-2 rounded-full shadow-2xl animate-pulse">
              <ChevronLeft size={20} />
              <span className="text-sm font-bold">{t("common.back")}</span>
            </div>
          </div>
        )}

        {/* 🆕 Индикатор скролла */}
        {scrollVelocity !== 0 && !pullingBack && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: arcCenterRef.current.x,
              top: arcCenterRef.current.y + (scrollVelocity > 0 ? -80 : 80),
              transform: "translate(-50%, -50%)",
              zIndex: 30,
            }}
          >
            <div className="flex items-center gap-2 bg-[#8b5cf6]/80 text-white px-3 py-1.5 rounded-full shadow-lg backdrop-blur-sm">
              <span className="text-xs font-bold">
                {scrollVelocity > 0 ? "↑" : "↓"} {Math.abs(Math.round(scrollVelocity))}px
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* ННННННН МОБИЛКА / DESKTOP ORBIT / DESKTOP ORBIT2 ННННННН */}
      {/* orbit2 — без фиксированной кнопки: дуга открывается зажимом в любом месте */}
      {/* 🚫 В режиме Nebula классическая орбита полностью отключена (в т.ч. кнопка вне <aside>) */}
      {!nebulaOff && (
        layout === "dock2" && isMobile ? (
          <Dock2Wheel
            user={user}
            router={router}
            setShowBugModal={setShowBugModal}
            setShowLayoutPicker={setShowLayoutPicker}
            hasContinue={!!lastReadPost}
            onContinue={handleContinueClick}
          />
        ) : (
      <div className={layout === "orbit" ? "block" : layout === "orbit2" ? "hidden" : "md:hidden"}>
        {/* 🔥 КРУГИ НА ВОДЕ (Память ленты) */}
        {/* 🔥 МЯГКОЕ СВЕЧЕНИЕ (Сохраненный пост) */}
        {lastReadPost && (
          <div 
            className={`fixed z-[97] w-14 h-14 pointer-events-none flex items-center justify-center
              ${layout === "orbit" 
                ? orbitDesktopPos 
                : "right-0 top-[calc(50%+8px)] -translate-y-1/2 rounded-l-full"
              }
            `}
          >
            {/* Статичное свечение вместо бесконечной пульсации */}
            <span className="absolute inset-0 rounded-full bg-[#8b5cf6]/10 ring-2 ring-[#8b5cf6]/40 shadow-[0_0_15px_rgba(139,92,246,0.4)]"></span>
          </div>
        )}

        <button
          ref={buttonRef}
          onTouchStart={handleStart}
          onMouseDown={handleStart}
          onDoubleClick={handleOrbitDoubleClick}
          onTouchEnd={handleOrbitTouchEnd}
          className={`fixed z-[98] w-14 h-14 
            bg-paper dark:bg-[#171717]/90 backdrop-blur-sm border 
            flex items-center justify-center shadow-lg shadow-gray-400/40 dark:shadow-black/50
            transition-all duration-200
            ${wheelOpen
              ? "border-[#8b5cf6]/50 bg-[#8b5cf6]/20 scale-110"
              : "border-line dark:border-white/10 active:scale-95"}
            ${layout === "orbit" 
              ? orbitDesktopPos
              : "right-0 top-[calc(50%+8px)] -translate-y-1/2 rounded-l-full"
            }
          `}
          style={{ 
            touchAction: "none", 
            userSelect: "none", 
            WebkitUserSelect: "none",
            WebkitTouchCallout: "none" as any,
          }}
          aria-label={t("nav.navMenu")}
        >
          <Orbit size={22} className={`transition-all duration-300 ${wheelOpen ? "text-[#8b5cf6] rotate-[60deg]" : "text-gray-800 dark:text-white/80"}`} />
        </button>
      </div>
        )
      )}

      {/* 🆕 Дуга рендерится ВНЕ обёртки — доступна в любом виде сайдбара
          (Ctrl на ПК в classic/dock/orbit, свободный зажим в orbit2) */}
      {/* 🚫 В Nebula классическая дуга не рендерится */}
      {!nebulaOff && renderWheel()}

{/* 🆕 🔥 ТУЛТИП "ПРОДОЛЖИТЬ ЧТЕНИЕ" */}
{!nebulaOff && showTooltip && showContinueButton && layout !== "orbit2" && (
  <div 
    className={`fixed z-[99] bg-[#8b5cf6] text-white text-xs font-bold px-3 py-2 rounded-lg shadow-xl whitespace-nowrap animate-bounce
      ${layout === "orbit" 
        ? (isMobile ? "right-20 top-[calc(50%+8px)] -translate-y-1/2" : "bottom-64 right-20") 
        : (isDock ? "left-24 bottom-20" : "left-64 bottom-16")
      }
    `}
  >
    {layout === "orbit" 
      ? t("nav.doubleClickContinue")
      : t("nav.tapContinue")
    }
    <div 
      className={`absolute w-2 h-2 bg-[#8b5cf6] rotate-45
        ${layout === "orbit" 
          ? (isMobile ? "right-[-4px] top-1/2 -translate-y-1/2" : "bottom-[-4px] right-10") 
          : (isDock ? "left-[-4px] bottom-4" : "left-[-4px] bottom-4")
        }
      `}
    ></div>
  </div>
)}

{/* ННННННН DESKTOP ORBIT: плавающие кнопки слева от орбиты ННННННН */}
{!nebulaOff && layout === "orbit" && !isMobile && (
  <div className={`fixed right-[92px] ${orbitRowPos} z-[97] flex flex-row items-center gap-3`}>


    {counts.chats > 0 && (
      <button
        onClick={() => router.push("/messages")}
        className="relative w-12 h-12 rounded-full bg-paper dark:bg-[#171717]/90 backdrop-blur-sm border border-line dark:border-white/10 flex items-center justify-center shadow-lg shadow-gray-400/40 dark:shadow-black/50 text-gray-600 dark:text-white/80 hover:text-[#8b5cf6] dark:hover:text-white hover:border-[#8b5cf6]/50 hover:bg-[#8b5cf6]/20 transition-all"
        title={t("nav.messages")}
      >
        <MessageSquare size={20} />
        <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-[#8b5cf6] border-2 border-paper dark:border-[#171717] text-white text-[10px] font-bold flex items-center justify-center">
          {counts.chats > 9 ? "9+" : counts.chats}
        </span>
      </button>
    )}

    {counts.notifications > 0 && (
      <button
        onClick={() => router.push("/notifications")}
        className="relative w-12 h-12 rounded-full bg-paper dark:bg-[#171717]/90 backdrop-blur-sm border border-line dark:border-white/10 flex items-center justify-center shadow-lg shadow-gray-400/40 dark:shadow-black/50 text-gray-600 dark:text-white/80 hover:text-[#8b5cf6] dark:hover:text-white hover:border-[#8b5cf6]/50 hover:bg-[#8b5cf6]/20 transition-all"
        title={t("nav.notifications")}
      >
        <Bell size={20} />
        <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-[#8b5cf6] border-2 border-paper dark:border-[#171717] text-white text-[10px] font-bold flex items-center justify-center">
          {counts.notifications > 9 ? "9+" : counts.notifications}
        </span>
      </button>
    )}
  </div>
)}



      {/* ННННННН ДЕСКТОП CLASSIC / DOCK (в orbit и orbit2 сайдбара нет) ННННННН */}
      {layout !== "orbit" && layout !== "orbit2" && (
        <aside className={`hidden md:flex shrink-0 overflow-y-auto flex-col bg-paper dark:bg-[#171717] transition-all duration-300 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          isDock ? "md:w-20 md:min-w-20 px-0 py-4 gap-2" : "md:w-64 md:min-w-64 p-5 gap-5"
        }`}>
          {desktopSidebarContent}
        </aside>
      )}

      {/* ННННННН УВЕДОМЛЕНИЯ ННННННН */}
      {showNotifs && (
        <>
          <div className="fixed inset-0 bg-black/60 z-[99]" onClick={() => setShowNotifs(false)} />
          <div className={`fixed left-4 right-4 md:right-auto md:top-4 top-16 w-auto md:w-[380px] max-h-[70vh] md:max-h-[520px] overflow-hidden border border-line dark:border-white/10 rounded-2xl bg-ivory dark:bg-[#1f1f23] shadow-2xl z-[100] flex flex-col transition-all duration-300 ${
             isDock ? "md:left-24" : "md:left-[272px]"
          }`}>
            <div className="sticky top-0 bg-ivory dark:bg-[#1f1f23]/95 backdrop-blur-md border-b border-line dark:border-white/10 p-3 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-gray-900 dark:text-white">{t("nav.notifications")}</h3>
              <div className="flex items-center gap-1">
                {notifs.some((n) => !n.read) && (
                  <button onClick={markAllRead} className="text-xs text-[#8b5cf6] hover:text-[#a78bfa] font-semibold px-2 py-1 rounded-lg hover:bg-[#8b5cf6]/10 transition-colors">
                    {t("notif.markAll")}
                  </button>
                )}
                <button onClick={() => setShowNotifs(false)} className="p-1.5 text-gray-600 dark:text-white/50 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {notifsLoading && notifs.length === 0 ? (
                <div className="p-8 text-center">
                  <Bell size={32} className="text-gray-300 dark:text-white/10 mx-auto mb-3 animate-pulse" />
                  <p className="text-sm text-gray-400 dark:text-white/40">…</p>
                </div>
              ) : notifs.length === 0 && (
                <div className="p-8 text-center">
                  <Bell size={32} className="text-gray-500 dark:text-white/20 mx-auto mb-3" />
                  <p className="text-sm text-gray-600 dark:text-white/50">{t("notif.empty")}</p>
                </div>
              )}
              {notifs.map((n) => {
                const link = getNotifLink(n);
                return (
                  <Link key={n.id} href={link}
                    onClick={() => { if (!n.read) markRead(n.id); setShowNotifs(false); }}
                    className={`flex items-start gap-3 p-3 border-b border-line dark:border-white/5 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors relative ${!n.read ? "bg-[#8b5cf6]/[0.03]" : ""}`}>
                    {!n.read && <div className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full bg-[#8b5cf6]" />}
                    <div className="shrink-0 relative">
                      <Avatar src={n.actor?.avatar_url} name={n.actor?.display_name || "User"} id={n.actor?.id} size={42} />
                      <div className={`absolute -bottom-1 -right-1 w-[18px] h-[18px] rounded-full flex items-center justify-center border-2 border-[#1f1f23] ${iconBg[n.type] || "bg-[#8b5cf6]/20 text-[#8b5cf6]"}`}>
                        {icons[n.type as keyof typeof icons] || <Bell size={9} />}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-gray-800 dark:text-white/90 leading-snug">
                        <span className="font-semibold text-gray-900 dark:text-white">{n.actor?.display_name || t("common.unknown")}</span>{" "}
                        {t(notifKeys[n.type] ?? "notif.fallback")}
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-white/40 mt-1">
                        {new Date(n.created_at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    {!n.read && <div className="w-2 h-2 rounded-full bg-[#8b5cf6] shrink-0 mt-2 shadow-[0_0_6px_rgba(139,92,246,0.6)]" />}
                  </Link>
                );
              })}
            </div>
            <div className="sticky bottom-0 bg-ivory dark:bg-[#1f1f23]/95 backdrop-blur-md border-t border-line dark:border-white/10 p-2.5 shrink-0">
              <Link href="/notifications" onClick={() => setShowNotifs(false)}
                className="block w-full text-center text-sm font-semibold text-[#8b5cf6] hover:text-[#a78bfa] py-2 rounded-lg hover:bg-[#8b5cf6]/10 transition-all">
                {t("notif.viewAll")}
              </Link>
            </div>
          </div>
        </>
      )}

      {showBugModal && <BugReportModal onClose={() => setShowBugModal(false)} />}
      {showSearch && <MobileSearch onClose={() => setShowSearch(false)} />}
      {showLayoutPicker && <LayoutPicker current={layout} isMobile={isMobile} onClose={() => setShowLayoutPicker(false)} />}
      
      {/* 🆕 МОДАЛКА СМЕНЫ АККАУНТА */}
      {showOrbitSwitcher && (
        <AccountSwitcher 
          variant="orbit" 
          isOpen={showOrbitSwitcher} 
          onClose={() => setShowOrbitSwitcher(false)} 
        />
      )}

      {/* 🆕 Horizontal Swipe Nav — только мобильные */}
      {isMobile && layout === "horizontal-swipe" && (
        <HorizontalSwipeNav pathname={pathname} user={user} counts={counts} />
      )}
    </>
  );
}
