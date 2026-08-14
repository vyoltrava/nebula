"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Home, Bell, Settings, LogOut, Heart, MessageCircle, UserPlus,
  AtSign, X, Shield, ShieldCheck, MessageSquare, Palette,
  Bug, Orbit, Search, Megaphone, Bookmark, ShieldAlert, Wrench, RefreshCw, Quote, ChevronLeft, ChevronRight, History
} from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { getToken, clearToken } from "@/lib/auth";
import { BugReportModal } from "@/components/BugReportModal";
import { getCachedUser, setCachedUser, clearCachedUser } from "@/lib/authCache";
import { useUnreadCounts } from "@/lib/UnreadCountsContext";
import { useWebSocket } from "@/src/hooks/useWebSocket";
import { setLikedCache } from "@/lib/postCache";

// ════════════════════════════════════════════════════════════════
// 🎯 КОНСТАНТЫ ОРБИТЫ
// ════════════════════════════════════════════════════════════════
const INNER_RADIUS     = 135;
const OUTER_RADIUS     = 215;
const SNAP_RADIUS      = 48;
const LONG_PRESS_MS    = 250;

const ARC_SPAN     = Math.PI / 2;
const ARC_CENTER   = Math.PI;
const ARC_START    = ARC_CENTER - ARC_SPAN;
const ARC_END      = ARC_CENTER + ARC_SPAN;
const ARC_OFFSET_X = -40;

const FEED_MEMORY_KEY = "trelod_feed_memory";
const FEED_TOOLTIP_KEY = "trelod_feed_tooltip";

