"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Avatar } from "@/components/Avatar";
import { MessageSquare, Search, Lock } from "lucide-react";
import { getToken } from "@/lib/auth";
import { triggerCountersRefresh } from "@/lib/events";


export default function MessagesPage() {
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const router = useRouter();

  function getGlowColor(user: any): string | null {
    if (user?.is_admin) return "#8b5cf6";
    if (user?.is_moderator) return "#3b82f6";
    if (user?.role?.color) return user.role.color;
    return null;
  }

  function glowStyle(user: any): React.CSSProperties | undefined {
    const c = getGlowColor(user);
    if (!c) return undefined;
    return { color: c, textShadow: `0 0 6px ${c}B3, 0 0 14px ${c}66` };
  }

  async function load(q = "") {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    try {
      const url = q
        ? `${process.env.NEXT_PUBLIC_API_URL}/api/chats?q=${encodeURIComponent(q)}`
        : `${process.env.NEXT_PUBLIC_API_URL}/api/chats`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setChats(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    triggerCountersRefresh(); // Обновляем счётчик в сайдбаре при открытии страницы
    const interval = setInterval(() => {
      load(query);
      triggerCountersRefresh(); // И при каждом polling тоже
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Поиск с debounce
  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearchLoading(true);
      load(query).finally(() => setSearchLoading(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  const secretCount = chats.filter((c) => c.is_secret).length;

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />
      <div className="w-px shrink-0 bg-white/10 my-3" />
      <main className="flex-1 overflow-y-auto border-x border-white/10">
        {/* Шапка */}
        <div className="p-4 md:p-6 border-b border-white/10 sticky top-0 bg-[#171717]/95 backdrop-blur-md z-10 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <MessageSquare size={24} className="text-[#8b5cf6]" />
              <h1 className="text-xl md:text-2xl font-black text-white">Сообщения</h1>
              {secretCount > 0 && (
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold border border-emerald-500/30">
                  <Lock size={10} />
                  {secretCount} секретных
                </span>
              )}
            </div>
          </div>

          {/* Поиск */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по имени или @username..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-white/10 bg-white/5 text-white placeholder-white/40 focus:outline-none focus:border-[#8b5cf6] text-sm"
            />
            {searchLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 border border-[#8b5cf6] border-t-transparent rounded-full animate-spin" />
            )}
          </div>
        </div>

        {loading && <p className="p-8 text-center text-white/50">Загрузка...</p>}

        {!loading && chats.length === 0 && (
          <div className="p-12 text-center">
            <MessageSquare size={48} className="text-white/20 mx-auto mb-4" />
            <p className="text-white/60 text-lg">
              {query ? "Ничего не найдено" : "Нет диалогов"}
            </p>
            <p className="text-white/40 text-sm mt-2">
              {query
                ? "Попробуйте другой запрос"
                : 'Нажмите "Написать" в профиле пользователя, чтобы начать переписку'}
            </p>
          </div>
        )}

        {!loading && chats.map((chat) => {
          const glow = getGlowColor(chat.other);
          return (
            <div
              key={chat.id}
              onClick={() => {
                triggerCountersRefresh();
                router.push(`/messages/${chat.id}`);
              }}
              className={`flex items-center gap-3 p-3 md:p-4 border-b border-white/10 hover:bg-white/5 transition-colors cursor-pointer ${
                chat.unread_count > 0 ? "bg-purple-500/5" : ""
              }`}
            >
              <div className="shrink-0 relative" style={glow ? { filter: `drop-shadow(0 0 8px ${glow})` } : undefined}>
                <Avatar
                  src={chat.other.avatar_url}
                  name={chat.other.display_name}
                  id={chat.other.id}
                  size={48}
                />
                {chat.is_secret && (
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-[#171717] flex items-center justify-center">
                    <Lock size={10} className="text-white" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p
                      className={`font-bold truncate ${glowStyle(chat.other) ? "" : "text-white"}`}
                      style={glowStyle(chat.other)}
                    >
                      {chat.other.display_name}
                    </p>
                    {chat.is_secret && (
                      <span className="text-emerald-400 text-[9px] font-black uppercase tracking-widest shrink-0">
                        SECRET
                      </span>
                    )}
                  </div>
                  {chat.last_message && (
                    <span className="text-xs text-white/40 shrink-0">
                      {new Date(chat.last_message.created_at).toLocaleTimeString("ru-RU", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>
                {chat.last_message ? (
                  <p className={`text-sm truncate mt-0.5 ${
                    chat.unread_count > 0 ? "text-white" : "text-white/50"
                  }`}>
                    {chat.last_message.text}
                  </p>
                ) : (
                  <p className="text-sm text-white/40 mt-0.5">Начните переписку</p>
                )}
              </div>
              {chat.unread_count > 0 && (
                <span className={`text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0 ${
                  chat.is_secret ? "bg-emerald-500" : "bg-gradient-to-r from-pink-500 to-purple-500"
                }`}>
                  {chat.unread_count}
                </span>
              )}
            </div>
          );
        })}
      </main>
    </div>
  );
}