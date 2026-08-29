"use client";

/**
 * NebulaSidebar — оболочка режима Nebula в стиле Telegram.
 * По умолчанию свёрнута в узкий dock-рей (как dock-тема основного Sidebar),
 * разворачивается в панель со списком чатов, поиском, созданием чата/группы
 * и меню профиля. На мобилке панель раскрывается на весь экран.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles, Settings, LogOut, Search, X, Users, MessageCircle,
} from "lucide-react";
import { useNebulaMode } from "@/lib/useNebula";
import { getToken } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { CreateGroupModal } from "@/components/CreateGroupModal";

type Me = {
  id?: number;
  username?: string;
  display_name?: string;
  displayName?: string;
  avatar_url?: string | null;
  avatarUrl?: string | null;
};

type ChatItem = {
  id?: number;
  is_group?: boolean;
  name?: string;
  other?: {
    id?: number;
    username?: string;
    display_name?: string;
    avatar_url?: string | null;
  };
  last_message?: { text?: string } | null;
};

type UserItem = {
  id?: number;
  username?: string;
  display_name?: string;
  displayName?: string;
  avatar_url?: string | null;
  avatarUrl?: string | null;
};

export function NebulaSidebar() {
  const router = useRouter();
  const { toggleNebula } = useNebulaMode();

  const [expanded, setExpanded] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserItem[]>([]);
  const [creating, setCreating] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Профиль + список чатов
  useEffect(() => {
    const token = getToken();
    if (!token) return;

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe)
      .catch(() => {});

    const loadChats = () =>
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => setChats(Array.isArray(data) ? data : []))
        .catch(() => {});

    loadChats();
    const interval = setInterval(loadChats, 15000);
    return () => clearInterval(interval);
  }, []);

  // Поиск пользователей для нового чата (только когда панель развёрнута)
  useEffect(() => {
    if (!expanded) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = query.trim();
    if (q.length < 1) {
      setUsers([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      const token = getToken();
      if (!token) return;
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/search?q=${encodeURIComponent(q)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setUsers(Array.isArray(data) ? data : data.users || []);
        }
      } catch {
        setUsers([]);
      }
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query, expanded]);

  const openChat = useCallback(
    (chatId: number) => {
      setExpanded(false);
      router.push(`/messages/${chatId}`);
    },
    [router]
  );

  // Создать личный чат с пользователем из поиска
  const startChatWith = useCallback(
    async (userId: number) => {
      if (creating) return;
      setCreating(true);
      try {
        const token = getToken();
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ other_user_id: userId }),
        });
        if (res.ok) {
          const data = await res.json();
          setQuery("");
          setUsers([]);
          setExpanded(false);
          router.push(`/messages/${data.chat_id}`);
        }
      } finally {
        setCreating(false);
      }
    },
    [creating, router]
  );

  const displayName = me?.display_name || me?.displayName || me?.username || "Профиль";
  const avatar = me?.avatar_url || me?.avatarUrl || null;

  return (
    <>
      {/* Индикатор режима Nebula */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-purple-500 z-50" />

      {/* ===== Свёрнутый dock-рей (по умолчанию) ===== */}
      <aside className="fixed left-0 top-1 bottom-0 z-40 w-16 flex flex-col items-center py-3 gap-2 bg-white dark:bg-[#17171b] border-r border-line dark:border-white/10">
        {/* Аватар: раскрывает панель */}
        <button
          onClick={() => setExpanded(true)}
          title={displayName}
          className="rounded-full hover:ring-2 hover:ring-purple-500/50 transition-all"
        >
          {avatar ? (
            <Avatar src={avatar} name={displayName} size={38} />
          ) : (
            <div className="w-[38px] h-[38px] rounded-full bg-purple-500/15 flex items-center justify-center text-sm font-bold text-purple-500">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </button>

        <div className="w-8 h-px bg-gray-200 dark:bg-white/10" />

        {/* Новый чат / поиск */}
        <button
          onClick={() => setExpanded(true)}
          title="Новый чат"
          className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-purple-500 transition-colors"
        >
          <MessageCircle size={20} />
        </button>

        {/* Новая группа */}
        <button
          onClick={() => {
            setExpanded(true);
            setShowCreateGroup(true);
          }}
          title="Новая группа"
          className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-purple-500 transition-colors"
        >
          <Users size={20} />
        </button>

        <div className="flex-1" />

        {/* Настройки Nebula */}
        <button
          onClick={() => {
            setExpanded(false);
            router.push("/nebula-settings");
          }}
          title="Настройки Nebula"
          className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-purple-500 transition-colors"
        >
          <Settings size={20} />
        </button>

        {/* Выход из режима Nebula */}
        <button
          onClick={() => {
            toggleNebula();
            router.push("/");
          }}
          title="Выйти из Nebula"
          className="w-10 h-10 rounded-xl flex items-center justify-center text-[#E74C3C] hover:bg-[#E74C3C]/10 transition-colors"
        >
          <LogOut size={20} />
        </button>
      </aside>

      {/* ===== Развёрнутая панель (как в Telegram) ===== */}
      {expanded && (
        <>
          {/* Затемнение — кликом сворачивает панель */}
          <div
            className="fixed inset-0 bg-black/40 z-[45] md:bg-black/20"
            onClick={() => setExpanded(false)}
          />

          <div className="fixed left-0 top-1 bottom-0 z-[46] w-full sm:w-96 flex flex-col bg-white dark:bg-[#17171b] border-r border-line dark:border-white/10 shadow-2xl">
            {/* Шапка: аватар + имя + «Nebula» */}
            <div className="px-4 py-3 flex items-center gap-3 border-b border-line dark:border-white/10 shrink-0">
              {avatar ? (
                <Avatar src={avatar} name={displayName} size={38} />
              ) : (
                <div className="w-[38px] h-[38px] rounded-full bg-purple-500/15 flex items-center justify-center text-sm font-bold text-purple-500">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-gray-900 dark:text-white truncate">
                  {displayName}
                </div>
                {me?.username && (
                  <div className="text-xs text-gray-400 dark:text-white/30 truncate">
                    @{me.username}
                  </div>
                )}
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 border border-purple-500/25 px-2 py-0.5 text-[10px] font-bold text-purple-500">
                <Sparkles size={10} />
                NEBULA
              </span>
              <button
                onClick={() => setExpanded(false)}
                title="Свернуть"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Поиск / новый чат */}
            <div className="px-3 py-2.5 border-b border-line dark:border-white/10 shrink-0">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/30" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Поиск чатов и людей..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:border-purple-500/60"
                />
              </div>
            </div>

            {/* Результаты поиска людей → новый чат */}
            {query.trim().length > 0 && (
              <div className="flex-1 overflow-y-auto py-1">
                <div className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-white/30">
                  Люди — нажмите, чтобы написать
                </div>
                {users.length === 0 && (
                  <div className="px-4 py-3 text-sm text-gray-400 dark:text-white/30">
                    Никого не найдено
                  </div>
                )}
                {users.map((u) => {
                  const uname = u.username || "";
                  const dn = u.display_name || u.displayName || uname;
                  const uav = u.avatar_url || u.avatarUrl || null;
                  return (
                    <button
                      key={u.id ?? uname}
                      onClick={() => u.id && startChatWith(u.id)}
                      disabled={creating}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
                    >
                      {uav ? (
                        <Avatar src={uav} name={dn} size={40} />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center text-sm font-bold text-gray-400 dark:text-white/40">
                          {dn.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {dn}
                        </div>
                        {uname && (
                          <div className="text-xs text-gray-400 dark:text-white/30">
                            @{uname}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Список чатов (орбита) */}
            {query.trim().length === 0 && (
              <div className="flex-1 overflow-y-auto py-1">
                <div className="px-4 py-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-white/30">
                    Чаты
                  </span>
                  <button
                    onClick={() => setShowCreateGroup(true)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-purple-500 hover:text-purple-600 transition-colors"
                  >
                    <Users size={13} />
                    Новая группа
                  </button>
                </div>

                {chats.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-gray-400 dark:text-white/30">
                    Чатов пока нет.
                    <br />
                    Найдите человека через поиск выше.
                  </div>
                )}

                {chats.map((chat) => {
                  const isGroup = !!chat.is_group;
                  const label = isGroup
                    ? chat.name || "Группа"
                    : chat.other?.display_name || chat.other?.username || "Чат";
                  const cav = isGroup ? null : chat.other?.avatar_url || null;
                  const preview =
                    chat.last_message?.text || (isGroup ? "Групповой чат" : "Напишите первым");
                  return (
                    <button
                      key={chat.id ?? label}
                      onClick={() => chat.id && openChat(chat.id)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
                    >
                      {cav ? (
                        <Avatar src={cav} name={label} size={44} />
                      ) : (
                        <div
                          className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${
                            isGroup
                              ? "bg-purple-500/15 text-purple-500"
                              : "bg-gray-100 dark:bg-white/10 text-gray-400 dark:text-white/40"
                          }`}
                        >
                          {isGroup ? (
                            <Users size={18} />
                          ) : (
                            <span className="text-sm font-bold">
                              {label.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                          {label}
                        </div>
                        <div className="text-xs text-gray-400 dark:text-white/30 truncate">
                          {preview}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Создание группы — переиспользуем существующую модалку */}
      {showCreateGroup && (
        <CreateGroupModal
          onClose={() => setShowCreateGroup(false)}
          onCreated={(chatId) => {
            setShowCreateGroup(false);
            setExpanded(false);
            router.push(`/messages/${chatId}`);
          }}
        />
      )}
    </>
  );
}