// ════════════════════════════════════════════════════════════════
//  Админский dropdown (desktop classic)
// ════════════════════════════════════════════════════════════════
function AdminDropdown({ user, pathname, isOpen, onToggle, onClose }: { 
  user: any; 
  pathname: string;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", onClick);
      return () => document.removeEventListener("mousedown", onClick);
    }
  }, [isOpen, onClose]);

  const items = [
    { href: "/admin", icon: ShieldAlert, label: user?.is_admin ? "Админка" : user?.is_moderator ? "Модерация" : "Админ панель", show: true },
    { href: "/admin/roles", icon: Palette, label: "Роли", show: !!user?.is_admin },
    { href: "/admin/technical", icon: Wrench, label: "Техпанель", show: !!user?.permissions?.includes("tech_access") },
  ].filter((i) => i.show);

  const active = items.some((i) => pathname === i.href);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-3 px-4 py-3 font-medium transition-all border-b border-white/5 group ${
          active || isOpen ? "bg-[#8b5cf6]/15 text-[#a78bfa]" : "text-white/40 hover:bg-white/[0.03] hover:text-white/60"
        }`}
      >
        {user?.is_admin ? (
          <ShieldAlert size={18} className={active || isOpen ? "text-[#8b5cf6]" : "text-[#f59e0b]"} />
        ) : user?.is_moderator ? (
          <ShieldCheck size={18} className={active || isOpen ? "text-[#8b5cf6]" : "text-white/80 group-hover:text-white"} />
        ) : (
          <ShieldAlert size={18} className="text-[#f59e0b]" />
        )}
        <span>{user?.is_admin ? "Админка" : user?.is_moderator ? "Модерация" : "Админ панель"}</span>
        <ChevronRight
          size={14}
          className={`ml-auto transition-transform duration-200 ${isOpen ? "rotate-90" : "rotate-0"}`}
        />
      </button>

      {isOpen && (
        <div 
          className="absolute left-0 top-full mt-1 w-full bg-[#1f1f23] border border-white/10 rounded-xl shadow-2xl z-[9999] overflow-hidden"
          style={{ minWidth: '200px', boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}
        >
          {items.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => { onClose(); }}
              className={`flex items-center gap-2 px-3 py-2.5 text-sm transition-colors ${
                pathname === href ? "bg-[#8b5cf6]/15 text-[#a78bfa]" : "text-white/70 hover:bg-white/10"
              }`}
            >
              <Icon size={15} />
              <span>{label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  Мобильный админ-лист (bottom sheet)
// ════════════════════════════════════════════════════════════════
function MobileAdminSheet({ user, onClose }: { user: any; onClose: () => void }) {
  const router = useRouter();
  const items = [
    { href: "/admin", icon: ShieldAlert, label: user?.is_admin ? "Админка" : user?.is_moderator ? "Модерация" : "Админ панель", show: true },
    { href: "/admin/roles", icon: Palette, label: "Роли", show: !!user?.is_admin },
    { href: "/admin/technical", icon: Wrench, label: "Техпанель", show: !!user?.permissions?.includes("tech_access") },
  ].filter((i) => i.show);

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[240]" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-[241] bg-[#1f1f23] border-t border-white/10 rounded-t-2xl p-4 pb-8 shadow-2xl max-w-md mx-auto">
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
        {items.map(({ href, icon: Icon, label }) => (
          <button
            key={href}
            onClick={() => { onClose(); router.push(href); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white/80 hover:bg-white/5 transition-colors"
          >
            <Icon size={18} className="text-[#8b5cf6]" />
            <span className="font-medium">{label}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function MobileSearch({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

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
    <div className="fixed inset-0 z-[250] bg-[#171717] flex flex-col md:hidden">
      <div className="flex items-center gap-2 p-3 border-b border-white/10 shrink-0">
        <div className="flex-1 flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
          <Search size={16} className="text-white/40" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Люди, посты, теги..."
            className="flex-1 bg-transparent text-white text-sm focus:outline-none placeholder-white/40"
          />
        </div>
        <button onClick={onClose} className="p-2 text-white/60 hover:text-white">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {users.length > 0 && (
          <div className="p-3 pb-1">
            <p className="text-[11px] font-bold uppercase text-white/40 mb-2">Люди</p>
            {users.map((u) => (
              <Link key={u.id} href={`/${u.username}`} onClick={onClose}
                className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors">
                <Avatar src={u.avatar_url} name={u.display_name} id={u.id} size={40} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{u.display_name}</p>
                  <p className="text-xs text-white/40">@{u.username}</p>
                </div>
              </Link>
            ))}
          </div>
        )}

        {posts.length > 0 && (
          <div className="p-3 pt-1">
            <p className="text-[11px] font-bold uppercase text-white/40 mb-2">Посты</p>
            {posts.map((p) => (
              <button
                key={p.id}
                onClick={() => { onClose(); router.push(`/post/${p.id}`); }}
                className="w-full text-left p-3 rounded-xl hover:bg-white/5 transition-colors border-b border-white/5"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Avatar src={p.author_avatar} name={p.author} id={p.author_id} size={24} />
                  <span className="text-xs font-bold text-white truncate">{p.author}</span>
                  <span className="text-[10px] text-white/40">{p.handle}</span>
                </div>
                <p className="text-sm text-white/80 line-clamp-3 whitespace-pre-wrap break-words">{p.text}</p>
                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-white/40">
                  <span>❤️ {p.likes_count}</span>
                  <span>💬 {p.replies_count}</span>
                  <span>👁 {p.views_count ?? 0}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {loading && <p className="text-center text-white/40 text-sm mt-10">Ищем...</p>}
        {!loading && q.trim() && users.length === 0 && posts.length === 0 && (
          <p className="text-center text-white/40 text-sm mt-10">Ничего не нашли 🤷</p>
        )}
        {!q.trim() && (
          <p className="text-center text-white/30 text-sm mt-10">Начни вводить имя, ник или текст поста</p>
        )}
      </div>
    </div>
  );
}


// ════════════════════════════════════════════════════════════════
// 🎛 ВАРИАНТЫ САЙДБАРА
// ════════════════════════════════════════════════════════════════
export type SidebarLayout = "classic" | "orbit" | "dock";
const LAYOUT_KEY = "trelod_sidebar_layout";

export function getSidebarLayout(): SidebarLayout {
  if (typeof window === "undefined") return "classic";
  const v = localStorage.getItem(LAYOUT_KEY);
  return v === "orbit" || v === "dock" ? v : "classic";
}

export function setSidebarLayout(v: SidebarLayout) {
  localStorage.setItem(LAYOUT_KEY, v);
  window.dispatchEvent(new CustomEvent("sidebar-layout-change", { detail: v }));
}


function LayoutPreview({ kind }: { kind: SidebarLayout }) {
  return (
    <div className="w-full h-16 rounded-md bg-[#111114] border border-white/10 overflow-hidden flex">
      {kind === "classic" && (
        <>
          <div className="w-7 bg-[#22222a] border-r border-white/10 p-1 space-y-1">
            <div className="h-1.5 w-full rounded bg-white/25" />
            <div className="h-1.5 w-3/4 rounded bg-white/15" />
            <div className="h-1.5 w-full rounded bg-white/15" />
          </div>
          <div className="flex-1 p-1.5 space-y-1">
            <div className="h-1.5 w-full rounded bg-white/10" />
            <div className="h-1.5 w-3/4 rounded bg-white/10" />
          </div>
        </>
      )}
      {kind === "orbit" && (
        <div className="relative flex-1 p-1.5 space-y-1">
          <div className="absolute right-2 bottom-2 w-4 h-4 rounded-full bg-[#8b5cf6]" />
          <div className="h-1.5 w-full rounded bg-white/10" />
          <div className="h-1.5 w-3/4 rounded bg-white/10" />
        </div>
      )}
      {kind === "dock" && (
        <>
          <div className="w-4 bg-[#22222a] border-r border-white/10 flex flex-col items-center gap-1 py-1">
            <div className="w-2 h-2 rounded bg-white/25" />
            <div className="w-2 h-2 rounded bg-white/15" />
            <div className="w-2 h-2 rounded bg-white/15" />
          </div>
          <div className="flex-1 p-1.5 space-y-1">
            <div className="h-1.5 w-full rounded bg-white/10" />
            <div className="h-1.5 w-3/4 rounded bg-white/10" />
          </div>
        </>
      )}
    </div>
  );
}

function LayoutPicker({ current, onClose }: { current: SidebarLayout; onClose: () => void }) {
  const variants: { key: SidebarLayout; name: string; desc: string }[] = [
    { key: "classic", name: "Классика", desc: "Полная панель слева на ПК, орбита на мобилке." },
    { key: "orbit", name: "Орбита", desc: "Кнопка справа внизу на ПК, орбита на мобилке." },
    { key: "dock", name: "Док", desc: "Узкая рейка иконок слева — максимум места для ленты." },
  ];
  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[310]" onClick={onClose} />
      <div className="fixed right-3 top-1/2 -translate-y-1/2 z-[311] w-[250px] bg-[#1f1f23] border border-white/15 rounded-2xl shadow-2xl p-3">
        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-sm font-black text-white">Интерфейс</p>
          <button onClick={onClose} className="text-white/50 hover:text-white p-1"><X size={16} /></button>
        </div>
        <div className="space-y-2">
          {variants.map((v) => (
            <button
              key={v.key}
              onClick={() => setSidebarLayout(v.key)}
              className={`w-full text-left rounded-xl border p-2 transition-all ${
                current === v.key ? "border-[#8b5cf6] bg-[#8b5cf6]/10" : "border-white/10 bg-white/5 hover:bg-white/10"
              }`}
            >
              <LayoutPreview kind={v.key} />
              <p className="mt-1.5 text-xs font-bold text-white flex items-center gap-1.5">
                {v.name}
                {current === v.key && <span className="text-[9px] text-[#a78bfa] font-black uppercase">активен</span>}
              </p>
              <p className="text-[10px] text-white/50 mt-0.5 leading-snug">{v.desc}</p>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-white/40 text-center">Применяется сразу, хранится в этом браузере</p>
      </div>
    </>
  );
}

// ════════════════════════════════════════════════════════════════
//  САЙДБАР
// ════════════════════════════════════════════════════════════════
export function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const [user, setUser]               = useState<any>(() => getCachedUser());
  const [showNotifs, setShowNotifs]   = useState(false);
  const [notifs, setNotifs]           = useState<any[]>([]);
  const [showBugModal, setShowBugModal] = useState(false);
  const [showSearch, setShowSearch]     = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const [showAdminDropdown, setShowAdminDropdown] = useState(false);

  const [wheelOpen, setWheelOpen]   = useState(false);
  const [wheelReady, setWheelReady] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [fingerPos, setFingerPos]   = useState<{ x: number; y: number } | null>(null);
  const [closing, setClosing]       = useState(false);

  const buttonRef        = useRef<HTMLButtonElement>(null);
  const longPressTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressed    = useRef(false);
  const startPos         = useRef<{ x: number; y: number } | null>(null);
  const arcCenterRef     = useRef({ x: 0, y: 0 });

  const { counts, refresh } = useUnreadCounts();

  useWebSocket("post_liked", (data: any) => {
    window.dispatchEvent(new CustomEvent("like-sync", {
      detail: { post_id: data.post_id, likes_count: data.likes_count },
    }));
    const me = getCachedUser();
    if (me && data.liker_id === me.id) {
      setLikedCache(data.post_id, !!data.liked);
      window.dispatchEvent(new CustomEvent("like-state-sync", {
        detail: { post_id: data.post_id, liked: !!data.liked },
      }));
    }
  });

  const [layout, setLayout] = useState<SidebarLayout>(() => getSidebarLayout());
  const [showLayoutPicker, setShowLayoutPicker] = useState(false);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const arcParamsRef = useRef({ start: 0, end: 0, offsetX: 0, offsetY: 0 });

  useEffect(() => {
    const on = (e: Event) => setLayout((e as CustomEvent).detail as SidebarLayout);
    window.addEventListener("sidebar-layout-change", on);
    return () => window.removeEventListener("sidebar-layout-change", on);
  }, []);

  type WheelItem = { href: string; icon: any; label: string; isProfile?: boolean; count?: number };

  const innerItems: WheelItem[] = [
    { href: "/", icon: Home, label: "Главная" },
  ];
  if (user) innerItems.push({ href: "/messages", icon: MessageSquare, label: "Сообщения", count: counts.chats });
  if (user) innerItems.push({ href: "/notifications", icon: Bell, label: "Уведомления", count: counts.notifications });
  innerItems.push({ href: "/bookmarks", icon: Bookmark, label: "Закладки" });
  innerItems.push({ href: "#search", icon: Search, label: "Поиск" });
  innerItems.push({ href: "/updates", icon: Megaphone, label: "Обновления", count: counts.updates });
  if (user) innerItems.push({ href: `/${user.username}`, icon: Home, label: "Профиль", isProfile: true });

    const outerItems: WheelItem[] = [
      { href: "/settings", icon: Settings, label: "Настройки" },
      { href: "/rules", icon: Shield, label: "Правила" },
      { href: "#bug", icon: Bug, label: "Баг-трекер" },
    ];
    if (!isMobile) {
      outerItems.push({ href: "#layout", icon: Palette, label: "Интерфейс" });
    }
  
  if (user?.is_admin || user?.is_moderator || user?.permissions?.includes("manage_users")) {
    outerItems.push({
      href: "#admin",
      icon: user?.is_admin ? ShieldAlert : user?.is_moderator ? ShieldCheck : Shield,
      label: user?.is_admin ? "Админка" : user?.is_moderator ? "Модерация" : "Админ панель",
    });
  }
  if (user) outerItems.push({ href: "#logout", icon: LogOut, label: "Выйти" });
  else outerItems.push({ href: "/login", icon: Home, label: "Войти" });

  const wheelItems = [...innerItems, ...outerItems];
  const itemLayerMap = new Map<number, { layer: "inner" | "outer"; localIdx: number }>();
  innerItems.forEach((_, i) => itemLayerMap.set(i, { layer: "inner", localIdx: i }));
  outerItems.forEach((_, i) => itemLayerMap.set(i + innerItems.length, { layer: "outer", localIdx: i }));

  const nav = [
    { href: "/",          icon: Home,      label: "Главная" },
    { href: "/bookmarks", icon: Bookmark,  label: "Закладки" },
    { href: "/updates",   icon: Megaphone, label: "Обновления" },
    { href: "/rules",     icon: Shield,    label: "Правила" },
    { href: "/settings",  icon: Settings,  label: "Настройки" },
  ];

  useEffect(() => { refresh(); }, [pathname]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const controller = new AbortController();
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) return;
        const data = await r.json();
        setUser(data);
        setCachedUser(data);
      })
      .catch((err) => {
        if (err.name !== "AbortError") console.error("Failed to load user:", err);
      });
    return () => controller.abort();
  }, []);

  async function loadNotifications() {
    const token = getToken();
    if (!token) return;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) { setNotifs(await res.json()); setShowNotifs(true); }
  }

  async function markRead(id: number) {
    const token = getToken();
    if (!token) return;
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/notifications/${id}/read`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    });
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    refresh();
  }

  async function markAllRead() {
    const token = getToken();
    if (!token) return;
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/notifications/read-all`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    });
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
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

    const radius = info.layer === "inner" ? INNER_RADIUS : OUTER_RADIUS;
    const items  = info.layer === "inner" ? innerItems : outerItems;
    const n = items.length;

    const ap    = arcParamsRef.current;
    const step  = (ap.end - ap.start) / Math.max(n - 1, 1);
    const angle = ap.start + info.localIdx * step;

    return {
      x: arcCenterRef.current.x + radius * Math.cos(angle),
      y: arcCenterRef.current.y + radius * Math.sin(angle),
    };
  }, [innerItems.length, outerItems.length]);

  const openWheel = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();

    arcParamsRef.current = {
      start: ARC_START,
      end: ARC_END,
      offsetX: ARC_OFFSET_X,
      offsetY: 0,
    };
    arcCenterRef.current = {
      x: rect.left + rect.width / 2 + ARC_OFFSET_X,
      y: rect.top + rect.height / 2,
    };

    isLongPressed.current = true;
    setWheelOpen(true);
    setClosing(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { setWheelReady(true); });
    });
  }, []);

  const closeWheel = useCallback((doAction: boolean) => {
    if (doAction && hoveredIdx !== null) {
      const item = wheelItems[hoveredIdx];
      if (item) {
        if (item.href === "#logout") {
          clearToken(); setUser(null); clearCachedUser(); router.push("/");
        } else if (item.href === "#bug") {
          setShowBugModal(true);
        } else if (item.href === "#search") {
          setShowSearch(true);
        } else if (item.href === "#admin") {
          setShowAdminMenu(true);
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
    setTimeout(() => {
      setWheelOpen(false);
      setClosing(false);
      isLongPressed.current = false;
    }, 280);
  }, [hoveredIdx, wheelItems, router]);

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

  const handleStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const px = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const py = "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    startPos.current = { x: px, y: py };

    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      openWheel();
      const idx = findNearest(px, py);
      setHoveredIdx(idx);
      setFingerPos({ x: px, y: py });
    }, LONG_PRESS_MS);
  }, [openWheel, findNearest]);

  useEffect(() => {
    const cancelTimer = () => {
      if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    };

    const handleMove = (px: number, py: number) => {
      if (longPressTimer.current && startPos.current) {
        const dx = px - startPos.current.x;
        const dy = py - startPos.current.y;
        if (Math.sqrt(dx * dx + dy * dy) > 15) cancelTimer();
        return;
      }
      if (isLongPressed.current) {
        const idx = findNearest(px, py);
        setHoveredIdx(idx);
        setFingerPos({ x: px, y: py });
      }
    };

    const handleEnd = () => {
      cancelTimer();
      if (isLongPressed.current) closeWheel(hoveredIdx !== null);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isLongPressed.current && !longPressTimer.current) return;
      e.preventDefault();
      if (e.touches.length > 0) handleMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onTouchEnd = () => handleEnd();
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
    const onMouseUp   = () => handleEnd();

    document.addEventListener("touchmove",  onTouchMove, { passive: false });
    document.addEventListener("touchend",   onTouchEnd);
    document.addEventListener("touchcancel", onTouchEnd);
    document.addEventListener("mousemove",  onMouseMove);
    document.addEventListener("mouseup",    onMouseUp);

    return () => {
      document.removeEventListener("touchmove",  onTouchMove);
      document.removeEventListener("touchend",   onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
      document.removeEventListener("mousemove",  onMouseMove);
      document.removeEventListener("mouseup",    onMouseUp);
    };
  }, [hoveredIdx, closeWheel, findNearest]);

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
    like: "bg-pink-500/20 text-pink-400",
    reply: "bg-blue-500/20 text-blue-400",
    follow: "bg-purple-500/20 text-purple-400",
    mention: "bg-yellow-500/20 text-yellow-400",
    message: "bg-green-500/20 text-green-400",
    login_alert: "bg-red-500/20 text-red-400",
    repost: "bg-emerald-500/20 text-emerald-400",
    quote: "bg-cyan-500/20 text-cyan-400",
  };
  const texts = {
    like: "лайкнул(а) ваш пост",
    reply: "ответил(а) на ваш пост",
    follow: "подписался(ась) на вас",
    mention: "упомянул(а) вас в посте",
    message: "прислал(а) сообщение",
    login_alert: "вход с нового устройства",
    repost: "репостнул(а) ваш пост",
    quote: "цитировал(а) ваш пост",
  };

  const glow = user
    ? user.is_admin ? "#ffffff"
    : user.is_moderator ? "#3b82f6"
    : user.role?.color ?? null
    : null;

  const hasAdminAccess = user?.is_admin || user?.is_moderator || user?.permissions?.includes("manage_users");

  const isDock = layout === "dock";
  const isMessagesPage = pathname?.startsWith("/messages") ?? false;
  const orbitDesktopPos = "bottom-56 right-0 rounded-l-full";
  const orbitRowPos = "bottom-[228px] right-[68px]";
  const iconClass = isDock ? "w-6 h-6 mx-auto shrink-0" : "w-[18px] h-[18px]";
  const textClass = isDock ? "hidden" : "block";
  const containerClass = isDock ? "justify-center px-0 py-3" : "items-center gap-3 px-4 py-3";

  // ════════════════════════════════════════════════════════════════
  // 🧠 ПАМЯТЬ ЛЕНТЫ (Logic)
  // ════════════════════════════════════════════════════════════════
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

  const triggerRestore = useCallback(() => {
    window.dispatchEvent(new CustomEvent("restore-feed-position"));
  }, []);

  const handleOrbitDoubleClick = useCallback(() => {
    triggerRestore();
  }, [triggerRestore]);

  const handleOrbitTouchEnd = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      triggerRestore();
    }
    lastTapRef.current = now;
  }, [triggerRestore]);

  const desktopSidebarContent = (
    <>
      <div className={`flex ${isDock ? "justify-center" : "items-center gap-2"}`}>
        <img src="/logo-icon.svg" alt="Trelod logo" className={isDock ? "w-8 h-8" : "w-9 h-9"} />
        {!isDock && <h1 className="font-logo text-4xl text-[#8b5cf6]">trelod</h1>}
      </div>
      
      <nav className="flex flex-col flex-1">
        {/* 🔥 ПАМЯТЬ ЛЕНТЫ (Classic / Dock) */}
        {hasFeedMemory && (
          <button 
            onClick={triggerRestore}
            className={`flex ${containerClass} font-medium transition-all border-b border-[#8b5cf6]/20 group relative text-[#a78bfa] hover:bg-[#8b5cf6]/15 mb-1`}
          >
            <History size={18} className={`${iconClass} text-[#8b5cf6]`} />
            <span className={textClass}>Продолжить чтение</span>
            <span className={`${isDock ? "absolute top-2 right-2" : "ml-auto"} w-2 h-2 rounded-full bg-[#8b5cf6] animate-pulse shadow-[0_0_8px_#8b5cf6]`}></span>
          </button>
        )}

        {nav.map(({ href, icon: Icon, label }) => {
          const active = pathname === href;
          const showUpdatesBadge = href === "/updates" && (counts.updates || 0) > 0;
          return (
            <Link key={href} href={href}
              className={`flex ${containerClass} font-medium transition-all border-b border-white/5 last:border-none group relative ${
                active ? "bg-[#8b5cf6]/15 text-[#a78bfa]" : "text-white/40 hover:bg-white/[0.03] hover:text-white/60"
              }`}>
              <Icon size={18} className={`${iconClass} ${active ? "text-[#8b5cf6]" : "text-white/80 group-hover:text-white"}`} />
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
            className={`flex ${containerClass} font-medium transition-all relative border-b border-white/5 group ${
              pathname?.startsWith("/messages") ? "bg-[#8b5cf6]/15 text-[#a78bfa]" : "text-white/40 hover:bg-white/[0.03] hover:text-white/60"
            }`}>
            <MessageSquare size={18} className={`${iconClass} ${pathname?.startsWith("/messages") ? "text-[#8b5cf6]" : "text-white/80 group-hover:text-white"}`} />
            <span className={textClass}>Сообщения</span>
            {counts.chats > 0 && (
              <span className={`${isDock ? "absolute top-2 right-2" : "ml-auto"} bg-[#8b5cf6] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-sm`}>
                {counts.chats}
              </span>
            )}
          </Link>
        )}

        <button onClick={loadNotifications}
          className={`flex ${containerClass} font-medium transition-all relative border-b border-white/5 group ${
            pathname === "/notifications" ? "bg-[#8b5cf6]/15 text-[#a78bfa]" : "text-white/40 hover:bg-white/[0.03] hover:text-white/60"
          }`}>
          <Bell size={18} className={`${iconClass} ${pathname === "/notifications" ? "text-[#8b5cf6]" : "text-white/80 group-hover:text-white"}`} />
          <span className={textClass}>Уведомления</span>
          {counts.notifications > 0 && (
            <span className={`${isDock ? "absolute top-2 right-2" : "ml-auto"} bg-[#8b5cf6] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-sm`}>
              {counts.notifications}
            </span>
          )}
        </button>

        {hasAdminAccess && !isDock && (
          <AdminDropdown 
            user={user} 
            pathname={pathname}
            isOpen={showAdminDropdown}
            onToggle={() => setShowAdminDropdown(!showAdminDropdown)}
            onClose={() => setShowAdminDropdown(false)}
          />
        )}

        {hasAdminAccess && isDock && (
           <Link href="/admin" className={`flex ${containerClass} font-medium transition-all border-b border-white/5 group text-white/40 hover:bg-white/[0.03] hover:text-white/60`}>
              <ShieldAlert size={18} className={iconClass} />
           </Link>
        )}
      </nav>

      {/* ═══════ FOOTER (без лишних линий) ═══════ */}
      <div className={`mt-auto pt-4 ${isDock ? "flex flex-col items-center gap-3" : ""}`}>
        
        {/* Сервисные кнопки */}
        {!isDock && (
          <div className="px-4 flex items-center gap-2 mb-4">
            <button onClick={() => setShowBugModal(true)}
              className="p-2.5 rounded-xl text-orange-400/80 hover:text-orange-400 hover:bg-orange-500/10 transition-all" title="Сообщить о проблеме">
              <Bug size={18} />
            </button>
            <button onClick={() => setShowLayoutPicker(true)}
              className="p-2.5 rounded-xl text-[#8b5cf6]/80 hover:text-[#8b5cf6] hover:bg-[#8b5cf6]/10 transition-all" title="Настроить интерфейс">
              <Palette size={18} />
            </button>
          </div>
        )}

        {isDock && (
          <div className="flex flex-col items-center gap-2 mb-2">
            <button onClick={() => setShowBugModal(true)}
              className="p-2 rounded-lg text-orange-400/80 hover:text-orange-400 hover:bg-orange-500/10 transition-all shrink-0" title="Баг-трекер">
              <Bug size={20} className="shrink-0" />
            </button>
            <button onClick={() => setShowLayoutPicker(true)}
              className="p-2 rounded-lg text-[#8b5cf6]/80 hover:text-[#8b5cf6] hover:bg-[#8b5cf6]/10 transition-all shrink-0" title="Интерфейс">
              <Palette size={20} className="shrink-0" />
            </button>
          </div>
        )}

        {/* Профиль и Выход */}
        {user ? (
          <div className={isDock ? "flex flex-col items-center gap-2" : "px-2"}>
            <Link href={`/${user.username}`}
              className={`flex ${isDock ? "justify-center" : "items-center gap-3 px-2 py-2"} rounded-lg hover:bg-white/5 transition-all cursor-pointer group w-full`}>
              <div className="shrink-0" style={glow ? { filter: `drop-shadow(0 0 8px ${glow})` } : undefined}>
                <Avatar src={user.avatar_url} name={user.display_name} id={user.id} />
              </div>
              {!isDock && (
                <div className="leading-tight min-w-0 flex-1">
                  <p className={`font-semibold text-sm truncate transition-all ${glow ? "group-hover:opacity-80" : "text-white group-hover:text-[#8b5cf6]"}`}
                    style={glow ? { color: glow, textShadow: `0 0 6px ${glow}B3, 0 0 14px ${glow}66` } : undefined}>
                    {user.display_name}
                  </p>
                  <p className="text-sm text-white/40 truncate">@{user.username}</p>
                </div>
              )}
              {/* Кнопка ВЫЙТИ внутри профиля (Classic) */}
              {!isDock && (
                <button 
                  onClick={(e) => { 
                    e.preventDefault(); 
                    e.stopPropagation(); 
                    clearToken(); 
                    setUser(null); 
                    clearCachedUser(); 
                    router.push("/");
                  }}
                  className="shrink-0 p-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/20 transition-all" 
                  title="Выйти"
                >
                  <LogOut size={18} />
                </button>
              )}
            </Link>
            
            {/* Кнопка ВЫЙТИ отдельной иконкой (Dock) */}
            {isDock && (
              <button 
                onClick={() => { clearToken(); setUser(null); clearCachedUser(); router.push("/"); }}
                className="flex justify-center items-center w-full py-2 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all shrink-0"
                title="Выйти"
              >
                <LogOut size={20} className="shrink-0" />
              </button>
            )}
          </div>
        ) : (
          !isDock && (
            <div className="px-2">
              <Link href="/login"
                className="flex items-center justify-center bg-[#8b5cf6]/15 border border-[#8b5cf6]/30 rounded-lg px-4 py-2.5 font-medium text-[#a78bfa] hover:bg-[#8b5cf6]/25 transition-all w-full">
                Войти
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
    if (buttonRef.current && wheelOpen) {
      const r = buttonRef.current.getBoundingClientRect();
      buttonCx.current = r.left + r.width / 2;
      buttonCy.current = r.top + r.height / 2;
    }
  }, [wheelOpen]);

  const renderWheel = () => {
    if (!wheelOpen) return null;
    const activePos = hoveredIdx !== null ? getIconPos(hoveredIdx) : null;

    return (
      <div
        className="fixed inset-0 z-[100] pointer-events-none"
        style={{ touchAction: "none" }}
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
                    ? "w-11 h-11 bg-[#1a1a1f]/95 border border-white/15 shadow-lg shadow-black/40"
                    : "w-12 h-12 bg-[#22222a]/95 border border-white/20 shadow-lg shadow-black/40"
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
                    <span className={`font-bold ${isActive ? "text-white" : "text-white/70"}`}>
                      {(user.display_name || "?")[0]?.toUpperCase()}
                    </span>
                  )
                ) : (
                  <item.icon size={isActive ? 26 : isOuter ? 19 : 21} className={isActive ? "text-white" : "text-white/70"} />
                )}
                  </div>
                {!!item.count && item.count > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#8b5cf6] border-2 border-[#171717] text-white text-[9px] font-bold flex items-center justify-center">
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
      </div>
    );
  };

  return (
    <>
      {/* ═══════ МОБИЛКА ИЛИ DESKTOP ORBIT ═══════ */}
      <div className={layout === "orbit" ? "block" : "md:hidden"}>
        {/* 🔥 КРУГИ НА ВОДЕ (Память ленты) */}
        {hasFeedMemory && (
          <div 
            className={`fixed z-[97] w-14 h-14 pointer-events-none flex items-center justify-center
              ${layout === "orbit" 
                ? orbitDesktopPos 
                : "right-0 top-[calc(50%+8px)] -translate-y-1/2 rounded-l-full"
              }
            `}
          >
            <span className="absolute w-full h-full rounded-full border-2 border-[#8b5cf6]/80 feed-ripple"></span>
            <span className="absolute w-full h-full rounded-full border-2 border-[#8b5cf6]/50 feed-ripple-delay"></span>
          </div>
        )}

        <button
          ref={buttonRef}
          onTouchStart={handleStart}
          onMouseDown={handleStart}
          onDoubleClick={handleOrbitDoubleClick}
          onTouchEnd={handleOrbitTouchEnd}
          className={`fixed z-[98] w-14 h-14 
            bg-[#171717]/90 backdrop-blur-sm border 
            flex items-center justify-center shadow-lg shadow-black/50
            transition-all duration-200
            ${wheelOpen
              ? "border-[#8b5cf6]/50 bg-[#8b5cf6]/20 scale-110"
              : "border-white/10 active:scale-95"}
            ${layout === "orbit" 
              ? orbitDesktopPos
              : "right-0 top-[calc(50%+8px)] -translate-y-1/2 rounded-l-full"
            }
          `}
          style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}
          aria-label="Меню навигации"
        >
          <Orbit size={22} className={`transition-all duration-300 ${wheelOpen ? "text-[#8b5cf6] rotate-[60deg]" : "text-white/80"}`} />
        </button>
        {renderWheel()}
      </div>

      {/* 🔥 ТУЛТИП ПАМЯТИ ЛЕНТЫ */}
      {showTooltip && hasFeedMemory && (
        <div 
          className={`fixed z-[99] bg-[#8b5cf6] text-white text-xs font-bold px-3 py-2 rounded-lg shadow-xl whitespace-nowrap animate-bounce
            ${layout === "orbit" 
              ? (isMobile ? "right-20 top-[calc(50%+8px)] -translate-y-1/2" : "bottom-64 right-20") 
              : (isDock ? "left-24 top-20" : "left-72 top-20")
            }
          `}
        >
          {layout === "orbit" ? "Двойной тап по орбите" : "Нажми, чтобы"} продолжить чтение
          <div 
            className={`absolute w-2 h-2 bg-[#8b5cf6] rotate-45
              ${layout === "orbit" 
                ? (isMobile ? "right-[-4px] top-1/2 -translate-y-1/2" : "bottom-[-4px] right-10") 
                : "left-[-4px] top-4"
              }
            `}
          ></div>
        </div>
      )}

      {/* ═══════ DESKTOP ORBIT: непрочитанное слева от орбиты ═══════ */}
      {layout === "orbit" && !isMobile && (counts.chats > 0 || counts.notifications > 0) && (
      <div className={`fixed right-[92px] ${orbitRowPos} z-[97] flex flex-row items-center gap-3`}>
          {counts.chats > 0 && (
            <button
              onClick={() => router.push("/messages")}
              className="relative w-12 h-12 rounded-full bg-[#171717]/90 backdrop-blur-sm border border-white/10 flex items-center justify-center shadow-lg shadow-black/50 text-white/80 hover:text-white hover:border-[#8b5cf6]/50 hover:bg-[#8b5cf6]/20 transition-all"
              title="Сообщения"
            >
              <MessageSquare size={20} />
              <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-[#8b5cf6] border-2 border-[#171717] text-white text-[10px] font-bold flex items-center justify-center">
                {counts.chats > 9 ? "9+" : counts.chats}
              </span>
            </button>
          )}

          {counts.notifications > 0 && (
            <button
              onClick={() => router.push("/notifications")}
              className="relative w-12 h-12 rounded-full bg-[#171717]/90 backdrop-blur-sm border border-white/10 flex items-center justify-center shadow-lg shadow-black/50 text-white/80 hover:text-white hover:border-[#8b5cf6]/50 hover:bg-[#8b5cf6]/20 transition-all"
              title="Уведомления"
            >
              <Bell size={20} />
              <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-[#8b5cf6] border-2 border-[#171717] text-white text-[10px] font-bold flex items-center justify-center">
                {counts.notifications > 9 ? "9+" : counts.notifications}
              </span>
            </button>
          )}
        </div>
      )}



      {/* ═══════ ДЕСКТОП CLASSIC / DOCK ═══════ */}
      {layout !== "orbit" && (
        <aside className={`hidden md:flex shrink-0 overflow-y-auto flex-col bg-[#171717] transition-all duration-300 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          isDock ? "md:w-20 md:min-w-20 px-0 py-4 gap-2" : "md:w-64 md:min-w-64 p-5 gap-5"
        }`}>
          {desktopSidebarContent}
        </aside>
      )}

      {/* ═══════ УВЕДОМЛЕНИЯ ═══════ */}
      {showNotifs && (
        <>
          <div className="fixed inset-0 bg-black/60 z-[99]" onClick={() => setShowNotifs(false)} />
          <div className={`fixed left-4 right-4 md:right-auto md:top-4 top-16 w-auto md:w-[380px] max-h-[70vh] md:max-h-[520px] overflow-hidden border border-white/10 rounded-2xl bg-[#1f1f23] shadow-2xl z-[100] flex flex-col transition-all duration-300 ${
             isDock ? "md:left-24" : "md:left-[272px]"
          }`}>
            <div className="sticky top-0 bg-[#1f1f23]/95 backdrop-blur-md border-b border-white/10 p-3 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-white">Уведомления</h3>
              <div className="flex items-center gap-1">
                {notifs.some((n) => !n.read) && (
                  <button onClick={markAllRead} className="text-xs text-[#8b5cf6] hover:text-[#a78bfa] font-semibold px-2 py-1 rounded-lg hover:bg-[#8b5cf6]/10 transition-colors">
                    Прочитать все
                  </button>
                )}
                <button onClick={() => setShowNotifs(false)} className="p-1.5 text-white/50 hover:text-white rounded-lg hover:bg-white/10 transition-colors">
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {notifs.length === 0 && (
                <div className="p-8 text-center">
                  <Bell size={32} className="text-white/20 mx-auto mb-3" />
                  <p className="text-sm text-white/50">Пока нет уведомлений</p>
                </div>
              )}
              {notifs.map((n) => {
                const link = getNotifLink(n);
                return (
                  <Link key={n.id} href={link}
                    onClick={() => { if (!n.read) markRead(n.id); setShowNotifs(false); }}
                    className={`flex items-start gap-3 p-3 border-b border-white/5 hover:bg-white/5 transition-colors relative ${!n.read ? "bg-[#8b5cf6]/[0.03]" : ""}`}>
                    {!n.read && <div className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full bg-[#8b5cf6]" />}
                    <div className="shrink-0 relative">
                      <Avatar src={n.actor?.avatar_url} name={n.actor?.display_name || "User"} id={n.actor?.id} size={42} />
                      <div className={`absolute -bottom-1 -right-1 w-[18px] h-[18px] rounded-full flex items-center justify-center border-2 border-[#1f1f23] ${iconBg[n.type] || "bg-[#8b5cf6]/20 text-[#8b5cf6]"}`}>
                        {icons[n.type as keyof typeof icons] || <Bell size={9} />}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-white/90 leading-snug">
                        <span className="font-semibold text-white">{n.actor?.display_name || "Неизвестный"}</span>{" "}
                        {texts[n.type as keyof typeof texts] || "совершил(а) действие"}
                      </p>
                      <p className="text-[11px] text-white/40 mt-1">
                        {new Date(n.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    {!n.read && <div className="w-2 h-2 rounded-full bg-[#8b5cf6] shrink-0 mt-2 shadow-[0_0_6px_rgba(139,92,246,0.6)]" />}
                  </Link>
                );
              })}
            </div>
            <div className="sticky bottom-0 bg-[#1f1f23]/95 backdrop-blur-md border-t border-white/10 p-2.5 shrink-0">
              <Link href="/notifications" onClick={() => setShowNotifs(false)}
                className="block w-full text-center text-sm font-semibold text-[#8b5cf6] hover:text-[#a78bfa] py-2 rounded-lg hover:bg-[#8b5cf6]/10 transition-all">
                Посмотреть все
              </Link>
            </div>
          </div>
        </>
      )}

      {showBugModal && <BugReportModal onClose={() => setShowBugModal(false)} />}
      {showSearch && <MobileSearch onClose={() => setShowSearch(false)} />}
      {showAdminMenu && <MobileAdminSheet user={user} onClose={() => setShowAdminMenu(false)} />}
      {showLayoutPicker && <LayoutPicker current={layout} onClose={() => setShowLayoutPicker(false)} />}
    </>
  );
}