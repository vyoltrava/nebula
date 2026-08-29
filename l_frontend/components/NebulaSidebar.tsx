"use client";

/**
 * 🌌 NebulaSidebar — отдельная оболочка-сайдбар для режима Nebula.
 * Показывает только орбиту чатов, настройки Nebula и выход из режима.
 * Основной components/Sidebar.tsx не изменяется.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Settings, LogOut, MessagesSquare, Sparkles } from "lucide-react";
import { useNebulaMode } from "@/lib/useNebula";
import { getToken } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";

type ChatItem = {
  id?: number;
  name?: string;
  title?: string;
  avatarUrl?: string | null;
  lastMessagePreview?: string;
  other?: { displayName?: string; username?: string; avatarUrl?: string | null };
};

export function NebulaSidebar() {
  const router = useRouter();
  const { toggleNebula } = useNebulaMode();
  const [chats, setChats] = useState<ChatItem[]>([]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setChats(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  return (
    <>
      {/* 🟣 Индикатор режима Nebula — тонкая фиолетовая полоска сверху */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-purple-500 z-50" />

      <aside className="fixed left-0 top-1 bottom-0 z-40 w-[72px] md:w-64 flex flex-col bg-white dark:bg-[#17171b] border-r border-line dark:border-white/10">
        {/* Лого */}
        <div className="px-3 md:px-4 py-4 flex items-center gap-2 border-b border-line dark:border-white/10">
          <div className="w-8 h-8 rounded-xl bg-purple-500/15 flex items-center justify-center shrink-0">
            <Sparkles size={16} className="text-purple-500" />
          </div>
          <span className="hidden md:block font-bold text-gray-900 dark:text-white">
            Nebula
          </span>
        </div>

        {/* Орбита: список чатов */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {chats.length === 0 && (
            <div className="hidden md:block px-3 py-6 text-sm text-gray-400 dark:text-white/30">
              Чатов пока нет
            </div>
          )}
          {chats.map((chat) => {
            const label = chat.name || chat.title || chat.other?.displayName || chat.other?.username || "Чат";
            const avatar = chat.avatarUrl || chat.other?.avatarUrl || null;
            return (
              <button
                key={chat.id ?? label}
                onClick={() => router.push(`/messages/${chat.id}`)}
                title={label}
                className="w-full flex md:items-center items-start gap-3 rounded-xl px-2 md:px-3 py-2.5 text-left hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
              >
                <div className="shrink-0">
                  {avatar ? (
                    <Avatar src={avatar} name={label} size={36} />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center">
                      <MessagesSquare size={16} className="text-gray-400 dark:text-white/40" />
                    </div>
                  )}
                </div>
                <div className="hidden md:block min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {label}
                  </div>
                  {chat.lastMessagePreview && (
                    <div className="text-xs text-gray-400 dark:text-white/30 truncate">
                      {chat.lastMessagePreview}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </nav>

        {/* Низ: настройки Nebula и выход из режима */}
        <div className="p-2 border-t border-line dark:border-white/10 space-y-1">
          <button
            onClick={() => router.push("/nebula-settings")}
            title="Настройки Nebula"
            className="w-full flex items-center gap-3 rounded-xl px-2 md:px-3 py-2.5 text-gray-500 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <Settings size={18} className="shrink-0" />
            <span className="hidden md:block text-sm font-medium">Настройки Nebula</span>
          </button>
          <button
            onClick={() => {
              toggleNebula();
              router.push("/");
            }}
            title="Выйти из режима Nebula"
            className="w-full flex items-center gap-3 rounded-xl px-2 md:px-3 py-2.5 text-[#E74C3C] hover:bg-[#E74C3C]/10 transition-colors"
          >
            <LogOut size={18} className="shrink-0" />
            <span className="hidden md:block text-sm font-medium">Выйти из Nebula</span>
          </button>
        </div>
      </aside>
    </>
  );
}