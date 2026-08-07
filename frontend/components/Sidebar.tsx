"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { 
  Home, Bell, Settings, LogOut, Heart, MessageCircle, UserPlus, 
  AtSign, X, Shield, ShieldCheck, MessageSquare, Palette, 
  Bug, Users  // ✅ Добавлен Users
} from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { getToken, clearToken } from "@/lib/auth";
import { onFeedRefresh } from "@/lib/events";
import { BugReportModal } from "@/components/BugReportModal";
import { API_URL } from "@/lib/api";

export function Sidebar() {
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [chatsUnread, setChatsUnread] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [showBugModal, setShowBugModal] = useState(false);

  const nav = [
    { href: "/", icon: Home, label: "Главная" },
    { href: "/rules", icon: Shield, label: "Правила" },
    { href: "/settings", icon: Settings, label: "Настройки" },
  ];

  useEffect(() => {
  const token = getToken();
  if (!token) return;

  const controller = new AbortController();

  fetch('http://${API_URL}/api/me', {
    headers: { Authorization: `Bearer ${token}` },
    signal: controller.signal,
  })
    .then(async (r) => {
      if (!r.ok) return;
      const data = await r.json();
      setUser(data);
    })
    .catch((err) => {
      // Игнорируем ошибки отмены (при размонтировании компонента)
      if (err.name !== "AbortError") {
        console.error("Failed to load user:", err);
      }
    });

  // Отменяем запрос при размонтировании компонента
  return () => controller.abort();
}, []);

  useEffect(() => {
    const cleanup = onFeedRefresh(() => {
      const token = getToken();
      if (!token) return;
      fetch('http://${API_URL}/api/notifications/unread-count', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : { count: 0 }))
        .then((data) => setUnreadCount(data.count));
      fetch('http://${API_URL}/api/chats/unread-count', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : { count: 0 }))
        .then((data) => setChatsUnread(data.count));
    });
    return cleanup;
  }, []);

  async function loadNotifications() {
    const token = getToken();
    if (!token) return;
    const res = await fetch('http://${API_URL}/api/notifications', {
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
    await fetch(`http://${API_URL}/api/notifications/${id}/read`, {
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
    message: <MessageSquare size={14} />,
  };
  const texts = {
    like: "лайкнул(а) ваш пост",
    reply: "ответил(а) на ваш пост",
    follow: "подписался(ась) на вас",
    mention: "упомянул(а) вас в посте",
    message: "прислал(а) вам сообщение",
  };

  const glow = user
    ? user.is_admin
      ? "#ffffff"
      : user.is_moderator
      ? "#3b82f6"
      : user.role?.color ?? null
    : null;

  return (
    <>
      <aside className="w-64 shrink-0 overflow-y-auto p-5 flex flex-col gap-8 bg-[#171717]">
        <h1 className="font-logo text-4xl text-[#8b5cf6]">
          NEBULA
        </h1>

        <nav className="flex flex-col gap-2">
          {nav.map(({ href, icon: Icon, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 border rounded-lg px-4 py-2.5 font-medium transition-all ${
                  active
                    ? "bg-[#8b5cf6] border-[#8b5cf6] text-white"
                    : "border-white/8 bg-white/3 text-white/80 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon size={18} /> {label}
              </Link>
            );
          })}

          {user && (
            <Link
              href="/messages"
              className={`flex items-center gap-3 border rounded-lg px-4 py-2.5 font-medium transition-all relative ${
                pathname?.startsWith("/messages")
                  ? "bg-[#8b5cf6] border-[#8b5cf6] text-white"
                  : "border-white/8 bg-white/3 text-white/80 hover:bg-white/5 hover:text-white"
              }`}
            >
              <MessageSquare size={18} /> Сообщения
              {chatsUnread > 0 && (
                <span className="ml-auto bg-[#8b5cf6] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {chatsUnread}
                </span>
              )}
            </Link>
          )}

          {(user?.is_admin || user?.is_moderator || user?.permissions?.includes("manage_users")) && (
            <Link
              href="/admin"
              className={`flex items-center gap-3 border rounded-lg px-4 py-2.5 font-medium transition-all ${
                pathname === "/admin"
                  ? "bg-[#8b5cf6] border-[#8b5cf6] text-white"
                  : "border-white/8 bg-white/3 text-white/80 hover:bg-white/5 hover:text-white"
              }`}
            >
              {user?.is_admin ? (
                <Shield size={18} />
              ) : user?.is_moderator ? (
                <ShieldCheck size={18} />
              ) : (
                <Shield size={18} className="text-[#f59e0b]" />
              )}
              {user?.is_admin ? "Админка" : user?.is_moderator ? "Модерация" : "Админ панель"}
            </Link>
          )}

          {user?.is_admin && (
            <Link
              href="/admin/roles"
              className={`flex items-center gap-3 border rounded-lg px-4 py-2.5 font-medium transition-all ${
                pathname === "/admin/roles"
                  ? "bg-[#8b5cf6] border-[#8b5cf6] text-white"
                  : "border-white/8 bg-white/3 text-white/80 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Palette size={18} />
              Роли
            </Link>
          )}

          {user?.permissions?.includes("tech_access") && (
            <Link
              href="/admin/technical"
              className={`flex items-center gap-3 border rounded-lg px-4 py-2.5 font-medium transition-all ${
                pathname === "/admin/technical"
                  ? "bg-[#8b5cf6] border-[#8b5cf6] text-white"
                  : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Settings size={18} />
              Техпанель
            </Link>
          )}

          <button
            onClick={loadNotifications}
            className={`flex items-center gap-3 border rounded-lg px-4 py-2.5 font-medium transition-all relative ${
              pathname === "/notifications"
                ? "bg-[#8b5cf6] border-[#8b5cf6] text-white"
                : "border-white/8 bg-white/3 text-white/80 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Bell size={18} /> Уведомления
            {unreadCount > 0 && (
              <span className="ml-auto bg-[#8b5cf6] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>

          {/* ✅ КНОПКА БАГ-ТРЕКЕРА В ОСНОВНОМ МЕНЮ (не в модалке уведомлений) */}
<button
  onClick={() => setShowBugModal(true)}
  className="w-fit p-2.5 rounded-xl border border-orange-400/30 text-orange-400 hover:bg-orange-500/10 hover:border-orange-400/50 transition-all"
  title="Сообщить о проблеме"
>
  <Bug size={18} />
</button>
        </nav>

        <div className="mt-auto flex flex-col gap-3">
          {user ? (
            <>
              <Link
                href={`/user/${user.id}`}
                className="flex items-center gap-3 px-2 py-2 -mx-2 rounded-lg hover:bg-white/5 transition-all cursor-pointer group"
              >
                <div
                  className="shrink-0"
                  style={
                    glow
                      ? { filter: `drop-shadow(0 0 8px ${glow})` }
                      : undefined
                  }
                >
                  <Avatar src={user.avatar_url} name={user.display_name} id={user.id} />
                </div>
                <div className="leading-tight min-w-0">
                  <p
                    className={`font-semibold text-sm truncate transition-all ${
                      glow ? "group-hover:opacity-80" : "text-white group-hover:text-[#8b5cf6]"
                    }`}
                    style={
                      glow
                        ? {
                            color: glow,
                            textShadow: `0 0 6px ${glow}B3, 0 0 14px ${glow}66`,
                          }
                        : undefined
                    }
                  >
                    {user.display_name}
                  </p>
                  <p className="text-sm text-white/50 truncate">@{user.username}</p>
                </div>
              </Link>

              <button
                onClick={() => {
                  clearToken();
                  setUser(null);
                }}
                className="flex items-center gap-3 border border-white/8 rounded-lg px-4 py-2.5 font-medium text-white/70 hover:bg-white/5 hover:border-white/15 hover:text-white transition-all"
              >
                <LogOut size={18} /> Выйти
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="flex items-center justify-center bg-[#8b5cf6] border border-[#8b5cf6] rounded-lg px-4 py-2.5 font-medium text-white hover:bg-[#7c3aed] transition-all"
            >
              Войти
            </Link>
          )}
        </div>
      </aside>

      {/* Модалка уведомлений */}
      {showNotifs && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-[99]"
            onClick={() => setShowNotifs(false)}
          />
          <div className="fixed left-[272px] top-4 w-80 max-h-96 overflow-y-auto border border-white/10 rounded-xl bg-[#1f1f23] shadow-2xl z-[100]">
            <div className="sticky top-0 bg-[#1f1f23] border-b border-white/10 p-3 flex items-center justify-between">
              <h3 className="font-bold text-white">Уведомления</h3>
              <button onClick={() => setShowNotifs(false)} className="text-white/50 hover:text-white">
                <X size={16} />
              </button>
            </div>

            {notifs.length === 0 && (
              <p className="p-4 text-center text-sm text-white/50">Пока нет уведомлений</p>
            )}

            {notifs.map((n) => (
              <div
                key={n.id}
                onClick={() => !n.read && markRead(n.id)}
                className={`p-3 border-b border-white/5 cursor-pointer hover:bg-white/5 ${
                  !n.read ? "bg-[#8b5cf6]/10" : ""
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#8b5cf6]/20 flex items-center justify-center shrink-0 text-[#8b5cf6]">
                    {icons[n.type as keyof typeof icons]}
                  </div>
                  <div className="flex-1 text-sm text-white/90">
                    <p>
                      <span className="font-semibold text-white">{n.actor.display_name}</span>{" "}
                      {texts[n.type as keyof typeof texts]}
                    </p>
                    <p className="text-xs text-white/40 mt-1">
                      {new Date(n.created_at).toLocaleString("ru-RU")}
                    </p>
                  </div>
                  {!n.read && (
                    <div className="w-2 h-2 rounded-full bg-[#8b5cf6] shrink-0 mt-1" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ✅ Модалка баг-репорта (всегда доступна) */}
      {showBugModal && (
        <BugReportModal onClose={() => setShowBugModal(false)} />
      )}
    </>
  );
}