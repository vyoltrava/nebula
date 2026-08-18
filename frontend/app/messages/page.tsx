"use client";
import { useEffect, useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Avatar } from "@/components/Avatar";
import { CreateGroupModal } from "@/components/CreateGroupModal";
import { MessageSquare, Search, Lock, Users, Bookmark, ShieldCheck, X, } from "lucide-react";
import { getToken } from "@/lib/auth";
import { useUnreadCounts } from "@/lib/UnreadCountsContext";
import { socket } from "@/lib/websocket";
import { ChatListSkeleton } from "@/components/Skeletons";
import { Pin, PinOff, MoreVertical, Trash2 } from "lucide-react";
import { pinChat, unpinChat } from "@/lib/api";
import { useSwipe } from "@/lib/useSwipe";
import { generatePrismKey, splitKeyIntoShards, encryptAnchorWithPin } from "@/lib/prismCrypto";

// Компонент карточки чата со свайпом
function SwipeableChatItem({
  children,
  onSwipeRight,
  onSwipeLeft,
  isPinned,
  onClick,
}: {
  children: React.ReactNode;
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
  isPinned: boolean;
  onClick: () => void;
}) {
  const { offset, direction, isSwiping, handlers } = useSwipe({
    threshold: 70,
    maxOffset: 100,
    resistance: 0.35,
    onSwipeRight,
    onSwipeLeft,
  });

  const swipeRef = useRef(false);
  if (isSwiping) swipeRef.current = true;

  // Показываем иконки при свайпе
  const showRightIcon = direction === "right" && offset > 25;
  const showLeftIcon = direction === "left" && offset < -25;
  const iconOpacity = Math.min(Math.abs(offset) / 60, 1);

  return (
    <div
      className="relative overflow-hidden select-none"
      style={{ touchAction: "pan-y" }}
      {...handlers}
      onClick={() => {
        // Блокируем клик если был свайп
        if (swipeRef.current) {
          swipeRef.current = false;
          return;
        }
        onClick();
      }}
    >
      {/* Фон при свайпе вправо — меню */}
      {showRightIcon && (
        <div
          className="absolute inset-y-0 left-0 flex items-center pl-5 pointer-events-none"
          style={{ opacity: iconOpacity }}
        >
          <div className="w-9 h-9 rounded-full bg-[#8b5cf6]/20 border-2 border-[#8b5cf6] flex items-center justify-center">
            <MoreVertical size={16} className="text-[#8b5cf6]" />
          </div>
        </div>
      )}

      {/* Фон при свайпе влево — УДАЛИТЬ (красный) */}
      {showLeftIcon && (
        <div
          className="absolute inset-y-0 right-0 flex items-center pr-5 pointer-events-none"
          style={{ opacity: iconOpacity }}
        >
          <div className="w-10 h-10 rounded-full bg-red-500/90 border-2 border-red-400 flex items-center justify-center shadow-[0_0_15px_rgba(239,68,68,0.5)]">
            <Trash2 size={18} className="text-white" />
          </div>
        </div>
      )}

      {/* Контент со смещением */}
      <div
        className="relative z-10 bg-[#171717] transition-transform"
        style={{
          transform: `translateX(${isSwiping ? offset : 0}px)`,
          transition: isSwiping ? "none" : "transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        }}
      >
        {children}
      </div>
    </div>
  );
}


export default function MessagesPage() {
  const [allChats, setAllChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(""); // ✅ Сначала объявляем query
  const [searchLoading, setSearchLoading] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showPrismModal, setShowPrismModal] = useState(false);
  const [prismSearchQuery, setPrismSearchQuery] = useState("");
  const [prismSearchResults, setPrismSearchResults] = useState<any[]>([]);
  const [isCreatingPrism, setIsCreatingPrism] = useState(false);
  const router = useRouter();
  const { refresh } = useUnreadCounts();
  const [activeChatMenu, setActiveChatMenu] = useState<number | null>(null);
  const [pinningChat, setPinningChat] = useState<number | null>(null);

  // 🔎 Клиентский поиск (теперь query уже существует)
  const chats = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allChats;
    return allChats.filter((c) => {
      const isGroup = !!c.is_group;
      const name = (isGroup ? c.name : c.other?.display_name || "").toLowerCase();
      const username = (!isGroup ? c.other?.username || "" : "").toLowerCase();
      const text = (c.last_message?.text || "").toLowerCase();
      return name.includes(q) || username.includes(q) || text.includes(q);
    });
  }, [allChats, query]);


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


  // 🔴 Удаление чата
async function deleteChat(chatId: number, chatName: string) {
  if (!confirm(`Удалить чат "${chatName}"? Все сообщения будут удалены навсегда.`)) return;
  const token = getToken();
  if (!token) return;
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      await load();
      refresh();
    } else {
      const err = await res.json().catch(() => ({ detail: "Ошибка" }));
      alert(err.detail || "Не удалось удалить чат");
    }
  } catch {
    alert("Ошибка сети");
  }
}


