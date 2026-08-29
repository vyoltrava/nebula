"use client";
import { useEffect, useState, useRef } from "react";
import { useTheme } from "next-themes";
import { resolveNickColor } from "@/lib/nickGlow";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Settings, LogOut, MessageCircle, ArrowLeft,
  Users, Bug, Headphones, Sparkles, X,
} from "lucide-react";
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
  const sidebarRef = useRef<HTMLElement>(null);

  // Reset state on mount (requirement #4)
  useEffect(() => {
    setExpanded(true);
    setShowBugModal(false);
    setShowAccountSwitcher(false);
    setShowCircle(false);
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

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
  const handleLogout = () => { clearToken(); router.push("/login"); };
  const toggleSidebar = () => setExpanded((prev) => !prev);

  // Mobile layout (requirement #5: same structure as classic)
  if (isMobile) {
    return (
      <>
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
              <span className="font-logo text-2xl text-[#3D1F6D] dark:text-[#8b5cf6]">trelod</span>
            </div>
            <button onClick={() => router.push("/nebula-profile")} className="p-1 rounded-full">
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

        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-paper dark:bg-[#171717] border-t border-line dark:border-white/10">
          <div className="flex items-center justify-around h-16 px-2">
            <button onClick={() => router.push("/messages")} className={"flex flex-col items-center justify-center gap-1 flex-1 py-2 rounded-xl transition-colors " + (isMessagesPage ? "text-[#8b5cf6]" : "text-gray-500 dark:text-white/40")}>
              <div className="relative">
                <MessageCircle size={22} />
                {counts.chats > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#8b5cf6] text-white text-[9px] font-bold flex items-center justify-center">
                    {counts.chats > 9 ? "9+" : counts.chats}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{t("nav.messages")}</span>
            </button>
            <button onClick={() => setShowCircle(true)} className={"flex flex-col items-center justify-center gap-1 flex-1 py-2 rounded-xl transition-colors " + (showCircle ? "text-[#8b5cf6]" : "text-gray-500 dark:text-white/40")}>
              <Users size={22} />
              <span className="text-[10px] font-medium">Circle</span>
            </button>
            <button onClick={() => router.push("/nebula-settings")} className={"flex flex-col items-center justify-center gap-1 flex-1 py-2 rounded-xl transition-colors " + (pathname?.startsWith("/nebula-settings") ? "text-[#8b5cf6]" : "text-gray-500 dark:text-white/40")}>
              <Settings size={22} />
              <span className="text-[10px] font-medium">More</span>
            </button>
          </div>
        </div>
        {showCircle && <NebulaCircleModal onClose={() => setShowCircle(false)} />}
      </>
    );
    }

  // Desktop layout
  const navItems = [
    { href: "/messages", icon: MessageCircle, label: t("nav.messages"), badge: counts.chats, isCircle: false },
    { href: "#circle", icon: Users, label: "Circle", badge: 0, isCircle: true },
    { href: "/nebula-settings", icon: Settings, label: "Settings", badge: 0, isCircle: false },
  ];

  return (
    <>
      <aside ref={sidebarRef} className={"hidden md:flex shrink-0 overflow-y-auto flex-col bg-paper dark:bg-[#171717] transition-all duration-300 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border-r border-line dark:border-white/5 " + (isDock ? "md:w-20 md:min-w-20 px-0 py-4 gap-2" : "md:w-64 md:min-w-64 p-5 gap-5")}>
        <div className={"flex " + (isDock ? "justify-center" : "items-center gap-2")}>
          <BrandIcon className={isDock ? "w-8 h-8" : "w-9 h-9"} />
                    {!isDock && <h1 className="font-logo text-4xl text-[#3D1F6D] dark:text-[#8b5cf6]">trelod</h1>}
          <button onClick={toggleSidebar} className={(isDock ? "mt-2" : "ml-auto") + " p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white/70 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"}>
            {isDock ? <ArrowLeft size={16} className="rotate-180" /> : <ArrowLeft size={16} />}
          </button>
        </div>

        {/* Account block at TOP (requirement #3) */}
        {user && (
          <div className={"flex flex-col " + (isDock ? "items-center gap-2 px-2" : "px-2")}>
            <div className={"flex " + (isDock ? "justify-center" : "items-center gap-3") + " px-2 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition-all group w-full relative"}>
              <Link href="/nebula-profile" className="flex items-center gap-3 flex-1 min-w-0">
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

