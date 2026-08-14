"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Avatar } from "@/components/Avatar";
import { CreateGroupModal } from "@/components/CreateGroupModal";
import { MessageSquare, Search, Lock, Users } from "lucide-react";
import { getToken } from "@/lib/auth";
import { useUnreadCounts } from "@/lib/UnreadCountsContext";
import { socket } from "@/lib/websocket";
import { ChatListSkeleton } from "@/components/Skeletons";
import { Pin, PinOff, MoreVertical } from "lucide-react";
import { pinChat, unpinChat } from "@/lib/api";


export default function MessagesPage() {
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const router = useRouter();
  const { refresh } = useUnreadCounts();
  const [activeChatMenu, setActiveChatMenu] = useState<number | null>(null);
  const [pinningChat, setPinningChat] = useState<number | null>(null);

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


async function togglePinChat(chatId: number, currentlyPinned: boolean) {
  setPinningChat(chatId);
  try {
    if (currentlyPinned) {
      await unpinChat(chatId);
    } else {
      await pinChat(chatId);
    }
    await load(query);
  } catch (err: any) {
    alert(err.message || "Ошибка");
  } finally {
    setPinningChat(null);
    setActiveChatMenu(null);
  }
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
    refresh();

    const unsubNewMsg = socket.on("new_message", () => {
      load(query);
      refresh();
    });

    const unsubRead = socket.on("message_read", () => {
      load(query);
      refresh();
    });

    // 🆕 Групповые события
    const unsubGroupCreated = socket.on("group_created", () => {
      load(query);
      refresh();
    });
    const unsubGroupAdded = socket.on("group_member_added", () => {
      load(query);
    });
    const unsubGroupRemoved = socket.on("group_member_removed", () => {
      load(query);
    });
    const unsubChatDeleted = socket.on("chat_deleted", () => {
      load(query);
      refresh();
    });


    return () => {
      unsubNewMsg();
      unsubRead();
      unsubGroupCreated();
      unsubGroupAdded();
      unsubGroupRemoved();
      unsubChatDeleted();
    };
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearchLoading(true);
      load(query).finally(() => setSearchLoading(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  const secretCount = chats.filter((c) => c.is_secret).length;
  const sortedChats = [...chats].sort((a, b) => {
    // Закреплённые сверху
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    // Потом по времени последнего сообщения
    const aTime = a.last_message ? new Date(a.last_message.created_at).getTime() : 0;
    const bTime = b.last_message ? new Date(b.last_message.created_at).getTime() : 0;
    return bTime - aTime;
  });

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
              {/* 🆕 Кнопка создания группы */}
              <button
                onClick={() => setShowCreateGroup(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#8b5cf6]/10 text-[#8b5cf6] text-xs font-bold hover:bg-[#8b5cf6]/20 transition-colors border border-[#8b5cf6]/30"
              >
                <Users size={14} />
                <span className="hidden sm:inline">Создать группу</span>
              </button>
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

        {loading && <ChatListSkeleton />}

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

        {!loading && sortedChats.map((chat) => {
          // 🛡️ Защита: для групп chat.other может быть undefined
          const isGroup = !!chat.is_group;
          const otherUser = chat.other;
          const glow = !isGroup && otherUser ? getGlowColor(otherUser) : null;

          return (
            <div
              key={chat.id}
              onClick={() => {
                refresh();
                router.push(`/messages/${chat.id}`);
              }}
              className={`flex items-center gap-3 p-3 md:p-4 border-b border-white/10 hover:bg-white/5 transition-colors cursor-pointer ${
                chat.unread_count > 0 ? "bg-purple-500/5" : ""
              }`}
            >
              <div className="shrink-0 relative">
                {isGroup ? (
                  chat.avatar_url ? (
                    /* 1. Если у группы есть своя аватарка — показываем её */
                    <Avatar
                      src={chat.avatar_url}
                      name={chat.name || "Группа"}
                      id={chat.id}
                      size={48}
                    />
                  ) : (
                    /* 2. Если аватарки нет — показываем стопку участников */
                    <div className="w-12 h-12 relative flex items-center justify-center bg-white/5 rounded-full">
                      {(chat.members || []).slice(0, 3).map((m: any, i: number) => (
                        <div
                          key={m.user.id}
                          className="absolute"
                          style={{
                            top: i === 0 ? 0 : i === 1 ? 24 : 0,
                            left: i === 0 ? 0 : i === 1 ? 24 : 24,
                            zIndex: 3 - i,
                          }}
                        >
                          <Avatar
                            src={m.user.avatar_url}
                            name={m.user.display_name}
                            id={m.user.id}
                            size={28}
                          />
                        </div>
                      ))}
                      {/* 3. Страховка: если участников нет, показываем иконку */}
                      {!(chat.members || []).length && <Users size={24} className="text-white/40" />}
                      
                      {/* Индикатор группы */}
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#8b5cf6] border-2 border-[#171717] flex items-center justify-center">
                        <Users size={10} className="text-white" />
                      </div>
                    </div>
                  )
                ) : (
                  /* Обычный DM */
                  <div style={glow ? { filter: `drop-shadow(0 0 8px ${glow})` } : undefined}>
                    <Avatar
                      src={otherUser?.avatar_url}
                      name={otherUser?.display_name}
                      id={otherUser?.id}
                      size={48}
                    />
                    {chat.is_secret && (
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-[#171717] flex items-center justify-center">
                        <Lock size={10} className="text-white" />
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {/* 🆕 ИКОНКА ЗАКРЕПЛЕНИЯ */}
                    {chat.pinned && (
                      <Pin size={12} className="text-[#8b5cf6] shrink-0" />
                    )}
                    {isGroup ? (
                      <p className="font-bold truncate text-white">{chat.name}</p>
                    ) : (
                      <>
                        <p
                          className={`font-bold truncate ${glowStyle(otherUser) ? "" : "text-white"}`}
                          style={glowStyle(otherUser)}
                        >
                          {otherUser?.display_name}
                        </p>
                        {chat.is_secret && (
                          <span className="text-emerald-400 text-[9px] font-black uppercase tracking-widest shrink-0">
                            SECRET
                          </span>
                        )}
                      </>
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
                  <p className="text-sm text-white/40 mt-0.5">
                    {isGroup ? `${chat.members_count} участников` : "Начните переписку"}
                  </p>
                )}
              </div>

              {/* 🆕 КНОПКА МЕНЮ ЧАТА (закрепить/открепить) */}
              <div className="relative shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveChatMenu(activeChatMenu === chat.id ? null : chat.id);
                  }}
                  className="p-1.5 text-white/40 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                >
                  {pinningChat === chat.id ? (
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <MoreVertical size={16} />
                  )}
                </button>
                {activeChatMenu === chat.id && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveChatMenu(null);
                      }}
                    />
                    <div className="absolute right-0 top-full mt-1 bg-[#1f1f23] border border-white/15 rounded-xl shadow-2xl overflow-hidden min-w-[160px] z-50">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePinChat(chat.id, !!chat.pinned);
                        }}
                        className="w-full px-3 py-2.5 text-left text-sm text-white hover:bg-white/10 flex items-center gap-2 transition-colors"
                      >
                        {chat.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                        {chat.pinned ? "Открепить" : "Закрепить"}
                      </button>
                    </div>
                  </>
                )}
              </div>

              {chat.unread_count > 0 && (
                <span className={`text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0 ${
                  isGroup ? "bg-[#8b5cf6]" : chat.is_secret ? "bg-emerald-500" : "bg-gradient-to-r from-pink-500 to-purple-500"
                }`}>
                  {chat.unread_count}
                </span>
              )}
            </div>
          );
        })}
      </main>

      {/* 🆕 Модалка создания группы */}
      {showCreateGroup && (
        <CreateGroupModal
          onClose={() => setShowCreateGroup(false)}
          onCreated={(chatId) => {
            setShowCreateGroup(false);
            router.push(`/messages/${chatId}`);
          }}
        />
      )}
    </div>
  );
}