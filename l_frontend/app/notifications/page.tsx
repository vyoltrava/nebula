"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";
import { Avatar } from "@/components/Avatar";
import { NotificationsSkeleton } from "@/components/Skeletons";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import type { MessageKey } from "@/lib/i18n";
import { getNotifsCache, setNotifsCache, invalidateNotifsCache } from "@/lib/notifsCache";

import { 
  Heart, MessageCircle, UserPlus, AtSign, MessageSquare, 
  CheckCheck, Bell, ArrowLeft 
} from "lucide-react";

// Относительное время
function timeAgo(dateStr: string, t: (key: MessageKey, params?: Record<string, string | number>) => string, locale: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return t("notif.justNow");
  if (seconds < 3600) return t("notif.minutesAgo", { n: Math.floor(seconds / 60) });
  if (seconds < 86400) return t("notif.hoursAgo", { n: Math.floor(seconds / 3600) });
  if (seconds < 604800) return t("notif.daysAgo", { n: Math.floor(seconds / 86400) });
  return date.toLocaleDateString(locale);
}

export default function NotificationsPage() {
  const [notifs, setNotifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const router = useRouter();
  const { t, locale } = useI18n();

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }

    const cached = getNotifsCache();
    if (cached) {
      setNotifs(cached);
      setLoading(false);
      // Фоновое обновление — список остаётся на экране, данные не протухают
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (Array.isArray(data)) {
            setNotifs(data);
            setNotifsCache(data);
          }
        })
        .catch(() => {});
      return;
    }

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data)) {
          setNotifs(data);
          setNotifsCache(data);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function markRead(id: number) {
    const token = getToken();
    if (!token) return;
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/notifications/${id}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifs((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      invalidateNotifsCache();
    } catch (e) {
      console.error("Ошибка отметки:", e);
    }
  }

  async function markAllRead() {
    const token = getToken();
    if (!token) return;
    setMarkingAll(true);
    
    const unread = notifs.filter((n) => !n.read);
    
    // Мгновенно обновляем UI
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    invalidateNotifsCache();
    
    // Параллельно отправляем на сервер
    await Promise.allSettled(
      unread.map((n) =>
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/notifications/${n.id}/read`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        })
      )
    );
    
    setMarkingAll(false);
  }

  function getNotificationLink(n: any): string {
    if (!n) return "/";
    switch (n.type) {
      case "follow":
      case "like":
      case "reply":
      case "mention":
        return n.actor?.id ? `/user/${n.actor.id}` : "/";
      case "message":
        return "/messages";
      default:
        return n.actor?.id ? `/user/${n.actor.id}` : "/";
    }
  }

  const icons: Record<string, React.ReactNode> = {
    like: <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-pink-500 flex items-center justify-center shrink-0 shadow-sm"><Heart size={11} className="text-white" fill="currentColor" /></span>,
    reply: <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-blue-500 flex items-center justify-center shrink-0 shadow-sm"><MessageCircle size={11} className="text-white" /></span>,
    follow: <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-purple-500 flex items-center justify-center shrink-0 shadow-sm"><UserPlus size={11} className="text-white" /></span>,
    mention: <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-yellow-500 flex items-center justify-center shrink-0 shadow-sm"><AtSign size={11} className="text-white" /></span>,
    message: <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-green-500 flex items-center justify-center shrink-0 shadow-sm"><MessageSquare size={11} className="text-white" /></span>,
  };

  const fallbackIcon = (
    <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gray-400 dark:bg-white/30 flex items-center justify-center shrink-0 shadow-sm">
      <Bell size={11} className="text-white" />
    </span>
  );

  const notifKeys: Record<string, MessageKey> = {
    like: "notif.like",
    reply: "notif.reply",
    follow: "notif.follow",
    mention: "notif.mention",
    message: "notif.sentMessage",
  };

  const unreadCount = notifs.filter((n) => !n.read).length;

  return (
    <div className="h-screen flex overflow-hidden bg-ivory dark:bg-[#18181b]">
      <Sidebar />
      <div className="w-px shrink-0 bg-gray-100 dark:bg-white/10 my-3 hidden md:block" />
      <main className="flex-1 overflow-y-auto overflow-x-hidden border-x border-line dark:border-white/10 md:border-x-0">
        {/* Шапка */}
        <div className="p-3 sm:p-4 border-b border-line dark:border-white/10 sticky top-0 bg-paper dark:bg-[#171717]/95 backdrop-blur-md z-10">
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button
                onClick={() => router.back()}
                className="p-1.5 sm:p-2 rounded-lg text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-all active:scale-95 shrink-0"
              >
                <ArrowLeft size={18} className="sm:w-5 sm:h-5" />
              </button>
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <Bell size={20} className="sm:w-6 sm:h-6 text-[#8b5cf6] shrink-0" />
                <h1 className="text-lg sm:text-2xl font-black text-gray-900 dark:text-white truncate">{t("nav.notifications")}</h1>
                {unreadCount > 0 && (
                  <span className="px-1.5 sm:px-2 py-0.5 rounded-full bg-[#8b5cf6] text-white text-[10px] sm:text-xs font-bold shrink-0">
                    {unreadCount}
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={markAllRead}
              disabled={unreadCount === 0 || markingAll}
              className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg border text-xs sm:text-sm font-semibold transition-all active:scale-95 shrink-0 ${
                unreadCount === 0 || markingAll
                  ? "border-line dark:border-white/5 text-gray-500 dark:text-white/20 cursor-not-allowed"
                  : "border-[#8b5cf6]/40 text-[#8b5cf6] hover:bg-[#8b5cf6]/10 hover:text-[#a78bfa]"
              }`}
              title={t("notif.markAll")}
            >
              <CheckCheck size={14} className="sm:w-4 sm:h-4" />
              <span className="hidden xs:inline">
                {markingAll ? t("notif.marking") : t("notif.markAll")}
              </span>
            </button>
          </div>
        </div>

        {/* Контент */}
        <div className="max-w-3xl mx-auto">
          {loading && <NotificationsSkeleton />}

          {!loading && notifs.length === 0 && (
            <div className="text-center py-12 sm:py-16 px-4">
              <Bell size={44} className="sm:w-14 sm:h-14 text-gray-500 dark:text-white/20 mx-auto mb-3 sm:mb-4" />
              <p className="text-gray-600 dark:text-white/50 text-base sm:text-lg font-semibold">{t("notif.empty")}</p>
              <p className="text-gray-500 dark:text-white/30 text-xs sm:text-sm mt-1.5 sm:mt-2 max-w-xs mx-auto">
                {t("notif.emptyHint")}
              </p>
            </div>
          )}

          {!loading && notifs.length > 0 && (
            <div className="divide-y divide-line dark:divide-white/5">
              {notifs.map((n) => {
                const link = getNotificationLink(n);
                
                return (
                  <Link
                    key={n.id}
                    href={link}
                    scroll={false}
                    prefetch={false}
                    onClick={() => {
                      if (!n.read) markRead(n.id);
                    }}
                    className={`flex items-start gap-2.5 sm:gap-3 p-3 sm:p-4 transition-all group active:bg-gray-100 dark:active:bg-white/10 ${
                      !n.read
                        ? "bg-[#8b5cf6]/5 hover:bg-[#8b5cf6]/10"
                        : "hover:bg-gray-100 dark:hover:bg-white/5"
                    }`}
                  >
                    {/* Аватарка */}
                    <div className="shrink-0 mt-0.5">
                      <Avatar
                        src={n.actor?.avatar_url}
                        name={n.actor?.display_name || "User"}
                        id={n.actor?.id}
                        size={38}
                      />
                    </div>

                    {/* Контент */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                        <span className="font-bold text-[13px] sm:text-sm text-gray-900 dark:text-white truncate group-hover:text-[#a78bfa] transition-colors max-w-[40%] sm:max-w-none">
                          {n.actor?.display_name || t("common.unknown")}
                        </span>
                        <span className="text-[11px] sm:text-sm text-gray-600 dark:text-white/60 truncate">
                          {t(notifKeys[n.type] ?? "notif.fallback")}
                        </span>
                        <span className="shrink-0">
                          {icons[n.type as keyof typeof icons] || fallbackIcon}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <p className="text-[11px] sm:text-xs text-gray-500 dark:text-white/40 shrink-0">
                          {timeAgo(n.created_at, t, locale)}
                        </p>

                        {/* Подсказка куда ведёт — только на sm+ */}
                        <p className="hidden sm:block text-xs text-[#8b5cf6]/80 font-medium truncate">
                          → {link === "/messages" ? t("notif.openMessages") : t("notif.goToProfile")}
                        </p>
                      </div>
                    </div>

                    {/* Индикатор непрочитанного */}
                    {!n.read && (
                      <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-[#8b5cf6] shrink-0 mt-3 shadow-[0_0_8px_rgba(139,92,246,0.6)]" />
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}