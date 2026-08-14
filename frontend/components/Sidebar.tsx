"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Home, Bell, Settings, LogOut, Heart, MessageCircle, UserPlus,
  AtSign, X, Shield, ShieldCheck, MessageSquare, Palette,
  Bug, Orbit, Search, Megaphone, Bookmark, ShieldAlert, Wrench, RefreshCw, Quote, ChevronLeft
} from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { getToken, clearToken } from "@/lib/auth";
import { BugReportModal } from "@/components/BugReportModal";
import { getCachedUser, setCachedUser, clearCachedUser } from "@/lib/authCache";
import { useUnreadCounts } from "@/lib/UnreadCountsContext";

// ════════════════════════════════════════════════════════════════
// 🎯 ДВОЙНОЙ ПОЛУКРУГ: внутренний = частое, внешний = редкое
// ════════════════════════════════════════════════════════════════
const INNER_RADIUS     = 135;  // ближний слой
const OUTER_RADIUS     = 215;  // дальний слой
const CENTER_OFFSET_X  = 40;
const CENTER_OFFSET_Y  = 0;
const ARC_ANGLE_START  = (11 * Math.PI) / 18;  // 110°
const ARC_ANGLE_END    = (25 * Math.PI) / 18;  // 250°
const SNAP_RADIUS      = 48;   // меньше = точнее наведение
const LONG_PRESS_MS    = 250;