// 🆕 Открытие или создание чата "Избранное"
async function openSavedMessages() {
  const token = getToken();
  if (!token) return;
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/saved`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      router.push(`/messages/${data.id}`);
    }
  } catch (err) {
    console.error("Failed to open saved messages", err);
  }
}

// 🟣 Подсветка совпадений в поиске
function highlight(text: string | null | undefined, q: string): React.ReactNode {
  if (!text) return null;
  if (!q.trim()) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-[#8b5cf6]/50 text-white rounded px-0.5 font-semibold">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

// Показывает сниппет вокруг совпадения в тексте сообщения
function snippet(text: string | null | undefined, q: string, maxLen = 80): string {
  if (!text) return "";
  if (!q.trim()) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  const start = Math.max(0, idx - 20);
  const end = Math.min(text.length, idx + q.length + 40);
  let s = text.slice(start, end);
  if (start > 0) s = "…" + s;
  if (end < text.length) s = s + "…";
  return s;
}

async function togglePinChat(chatId: number, currentlyPinned: boolean) {
  setPinningChat(chatId);
  try {
    if (currentlyPinned) {
      await unpinChat(chatId);
    } else {
      await pinChat(chatId);
    }
    await load();
  } catch (err: any) {
    alert(err.message || "Ошибка");
  } finally {
    setPinningChat(null);
    setActiveChatMenu(null);
  }
}


  async function load() {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setAllChats(await res.json());
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    refresh();

    const unsubNewMsg = socket.on("new_message", () => {
      load();
      refresh();
    });

    const unsubRead = socket.on("message_read", () => {
      load();
      refresh();
    });

    // 🆕 Групповые события
    const unsubGroupCreated = socket.on("group_created", () => {
      load();
      refresh();
    });
    const unsubGroupAdded = socket.on("group_member_added", () => {
      load();
    });
    const unsubGroupRemoved = socket.on("group_member_removed", () => {
      load();
    });
    const unsubChatDeleted = socket.on("chat_deleted", () => {
      load();
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
    if (!query.trim()) {
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const timeout = setTimeout(() => setSearchLoading(false), 150);
    return () => clearTimeout(timeout);
  }, [query]);

  const secretCount = chats.filter((c) => c.is_secret).length;
  const q = query.trim().toLowerCase();

  const sortedChats = [...chats].sort((a, b) => {
    // 🔎 При поиске: сначала совпадения в имени, потом в сообщениях
    if (q) {
      const aName = (a.is_group ? a.name : a.other?.display_name || "").toLowerCase() + " " + (a.other?.username || "").toLowerCase();
      const bName = (b.is_group ? b.name : b.other?.display_name || "").toLowerCase() + " " + (b.other?.username || "").toLowerCase();
      const aText = (a.last_message?.text || "").toLowerCase();
      const bText = (b.last_message?.text || "").toLowerCase();
      const aNameMatch = aName.includes(q);
      const bNameMatch = bName.includes(q);
      const aTextMatch = !aNameMatch && aText.includes(q);
      const bTextMatch = !bNameMatch && bText.includes(q);
      if (aNameMatch && !bNameMatch) return -1;
      if (!aNameMatch && bNameMatch) return 1;
      if (aTextMatch && !bTextMatch && !bNameMatch) return -1;
      if (!aTextMatch && !aNameMatch && bTextMatch) return 1;
    }
    // Закреплённые сверху
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    // По времени
    const aTime = a.last_message ? new Date(a.last_message.created_at).getTime() : 0;
    const bTime = b.last_message ? new Date(b.last_message.created_at).getTime() : 0;
    return bTime - aTime;
  });

  // 🔎 Счётчики для заголовка
  const nameMatches = sortedChats.filter((c) => {
    const n = ((c.is_group ? c.name : c.other?.display_name || "") + " " + (c.other?.username || "")).toLowerCase();
    return n.includes(q);
  }).length;
  const textMatches = sortedChats.length - nameMatches;


// Поиск пользователей для Призмы
const searchUsersForPrism = async (q: string) => {
  if (!q.trim()) { 
    setPrismSearchResults([]); 
    return; 
  }
  
  const token = getToken();
  if (!token) return;

  try {
    // ✅ ИСПРАВЛЕНО: стучимся в реальный эндпоинт из routers/users.py (@router.get("/api/users"))
    const url = `${process.env.NEXT_PUBLIC_API_URL}/api/users?q=${encodeURIComponent(q)}&limit=10`;
    
    console.log("🔍 Запрос поиска на URL:", url);
    
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`❌ Ошибка поиска (Status ${res.status}):`, errText);
      setPrismSearchResults([]);
      return;
    }

    const data = await res.json();
    console.log("✅ Сырой ответ от сервера:", data);

    // ✅ ИСПРАВЛЕНО: бэкенд возвращает { users: [...], posts: [...] }
    // Мы забираем именно массив users. Если его нет — пустой массив.
    const usersArray = Array.isArray(data) ? data : (data.users || []);
    
    console.log("✅ Извлеченные пользователи для модалки:", usersArray);
    setPrismSearchResults(usersArray);
    
  } catch (e) { 
    console.error("💥 Сетевая ошибка при поиске пользователей:", e); 
    setPrismSearchResults([]);
  }
};

// Создание чата Призма
const initiatePrism = async (targetUserId: number, targetUserName: string) => {
  if (!confirm(`Создать защищенный канал 'Призма' с @${targetUserName}?`)) return;
  
  setIsCreatingPrism(true);
  const token = getToken();
  const pin = prompt("Придумайте 4-значный PIN-код для защиты этого канала (запомните его!):");
  
  if (!pin || pin.length < 4) {
    alert("PIN-код обязателен и должен быть не менее 4 символов");
    setIsCreatingPrism(false);
    return;
  }

  try {
    // 1. Генерируем ключ и делим на 3 спектра
    const key = generatePrismKey();
    const { shard1_anchor, shard2_genesis, shard3_local } = splitKeyIntoShards(key);
    
    // 2. Шифруем Спектр 1 (Якорь) PIN-кодом пользователя
    const encryptedShard1 = await encryptAnchorWithPin(shard1_anchor, pin);
    
    // 3. Сохраняем Спектр 3 локально для мгновенного доступа
    localStorage.setItem(`trelod_prism_local_${targetUserId}`, shard3_local);
    
    // 4. Отправляем на сервер
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/prism`, {
      method: "POST",
      headers: { 
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        other_user_id: targetUserId,
        shard1_encrypted: encryptedShard1,
        shard2_genesis: shard2_genesis,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setShowPrismModal(false);
      setPrismSearchQuery("");
      setPrismSearchResults([]);
      router.push(`/messages/${data.chat_id}`); // Переход в новый чат
    } else {
      const err = await res.json();
      alert(err.detail || "Ошибка создания канала");
    }
  } catch (e) {
    console.error(e);
    alert("Ошибка сети или шифрования");
  } finally {
    setIsCreatingPrism(false);
  }
};




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

