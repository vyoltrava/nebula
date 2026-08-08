"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Home, Bell, Settings, LogOut, Heart, MessageCircle, UserPlus, AtSign, X } from "lucide-react";
import { getToken, clearToken } from "@/lib/auth";
import { onFeedRefresh } from "@/lib/events";

const nav = [
  { href: "/", icon: Home, label: "Главная" },
  { href: "/settings", icon: Settings, label: "Настройки" },
];

export function Sidebar() {
  const pathname = usePathname();
  const [user, setUser] = useState<{
    username: string;
    display_name: string;
    avatar_url?: string | null;
  } | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifs, setNotifs] = useState<any[]>([]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    fetch("http://localhost:8000/api/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setUser(data);
      });

    fetch("http://localhost:8000/api/notifications/unread-count", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : { count: 0 }))
      .then((data) => setUnreadCount(data.count));
  }, []);

  useEffect(() => {
    const cleanup = onFeedRefresh(() => {
      const token = getToken();
      if (!token) return;
      fetch("http://localhost:8000/api/notifications/unread-count", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : { count: 0 }))
        .then((data) => setUnreadCount(data.count));
    });
    return cleanup;
  }, []);

  async function loadNotifications() {
    const token = getToken();
    if (!token) return;

    const res = await fetch("http://localhost:8000/api/notifications", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setNotifs(data);
    setShowNotifs(true);
  }

  async function markRead(id: number) {
    const token = getToken();
    if (!token) return;
    await fetch(`http://localhost:8000/api/notifications/${id}/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  const icons = {
    like: <Heart size={14} fill="currentColor" />,
    reply: <MessageCircle size={14} />,
    follow: <UserPlus size={14} />,
    mention: <AtSign size={14} />,
  };

  const texts = {
    like: "лайкнул(а) ваш пост",
    reply: "ответил(а) на ваш пост",
    follow: "подписался(ась) на вас",
    mention: "упомянул(а) вас в посте",
  };

  return (
    <>
      <aside className="w-64 shrink-0 overflow-y-auto p-5 flex flex-col gap-8 backdrop-blur-sm">
        <h1 className="font-logo text-4xl bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
          NEBULA
        </h1>

        <nav className="flex flex-col gap-3">
          {nav.map(({ href, icon: Icon, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 border border-white/15 rounded-full px-4 py-2 font-semibold transition-all hover:bg-white/10 hover:border-white/30 ${
                  active ? "bg-white/10 border-white/30 text-white" : "text-white/80"
                }`}
              >
                <Icon size={18} /> {label}
              </Link>
            );
          })}

          <div className="relative">
            <button
              onClick={loadNotifications}
              className={`w-full flex items-center gap-3 border border-white/15 rounded-full px-4 py-2 font-semibold transition-all hover:bg-white/10 hover:border-white/30 relative ${
                pathname === "/notifications" ? "bg-white/10 border-white/30 text-white" : "text-white/80"
              }`}
            >
              <Bell size={18} /> Уведомления
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-gradient-to-r from-pink-500 to-purple-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        </nav>

        <div className="mt-auto flex flex-col gap-3">
          {user ? (
            <>
              <div className="flex items-center gap-3 px-1">
                {user.avatar_url ? (
                  <img
                    src={`http://localhost:8000${user.avatar_url}`}
                    alt=""
                    className="w-10 h-10 rounded-full border border-white/20 object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full border border-white/20 bg-white/5" />
                )}
                <div className="leading-tight">
                  <p className="font-bold text-sm text-white">{user.display_name}</p>
                  <p className="text-sm text-white/60">@{user.username}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  clearToken();
                  setUser(null);
                }}
                className="flex items-center gap-3 border border-white/15 rounded-full px-4 py-2 font-semibold text-white/80 hover:bg-white/10 hover:border-white/30 hover:text-white transition-all"
              >
                <LogOut size={18} /> Выйти
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="flex items-center justify-center border border-white/15 rounded-full px-4 py-2 font-semibold text-white/80 hover:bg-white/10 hover:border-white/30 hover:text-white transition-all"
            >
              Войти
            </Link>
          )}
        </div>
      </aside>

      {showNotifs && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-[99]"
            onClick={() => setShowNotifs(false)}
          />
          <div className="fixed left-[272px] top-4 w-80 max-h-96 overflow-y-auto border border-white/20 rounded-xl bg-[#1a1a2e]/95 backdrop-blur-md shadow-2xl z-[100]">
            <div className="sticky top-0 bg-[#1a1a2e]/95 backdrop-blur-md border-b border-white/10 p-3 flex items-center justify-between">
              <h3 className="font-black text-white">Уведомления</h3>
              <button onClick={() => setShowNotifs(false)} className="text-white/60 hover:text-white">
                <X size={16} />
              </button>
            </div>

            {notifs.length === 0 && (
              <p className="p-4 text-center text-sm text-white/60">Пока нет уведомлений</p>
            )}

            {notifs.map((n) => (
              <div
                key={n.id}
                onClick={() => !n.read && markRead(n.id)}
                className={`p-3 border-b border-white/10 cursor-pointer hover:bg-white/5 ${
                  !n.read ? "bg-purple-500/10" : ""
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full border border-white/20 bg-white/5 flex items-center justify-center shrink-0 text-purple-400">
                    {icons[n.type as keyof typeof icons]}
                  </div>
                  <div className="flex-1 text-sm text-white/90">
                    <p>
                      <span className="font-bold text-white">{n.actor.display_name}</span>{" "}
                      {texts[n.type as keyof typeof texts]}
                    </p>
                    <p className="text-xs text-white/50 mt-1">
                      {new Date(n.created_at).toLocaleString("ru-RU")}
                    </p>
                  </div>
                  {!n.read && (
                    <div className="w-2 h-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 shrink-0 mt-1" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}