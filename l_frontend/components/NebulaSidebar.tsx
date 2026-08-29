"use client";

/**
 * NebulaSidebar — оболочка режима Nebula (стиль Telegram, дизайн наш).
 * ПК: узкий рей с "гамбургером" — раскрывает панель со списком чатов
 * и всеми кнопками мессенджера (группа, призма, секретный чат, профиль).
 * Телефон: вместо рейки — круглая кнопка-орбита, тап раскрывает дугу
 * из наших кнопок. Выход — как в обычном режиме (logout аккаунта).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Menu, X, Search, Users, Sparkles, Lock, User, LogOut,
  MessageCircle, Gem, Power,
} from "lucide-react";
import { getToken, clearToken } from "@/lib/auth";
import { useNebulaMode } from "@/lib/useNebula";
import { ensureKeyPair } from "@/lib/crypto";
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
  is_secret?: boolean;
  is_prism?: boolean;
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
  const [orbitOpen, setOrbitOpen] = useState(false); // мобильная орбита
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

  // Поиск людей (для нового / секретного чата)
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
    (chatId: number, isPrism?: boolean) => {
      setExpanded(false);
      setOrbitOpen(false);
      router.push(isPrism ? `/prisme/${chatId}` : `/messages/${chatId}`);
    },
    [router]
  );

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
          setOrbitOpen(false);
          router.push(`/messages/${data.chat_id}`);
        }
      } finally {
        setCreating(false);
      }
    },
    [creating, router]
  );

  // Секретный чат: выбор человека из поиска
  const startSecretChatWith = useCallback(
    async (userId: number) => {
      if (creating) return;
      setCreating(true);
      try {
        const token = getToken();
        if (!token) return;
        const apiUrl = process.env.NEXT_PUBLIC_API_URL!;
        await ensureKeyPair(token, apiUrl);
        const res = await fetch(
          `${apiUrl}/api/chats/secret?other_user_id=${userId}`,
          { method: "POST", headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setQuery("");
          setUsers([]);
          setExpanded(false);
          setOrbitOpen(false);
          router.push(`/messages/${data.chat_id}`);
        }
      } finally {
        setCreating(false);
      }
    },
    [creating, router]
  );

  // Выход — как в обычном режиме
  const logout = useCallback(() => {
    clearToken();
    router.push("/login");
  }, [router]);

  const displayName = me?.display_name || me?.displayName || me?.username || "Профиль";
  const avatar = me?.avatar_url || me?.avatarUrl || null;

  // ---- Действия (общие для рейки на ПК и орбиты на телефоне) ----
  const [panelMode, setPanelMode] = useState<"chats" | "secret">("chats");

  const openChatsPanel = () => {
    setPanelMode("chats");
    setQuery("");
    setOrbitOpen(false);
    setExpanded(true);
  };
  const openGroupModal = () => {
    setOrbitOpen(false);
    setShowCreateGroup(true);
  };
  const openPrism = () => {
    setExpanded(false);
    setOrbitOpen(false);
    router.push("/messages?create=prism");
  };
  const openSecret = () => {
    setOrbitOpen(false);
    setPanelMode("secret");
    setQuery("");
    setUsers([]);
    setExpanded(true);
  };
  const openProfile = () => {
    setExpanded(false);
    setOrbitOpen(false);
    router.push("/nebula-profile");
  };

  // Выход из режима Nebula
  const exitNebula = useCallback(() => {
    toggleNebula();
    router.push("/");
  }, [toggleNebula, router]);

  // Кнопки орбиты — только мессенджерные, без настроек
  const orbitItems = [
    { icon: MessageCircle, label: "Чаты", action: openChatsPanel },
    { icon: Users, label: "Группа", action: openGroupModal },
    { icon: Gem, label: "Призма", action: openPrism },
    { icon: Lock, label: "Секрет", action: openSecret },
    { icon: User, label: "Профиль", action: openProfile },
    { icon: Power, label: "Выйти", action: exitNebula },
  ];

  return (
    <>
      {/* Индикатор режима Nebula */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-purple-500 z-50" />

      {/* ===== Телефон: кнопка-орбита + дуга наших кнопок ===== */}
      <div className="sm:hidden">
        <button
          onClick={() => setOrbitOpen((v) => !v)}
          aria-label="Меню Nebula"
          className="fixed left-4 bottom-6 z-[47] w-14 h-14 rounded-full bg-purple-500 hover:bg-purple-600 text-white shadow-lg shadow-purple-500/30 flex items-center justify-center transition-all active:scale-95"
        >
          {orbitOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        {orbitOpen && (
          <>
            <div className="fixed inset-0 z-[46]" onClick={() => setOrbitOpen(false)} />
            {orbitItems.map((item, i) => {
              const angle = (100 + (i * 80) / (orbitItems.length - 1)) * (Math.PI / 180);
              const R = 104;
              const x = Math.cos(angle) * R;
              const y = -Math.sin(angle) * R;
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  className="fixed z-[48] flex flex-col items-center gap-1 animate-in zoom-in-95 duration-150"
                  style={{
                    left: `calc(2rem + ${x}px)`,
                    bottom: `calc(6rem + ${-y}px)`,
                    transform: "translate(-50%, 50%)",
                  }}
                >
                  <button
                    onClick={item.action}
                    className="w-12 h-12 rounded-full bg-white dark:bg-[#1f1f23] border border-line dark:border-white/10 shadow-xl flex items-center justify-center text-purple-500 active:scale-95 transition-transform"
                  >
                    <Icon size={20} />
                  </button>
                  <span className="text-[10px] font-semibold text-gray-600 dark:text-white/60 bg-white/80 dark:bg-[#1f1f23]/80 rounded px-1">
                    {item.label}
                  </span>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* ===== ПК: узкий рей с гамбургером ===== */}
      <aside className="hidden sm:flex fixed left-0 top-1 bottom-0 z-40 w-16 flex-col items-center py-3 gap-2 bg-white dark:bg-[#17171b] border-r border-line dark:border-white/10">
        <button
          onClick={() => {
            setPanelMode("chats");
            setQuery("");
            setExpanded((v) => !v);
          }}
          title="Меню"
          className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-purple-500 transition-colors"
        >
          <Menu size={22} />
        </button>

        <div className="w-8 h-px bg-gray-200 dark:bg-white/10" />

        <button onClick={openChatsPanel} title="Новый чат" className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-purple-500 transition-colors">
          <MessageCircle size={20} />
        </button>
        <button onClick={openGroupModal} title="Создать групповой чат" className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-purple-500 transition-colors">
          <Users size={20} />
        </button>
        <button onClick={openPrism} title="Создать PRISM" className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-cyan-500 transition-colors">
          <Gem size={20} />
        </button>
        <button onClick={openSecret} title="Секретный чат" className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-emerald-500 transition-colors">
          <Lock size={20} />
        </button>

        <div className="flex-1" />

        <button onClick={openProfile} title="Профиль" className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-purple-500 transition-colors">
          <User size={20} />
        </button>
        <button onClick={exitNebula} title="Выйти из Nebula" className="w-10 h-10 rounded-xl flex items-center justify-center text-purple-500 hover:bg-purple-500/10 transition-colors">
          <Power size={20} />
        </button>
        <button onClick={logout} title="Выйти из аккаунта" className="w-10 h-10 rounded-xl flex items-center justify-center text-[#E74C3C] hover:bg-[#E74C3C]/10 transition-colors">
          <LogOut size={20} />
        </button>
      </aside>

      {/* ===== Развёрнутая панель со списком чатов ===== */}
      {expanded && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-[44] sm:bg-black/20"
            onClick={() => setExpanded(false)}
          />
          <div className="fixed left-0 top-1 bottom-0 z-[45] w-full sm:w-96 flex flex-col bg-white dark:bg-[#17171b] border-r border-line dark:border-white/10 shadow-2xl">
            {/* Шапка */}
            <div className="px-4 py-3 flex items-center gap-3 border-b border-line dark:border-white/10 shrink-0">
              <button
                onClick={openProfile}
                className="rounded-full hover:ring-2 hover:ring-purple-500/50 transition-all"
                title="Открыть профиль"
              >
                {avatar ? (
                  <Avatar src={avatar} name={displayName} size={38} />
                ) : (
                  <div className="w-[38px] h-[38px] rounded-full bg-purple-500/15 flex items-center justify-center text-sm font-bold text-purple-500">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-gray-900 dark:text-white truncate">
                  {displayName}
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-500">
                  <Sparkles size={10} />
                  {panelMode === "secret" ? "Выберите человека для секретного чата" : "Nebula"}
                </span>
              </div>
              <button
                onClick={() => setExpanded(false)}
                title="Свернуть"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Поиск */}
            <div className="px-3 py-2.5 border-b border-line dark:border-white/10 shrink-0">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/30" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={panelMode === "secret" ? "Кому написать секретно..." : "Поиск чатов и людей..."}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:border-purple-500/60"
                />
              </div>
            </div>

            {/* Результаты поиска людей */}
            {query.trim().length > 0 && (
              <div className="flex-1 overflow-y-auto py-1">
                <div className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-white/30">
                  {panelMode === "secret" ? "Люди — секретный чат" : "Люди — нажмите, чтобы написать"}
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
                      onClick={() =>
                        u.id &&
                        (panelMode === "secret"
                          ? startSecretChatWith(u.id)
                          : startChatWith(u.id))
                      }
                      disabled={creating}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left disabled:opacity-50"
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
                      {panelMode === "secret" && (
                        <Lock size={14} className="ml-auto text-emerald-500 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            {/* Кнопки действий (группа, призма, секретный чат, профиль) */}
            {query.trim().length === 0 && panelMode === "chats" && (
              <div className="px-3 py-3 border-b border-line dark:border-white/10 shrink-0">
                <div className="grid grid-cols-4 gap-1">
                  <button
                    onClick={openGroupModal}
                    className="flex flex-col items-center gap-1 py-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                      <Users size={18} className="text-purple-500" />
                    </div>
                    <span className="text-[10px] font-medium text-gray-500 dark:text-white/40">Группа</span>
                  </button>
                  <button
                    onClick={openPrism}
                    className="flex flex-col items-center gap-1 py-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-cyan-500/10 flex items-center justify-center">
                      <Gem size={18} className="text-cyan-500" />
                    </div>
                    <span className="text-[10px] font-medium text-gray-500 dark:text-white/40">Призма</span>
                  </button>
                  <button
                    onClick={openSecret}
                    className="flex flex-col items-center gap-1 py-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                      <Lock size={18} className="text-emerald-500" />
                    </div>
                    <span className="text-[10px] font-medium text-gray-500 dark:text-white/40">Секрет</span>
                  </button>
                  <button
                    onClick={openProfile}
                    className="flex flex-col items-center gap-1 py-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-pink-500/10 flex items-center justify-center">
                      <User size={18} className="text-pink-500" />
                    </div>
                    <span className="text-[10px] font-medium text-gray-500 dark:text-white/40">Профиль</span>
                  </button>
                </div>
              </div>
            )}

            {/* Список чатов */}
            {query.trim().length === 0 && panelMode === "chats" && (
              <div className="flex-1 overflow-y-auto py-1">
                <div className="px-4 py-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-white/30">
                    Чаты
                  </span>
                  <button
                    onClick={openGroupModal}
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
                    chat.last_message?.text ||
                    (chat.is_secret ? "Секретный чат" : chat.is_prism ? "PRISM чат" : isGroup ? "Групповой чат" : "Напишите первым");
                  return (
                    <button
                      key={chat.id ?? label}
                      onClick={() => chat.id && openChat(chat.id, chat.is_prism)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
                    >
                      {cav ? (
                        <Avatar src={cav} name={label} size={44} />
                      ) : (
                        <div
                          className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${
                            chat.is_secret
                              ? "bg-emerald-500/15 text-emerald-500"
                              : chat.is_prism
                              ? "bg-cyan-500/15 text-cyan-500"
                              : isGroup
                              ? "bg-purple-500/15 text-purple-500"
                              : "bg-gray-100 dark:bg-white/10 text-gray-400 dark:text-white/40"
                          }`}
                        >
                          {chat.is_secret ? (
                            <Lock size={18} />
                          ) : chat.is_prism ? (
                            <Gem size={18} />
                          ) : isGroup ? (
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

      {/* Создание группы */}
      {showCreateGroup && (
        <CreateGroupModal
          onClose={() => setShowCreateGroup(false)}
          onCreated={(chatId) => {
            setShowCreateGroup(false);
            setExpanded(false);
            setOrbitOpen(false);
            router.push(`/messages/${chatId}`);
          }}
        />
      )}
    </>
  );
}