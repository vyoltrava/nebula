"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";
import { Avatar } from "@/components/Avatar";
import { API_URL } from "@/lib/api";
import { 
  Heart, MessageCircle, UserPlus, AtSign, MessageSquare, 
  CheckCheck, Bell, ArrowLeft 
} from "lucide-react";

// Относительное время
function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "только что";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} мин. назад`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} ч. назад`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} дн. назад`;
  return date.toLocaleDateString("ru-RU");
}

export default function NotificationsPage() {
  const [notifs, setNotifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    fetch('http://${API_URL}/api/notifications', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setNotifs(data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function markRead(id: number) {
    const token = getToken();
    if (!token) return;
    await fetch(`http://${API_URL}/api/notifications/${id}/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    setNotifs((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }

  async function markAllRead() {
    const token = getToken();
    if (!token) return;
    const unread = notifs.filter((n) => !n.read);
    await Promise.all(
      unread.map((n) =>
        fetch(`http://${API_URL}/api/notifications/${n.id}/read`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        })
      )
    );
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  // ✅ ИСПРАВЛЕНО: всегда возвращает ссылку
  function getNotificationLink(n: any): string {
    switch (n.type) {
      case "follow":
        return `/user/${n.actor?.id}`;
      case "like":
      case "reply":
      case "mention":
        // Всегда ведём к профилю актёра (оттуда можно перейти к посту)
        return `/user/${n.actor?.id}`;
      case "message":
        return "/messages";
      default:
        // Для неизвестных типов — просто профиль актёра
        return n.actor?.id ? `/user/${n.actor.id}` : "/";
    }
  }

  const icons: Record<string, React.ReactNode> = {
    like: <Heart size={16} className="text-pink-400" fill="currentColor" />,
    reply: <MessageCircle size={16} className="text-blue-400" />,
    follow: <UserPlus size={16} className="text-purple-400" />,
    mention: <AtSign size={16} className="text-yellow-400" />,
    message: <MessageSquare size={16} className="text-green-400" />,
  };

  const texts: Record<string, string> = {
    like: "лайкнул(а) ваш пост",
    reply: "ответил(а) на ваш пост",
    follow: "подписался(ась) на вас",
    mention: "упомянул(а) вас в посте",
    message: "отправил(а) вам сообщение",
  };

  const unreadCount = notifs.filter((n) => !n.read).length;

  return (
    <div className="h-screen flex overflow-hidden bg-[#18181b]">
      <Sidebar />
      <div className="w-px shrink-0 bg-white/10 my-3" />
      <main className="flex-1 overflow-y-auto border-x border-white/10">
        {/* Шапка */}
        <div className="p-4 border-b border-white/10 sticky top-0 bg-[#171717]/95 backdrop-blur-md z-10">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all"
              >
                <ArrowLeft size={20} />
              </button>
              <div className="flex items-center gap-2">
                <Bell size={24} className="text-[#8b5cf6]" />
                <h1 className="text-2xl font-black text-white">Уведомления</h1>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-[#8b5cf6] text-white text-xs font-bold">
                    {unreadCount}
                  </span>
                )}
              </div>
            </div>

            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 text-white/70 text-sm font-semibold hover:bg-white/10 hover:text-white transition-all"
              >
                <CheckCheck size={16} />
                Прочитать все
              </button>
            )}
          </div>
        </div>

        {/* Контент */}
        <div className="max-w-3xl mx-auto">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-[#8b5cf6] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && notifs.length === 0 && (
            <div className="text-center py-16">
              <Bell size={56} className="text-white/20 mx-auto mb-4" />
              <p className="text-white/50 text-lg">Пока нет уведомлений</p>
              <p className="text-white/30 text-sm mt-2">
                Здесь будут появляться лайки, ответы и новые подписчики
              </p>
            </div>
          )}

          {!loading && notifs.length > 0 && (
            <div className="divide-y divide-white/5">
              {notifs.map((n) => {
                const link = getNotificationLink(n);
                
                return (
                  <Link
                    key={n.id}
                    href={link}
                    onClick={() => {
                      if (!n.read) {
                        markRead(n.id);
                      }
                    }}
                    className={`flex items-start gap-3 p-4 transition-all cursor-pointer block ${
                      !n.read
                        ? "bg-[#8b5cf6]/5 hover:bg-[#8b5cf6]/10"
                        : "hover:bg-white/5"
                    }`}
                  >
                    {/* Аватарка актёра */}
                    <div className="shrink-0">
                      <Avatar
                        src={n.actor?.avatar_url}
                        name={n.actor?.display_name}
                        id={n.actor?.id}
                        size={44}
                      />
                    </div>

                    {/* Контент */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white truncate">
                          {n.actor?.display_name || "Неизвестный"}
                        </span>
                        <span className="text-sm text-white/60">
                          {texts[n.type as keyof typeof texts] || "совершил(а) действие"}
                        </span>
                        <span className={`p-1 rounded-full ${
                          !n.read ? "bg-white/10" : "bg-white/5"
                        }`}>
                          {icons[n.type as keyof typeof icons] || <Bell size={12} />}
                        </span>
                      </div>
                      
                      <p className="text-xs text-white/40 mt-1">
                        {timeAgo(n.created_at)}
                      </p>

                      {/* Подсказка куда ведёт */}
                      <p className="text-xs text-[#8b5cf6]/80 mt-1.5">
                        → {n.type === "follow" ? "Перейти к профилю" : 
                           n.type === "message" ? "Открыть сообщения" : 
                           "Перейти к профилю"}
                      </p>
                    </div>

                    {/* Индикатор непрочитанного */}
                    {!n.read && (
                      <div className="w-2.5 h-2.5 rounded-full bg-[#8b5cf6] shrink-0 mt-2 shadow-[0_0_8px_rgba(139,92,246,0.6)]" />
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