"use client";
/**
 * 🌌 NebulaSidebar — сайдбар Nebula-оболочки.
 * ПК: 1в1 стиль кнопок классического расширенного сайдбара,
 *     отдельные кнопки создания всех типов чатов,
 *     свёрнутый вид = гамбургер вместо лого, развёрнутый = лого + "Nebula".
 * Мобилка: тема ОРБИТЫ (как в классическом Sidebar) — плавающая кнопка
 *     у правого края, по тапу раскрывает дугу с кнопками ПК-сайдбара.
 */
import { useEffect, useState, useRef } from "react";
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
  const [wheelOpen, setWheelOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);

  // Reset state on mount
  useEffect(() => {
    setExpanded(true);
    setShowBugModal(false);
    setShowAccountSwitcher(false);
    setShowCircle(false);
    setWheelOpen(false);
  }, []);

  useEffect(() => {
    const check = () => {
      const m = window.innerWidth < 768;
      setIsMobile(m);
      if (m) setWheelOpen(false);
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
  // ════════════════════════════════════════════════════════════════
  //  📱 МОБИЛКА — тема ОРБИТЫ (как в классическом Sidebar)
  // ════════════════════════════════════════════════════════════════
  if (isMobile) {
    // Позиции дуги: полукруг слева от кнопки (кнопка у правого края, по центру вертикали)
    const cx = typeof window !== "undefined" ? window.innerWidth - 28 : 0;
    const cy = typeof window !== "undefined" ? window.innerHeight / 2 + 8 : 0;
    const R = 135;
    const n = orbitItems.length;
    const pos = (i: number) => {
      const a = (Math.PI / 2) + (Math.PI * i) / (n - 1); // 90° … 270° (левый полукруг)
      return { x: cx + R * Math.cos(a), y: cy - R * Math.sin(a) };
    };

    return (
      <>
        {/* Верхняя панель */}
        <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-paper dark:bg-[#171717] border-b border-line dark:border-white/10">
          <div className="flex items-center justify-between px-4 h-14">
            {isChatOpen ? (
              <button onClick={() => router.push("/messages")} className="p-2 -ml-2 rounded-lg text-gray-600 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
                <ArrowLeft size={20} />
              </button>
            ) : (
              <div className="w-8" />
            )}
            <div className="flex items-center gap-2">
              <BrandIcon className="w-7 h-7" />
              <span className="font-logo text-2xl text-[#3D1F6D] dark:text-[#8b5cf6]">Nebula</span>
            </div>
            <button onClick={() => user && router.push(`/nebula-user/${user.username}`)} className="p-1 rounded-full">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#8b5cf6]/20 flex items-center justify-center">
                  <Sparkles size={16} className="text-[#8b5cf6]" />
                </div>
              )}
            </button>
          </div>
        </div>

        {/* 🪐 Кнопка ОРБИТЫ у правого края (стиль классического Sidebar) */}
        <button
          onClick={() => setWheelOpen((v) => !v)}
          className={"md:hidden fixed z-[98] w-14 h-14 right-0 top-[calc(50%+8px)] -translate-y-1/2 rounded-l-full bg-paper dark:bg-[#171717]/90 backdrop-blur-sm border flex items-center justify-center shadow-lg shadow-gray-400/40 dark:shadow-black/50 transition-all duration-200 " + (wheelOpen ? "border-[#8b5cf6]/50 bg-[#8b5cf6]/20 scale-110" : "border-line dark:border-white/10 active:scale-95")}
          style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none" } as React.CSSProperties}
          aria-label="Меню Nebula"
        >
          <Orbit size={22} className={"transition-all duration-300 " + (wheelOpen ? "text-[#8b5cf6] rotate-[60deg]" : "text-gray-800 dark:text-white/80")} />
        </button>

        {/* 🪐 Дуга орбиты — те же кнопки, что и в ПК-сайдбаре */}
        {wheelOpen && (
          <>
            <div className="md:hidden fixed inset-0 z-[96] bg-black/30" onClick={() => setWheelOpen(false)} />
            <div className="md:hidden fixed inset-0 z-[99] pointer-events-none" style={{ touchAction: "none" }}>
              {orbitItems.map((item, i) => {
                const p = pos(i);
                return (
                  <button
                    key={item.key}
                    onClick={() => { setWheelOpen(false); item.run(); }}
                    className="absolute w-12 h-12 rounded-full bg-paper dark:bg-[#1a1a1f]/95 border border-line dark:border-white/15 shadow-lg shadow-gray-400/40 dark:shadow-black/40 flex items-center justify-center text-gray-800 dark:text-white/70 hover:border-[#8b5cf6]/50 hover:bg-[#8b5cf6]/20 hover:text-[#8b5cf6] transition-all pointer-events-auto"
                    style={{ left: p.x, top: p.y, transform: "translate(-50%, -50%)" }}
                    title={item.label}
                  >
                    {item.key === "profile" && user ? (
                      user.avatar_url ? (
                        <img src={user.avatar_url} alt="" className="absolute inset-0 w-full h-full rounded-full object-cover" />
                      ) : (
                        <span className="font-bold text-sm">{(user.display_name || "?")[0]?.toUpperCase()}</span>
                      )
                    ) : item.icon ? (
                      <item.icon size={20} />
                    ) : null}
                    {!!item.badge && item.badge > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#8b5cf6] border-2 border-paper dark:border-[#171717] text-white text-[9px] font-bold flex items-center justify-center">
                        {item.badge > 9 ? "9+" : item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
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
              {isDock && (
                <button onClick={() => setShowAccountSwitcher(true)} className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" title={t("nav.logout")}>
                  <LogOut size={10} />
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

