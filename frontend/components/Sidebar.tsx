"use client";
import { useEffect, useState, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Home, Bell, Settings, LogOut, Heart, MessageCircle, UserPlus,
  AtSign, X, Shield, ShieldCheck, MessageSquare, Palette,
  Bug, Menu, Search, Megaphone, Bookmark, ShieldAlert, Wrench, RefreshCw, Quote, ChevronLeft
} from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { getToken, clearToken } from "@/lib/auth";
import { BugReportModal } from "@/components/BugReportModal";
import { getCachedUser, setCachedUser, clearCachedUser } from "@/lib/authCache";
import { useUnreadCounts } from "@/lib/UnreadCountsContext";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(() => getCachedUser());
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [showBugModal, setShowBugModal] = useState(false);
  const [searchQ, setSearchQ] = useState("");

  // ── Состояние для мобильного колеса (полуколесо) ────────────────────────
  const [wheelOpen, setWheelOpen] = useState(false);
  const [wheelOffset, setWheelOffset] = useState(0);          // накопленный поворот в радианах
  const [activeIndex, setActiveIndex] = useState(0);           // текущий активный пункт

  const buttonRef = useRef<HTMLButtonElement>(null);
  const centerRef = useRef({ x: 0, y: 0 });                   // центр дуги (со смещением от кнопки)
  const isDragging = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const lastAngle = useRef(0);
  const accumulatedOffset = useRef(0);

  const { counts, refresh } = useUnreadCounts();

  // ── Пункты для колеса ─────────────────────────────────────────────────
  const wheelItems: Array<{ href: string; icon: any; label: string }> = [
    { href: "/",          icon: Home,        label: "Главная" },
    { href: "/bookmarks", icon: Bookmark,    label: "Закладки" },
    { href: "/updates",   icon: Megaphone,   label: "Обновления" },
    { href: "/rules",     icon: Shield,      label: "Правила" },
    { href: "/settings",  icon: Settings,    label: "Настройки" },
  ];

  if (user) {
    wheelItems.push({ href: "/messages", icon: MessageSquare, label: "Сообщения" });
  }

  if (user?.is_admin || user?.is_moderator || user?.permissions?.includes("manage_users")) {
    wheelItems.push({
      href: "/admin",
      icon: user?.is_admin ? ShieldAlert : user?.is_moderator ? ShieldCheck : Shield,
      label: user?.is_admin ? "Админка" : user?.is_moderator ? "Модерация" : "Админ панель",
    });
  }

  wheelItems.push({ href: "/notifications", icon: Bell, label: "Уведомления" });

  if (user) {
    wheelItems.push({ href: `/${user.username}`, icon: Home, label: "Профиль" });
    wheelItems.push({ href: "#logout", icon: LogOut, label: "Выйти" });
  } else {
    wheelItems.push({ href: "/login", icon: Home, label: "Войти" });
  }

  // ── Десктопные пункты (как было) ──────────────────────────────────────
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
    if (res.ok) {
      setNotifs(await res.json());
      setShowNotifs(true);
    }
  }

  async function markRead(id: number) {
    const token = getToken();
    if (!token) return;
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/notifications/${id}/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    refresh();
  }

  async function markAllRead() {
    const token = getToken();
    if (!token) return;
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/notifications/read-all`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
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

  // ──── ЛОГИКА МОБИЛЬНОГО КОЛЕСА ──────────────────────────────────────────

  // Нормализация угла в диапазон [0, 2π)
  const normalizeAngle = (a: number): number => {
    while (a < 0) a += 2 * Math.PI;
    while (a >= 2 * Math.PI) a -= 2 * Math.PI;
    return a;
  };

  // Параметры дуги
  const ARC_RADIUS = 120;
  const CENTER_OFFSET_Y = -40;                // поднимаем центр дуги над кнопкой
  const ARC_START = Math.PI / 2;              // 90°  (низ дуги)
  const ARC_END = (3 * Math.PI) / 2;          // 270° (верх дуги)

  const midIndex = (wheelItems.length - 1) / 2;
  const step = (ARC_END - ARC_START) / (wheelItems.length - 1);

  // Глобальные обработчики движения/отпускания (чтобы ловить drag вне кнопки)
  useEffect(() => {
    if (!wheelOpen) return;

    const handleMove = (clientX: number, clientY: number) => {
      if (!isDragging.current) return;

      const dx = clientX - centerRef.current.x;
      const dy = clientY - centerRef.current.y;
      const currentAngle = normalizeAngle(Math.atan2(dy, dx));

      let delta = currentAngle - lastAngle.current;
      if (delta > Math.PI) delta -= 2 * Math.PI;
      if (delta < -Math.PI) delta += 2 * Math.PI;

      accumulatedOffset.current += delta;
      lastAngle.current = currentAngle;

      const newActiveIndex = Math.round(midIndex + accumulatedOffset.current / step);
      const clampedIndex = Math.max(0, Math.min(wheelItems.length - 1, newActiveIndex));

      setWheelOffset(accumulatedOffset.current);
      setActiveIndex(clampedIndex);
    };

    const handleEnd = () => {
      if (!isDragging.current) return;
      isDragging.current = false;

      const finalIndex = Math.round(midIndex + accumulatedOffset.current / step);
      const clampedIndex = Math.max(0, Math.min(wheelItems.length - 1, finalIndex));

      // «Был сделан выбор» — activeIndex отличается от начального (среднего)
      const wasRotated = Math.abs(clampedIndex - Math.round(midIndex)) > 0;

      if (wasRotated) {
        const selectedItem = wheelItems[clampedIndex];
        if (selectedItem) {
          if (selectedItem.href === "#logout") {
            clearToken();
            setUser(null);
            clearCachedUser();
            router.push("/");
          } else {
            router.push(selectedItem.href);
          }
        }
      }

      setWheelOpen(false);
      setWheelOffset(0);
      setActiveIndex(Math.round(midIndex));
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length > 0) handleMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onMouseMove = (e: MouseEvent) => {
      if (e.buttons === 0) { handleEnd(); return; }
      handleMove(e.clientX, e.clientY);
    };

    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", handleEnd);
    document.addEventListener("touchcancel", handleEnd);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", handleEnd);

    return () => {
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", handleEnd);
      document.removeEventListener("touchcancel", handleEnd);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", handleEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wheelOpen]);

  // Long-press → раскрываем колесо
  const handleWheelStart = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    touchStartPos.current = { x: clientX, y: clientY };

    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      isDragging.current = true;

      // Центр дуги = центр кнопки + смещение
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        centerRef.current = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2 + CENTER_OFFSET_Y,
        };
      }

      const dx = clientX - centerRef.current.x;
      const dy = clientY - centerRef.current.y;
      lastAngle.current = normalizeAngle(Math.atan2(dy, dx));
      accumulatedOffset.current = 0;

      setActiveIndex(Math.round(midIndex));
      setWheelOffset(0);
      setWheelOpen(true);
    }, 250); // задержка long-press
  };

  // Если палец сдвинулся до long-press — отменяем
  const handleEarlyMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (isDragging.current || !longPressTimer.current) return;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    if (touchStartPos.current) {
      const dx = clientX - touchStartPos.current.x;
      const dy = clientY - touchStartPos.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 10) {
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
      }
    }
  };

  // Короткий тап — просто отменяем long-press, ничего не делаем
  const handleEarlyEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // ── Иконки и цвета для уведомлений (как было) ────────────────────────
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

  // ── Десктопный контент (без изменений) ─────────────────────────────────
  const desktopSidebarContent = (
    <>
      <div className="flex items-center gap-2">
        <img src="/logo-icon.svg" alt="Trelod logo" className="w-9 h-9" />
        <h1 className="font-logo text-4xl text-[#8b5cf6]">trelod</h1>
      </div>

      <nav className="flex flex-col">
        {nav.map(({ href, icon: Icon, label }) => {
          const active = pathname === href;
          const isUpdates = href === "/updates";
          const showUpdatesBadge = isUpdates && (counts.updates || 0) > 0;

          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-4 py-3 font-medium transition-all border-b border-white/5 last:border-none group ${
                active
                  ? "bg-[#8b5cf6]/15 text-[#a78bfa]"
                  : "text-white/40 hover:bg-white/[0.03] hover:text-white/60"
              }`}
            >
              <Icon size={18} className={active ? "text-[#8b5cf6]" : "text-white/80 group-hover:text-white"} />
              <span>{label}</span>
              {showUpdatesBadge && (
                <span className="ml-auto bg-[#8b5cf6] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-sm">
                  {counts.updates}
                </span>
              )}
            </Link>
          );
        })}

        {user && (
          <Link
            href="/messages"
            className={`flex items-center gap-3 px-4 py-3 font-medium transition-all relative border-b border-white/5 group ${
              pathname?.startsWith("/messages")
                ? "bg-[#8b5cf6]/15 text-[#a78bfa]"
                : "text-white/40 hover:bg-white/[0.03] hover:text-white/60"
            }`}
          >
            <MessageSquare size={18} className={pathname?.startsWith("/messages") ? "text-[#8b5cf6]" : "text-white/80 group-hover:text-white"} />
            <span>Сообщения</span>
            {counts.chats > 0 && (
              <span className="ml-auto bg-[#8b5cf6] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-sm">
                {counts.chats}
              </span>
            )}
          </Link>
        )}

        {(user?.is_admin || user?.is_moderator || user?.permissions?.includes("manage_users")) && (
          <Link
            href="/admin"
            className={`flex items-center gap-3 px-4 py-3 font-medium transition-all border-b border-white/5 group ${
              pathname === "/admin"
                ? "bg-[#8b5cf6]/15 text-[#a78bfa]"
                : "text-white/40 hover:bg-white/[0.03] hover:text-white/60"
            }`}
          >
            {user?.is_admin
              ? <ShieldAlert size={18} className={pathname === "/admin" ? "text-[#8b5cf6]" : "text-white/80 group-hover:text-white"} />
              : user?.is_moderator
                ? <ShieldCheck size={18} className={pathname === "/admin" ? "text-[#8b5cf6]" : "text-white/80 group-hover:text-white"} />
                : <ShieldAlert size={18} className="text-[#f59e0b]" />
            }
            <span>{user?.is_admin ? "Админка" : user?.is_moderator ? "Модерация" : "Админ панель"}</span>
          </Link>
        )}

        {user?.is_admin && (
          <Link
            href="/admin/roles"
            className={`flex items-center gap-3 px-4 py-3 font-medium transition-all border-b border-white/5 group ${
              pathname === "/admin/roles"
                ? "bg-[#8b5cf6]/15 text-[#a78bfa]"
                : "text-white/40 hover:bg-white/[0.03] hover:text-white/60"
            }`}
          >
            <Palette size={18} className={pathname === "/admin/roles" ? "text-[#8b5cf6]" : "text-white/80 group-hover:text-white"} />
            <span>Роли</span>
          </Link>
        )}

        {user?.permissions?.includes("tech_access") && (
          <Link
            href="/admin/technical"
            className={`flex items-center gap-3 px-4 py-3 font-medium transition-all border-b border-white/5 group ${
              pathname === "/admin/technical"
                ? "bg-[#8b5cf6]/15 text-[#a78bfa]"
                : "text-white/40 hover:bg-white/[0.03] hover:text-white/60"
            }`}
          >
            <Wrench size={18} className={pathname === "/admin/technical" ? "text-[#8b5cf6]" : "text-white/80 group-hover:text-white"} />
            <span>Техпанель</span>
          </Link>
        )}

        <button
          onClick={loadNotifications}
          className={`flex items-center gap-3 px-4 py-3 font-medium transition-all relative border-b border-white/5 group ${
            pathname === "/notifications"
              ? "bg-[#8b5cf6]/15 text-[#a78bfa]"
              : "text-white/40 hover:bg-white/[0.03] hover:text-white/60"
          }`}
        >
          <Bell size={18} className={pathname === "/notifications" ? "text-[#8b5cf6]" : "text-white/80 group-hover:text-white"} />
          <span>Уведомления</span>
          {counts.notifications > 0 && (
            <span className="ml-auto bg-[#8b5cf6] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-sm">
              {counts.notifications}
            </span>
          )}
        </button>

        <div className="mt-4 px-4">
          <button
            onClick={() => setShowBugModal(true)}
            className="w-fit p-2.5 rounded-xl text-orange-400/80 hover:text-orange-400 hover:bg-orange-500/10 transition-all"
            title="Сообщить о проблеме"
          >
            <Bug size={18} />
          </button>
        </div>
      </nav>

      <div className="mt-4 flex flex-col gap-2 pt-4 border-t border-white/5">
        {user ? (
          <Link
            href={`/${user.username}`}
            className="flex items-center gap-3 px-2 py-2 -mx-2 rounded-lg hover:bg-white/5 transition-all cursor-pointer group w-full"
          >
            <div
              className="shrink-0"
              style={glow ? { filter: `drop-shadow(0 0 8px ${glow})` } : undefined}
            >
              <Avatar src={user.avatar_url} name={user.display_name} id={user.id} />
            </div>
            <div className="leading-tight min-w-0 flex-1">
              <p
                className={`font-semibold text-sm truncate transition-all ${
                  glow ? "group-hover:opacity-80" : "text-white group-hover:text-[#8b5cf6]"
                }`}
                style={
                  glow
                    ? { color: glow, textShadow: `0 0 6px ${glow}B3, 0 0 14px ${glow}66` }
                    : undefined
                }
              >
                {user.display_name}
              </p>
              <p className="text-sm text-white/40 truncate">@{user.username}</p>
            </div>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                clearToken();
                setUser(null);
                clearCachedUser();
              }}
              className="shrink-0 p-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/20 transition-all"
              title="Выйти"
            >
              <LogOut size={18} />
            </button>
          </Link>
        ) : (
          <Link
            href="/login"
            className="flex items-center justify-center bg-[#8b5cf6]/15 border border-[#8b5cf6]/30 rounded-lg px-4 py-2.5 font-medium text-[#a78bfa] hover:bg-[#8b5cf6]/25 transition-all w-full"
          >
            Войти
          </Link>
        )}
      </div>
    </>
  );

  // ── Рендер мобильного полуколеса ────────────────────────────────────────
  const renderWheelItems = () => {
    if (!wheelOpen) return null;

    return wheelItems.map((item, i) => {
      const baseAngle = ARC_START + i * step;
      const angle = baseAngle - wheelOffset;

      const x = centerRef.current.x + ARC_RADIUS * Math.cos(angle);
      const y = centerRef.current.y + ARC_RADIUS * Math.sin(angle);

      const isActive = i === activeIndex;
      const distance = Math.abs(i - activeIndex);

      const scale = isActive ? 1.35 : Math.max(0.65, 1 - distance * 0.12);
      const opacity = isActive ? 1 : Math.max(0.25, 0.75 - distance * 0.18);

      return (
        <div
          key={`${item.href}-${i}`}
          className="absolute flex flex-col items-center gap-1 pointer-events-none"
          style={{
            left: x,
            top: y,
            transform: `translate(-50%, -50%) scale(${scale})`,
            opacity,
            zIndex: isActive ? 20 : 10,
            transition: "transform 100ms ease-out, opacity 100ms ease-out",
          }}
        >
          <div
            className={`p-3 rounded-full transition-all ${
              isActive
                ? "bg-[#8b5cf6] shadow-lg shadow-[#8b5cf6]/50"
                : "bg-white/10"
            }`}
          >
            <item.icon size={22} className={isActive ? "text-white" : "text-white/70"} />
          </div>
          <span
            className={`text-[10px] font-semibold whitespace-nowrap drop-shadow-lg ${
              isActive ? "text-white" : "text-white/60"
            }`}
          >
            {item.label}
          </span>
        </div>
      );
    });
  };

  return (
    <>
      {/* ═══════════════ МОБИЛЬНАЯ ВЕРСИЯ (ПОЛУКОЛЕСО) ═══════════════ */}
      <div className="md:hidden">
        {/* Таблетка-триггер */}
        <button
          ref={buttonRef}
          onTouchStart={handleWheelStart}
          onMouseDown={handleWheelStart}
          onTouchMove={handleEarlyMove}
          onMouseMove={handleEarlyMove}
          onTouchEnd={handleEarlyEnd}
          onMouseUp={handleEarlyEnd}
          className="fixed bottom-24 right-4 z-[98] w-14 h-14 bg-[#171717]/90 backdrop-blur-sm border border-white/10 rounded-full flex items-center justify-center shadow-lg shadow-black/50 active:scale-95 transition-transform"
          style={{ touchAction: "none" }}
          aria-label="Открыть меню навигации"
        >
          <Menu size={22} className="text-white/80" />
        </button>

        {/* Раскрывающееся полуколесо */}
        {wheelOpen && (
          <div className="fixed inset-0 z-[100]" style={{ touchAction: "none" }}>
            {/* Затемнение фона */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

            {/* Декоративная дуга (тонкая линия) */}
            <svg
              className="absolute pointer-events-none"
              style={{
                left: centerRef.current.x - ARC_RADIUS - 20,
                top: centerRef.current.y - ARC_RADIUS - 20,
                width: (ARC_RADIUS + 20) * 2,
                height: (ARC_RADIUS + 20) * 2,
              }}
              viewBox={`0 0 ${(ARC_RADIUS + 20) * 2} ${(ARC_RADIUS + 20) * 2}`}
            >
              <path
                d={`M ${ARC_RADIUS + 20} ${20 + ARC_RADIUS * 2}
                    A ${ARC_RADIUS} ${ARC_RADIUS} 0 0 1 ${ARC_RADIUS + 20} ${20}`}
                fill="none"
                stroke="rgba(139,92,246,0.15)"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
            </svg>

            {/* Активная зона (кольцо-индикатор) */}
            <div
              className="absolute w-14 h-14 rounded-full border-2 border-[#8b5cf6]/30 pointer-events-none animate-pulse"
              style={{
                left: centerRef.current.x - ARC_RADIUS,
                top: centerRef.current.y,
                transform: "translate(-50%, -50%)",
              }}
            />

            {/* Иконки на дуге */}
            {renderWheelItems()}

            {/* Подсветка кнопки-таблетки */}
            <div
              className="absolute w-14 h-14 rounded-full bg-[#8b5cf6]/20 border border-[#8b5cf6]/30 pointer-events-none"
              style={{
                left: centerRef.current.x,
                top: centerRef.current.y - CENTER_OFFSET_Y,
                transform: "translate(-50%, -50%)",
              }}
            />
          </div>
        )}
      </div>

      {/* ═══════════════ ДЕСКТОП ═══════════════ */}
      <aside className="hidden md:flex md:w-64 shrink-0 overflow-y-auto p-5 flex-col gap-5 bg-[#171717]">
        {desktopSidebarContent}
      </aside>

      {/* ═══════════════ МОДАЛКА УВЕДОМЛЕНИЙ ═══════════════ */}
      {showNotifs && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-[99]"
            onClick={() => setShowNotifs(false)}
          />
          <div className="fixed left-4 right-4 md:left-[272px] md:right-auto md:top-4 top-16 w-auto md:w-[380px] max-h-[70vh] md:max-h-[520px] overflow-hidden border border-white/10 rounded-2xl bg-[#1f1f23] shadow-2xl z-[100] flex flex-col">
            <div className="sticky top-0 bg-[#1f1f23]/95 backdrop-blur-md border-b border-white/10 p-3 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-white">Уведомления</h3>
              <div className="flex items-center gap-1">
                {notifs.some((n) => !n.read) && (
                  <button
                    onClick={markAllRead}
                    className="text-xs text-[#8b5cf6] hover:text-[#a78bfa] font-semibold px-2 py-1 rounded-lg hover:bg-[#8b5cf6]/10 transition-colors"
                  >
                    Прочитать все
                  </button>
                )}
                <button
                  onClick={() => setShowNotifs(false)}
                  className="p-1.5 text-white/50 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                >
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
                  <Link
                    key={n.id}
                    href={link}
                    onClick={() => {
                      if (!n.read) markRead(n.id);
                      setShowNotifs(false);
                    }}
                    className={`flex items-start gap-3 p-3 border-b border-white/5 hover:bg-white/5 transition-colors relative ${
                      !n.read ? "bg-[#8b5cf6]/[0.03]" : ""
                    }`}
                  >
                    {!n.read && (
                      <div className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full bg-[#8b5cf6]" />
                    )}

                    <div className="shrink-0 relative">
                      <Avatar
                        src={n.actor?.avatar_url}
                        name={n.actor?.display_name || "User"}
                        id={n.actor?.id}
                        size={42}
                      />
                      <div
                        className={`absolute -bottom-1 -right-1 w-[18px] h-[18px] rounded-full flex items-center justify-center border-2 border-[#1f1f23] ${
                          iconBg[n.type] || "bg-[#8b5cf6]/20 text-[#8b5cf6]"
                        }`}
                      >
                        {icons[n.type as keyof typeof icons] || <Bell size={9} />}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-white/90 leading-snug">
                        <span className="font-semibold text-white">
                          {n.actor?.display_name || "Неизвестный"}
                        </span>{" "}
                        {texts[n.type as keyof typeof texts] || "совершил(а) действие"}
                      </p>
                      <p className="text-[11px] text-white/40 mt-1">
                        {new Date(n.created_at).toLocaleTimeString("ru-RU", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>

                    {!n.read && (
                      <div className="w-2 h-2 rounded-full bg-[#8b5cf6] shrink-0 mt-2 shadow-[0_0_6px_rgba(139,92,246,0.6)]" />
                    )}
                  </Link>
                );
              })}
            </div>

            <div className="sticky bottom-0 bg-[#1f1f23]/95 backdrop-blur-md border-t border-white/10 p-2.5 shrink-0">
              <Link
                href="/notifications"
                onClick={() => setShowNotifs(false)}
                className="block w-full text-center text-sm font-semibold text-[#8b5cf6] hover:text-[#a78bfa] py-2 rounded-lg hover:bg-[#8b5cf6]/10 transition-all"
              >
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