export function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const [user, setUser]               = useState<any>(() => getCachedUser());
  const [showNotifs, setShowNotifs]   = useState(false);
  const [notifs, setNotifs]           = useState<any[]>([]);
  const [showBugModal, setShowBugModal] = useState(false);

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

  type WheelItem = { href: string; icon: any; label: string; isProfile?: boolean; count?: number };

  // ══════════════════════════════════════════════════════════════
  // ️ ВАРИАНТ А: ВНУТРЕННИЙ СЛОЙ — то, что жмёшь каждый день
  // ══════════════════════════════════════════════════════════════
  const innerItems: WheelItem[] = [
    { href: "/", icon: Home, label: "Главная" },
  ];
  if (user) innerItems.push({ href: "/messages", icon: MessageSquare, label: "Сообщения", count: counts.chats });
  if (user) innerItems.push({ href: "/notifications", icon: Bell, label: "Уведомления", count: counts.notifications });
  innerItems.push({ href: "/bookmarks", icon: Bookmark, label: "Закладки" });
  innerItems.push({ href: "/updates", icon: Megaphone, label: "Обновления", count: counts.updates });
  if (user) innerItems.push({ href: `/${user.username}`, icon: Home, label: "Профиль", isProfile: true });

  // 🧰 ВНЕШНИЙ СЛОЙ — системное и редкое
  const outerItems: WheelItem[] = [
    { href: "/settings", icon: Settings, label: "Настройки" },
    { href: "/rules", icon: Shield, label: "Правила" },
    { href: "#bug", icon: Bug, label: "Баг-трекер" },
  ];
  if (user?.is_admin || user?.is_moderator || user?.permissions?.includes("manage_users")) {
    outerItems.push({
      href: "/admin",
      icon: user?.is_admin ? ShieldAlert : user?.is_moderator ? ShieldCheck : Shield,
      label: user?.is_admin ? "Админка" : user?.is_moderator ? "Модерация" : "Админ панель",
    });
  }
  if (user?.is_admin) outerItems.push({ href: "/admin/roles", icon: Palette, label: "Роли" });
  if (user?.permissions?.includes("tech_access")) outerItems.push({ href: "/admin/technical", icon: Wrench, label: "Техпанель" });
  if (user) outerItems.push({ href: "#logout", icon: LogOut, label: "Выйти" });
  else outerItems.push({ href: "/login", icon: Home, label: "Войти" });

  // Склеиваем в один массив + карта слоёв
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

  // ══════════════════════════════════════════════════════════════
  //  Позиция иконки с учётом слоя
  // ══════════════════════════════════════════════════════════════
  const getIconPos = useCallback((globalIdx: number) => {
    const info = itemLayerMap.get(globalIdx);
    if (!info) return { x: arcCenterRef.current.x, y: arcCenterRef.current.y };

    const radius = info.layer === "inner" ? INNER_RADIUS : OUTER_RADIUS;
    const items  = info.layer === "inner" ? innerItems : outerItems;
    const n = items.length;

    const step  = (ARC_ANGLE_END - ARC_ANGLE_START) / Math.max(n - 1, 1);
    const angle = ARC_ANGLE_START + info.localIdx * step;

    return {
      x: arcCenterRef.current.x + radius * Math.cos(angle),
      y: arcCenterRef.current.y + radius * Math.sin(angle),
    };
  }, [innerItems.length, outerItems.length]);

  const openWheel = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    arcCenterRef.current = {
      x: rect.left + rect.width / 2 + CENTER_OFFSET_X,
      y: rect.top + rect.height / 2 + CENTER_OFFSET_Y,
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

  // ── Уведомления: иконки/цвета/тексты ──────────────────────────
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

  // ══════════════════════════════════════════════════════════════
  //  Десктопный сайдбар
  // ══════════════════════════════════════════════════════════════
  const desktopSidebarContent = (
    <>
      <div className="flex items-center gap-2">
        <img src="/logo-icon.svg" alt="Trelod logo" className="w-9 h-9" />
        <h1 className="font-logo text-4xl text-[#8b5cf6]">trelod</h1>
      </div>
      <nav className="flex flex-col">
        {nav.map(({ href, icon: Icon, label }) => {
          const active = pathname === href;
          const showUpdatesBadge = href === "/updates" && (counts.updates || 0) > 0;
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-3 px-4 py-3 font-medium transition-all border-b border-white/5 last:border-none group ${
                active ? "bg-[#8b5cf6]/15 text-[#a78bfa]" : "text-white/40 hover:bg-white/[0.03] hover:text-white/60"
              }`}>
              <Icon size={18} className={active ? "text-[#8b5cf6]" : "text-white/80 group-hover:text-white"} />
              <span>{label}</span>
              {showUpdatesBadge && (
                <span className="ml-auto bg-[#8b5cf6] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-sm">{counts.updates}</span>
              )}
            </Link>
          );
        })}
        {user && (
          <Link href="/messages"
            className={`flex items-center gap-3 px-4 py-3 font-medium transition-all relative border-b border-white/5 group ${
              pathname?.startsWith("/messages") ? "bg-[#8b5cf6]/15 text-[#a78bfa]" : "text-white/40 hover:bg-white/[0.03] hover:text-white/60"
            }`}>
            <MessageSquare size={18} className={pathname?.startsWith("/messages") ? "text-[#8b5cf6]" : "text-white/80 group-hover:text-white"} />
            <span>Сообщения</span>
            {counts.chats > 0 && (
              <span className="ml-auto bg-[#8b5cf6] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-sm">{counts.chats}</span>
            )}
          </Link>
        )}
        {(user?.is_admin || user?.is_moderator || user?.permissions?.includes("manage_users")) && (
          <Link href="/admin"
            className={`flex items-center gap-3 px-4 py-3 font-medium transition-all border-b border-white/5 group ${
              pathname === "/admin" ? "bg-[#8b5cf6]/15 text-[#a78bfa]" : "text-white/40 hover:bg-white/[0.03] hover:text-white/60"
            }`}>
            {user?.is_admin
              ? <ShieldAlert size={18} className={pathname === "/admin" ? "text-[#8b5cf6]" : "text-white/80 group-hover:text-white"} />
              : user?.is_moderator
                ? <ShieldCheck size={18} className={pathname === "/admin" ? "text-[#8b5cf6]" : "text-white/80 group-hover:text-white"} />
                : <ShieldAlert size={18} className="text-[#f59e0b]" />}
            <span>{user?.is_admin ? "Админка" : user?.is_moderator ? "Модерация" : "Админ панель"}</span>
          </Link>
        )}
        {user?.is_admin && (
          <Link href="/admin/roles"
            className={`flex items-center gap-3 px-4 py-3 font-medium transition-all border-b border-white/5 group ${
              pathname === "/admin/roles" ? "bg-[#8b5cf6]/15 text-[#a78bfa]" : "text-white/40 hover:bg-white/[0.03] hover:text-white/60"
            }`}>
            <Palette size={18} className={pathname === "/admin/roles" ? "text-[#8b5cf6]" : "text-white/80 group-hover:text-white"} />
            <span>Роли</span>
          </Link>
        )}
        {user?.permissions?.includes("tech_access") && (
          <Link href="/admin/technical"
            className={`flex items-center gap-3 px-4 py-3 font-medium transition-all border-b border-white/5 group ${
              pathname === "/admin/technical" ? "bg-[#8b5cf6]/15 text-[#a78bfa]" : "text-white/40 hover:bg-white/[0.03] hover:text-white/60"
            }`}>
            <Wrench size={18} className={pathname === "/admin/technical" ? "text-[#8b5cf6]" : "text-white/80 group-hover:text-white"} />
            <span>Техпанель</span>
          </Link>
        )}
        <button onClick={loadNotifications}
          className={`flex items-center gap-3 px-4 py-3 font-medium transition-all relative border-b border-white/5 group ${
            pathname === "/notifications" ? "bg-[#8b5cf6]/15 text-[#a78bfa]" : "text-white/40 hover:bg-white/[0.03] hover:text-white/60"
          }`}>
          <Bell size={18} className={pathname === "/notifications" ? "text-[#8b5cf6]" : "text-white/80 group-hover:text-white"} />
          <span>Уведомления</span>
          {counts.notifications > 0 && (
            <span className="ml-auto bg-[#8b5cf6] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-sm">{counts.notifications}</span>
          )}
        </button>
        <div className="mt-4 px-4">
          <button onClick={() => setShowBugModal(true)}
            className="w-fit p-2.5 rounded-xl text-orange-400/80 hover:text-orange-400 hover:bg-orange-500/10 transition-all" title="Сообщить о проблеме">
            <Bug size={18} />
          </button>
        </div>
      </nav>
      <div className="mt-4 flex flex-col gap-2 pt-4 border-t border-white/5">
        {user ? (
          <Link href={`/${user.username}`}
            className="flex items-center gap-3 px-2 py-2 -mx-2 rounded-lg hover:bg-white/5 transition-all cursor-pointer group w-full">
            <div className="shrink-0" style={glow ? { filter: `drop-shadow(0 0 8px ${glow})` } : undefined}>
              <Avatar src={user.avatar_url} name={user.display_name} id={user.id} />
            </div>
            <div className="leading-tight min-w-0 flex-1">
              <p className={`font-semibold text-sm truncate transition-all ${glow ? "group-hover:opacity-80" : "text-white group-hover:text-[#8b5cf6]"}`}
                style={glow ? { color: glow, textShadow: `0 0 6px ${glow}B3, 0 0 14px ${glow}66` } : undefined}>
                {user.display_name}
              </p>
              <p className="text-sm text-white/40 truncate">@{user.username}</p>
            </div>
            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); clearToken(); setUser(null); clearCachedUser(); }}
              className="shrink-0 p-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/20 transition-all" title="Выйти">
              <LogOut size={18} />
            </button>
          </Link>
        ) : (
          <Link href="/login"
            className="flex items-center justify-center bg-[#8b5cf6]/15 border border-[#8b5cf6]/30 rounded-lg px-4 py-2.5 font-medium text-[#a78bfa] hover:bg-[#8b5cf6]/25 transition-all w-full">
            Войти
          </Link>
        )}
      </div>
    </>
  );

  // ══════════════════════════════════════════════════════════════
  //  Рендер колеса
  // ══════════════════════════════════════════════════════════════
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
        {/* Иконки */}
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
              {/* ✅ overflow-hidden — аватарка обрезается по кругу, без обводок */}
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
                  // ✅ Аватарка на ВЕСЬ круг: без сжатия и без двойной обводки
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
              
                {/* Счётчик непрочитанного */}
                {!!item.count && item.count > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#8b5cf6] border-2 border-[#171717] text-white text-[9px] font-bold flex items-center justify-center">
                    {item.count > 9 ? "9+" : item.count}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {/* Пульсация на активной */}
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

  // ══════════════════════════════════════════════════════════════
  return (
    <>
      {/* ═══════ МОБИЛКА ═══════ */}
      <div className="md:hidden">
        <button
          ref={buttonRef}
          onTouchStart={handleStart}
          onMouseDown={handleStart}
          className={`fixed right-0 z-[98] w-14 h-14 -translate-y-1/2
            bg-[#171717]/90 backdrop-blur-sm border rounded-l-full
            flex items-center justify-center shadow-lg shadow-black/50
            transition-all duration-200
            ${wheelOpen
              ? "border-[#8b5cf6]/50 bg-[#8b5cf6]/20 scale-110"
              : "border-white/10 active:scale-95"}`}
          style={{ top: "calc(50% + 8px)", touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}
          aria-label="Меню навигации"
        >
          <Orbit size={22} className={`transition-all duration-300 ${wheelOpen ? "text-[#8b5cf6] rotate-[60deg]" : "text-white/80"}`} />
        </button>
        {renderWheel()}
      </div>

      {/* ═══════ ДЕСКТОП ═══════ */}
      <aside className="hidden md:flex md:w-64 shrink-0 overflow-y-auto p-5 flex-col gap-5 bg-[#171717]">
        {desktopSidebarContent}
      </aside>

      {/* ═══════ УВЕДОМЛЕНИЯ ═══════ */}
      {showNotifs && (
        <>
          <div className="fixed inset-0 bg-black/60 z-[99]" onClick={() => setShowNotifs(false)} />
          <div className="fixed left-4 right-4 md:left-[272px] md:right-auto md:top-4 top-16 w-auto md:w-[380px] max-h-[70vh] md:max-h-[520px] overflow-hidden border border-white/10 rounded-2xl bg-[#1f1f23] shadow-2xl z-[100] flex flex-col">
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
    </>
  );
}