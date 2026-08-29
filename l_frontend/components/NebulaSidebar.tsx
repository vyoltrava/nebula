"use client";
/**
 * 🌌 NebulaSidebar — сайдбар Nebula-оболочки.
 * ПК: 1в1 стиль кнопок классического расширенного сайдбара,
 *     отдельные кнопки создания всех типов чатов,
 *     свёрнутый вид = гамбургер вместо лого, развёрнутый = лого + "Nebula".
 * Мобилка: тема ОРБИТЫ (как в классическом Sidebar) — плавающая кнопка
 *     у правого края, по тапу раскрывает дугу с кнопками ПК-сайдбара.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { useTheme } from "next-themes";
import { resolveNickColor } from "@/lib/nickGlow";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Settings, LogOut, MessageCircle, ArrowLeft, Menu,
  Users, Bug, Headphones, Sparkles, Bookmark, ShieldCheck, Orbit,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { getToken, clearToken } from "@/lib/auth";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { BugReportModal } from "@/components/BugReportModal";
import { getCachedUser, setCachedUser } from "@/lib/authCache";
import { useUnreadCounts } from "@/lib/UnreadCountsContext";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { BrandIcon } from "@/components/BrandIcon";
import { NebulaCircleModal } from "@/components/NebulaCircleModal";

// 🪐 Константы ОРБИТЫ 1 (скопированы из классического Sidebar) — двухслойная дуга
const ORBIT_INNER_RADIUS  = 135;
const ORBIT_OUTER_RADIUS  = 215;
const ORBIT_SNAP_RADIUS   = 48;
const ORBIT_ARC_SPAN      = Math.PI / 2;
const ORBIT_ARC_CENTER    = Math.PI;
const ORBIT_ARC_START     = ORBIT_ARC_CENTER - ORBIT_ARC_SPAN;
const ORBIT_ARC_END       = ORBIT_ARC_CENTER + ORBIT_ARC_SPAN;
const ORBIT_ARC_OFFSET_X  = -40;

export function NebulaSidebar() {
  const { t } = useI18n();
  const { resolvedTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { counts, refresh } = useUnreadCounts();

  const [user, setUser] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [showBugModal, setShowBugModal] = useState(false);
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);
  const [showCircle, setShowCircle] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [wheelPos, setWheelPos] = useState<{ x: number; y: number } | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [wheelReady, setWheelReady] = useState(false);
  const [closing, setClosing] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const orbitButtonRef = useRef<HTMLButtonElement>(null);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStartRef = useRef<{ x: number; y: number } | null>(null);
  const wheelPosRef = useRef(wheelPos);
  const hoveredIdxRef = useRef<number | null>(null);
  const holdOpenedRef = useRef(false);
  useEffect(() => { wheelPosRef.current = wheelPos; }, [wheelPos]);
  useEffect(() => { hoveredIdxRef.current = hoveredIdx; }, [hoveredIdx]);

  // Reset state on mount
  useEffect(() => {
    setExpanded(true);
    setShowBugModal(false);
    setShowAccountSwitcher(false);
    setShowCircle(false);
    setWheelPos(null);
    setHoveredIdx(null);
  }, []);

  useEffect(() => {
    const check = () => {
      const m = window.innerWidth < 768;
      setIsMobile(m);
      if (m) { setWheelPos(null); setHoveredIdx(null); }
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Отступ контента под сайдбар: dock = 5rem, expanded = 16rem (применяется на ПК через CSS gate)
  useEffect(() => {
    document.documentElement.style.setProperty("--nebula-pad", expanded ? "16rem" : "5rem");
    return () => { document.documentElement.style.removeProperty("--nebula-pad"); };
  }, [expanded]);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    const cached = getCachedUser();
    if (cached) { setUser(cached); setReady(true); return; }
    fetch(process.env.NEXT_PUBLIC_API_URL + "/api/me", {
      headers: { Authorization: "Bearer " + token },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) { setUser(data); setCachedUser(data); } setReady(true); })
      .catch(() => setReady(true));
  }, [router]);

  const glow = user
    ? user.is_admin ? "#ffffff" : user.is_moderator ? "#3b82f6" : user.role?.color ?? null
    : null;
  const displayNickColor = resolveNickColor(glow, resolvedTheme);
  const nickGlowStyle = displayNickColor
    ? ({ color: displayNickColor, textShadow: "0 0 6px " + displayNickColor + "B3, 0 0 14px " + displayNickColor + "66" } as React.CSSProperties)
    : undefined;
  const avatarGlowStyle = displayNickColor
    ? ({ filter: "drop-shadow(0 0 8px " + displayNickColor + ")" } as React.CSSProperties)
    : undefined;

  // Derived values (must be declared before use)
  const isMessagesPage = pathname?.startsWith("/messages") ?? false;
  const isChatOpen = isMessagesPage && pathname !== "/messages";
  const isDock = !expanded;
  const iconClass = isDock ? "w-6 h-6 mx-auto shrink-0" : "w-[18px] h-[18px]";
  const textClass = isDock ? "hidden" : "block";
  const containerClass = isDock ? "justify-center px-0 py-3" : "items-center gap-3 px-4 py-3";
  const toggleSidebar = () => setExpanded((prev) => !prev);
  const handleLogout = () => { clearToken(); router.push("/login"); };

  // ── Создание чатов (каждый тип — отдельная кнопка) ──
  const openSavedMessages = async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/saved`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        refresh();
        router.push(`/messages/${data.id}`);
      }
    } catch (err) { console.error("Failed to open saved messages", err); }
  };
  const openCreateGroup = () => router.push("/messages?create=group");
  const openCreatePrism = () => router.push("/messages?create=prism");

  // ── Кнопки ПК-сайдбара (те же на мобильной орбите) ──
  const orbitItems: { key: string; icon: LucideIcon | null; label: string; badge: number; run: () => void }[] = [
    { key: "messages", icon: MessageCircle, label: t("nav.messages"), badge: counts.chats, run: () => router.push("/messages") },
    { key: "saved", icon: Bookmark, label: t("messages.saved"), badge: 0, run: openSavedMessages },
    { key: "group", icon: Users, label: t("messages.createGroup"), badge: 0, run: openCreateGroup },
    { key: "prism", icon: ShieldCheck, label: "PRISM Link", badge: 0, run: openCreatePrism },
    { key: "circle", icon: Sparkles, label: t("nav.circle"), badge: 0, run: () => setShowCircle(true) },
    { key: "profile", icon: null, label: t("nav.profile"), badge: 0, run: () => user && router.push(`/nebula-user/${user.username}`) },
    { key: "settings", icon: Settings, label: t("nav.settings"), badge: 0, run: () => router.push("/nebula-settings") },
    { key: "bug", icon: Bug, label: t("nav.reportProblem"), badge: 0, run: () => setShowBugModal(true) },
    { key: "support", icon: Headphones, label: t("nav.support"), badge: 0, run: () => router.push("/support") },
    { key: "logout", icon: LogOut, label: t("nav.logout"), badge: 0, run: handleLogout },
  ];
  const orbitItemsRef = useRef(orbitItems);
  useEffect(() => { orbitItemsRef.current = orbitItems; }, [orbitItems]);

  // Закрыть орбиту (с анимацией схлопывания, как в классике) + сброс зажима
  const closeWheel = useCallback(() => {
    if (pressTimerRef.current) { clearTimeout(pressTimerRef.current); pressTimerRef.current = null; }
    pressStartRef.current = null;
    setWheelReady(false);
    setClosing(true);
    setHoveredIdx(null);
    setTimeout(() => { setWheelPos(null); setClosing(false); }, 280);
  }, []);

  // Анимация разлёта пунктов из кнопки (двойной rAF, как в классике)
  useEffect(() => {
    if (!wheelPos) { setWheelReady(false); return; }
    const id = requestAnimationFrame(() => { requestAnimationFrame(() => setWheelReady(true)); });
    return () => cancelAnimationFrame(id);
  }, [wheelPos]);

  // Орбита/состояния сбрасываются при переходе на другую страницу
  useEffect(() => { if (wheelPosRef.current) closeWheel(); }, [pathname, closeWheel]);
  // ════════════════════════════════════════════════════════════════
  //  📱 МОБИЛКА — тема ОРБИТЫ (как в классическом Sidebar)
  // ════════════════════════════════════════════════════════════════
  if (isMobile) {
    // Двухслойная дуга: первые 5 пунктов — внутренний слой, остальные — внешний (как в классике)
    const innerCount = Math.min(5, orbitItems.length);
    const isInnerLayer = (gi: number) => gi < innerCount;

    // Позиция пункта на дуге (формула из классического Sidebar)
    const getIconPos = (gi: number) => {
      if (!wheelPos) return { x: 0, y: 0 };
      const inner = isInnerLayer(gi);
      const localIdx = inner ? gi : gi - innerCount;
      const n = inner ? innerCount : orbitItems.length - innerCount;
      const radius = inner ? ORBIT_INNER_RADIUS : ORBIT_OUTER_RADIUS;
      const step = (ORBIT_ARC_END - ORBIT_ARC_START) / Math.max(n - 1, 1);
      const angle = ORBIT_ARC_START + localIdx * step;
      return { x: wheelPos.x + radius * Math.cos(angle), y: wheelPos.y + radius * Math.sin(angle) };
    };

    const nearestIdx = (px: number, py: number): number | null => {
      let minDist = Infinity;
      let nearest: number | null = null;
      for (let i = 0; i < orbitItems.length; i++) {
        const p = getIconPos(i);
        const d = Math.hypot(px - p.x, py - p.y);
        if (d < minDist) { minDist = d; nearest = i; }
      }
      return minDist <= ORBIT_SNAP_RADIUS ? nearest : null;
    };

    // Открытие дуги от кнопки: центр = центр кнопки + сдвиг влево (как в классике)
    const openWheel = () => {
      const el = orbitButtonRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setHoveredIdx(null);
      setWheelPos({ x: r.left + r.width / 2 + ORBIT_ARC_OFFSET_X, y: r.top + r.height / 2 });
      try { navigator.vibrate?.(15); } catch {}
    };

    // Выбор подсвеченного пункта + схлопывание дуги
    const commitSelection = () => {
      const idx = hoveredIdxRef.current;
      if (idx != null && orbitItems[idx]) orbitItems[idx].run();
      closeWheel();
    };

    return (
      <>
        {/* 🪐 Кнопка ОРБИТЫ 1 у правого края: ТАП — открыть/закрыть дугу,
            ЗАЖАТИЕ (~250мс) — раскрыть дугу и выбрать пункт ведением пальца */}
        <button
          ref={orbitButtonRef}
          onTouchStart={(e) => {
            const t0 = e.touches[0];
            if (!t0) return;
            pressStartRef.current = { x: t0.clientX, y: t0.clientY };
            holdOpenedRef.current = false;
            if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
            pressTimerRef.current = setTimeout(() => {
              holdOpenedRef.current = true;
              openWheel();
            }, 250);
          }}
          onTouchMove={(e) => {
            const t0 = e.touches[0];
            if (!t0) return;
            if (wheelPosRef.current) {
              if (e.cancelable) e.preventDefault();
              setHoveredIdx(nearestIdx(t0.clientX, t0.clientY));
            }
          }}
          onTouchEnd={() => {
            if (pressTimerRef.current) { clearTimeout(pressTimerRef.current); pressTimerRef.current = null; }
            pressStartRef.current = null;
            if (wheelPosRef.current) commitSelection();
          }}
          onTouchCancel={() => {
            if (pressTimerRef.current) { clearTimeout(pressTimerRef.current); pressTimerRef.current = null; }
            pressStartRef.current = null;
          }}
          onClick={() => {
            if (holdOpenedRef.current) { holdOpenedRef.current = false; return; }
            if (wheelPosRef.current) closeWheel();
            else openWheel();
          }}
          className={"md:hidden fixed z-[98] w-14 h-14 right-0 top-[calc(50%+8px)] -translate-y-1/2 rounded-l-full bg-paper dark:bg-[#171717]/90 backdrop-blur-sm border flex items-center justify-center shadow-lg shadow-gray-400/40 dark:shadow-black/50 transition-all duration-200 " + (wheelPos ? "border-[#8b5cf6]/50 bg-[#8b5cf6]/20 scale-110" : "border-line dark:border-white/10 active:scale-95")}
          style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none" } as React.CSSProperties}
          aria-label={t("nav.navMenu")}
        >
          <Orbit size={22} className={"transition-all duration-300 " + (wheelPos ? "text-[#8b5cf6] rotate-[60deg]" : "text-gray-800 dark:text-white/80")} />
        </button>

        {/* 🪐 Дуга ОРБИТЫ 1 — рендер 1:1 из классического Sidebar */}
        {wheelPos && (
          <div
            className="fixed inset-0 z-[100] pointer-events-none"
            style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" } as React.CSSProperties}
          >
            {/* Затемнение под дугой */}
            <div className="absolute inset-0 bg-black/30" />

            {orbitItems.map((item, i) => {
              const finalPos = getIconPos(i);
              const isActive = i === hoveredIdx;
              const isOuter = !isInnerLayer(i);
              const x = (wheelReady && !closing) ? finalPos.x : wheelPos.x;
              const y = (wheelReady && !closing) ? finalPos.y : wheelPos.y;

              return (
                <div
                  key={`orbit-${item.key}`}
                  className="absolute"
                  style={{
                    left: x,
                    top: y,
                    transform: `translate(-50%, -50%) scale(${closing ? 0 : isActive ? 1.35 : wheelReady ? 1 : 0})`,
                    opacity: closing ? 0 : wheelReady ? (isActive ? 1 : 0.8) : 0,
                    transition: "left 300ms cubic-bezier(0.34, 1.56, 0.64, 1), top 300ms cubic-bezier(0.34, 1.56, 0.64, 1), transform 200ms ease, opacity 200ms ease",
                    transitionDelay: `${i * 25}ms`,
                    zIndex: isActive ? 20 : 10,
                  }}
                >
                  <div className="relative">
                    <div
                      className={
                        "relative flex items-center justify-center rounded-full overflow-hidden transition-all duration-150 " +
                        (isActive
                          ? "w-14 h-14 bg-[#8b5cf6] shadow-[0_0_28px_rgba(139,92,246,0.55)]"
                          : isOuter
                            ? "w-11 h-11 bg-ivory/95 dark:bg-[#1a1a1f]/95 border border-line dark:border-white/15 shadow-lg shadow-gray-400/40 dark:shadow-black/40"
                            : "w-12 h-12 bg-gray-100 dark:bg-[#22222a]/95 border border-line dark:border-white/20 shadow-lg shadow-gray-400/40 dark:shadow-black/40")
                      }
                    >
                      {item.key === "profile" && user ? (
                        user.avatar_url ? (
                          <img src={user.avatar_url} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover" />
                        ) : (
                          <span className={"font-bold " + (isActive ? "text-gray-900 dark:text-white" : "text-gray-800 dark:text-white/70")}>
                            {(user.display_name || "?")[0]?.toUpperCase()}
                          </span>
                        )
                      ) : item.icon ? (
                        <item.icon size={isActive ? 26 : isOuter ? 19 : 21} className={isActive ? "text-gray-900 dark:text-white" : "text-gray-800 dark:text-white/70"} />
                      ) : null}
                    </div>
                    {!!item.badge && item.badge > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#8b5cf6] border-2 border-paper dark:border-[#171717] text-white text-[9px] font-bold flex items-center justify-center">
                        {item.badge > 9 ? "9+" : item.badge}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Пинг-кольцо вокруг активного пункта (как в классике) */}
            {hoveredIdx !== null && (
              <div
                className="absolute w-16 h-16 rounded-full"
                style={{ left: getIconPos(hoveredIdx).x, top: getIconPos(hoveredIdx).y, transform: "translate(-50%, -50%)", zIndex: 9 }}
              >
                <div className="w-full h-full rounded-full border-2 border-[#8b5cf6]/30 animate-ping" />
              </div>
            )}
          </div>
        )}

        {showCircle && <NebulaCircleModal onClose={() => setShowCircle(false)} />}
        {showBugModal && <BugReportModal onClose={() => setShowBugModal(false)} />}
        {showAccountSwitcher && (
          <AccountSwitcher variant="orbit" isOpen={showAccountSwitcher} onClose={() => setShowAccountSwitcher(false)} />
        )}
      </>
    );
  }

  // Desktop layout
  const navItems = [
    { href: "/messages", icon: MessageCircle, label: t("nav.messages"), badge: counts.chats, isCircle: false },
    { href: "#circle", icon: Users, label: t("nav.circle"), badge: 0, isCircle: true },
    { href: "/nebula-settings", icon: Settings, label: t("nav.settings"), badge: 0, isCircle: false },
  ];

  return (
    <>
      <aside ref={sidebarRef} className={"hidden md:flex fixed top-0 left-0 h-screen z-50 shrink-0 overflow-y-auto flex-col bg-paper dark:bg-[#171717] transition-all duration-300 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border-r border-line dark:border-white/5 " + (isDock ? "md:w-20 md:min-w-20 px-0 py-4 gap-2" : "md:w-64 md:min-w-64 p-5 gap-5")}>
        <div className={"flex " + (isDock ? "justify-center" : "items-center gap-2")}>
          {isDock ? (
            /* Свёрнутый вид: гамбургер вместо лого */
            <button onClick={toggleSidebar} className="p-2 rounded-lg text-gray-500 dark:text-white/60 hover:text-gray-800 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 transition-colors" title="Развернуть меню">
              <Menu size={24} />
            </button>
          ) : (
            <>
              <BrandIcon className="w-9 h-9" />
              <h1 className="font-logo text-4xl text-[#3D1F6D] dark:text-[#8b5cf6]">Nebula</h1>
              <button onClick={toggleSidebar} className="ml-auto p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white/70 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors" title="Свернуть меню">
                <ArrowLeft size={16} />
              </button>
            </>
          )}
        </div>

        {/* Account block at TOP (requirement #3) */}
        {user && (
          <div className={"flex flex-col " + (isDock ? "items-center gap-2 px-2" : "px-2")}>
            <div className={"flex " + (isDock ? "justify-center" : "items-center gap-3") + " px-2 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition-all group w-full relative"}>
              {/* Как в классике: клик по нику/аватару открывает страницу профиля пользователя */}
              <Link href={`/nebula-user/${user.username}`} className="flex items-center gap-3 flex-1 min-w-0">
                <div className="shrink-0" style={avatarGlowStyle}>
                  <Avatar src={user.avatar_url} name={user.display_name} id={user.id} />
                </div>
                {!isDock && (
                  <div className="leading-tight min-w-0 flex-1">
                    <p className={"font-semibold text-sm truncate transition-all " + (nickGlowStyle ? "group-hover:opacity-80" : "text-gray-900 dark:text-white group-hover:text-[#8b5cf6]")} style={nickGlowStyle}>{user.display_name}</p>
                    <p className="text-sm text-gray-500 dark:text-white/40 truncate">@{user.username}</p>
                  </div>
                )}
              </Link>
              {!isDock && (
                <button onClick={() => setShowAccountSwitcher(true)} className="p-2 rounded-lg text-gray-500 dark:text-white/40 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0" title={t("account.accounts")}>
                  <LogOut size={18} />
                </button>
              )}
            </div>
          </div>
        )}  {/* Account block at TOP (requirement #3) */}

        {/* Navigation */}
        <nav className="flex flex-col flex-1">
          {isChatOpen && (
            <Link href="/messages" className={"flex " + containerClass + " font-medium transition-all border-b border-line dark:border-white/5 group text-gray-500 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/[0.03] hover:text-gray-600 dark:hover:text-white/60"}>
              <ArrowLeft size={18} className={iconClass + " text-gray-700 dark:text-white/80 group-hover:text-gray-500 dark:group-hover:text-[#e0e0e0]!"} />
              <span className={textClass}>Back to chats</span>
            </Link>
          )}
          {navItems.map(({ href, icon: Icon, label, badge, isCircle }) => {
            const active = pathname === href || (href === "/messages" && pathname?.startsWith("/messages"));
            return (
              <button key={href} onClick={() => { if (isCircle) setShowCircle(true); else router.push(href); }} className={"flex " + containerClass + " font-medium transition-all border-b border-line dark:border-white/5 last:border-none group relative " + (active ? "bg-[#8b5cf6]/15 text-[#a78bfa]" : "text-gray-500 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/[0.03] hover:text-gray-600 dark:hover:text-white/60")}>
                <Icon size={18} className={iconClass + " " + (active ? "text-[#8b5cf6]" : "text-gray-700 dark:text-white/80 group-hover:text-gray-500 dark:group-hover:text-[#e0e0e0]!")} />
                <span className={textClass}>{label}</span>
                                {badge > 0 && (<span className={(isDock ? "absolute top-2 right-2" : "ml-auto") + " bg-[#8b5cf6] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-sm"}>{badge}</span>)}
              </button>
            );
          })}

          {/* ── Создание чатов: каждый тип — отдельная кнопка, единым потоком одна под другой ── */}
          <button onClick={openSavedMessages} className={"flex " + containerClass + " font-medium transition-all border-b border-line dark:border-white/5 group text-gray-500 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/[0.03] hover:text-gray-600 dark:hover:text-white/60"} title={t("messages.saved")}>
            <Bookmark size={18} className={iconClass + " text-yellow-600 dark:text-yellow-400"} />
            <span className={textClass}>{t("messages.saved")}</span>
          </button>
          <button onClick={openCreateGroup} className={"flex " + containerClass + " font-medium transition-all border-b border-line dark:border-white/5 group text-gray-500 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/[0.03] hover:text-gray-600 dark:hover:text-white/60"} title={t("messages.createGroup")}>
            <Users size={18} className={iconClass + " text-[#8b5cf6]"} />
            <span className={textClass}>{t("messages.createGroup")}</span>
          </button>
          <button onClick={openCreatePrism} className={"flex " + containerClass + " font-medium transition-all border-b border-line dark:border-white/5 last:border-none group text-gray-500 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/[0.03] hover:text-gray-600 dark:hover:text-white/60"} title="PRISM Link">
            <ShieldCheck size={18} className={iconClass + " text-cyan-600 dark:text-cyan-400"} />
            <span className={textClass}>PRISM Link</span>
          </button>
        </nav>

        {/* Footer */}
        <div className={"mt-auto pt-4 " + (isDock ? "flex flex-col items-center gap-3" : "")}>
          {!isDock && (
            <div className="px-4 flex items-center gap-2 mb-4">
              <button onClick={() => setShowBugModal(true)} className="p-2.5 rounded-xl text-orange-400/80 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-500/10 transition-all" title={t("nav.reportProblem")}><Bug size={18} /></button>
              <button onClick={() => router.push("/support")} className="p-2.5 rounded-xl text-cyan-400/80 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-500/10 transition-all" title={t("nav.supportChat")}><Headphones size={18} /></button>
            </div>
          )}
          {isDock && (
            <div className="flex flex-col items-center gap-2 mb-2">
              <button onClick={() => setShowBugModal(true)} className="p-2 rounded-lg text-orange-400/80 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-500/10 transition-all shrink-0" title={t("nav.bugs")}><Bug size={20} className="shrink-0" /></button>
              <button onClick={() => router.push("/support")} className="p-2 rounded-lg text-cyan-400/80 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-500/10 transition-all shrink-0" title={t("nav.support")}><Headphones size={20} className="shrink-0" /></button>
              {user && (<button onClick={handleLogout} className="p-2 rounded-lg text-gray-500 dark:text-white/40 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0" title={t("nav.logout")}><LogOut size={20} className="shrink-0" /></button>)}
            </div>
          )}
        </div>
      </aside>

      {showBugModal && <BugReportModal onClose={() => setShowBugModal(false)} />}
      {showAccountSwitcher && (<AccountSwitcher variant="orbit" isOpen={showAccountSwitcher} onClose={() => setShowAccountSwitcher(false)} />)}
      {showCircle && <NebulaCircleModal onClose={() => setShowCircle(false)} />}
    </>
  );
}