{/* 🆕 Кнопка Избранное */}
<button
  onClick={openSavedMessages}
  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-yellow-500/10 text-yellow-400 text-xs font-bold hover:bg-yellow-500/20 transition-colors border border-yellow-500/30"
>
  <Bookmark size={14} />
  <span className="hidden sm:inline">Избранное</span>
</button>



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



{/* 🆕 КНОПКА ОТКРЫТИЯ МОДАЛКИ ПРИЗМЫ */}
<button 
  onClick={() => setShowPrismModal(true)}
  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-600/20 to-purple-600/20 border border-cyan-500/30 rounded-lg text-cyan-400 text-xs font-bold tracking-widest hover:shadow-[0_0_20px_rgba(34,211,238,0.2)] transition-all"
>
  <ShieldCheck size={14} />
  <span className="hidden sm:inline">PRISM LINK</span>
</button>   



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
        {/* 🔎 Заголовок результатов поиска */}
        {!loading && q && sortedChats.length > 0 && (
          <div className="px-4 md:px-6 py-2.5 border-b border-white/10 bg-[#8b5cf6]/5 flex items-center gap-3 backdrop-blur-md">
            <Search size={14} className="text-[#8b5cf6] shrink-0" />
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span className="text-white/80">
                Найдено <span className="font-bold text-white">{sortedChats.length}</span>
              </span>
              {nameMatches > 0 && (
                <span className="text-[#a78bfa]">· {nameMatches} по имени</span>
              )}
              {textMatches > 0 && (
                <span className="text-[#a78bfa]">· {textMatches} в сообщениях</span>
              )}
            </div>
          </div>
        )}
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
          const isSaved = !!chat.is_saved; // Теперь бэкенд присылает это поле
          const isGroup = !!chat.is_group;
          const otherUser = chat.other;

          const displayName = isSaved ? "Избранное" : (isGroup ? chat.name : otherUser?.display_name || "");
          const glow = !isGroup && !isSaved && otherUser ? getGlowColor(otherUser) : null;

          // 🔎 ПОИСК: определяем тип совпадения для группировки
          const chatName = (isGroup ? chat.name : otherUser?.display_name || "").toLowerCase();
          const chatUsername = (!isGroup ? otherUser?.username || "" : "").toLowerCase();
          const lastText = (chat.last_message?.text || "").toLowerCase();
          const nameMatch = q && (chatName.includes(q) || chatUsername.includes(q));
          const textMatch = q && !nameMatch && lastText.includes(q);
          const matchType = nameMatch ? "name" : textMatch ? "text" : null;
          return (
            <SwipeableChatItem
              key={chat.id}
              isPinned={!!chat.pinned}
              onClick={() => {
                refresh();
                router.push(`/messages/${chat.id}`);
              }}
              onSwipeRight={() => {
                setActiveChatMenu(activeChatMenu === chat.id ? null : chat.id);
              }}
              onSwipeLeft={() => {
                const name = isGroup ? chat.name : otherUser?.display_name || "чат";
                deleteChat(chat.id, name);
              }}
            >
              <div
                className={`flex items-center gap-3 p-3 md:p-4 border-b border-white/10 hover:bg-white/5 transition-colors cursor-pointer ${
                  chat.unread_count > 0 ? "bg-purple-500/5" : ""
                }`}
              >
<div className="shrink-0 relative">
  {isSaved ? (
    /* 🆕 Иконка для Избранного */
    <div className="w-12 h-12 rounded-full bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center">
      <Bookmark size={24} className="text-yellow-400" />
    </div>
  ) : isGroup ? (
    chat.avatar_url ? (
      <Avatar src={chat.avatar_url} name={chat.name || "Группа"} id={chat.id} size={48} />
    ) : (
      <div className="w-12 h-12 relative flex items-center justify-center bg-white/5 rounded-full">
        {(chat.members || []).slice(0, 3).map((m: any, i: number) => (
          <div
            key={m.user.id}
            className="absolute"
            style={{ top: i === 0 ? 0 : i === 1 ? 24 : 0, left: i === 0 ? 0 : i === 1 ? 24 : 24, zIndex: 3 - i }}
          >
            <Avatar src={m.user.avatar_url} name={m.user.display_name} id={m.user.id} size={28} />
          </div>
        ))}
        {!(chat.members || []).length && <Users size={24} className="text-white/40" />}
        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#8b5cf6] border-2 border-[#171717] flex items-center justify-center">
          <Users size={10} className="text-white" />
        </div>
      </div>
    )
  ) : (
    /* Обычный DM */
    <div style={glow ? { filter: `drop-shadow(0 0 8px ${glow})` } : undefined}>
      <Avatar src={otherUser?.avatar_url} name={otherUser?.display_name} id={otherUser?.id} size={48} />
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
  {chat.pinned && <Pin size={12} className="text-[#8b5cf6] shrink-0" />}
  
  {isSaved ? (
    <p className="font-bold truncate text-yellow-400">Избранное</p>
  ) : isGroup ? (
    <p className="font-bold truncate text-white">
      {query.trim() ? highlight(chat.name, query.trim()) : chat.name}
    </p>
  ) : (
    <>
      <p className={`font-bold truncate ${glowStyle(otherUser) ? "" : "text-white"}`} style={glowStyle(otherUser)}>
        {query.trim() ? highlight(otherUser?.display_name, query.trim()) : otherUser?.display_name}
      </p>
      {chat.is_secret && (
        <span className="text-emerald-400 text-[9px] font-black uppercase tracking-widest shrink-0">SECRET</span>
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
  <div className="mt-0.5">
    <p className={`text-sm truncate ${
      chat.unread_count > 0 ? "text-white" : "text-white/50"
    }`}>
      {/* 🆕 Если это избранное, не пишем свое имя перед текстом */}
      {isSaved ? (
        chat.last_message.text
      ) : query.trim() && textMatch ? (
        highlight(snippet(chat.last_message.text, query.trim()), query.trim())
      ) : query.trim() ? (
        highlight(chat.last_message.text, query.trim())
      ) : (
        chat.last_message.text
      )}
    </p>
  </div>
) : (
  <p className="text-sm text-white/40 mt-0.5">
    {isGroup ? `${chat.members_count} участников` : "Начните переписку"}
  </p>
)}
              </div>

              {/* КНОПКА МЕНЮ ЧАТА */}
              <div className="shrink-0">
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
              </div>

              {chat.unread_count > 0 && (
                <span className={`text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0 ${
                  isGroup ? "bg-[#8b5cf6]" : chat.is_secret ? "bg-emerald-500" : "bg-gradient-to-r from-pink-500 to-purple-500"
                }`}>
                  {chat.unread_count}
                </span>
              )}
            </div>
            </SwipeableChatItem>
          );
        })}
      </main>

            {/* 🆕 BOTTOM-SHEET МЕНЮ ЧАТА (не режется карточкой) */}
      {activeChatMenu !== null && (() => {
        const menuChat = chats.find((c) => c.id === activeChatMenu);
        if (!menuChat) return null;
        return (
          <>
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[250]"
              onClick={() => setActiveChatMenu(null)}
            />
            <div className="fixed bottom-0 left-0 right-0 z-[251] bg-[#1f1f23] border-t border-white/15 rounded-t-2xl shadow-2xl p-3 pb-8 animate-in slide-in-from-bottom-4 duration-200 md:left-auto md:right-6 md:bottom-6 md:w-80 md:rounded-2xl md:border md:pb-3">
              <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-3 md:hidden" />
              <p className="text-xs text-white/40 mb-2 px-1 truncate">
                {menuChat.is_group ? menuChat.name : menuChat.other?.display_name}
              </p>
              <button
                onClick={() => togglePinChat(menuChat.id, !!menuChat.pinned)}
                className="w-full px-3 py-3 rounded-xl text-left text-sm text-white hover:bg-white/10 flex items-center gap-2.5 transition-colors"
              >
                {menuChat.pinned ? (
                  <PinOff size={16} className="text-yellow-400" />
                ) : (
                  <Pin size={16} className="text-[#8b5cf6]" />
                )}
                {menuChat.pinned ? "Открепить" : "Закрепить"}
              </button>
              <button
                onClick={() => {
                  setActiveChatMenu(null);
                  refresh();
                  router.push(`/messages/${menuChat.id}`);
                }}
                className="w-full px-3 py-3 rounded-xl text-left text-sm text-white hover:bg-white/10 flex items-center gap-2.5 transition-colors"
              >
                <MessageSquare size={16} className="text-white/60" />
                Открыть чат
              </button>
              <div className="h-px bg-white/10 my-1" />
              <button
                onClick={() => {
                  const name = menuChat.is_group ? menuChat.name : menuChat.other?.display_name || "чат";
                  setActiveChatMenu(null);
                  deleteChat(menuChat.id, name);
                }}
                className="w-full px-3 py-3 rounded-xl text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2.5 transition-colors"
              >
                <Trash2 size={16} className="text-red-400" />
                Удалить чат
              </button>
            </div>
          </>
        );
      })()}

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


{/* 🆕 МОДАЛКА СОЗДАНИЯ ПРИЗМЫ */}
{showPrismModal && (
  <>
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[300]" onClick={() => setShowPrismModal(false)} />
    <div className="fixed inset-0 z-[301] flex items-center justify-center p-4 pointer-events-none">
      <div className="w-full max-w-md bg-[#171717] border border-cyan-500/30 rounded-2xl shadow-[0_0_40px_rgba(34,211,238,0.1)] flex flex-col pointer-events-auto animate-in zoom-in-95 duration-200">
        
        {/* Шапка */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
              <ShieldCheck size={18} className="text-cyan-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-wide">INITIATE PRISM</h3>
              <p className="text-[10px] text-cyan-400/70 uppercase tracking-widest">Бесшовное E2E шифрование</p>
            </div>
          </div>
          <button onClick={() => setShowPrismModal(false)} className="text-white/40 hover:text-white p-1">
            <X size={18} />
          </button>
        </div>

        {/* Контент */}
        <div className="p-4 space-y-4">
          <p className="text-xs text-white/60 leading-relaxed">
            Выберите пользователя. Ключ шифрования будет разделен на 3 спектра. 
            Для восстановления истории на новом устройстве потребуется только ваш PIN-код.
          </p>
          
          {/* Поиск */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              value={prismSearchQuery}
              onChange={(e) => { setPrismSearchQuery(e.target.value); searchUsersForPrism(e.target.value); }}
              placeholder="Поиск по @username или имени..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-white placeholder-white/40 focus:outline-none focus:border-cyan-500/50 text-sm"
              autoFocus
            />
          </div>

          {/* Результаты */}
          <div className="max-h-60 overflow-y-auto space-y-1">
            {prismSearchResults.map((u: any) => (
              <button
                key={u.id}
                onClick={() => initiatePrism(u.id, u.username)}
                disabled={isCreatingPrism}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-cyan-500/10 border border-transparent hover:border-cyan-500/30 transition-all text-left disabled:opacity-50"
              >
                <Avatar src={u.avatar_url} name={u.display_name} id={u.id} size={36} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{u.display_name}</p>
                  <p className="text-xs text-white/40 truncate">@{u.username}</p>
                </div>
                <Lock size={14} className="text-cyan-400/50" />
              </button>
            ))}
            {prismSearchQuery && prismSearchResults.length === 0 && !isCreatingPrism && (
              <p className="text-center text-xs text-white/30 py-4">Пользователи не найдены</p>
            )}
            {isCreatingPrism && (
              <div className="flex items-center justify-center gap-2 py-4 text-cyan-400 text-xs">
                <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                Генерация спектров и шифрование...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  </>
)} 



    </div>
  );
}