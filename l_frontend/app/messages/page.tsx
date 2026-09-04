"use client";
import { useTheme } from "next-themes";
import { resolveNickColor } from "@/lib/nickGlow";
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Avatar } from "@/components/Avatar";
import { CreateGroupModal } from "@/components/CreateGroupModal";
import { CreateChannelModal } from "@/components/CreateChannelModal";
import { MessageSquare, Search, Lock, Users, Bookmark, ShieldCheck, X, Plus, Megaphone } from "lucide-react";
import { getToken } from "@/lib/auth";
import { useUnreadCounts } from "@/lib/UnreadCountsContext";
import { socket } from "@/lib/websocket";
import { sanitizeSvg } from "@/lib/sanitize";
import { ChatListSkeleton } from "@/components/Skeletons";
import { ChatPreview } from "@/components/ChatPreview";
import { Pin, PinOff, MoreVertical, Trash2, Pencil, Bell, BellOff } from "lucide-react";
import { pinChat, unpinChat, setChatMute } from "@/lib/api";
import { formatChatTime } from "@/lib/time";
import { useSwipe } from "@/lib/useSwipe";
import { generatePrismKey, splitKeyIntoShards, encryptAnchorWithPin } from "@/lib/prismCrypto";
import { generatePrismAvatar } from "@/lib/prismAvatar";
import { prismStorage } from "@/lib/prismStorage";import { useI18n } from "@/lib/i18n/LanguageProvider";






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

  const showRightIcon = direction === "right" && offset > 25;
  const showLeftIcon = direction === "left" && offset < -25;
  const iconOpacity = Math.min(Math.abs(offset) / 60, 1);

  return (
    <div
      className="relative overflow-hidden select-none"
      style={{ touchAction: "pan-y" }}
      {...handlers}
      onClick={() => {
        if (swipeRef.current) {
          swipeRef.current = false;
          return;
        }
        onClick();
      }}
    >
      {showRightIcon && (
        <div className="absolute inset-y-0 left-0 flex items-center pl-5 pointer-events-none" style={{ opacity: iconOpacity }}>
          <div className="w-9 h-9 rounded-full bg-[#8b5cf6]/20 border-2 border-[#8b5cf6] flex items-center justify-center">
            <MoreVertical size={16} className="text-[#8b5cf6]" />
          </div>
        </div>
      )}

      {showLeftIcon && (
        <div className="absolute inset-y-0 right-0 flex items-center pr-5 pointer-events-none" style={{ opacity: iconOpacity }}>
          <div className="w-10 h-10 rounded-full bg-red-500/90 border-2 border-red-600 dark:border-red-400 flex items-center justify-center shadow-[0_0_15px_rgba(239,68,68,0.5)]">
            <Trash2 size={18} className="text-gray-900 dark:text-white" />
          </div>
        </div>
      )}

      <div
        className="relative z-10 bg-paper dark:bg-[#171717] transition-transform"
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
  const { t, locale } = useI18n();
  const [allChats, setAllChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showPrismModal, setShowPrismModal] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [prismSearchQuery, setPrismSearchQuery] = useState("");
  const [prismSearchResults, setPrismSearchResults] = useState<any[]>([]);
  const [isCreatingPrism, setIsCreatingPrism] = useState(false);
  const [creationLandscape, setCreationLandscape] = useState<{ chat_id: number; svg: string; objects: any[] } | null>(null);
  const [selectedCreationObject, setSelectedCreationObject] = useState<string | null>(null);
  
  const router = useRouter();
  const { refresh } = useUnreadCounts();

  // ✏️ Черновики чатов: из БД (/api/chat-drafts) + fallback на localStorage (офлайн)
  const [chatDrafts, setChatDrafts] = useState<Record<string, string>>({});
  const loadChatDrafts = useCallback(() => {
    const localMap: Record<string, string> = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("draft_chat_")) {
          const v = localStorage.getItem(k) || "";
          if (v.trim()) localMap[k.slice("draft_chat_".length)] = v;
        }
      }
    } catch { /* ignore */ }
    // сразу показываем локальные (мгновенно, работает офлайн)
    setChatDrafts(localMap);
    const token = getToken();
    if (!token) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/api/chat-drafts`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((rows) => {
        if (!rows) return; // сервер недоступен — остаёмся на localStorage
        const map: Record<string, string> = {};
        for (const d of rows || []) {
          if (d.text && d.text.trim()) map[String(d.chat_id)] = d.text;
        }
        // merge: локальные значения приоритетнее (свежее)
        setChatDrafts({ ...map, ...localMap });
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    loadChatDrafts();
    const onWake = () => {
      if (document.visibilityState === "visible") loadChatDrafts();
    };
    window.addEventListener("focus", onWake);
    window.addEventListener("drafts-changed", onWake);
    return () => {
      window.removeEventListener("focus", onWake);
      window.removeEventListener("drafts-changed", onWake);
    };
  }, [loadChatDrafts]);
  const [activeChatMenu, setActiveChatMenu] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const [pinningChat, setPinningChat] = useState<number | null>(null);

  const chats = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allChats;
    return allChats.filter((c) => {
      const isGroup = !!c.is_group;
      const name = (c.is_channel ? c.name : isGroup ? c.name : c.other?.display_name || "").toLowerCase();
      const username = (c.is_channel ? `@${c.custom_slug || ""}` : !isGroup ? c.other?.username || "" : "").toLowerCase();
      const text = (c.last_message?.text || "").toLowerCase();
      return name.includes(q) || username.includes(q) || text.includes(q);
    });
  }, [allChats, query]);

  // Nebula: поддержка ?create=prism (и ?create=group) — открытие
  // окна создания из Nebula-оболочки.
  // ДВА механизма:
  // 1) параметр ?create=... при переходе с другой страницы (эффект на монтирование);
  // 2) событие window "nebula-create" — если пользователь УЖЕ на /messages,
  //    router.push("?create=...") не перемонтирует страницу (раньше модалка
  //    не открывалась с орбиты Nebula, особенно на мобилке).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const create = new URLSearchParams(window.location.search).get("create");
    if (create === "prism") {
      // 🔁 prism объединён с групповым чатом — открываем создание группы
      setShowCreateGroup(true);
      window.history.replaceState({}, "", "/messages");
    } else if (create === "group") {
      setShowCreateGroup(true);
      window.history.replaceState({}, "", "/messages");
    } else if (create === "channel") {
      setShowCreateChannel(true);
      window.history.replaceState({}, "", "/messages");
    }
  }, []);

  useEffect(() => {
    const onNebulaCreate = (e: Event) => {
      const kind = (e as CustomEvent).detail;
      if (kind === "prism") setShowCreateGroup(true); // 🔁 prism → группа
      else if (kind === "group") setShowCreateGroup(true);
      else if (kind === "channel") setShowCreateChannel(true);
    };
    window.addEventListener("nebula-create", onNebulaCreate);
    return () => window.removeEventListener("nebula-create", onNebulaCreate);
  }, []);

  function getGlowColor(user: any): string | null {
if (user?.role?.color && (user?.role?.level ?? 0) >= 8) return user.role.color; // 🆕 роль 8-11 перекрывает флаги
if (user?.username === "trelod") return "#e4e4e7"; // Zinc-200
  if (user?.is_admin) return "#fff";
  if (user?.is_moderator) return "#3b82f6";
  if (user?.role?.color) return user.role.color;
  return null;
}
  const { resolvedTheme } = useTheme();
  function glowStyle(user: any): React.CSSProperties | undefined {
    const c = resolveNickColor(getGlowColor(user), resolvedTheme);
    if (!c) return undefined;
    return { color: c, textShadow: `0 0 6px ${c}B3, 0 0 14px ${c}66` };
  }

  async function deleteChat(chatId: number, chatName: string) {
    if (!confirm(t("messages.deleteChatConfirm", { name: chatName }))) return;
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
        const err = await res.json().catch(() => ({ detail: t("common.error") }));
        alert(err.detail || t("messages.deleteChatFailed"));
      }
    } catch {
      alert(t("common.networkError"));
    }
  }

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
      setMenuPosition(null);
    }
  }

  async function load() {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    try {
      // Чаты (существующий API) + каналы (изолированная система /api/channels)
      const [chatsRes, channelsRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/channels/my`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const chatsData = chatsRes.ok ? await chatsRes.json() : [];
      let items: any[] = chatsData;
      if (channelsRes.ok) {
        const channelsData = await channelsRes.json();
        // Каналы → унифицированный формат списка (is_channel: true)
        const channelItems = (channelsData || []).map((ch: any) => ({
          id: ch.id,
          is_channel: true,
          is_group: false,
          name: ch.title,
          avatar_url: ch.avatar_url,
          custom_slug: ch.custom_slug,
          my_role: ch.my_role,
          subscribers_count: ch.subscribers_count,
          unread_count: ch.unread_count || 0,
          muted: !!ch.is_muted,
          last_activity: ch.created_at,
          members: [],
        }));
        items = [...chatsData, ...channelItems];
      }
      setAllChats(items);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    refresh();

    const unsubNewMsg = socket.on("new_message", () => { load(); refresh(); });
    const unsubRead = socket.on("message_read", () => { load(); refresh(); });
    const unsubGroupCreated = socket.on("group_created", () => { load(); refresh(); });
    const unsubGroupAdded = socket.on("group_member_added", () => { load(); });
    const unsubGroupRemoved = socket.on("group_member_removed", () => { load(); });
    const unsubChatDeleted = socket.on("chat_deleted", () => { load(); refresh(); });
    // 📢 Каналы (изолированные channel_* события)
    const unsubChannelPost = socket.on("channel_new_post", () => { load(); });
    const unsubChannelSilent = socket.on("channel_new_post_silent", () => { load(); });
    const unsubChannelEdited = socket.on("channel_post_edited", () => { load(); });
    const unsubChannelDeleted = socket.on("channel_post_deleted", () => { load(); });
    const unsubChannelJoined = socket.on("channel_subscriber_joined", () => { load(); });

    return () => {
      unsubNewMsg();
      unsubRead();
      unsubGroupCreated();
      unsubGroupAdded();
      unsubGroupRemoved();
      unsubChatDeleted();
      unsubChannelPost();
      unsubChannelSilent();
      unsubChannelEdited();
      unsubChannelDeleted();
      unsubChannelJoined();
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
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    const aTime = a.last_message ? new Date(a.last_message.created_at).getTime() : (a.last_activity ? new Date(a.last_activity).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0));
    const bTime = b.last_message ? new Date(b.last_message.created_at).getTime() : (b.last_activity ? new Date(b.last_activity).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0));
    return bTime - aTime;
  });

  const nameMatches = sortedChats.filter((c) => {
    const n = ((c.is_group ? c.name : c.other?.display_name || "") + " " + (c.other?.username || "")).toLowerCase();
    return n.includes(q);
  }).length;
  const textMatches = sortedChats.length - nameMatches;

  const searchUsersForPrism = async (q: string) => {
    if (!q.trim()) { 
      setPrismSearchResults([]); 
      return; 
    }
    const token = getToken();
    if (!token) return;

    try {
      const url = `${process.env.NEXT_PUBLIC_API_URL}/api/users?q=${encodeURIComponent(q)}&limit=10`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

      if (!res.ok) {
        setPrismSearchResults([]);
        return;
      }

      const data = await res.json();
      const usersArray = Array.isArray(data) ? data : (data.users || []);
      setPrismSearchResults(usersArray);
    } catch (e) { 
      setPrismSearchResults([]);
    }
  };
const initiatePrism = async () => {
  // Старый флоу POST /api/chats/prism мёртв: бэкенд требует shard1_encrypted /
  // shard2_genesis / avatar_url, а confirmPrismKey стучится в несуществующий
  // /prism-key. Отсюда была ошибка "Ошибка: [object Object],..." — массив
  // валидации 422 из трёх объектов, склеенный в строку.
  // Новая система Prisme Chat живёт на /prisme: пользователь выбирает
  // свободный объект-ключ, и чат создаётся корректно.
  setShowPrismModal(false);
  setCreationLandscape(null);
  setSelectedCreationObject(null);
  setPrismSearchQuery("");
  setPrismSearchResults([]);
  setIsCreatingPrism(true);
  router.push("/prisme");
};

// Новая функция для сохранения выбранного ключа
const confirmPrismKey = async () => {
  if (!selectedCreationObject || !creationLandscape) return;
  
  setIsCreatingPrism(true);
  const token = getToken();
  const formData = new FormData();
  formData.append("object_id", selectedCreationObject);

  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${creationLandscape.chat_id}/prism-enter`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
      body: formData,
    });

    if (!res.ok) throw new Error("Не удалось сохранить ключ");

    // Успех! Очищаем и переходим в чат
    setShowPrismModal(false);
    setCreationLandscape(null);
    setSelectedCreationObject(null);
    setPrismSearchQuery("");
    setPrismSearchResults([]);
    router.push(`/prisme/${creationLandscape.chat_id}`);
  } catch (e) {
    alert("Ошибка при установке ключа. Попробуйте снова.");
    setIsCreatingPrism(false);
  }
};

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />
      <div className="w-px shrink-0 bg-gray-100 dark:bg-white/10 my-3" />
      <main className="flex-1 overflow-y-auto border-x border-line dark:border-white/10">
        
        {/* ШАПКА - только иконка и поиск */}
        <div className="p-4 md:p-6 border-b border-line dark:border-white/10 sticky top-0 bg-paper dark:bg-[#171717]/95 backdrop-blur-md z-10">
          {/* mr-12/md:mr-14 — резервируем место под fixed-кнопку "+", чтобы поиск не заезжал на неё */}
          <div className="flex items-center gap-3 md:gap-4 mr-12 md:mr-14">
            
            {/* Иконка */}
            <div className="flex items-center gap-3 shrink-0">
              <MessageSquare size={24} className="text-[#8b5cf6]" />
            </div>

            {/* Поиск — тянется от иконки до кнопки "+" на любой ширине */}
            <div className="relative flex-1 min-w-0">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-white/40" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("messages.search")}
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 text-sm focus:outline-none focus:border-[#8b5cf6] focus:bg-gray-100 dark:focus:bg-white/10 transition-all"
              />
              {searchLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-[#8b5cf6] border-t-transparent rounded-full animate-spin" />
              )}
            </div>
          </div>
        </div>

        {loading && <ChatListSkeleton />}
        
        {!loading && q && sortedChats.length > 0 && (
          <div className="px-4 md:px-6 py-2.5 border-b border-line dark:border-white/10 bg-[#8b5cf6]/5 flex items-center gap-3 backdrop-blur-md">
            <Search size={14} className="text-[#8b5cf6] shrink-0" />
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span className="text-gray-800 dark:text-white/80">
                Найдено <span className="font-bold text-gray-900 dark:text-white">{sortedChats.length}</span>
              </span>
              {nameMatches > 0 && <span className="text-[#a78bfa]">· {nameMatches} по имени</span>}
              {textMatches > 0 && <span className="text-[#a78bfa]">· {textMatches} в сообщениях</span>}
            </div>
          </div>
        )}
        
        {!loading && chats.length === 0 && (
          <div className="p-12 text-center">
            <MessageSquare size={48} className="text-gray-500 dark:text-white/20 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-white/60 text-lg">{query ? t("messages.nothingFound") : t("messages.noDialogs")}</p>
            <p className="text-gray-500 dark:text-white/40 text-sm mt-2">
              {query ? t("messages.tryAnother") : t("messages.startHint")}
            </p>
          </div>
        )}

        {!loading && sortedChats.map((chat) => {
          // 📢 Каналы: отдельная карточка (рупор вместо пузыря чата)
          if (chat.is_channel) {
            return (
              <div
                key={`channel-${chat.id}`}
                onClick={() => { refresh(); router.push(`/channels/${chat.id}`); }}
                className={`flex items-center gap-3 p-3 md:p-4 border-b border-b-white/10 border-l-4 border-l-[#8b5cf6]/40 hover:bg-gray-100 dark:hover:bg-white/5 cursor-pointer transition-all duration-200 ${chat.muted ? "opacity-60" : ""} ${chat.unread_count > 0 && !chat.muted ? "bg-purple-500/10" : ""}`}
              >
                <div className="shrink-0">
                  {chat.avatar_url ? (
                    <Avatar src={chat.avatar_url} name={chat.name} id={chat.id} size={48} />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] flex items-center justify-center">
                      <Megaphone size={22} className="text-white" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="font-bold truncate text-gray-900 dark:text-white">{chat.name}</p>
                    <span className="ml-1 px-2 py-0.5 rounded-md bg-[#8b5cf6]/10 border border-[#8b5cf6]/40 text-[#a78bfa] text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0">
                      <Megaphone size={10} /> {t("messages.channel") || "Канал"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-white/40 mt-0.5 truncate">
                    {chat.my_role === "owner" ? "Ваш канал" : chat.my_role === "admin" ? "Вы админ" : "Канал"} · @{chat.custom_slug} · {chat.subscribers_count}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {chat.unread_count > 0 && (
                    <span className={`text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center ${chat.muted ? "bg-gray-400/70 dark:bg-white/25 text-gray-800 dark:text-black" : "bg-[#8b5cf6] text-gray-900 dark:text-white"}`}>
                      {chat.unread_count}
                    </span>
                  )}
                </div>
              </div>
            );
          }
          const isSaved = !!chat.is_saved;
          const isGroup = !!chat.is_group;
          const otherUser = chat.other;
          const glow = !isGroup && !isSaved && otherUser ? getGlowColor(otherUser) : null;

          const chatName = (isGroup ? chat.name : otherUser?.display_name || "").toLowerCase();
          const chatUsername = (!isGroup ? otherUser?.username || "" : "").toLowerCase();
          const lastText = (chat.last_message?.text || "").toLowerCase();
          const nameMatch = q && (chatName.includes(q) || chatUsername.includes(q));
          const textMatch = q && !nameMatch && lastText.includes(q);

          return (
            <SwipeableChatItem
              key={chat.id}
              isPinned={!!chat.pinned}
              onClick={() => {
                refresh();
                if (chat.is_prism) {
                  router.push(`/prisme/${chat.id}`);
                } else {
                  router.push(`/messages/${chat.id}`);
                }
              }}
              onSwipeRight={() => {
                if (activeChatMenu === chat.id) {
                  setActiveChatMenu(null);
                  setMenuPosition(null);
                } else {
                  setActiveChatMenu(chat.id);
                }
              }}
              onSwipeLeft={() => {
                const name = isGroup ? chat.name : otherUser?.display_name || t("common.chat");
                deleteChat(chat.id, name);
              }}
            >
              <div className={`flex items-center gap-3 p-3 md:p-4 border-b transition-all duration-200 cursor-pointer ${
                chat.muted ? "opacity-60" : ""
              } ${
                chat.is_prism
                  ? "bg-cyan-950/20 border-l-4 border-l-cyan-500 border-b-cyan-500/20 hover:bg-cyan-900/30"
                  : chat.is_secret
                  ? "bg-emerald-950/20 border-l-4 border-l-emerald-500 border-b-emerald-500/20 hover:bg-emerald-900/30"
                  : "border-b-white/10 border-l-4 border-l-transparent hover:bg-gray-100 dark:hover:bg-white/5"
              } ${
                chat.unread_count > 0 && !chat.muted
                  ? (chat.is_prism ? "bg-cyan-900/40" : chat.is_secret ? "bg-emerald-900/40" : "bg-purple-500/10")
                  : ""
              }`}>
                
                <div className="shrink-0 relative">
                  {isSaved ? (
                    <div className="w-12 h-12 rounded-xl bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center">
                      <Bookmark size={24} className="text-yellow-600 dark:text-yellow-400" />
                    </div>
                  ) : isGroup ? (
                    chat.avatar_url ? (
                      <Avatar src={chat.avatar_url} name={chat.name || t("common.group")} id={chat.id} size={48} />
                    ) : (
                      <div className="w-12 h-12 relative flex items-center justify-center bg-gray-100 dark:bg-white/5 rounded-xl">
                        {(chat.members || []).slice(0, 3).map((m: any, i: number) => (
                          <div key={m.user.id} className="absolute" style={{ top: i === 0 ? 0 : i === 1 ? 24 : 0, left: i === 0 ? 0 : i === 1 ? 24 : 24, zIndex: 3 - i }}>
                            <Avatar src={m.user.avatar_url} name={m.user.display_name} id={m.user.id} size={28} />
                          </div>
                        ))}
                        {!(chat.members || []).length && <Users size={24} className="text-gray-500 dark:text-white/40" />}
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#8b5cf6] border-2 border-[#171717] flex items-center justify-center">
                          <Users size={10} className="text-gray-900 dark:text-white" />
                        </div>
                      </div>
                    )
                  ) : (
                    <div style={glow ? { filter: `drop-shadow(0 0 8px ${glow})` } : undefined}>
                      <Avatar src={otherUser?.avatar_url} name={otherUser?.display_name} id={otherUser?.id} size={48} />
                      {chat.is_prism && (
                        <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-cyan-500 border-2 border-[#171717] flex items-center justify-center shadow-[0_0_12px_rgba(34,211,238,0.8)] z-10">
                          <ShieldCheck size={12} className="text-gray-900 dark:text-white" />
                        </div>
                      )}
                      {chat.is_secret && !chat.is_prism && (
                        <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 border-2 border-[#171717] flex items-center justify-center shadow-[0_0_12px_rgba(16,185,129,0.8)] z-10">
                          <Lock size={12} className="text-gray-900 dark:text-white" />
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
                        <p className="font-bold truncate text-yellow-600 dark:text-yellow-400">{t("messages.saved")}</p>
                      ) : isGroup ? (
                        <p className="font-bold truncate text-gray-900 dark:text-white">
                          {query.trim() ? highlight(chat.name, query.trim()) : chat.name}
                        </p>
                      ) : (
                        <>
                          <p className={`font-bold truncate ${glowStyle(otherUser) ? "" : "text-gray-900 dark:text-white"}`} style={glowStyle(otherUser)}>
                            {query.trim() ? highlight(otherUser?.display_name, query.trim()) : otherUser?.display_name}
                          </p>
                          
                          {chat.is_prism && (
                            <span className="ml-1 px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/40 text-cyan-600 dark:text-cyan-400 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-[0_0_8px_rgba(34,211,238,0.2)]">
                              <ShieldCheck size={10} /> PRISM
                            </span>
                          )}
                          
                          {chat.is_secret && !chat.is_prism && (
                            <span className="ml-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-[0_0_8px_rgba(16,185,129,0.2)]">
                              <Lock size={10} /> SECRET
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    {chat.last_message && (
                      <span className="text-xs text-gray-500 dark:text-white/40 shrink-0">
                        {formatChatTime(chat.last_message.created_at)}
                      </span>
                    )}
                  </div>
                  
                  {/* ТЕКСТ ПОСЛЕДНЕГО СООБЩЕНИЯ */}
                  {chatDrafts[String(chat.id)] ? (
                    <p className="text-sm truncate text-[#8b5cf6] dark:text-[#a78bfa] mt-0.5 flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded bg-[#8b5cf6]/15 border border-[#8b5cf6]/40 text-[#8b5cf6] dark:text-[#a78bfa] text-[10px] font-bold uppercase tracking-wide">
                        <Pencil size={9} /> {t("messages.draft")}
                      </span>
                      <span className="truncate">{chatDrafts[String(chat.id)]}</span>
                    </p>
                  ) : chat.last_message ? (
                    <p className={`text-sm truncate ${chat.muted ? "text-gray-500 dark:text-white/40" : chat.unread_count > 0 ? "text-gray-900 dark:text-white" : "text-gray-600 dark:text-white/50"}`}>
                      <ChatPreview text={chat.last_message.text} query={query.trim()} />
                    </p>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-white/40 mt-0.5">
                      {isGroup ? t("messages.members", { n: chat.members_count }) : t("messages.startChat")}
                    </p>
                  )}
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {chat.unread_count > 0 && (
                    <span className={`text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0 ${
                      chat.muted
                        ? "bg-gray-400/70 dark:bg-white/25 text-gray-800 dark:text-black"
                        : `text-gray-900 dark:text-white ${isGroup ? "bg-[#8b5cf6]" : chat.is_secret ? "bg-emerald-500" : "bg-gradient-to-r from-pink-500 to-purple-500"}`
                    }`}>
                      {chat.unread_count}
                    </span>
                  )}
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (activeChatMenu === chat.id) {
                        setActiveChatMenu(null);
                        setMenuPosition(null);
                      } else {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setActiveChatMenu(chat.id);
                        setMenuPosition({
                          top: rect.bottom + 8,
                          right: window.innerWidth - rect.right,
                        });
                      }
                    }}
                    className="p-1.5 text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                  >
                    {pinningChat === chat.id ? (
                      <div className="w-4 h-4 border-2 border-gray-300 dark:border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                      <MoreVertical size={16} />
                    )}
                  </button>
                </div>
              </div>
            </SwipeableChatItem>
          );
        })}
      </main>

      {/* КНОПКА "+" - вынесена за пределы main, fixed */}
      <div className="fixed top-4 right-4 md:top-6 md:right-6 z-[100]">
        <button
          onClick={() => setShowCreateMenu(!showCreateMenu)}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#8b5cf6]/10 text-[#8b5cf6] hover:bg-[#8b5cf6]/20 transition-colors border border-[#8b5cf6]/30"
        >
          <Plus size={24} />
        </button>

        {showCreateMenu && (
          <div className="absolute right-0 top-12 w-56 bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/10 rounded-xl shadow-2xl z-[9999] overflow-visible animate-in fade-in slide-in-from-top-2 duration-200">
            <button
              onClick={() => { setShowCreateMenu(false); openSavedMessages(); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            >
              <Bookmark size={16} className="text-yellow-600 dark:text-yellow-400" /> {t("messages.saved")}
            </button>
            <button
              onClick={() => { setShowCreateMenu(false); setShowCreateGroup(true); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors border-t border-line dark:border-white/5"
            >
              <Users size={16} className="text-[#8b5cf6]" /> {t("messages.createGroup")}
            </button>
            <button
              onClick={() => { setShowCreateMenu(false); setShowCreateChannel(true); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors border-t border-line dark:border-white/5"
            >
              <Megaphone size={16} className="text-[#8b5cf6]" /> {t("messages.createChannel")}
            </button>
          </div>
        )}
      </div>

      {/* МЕНЮ ЧАТА */}
      {activeChatMenu !== null && (() => {
        const menuChat = chats.find((c) => c.id === activeChatMenu);
        if (!menuChat) return null;
        return (
          <>
            <div 
              className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm" 
              onClick={() => { setActiveChatMenu(null); setMenuPosition(null); }} 
            />
            <div 
              className={`
                fixed z-[9999] bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 shadow-2xl p-3 
                animate-in zoom-in-95 duration-200
                /* Мобильные: по центру */
                top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 rounded-2xl
                /* Десктоп: около троеточия */
                md:top-auto md:left-auto md:-translate-x-0 md:-translate-y-0 md:w-56 md:rounded-xl
              `}
              style={menuPosition ? { top: menuPosition.top, right: menuPosition.right } : undefined}
            >
              <p className="text-xs text-gray-500 dark:text-white/40 mb-2 px-1 truncate">
                {menuChat.is_group ? menuChat.name : menuChat.other?.display_name}
              </p>
              <button
                onClick={() => togglePinChat(menuChat.id, !!menuChat.pinned)}
                className="w-full px-3 py-3 rounded-xl text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-2.5 transition-colors"
              >
                {menuChat.pinned ? <PinOff size={16} className="text-yellow-600 dark:text-yellow-400" /> : <Pin size={16} className="text-[#8b5cf6]" />}
                {menuChat.pinned ? t("messages.unpin") : t("messages.pin")}
              </button>
              {/* 🔕 Выключение уведомлений чата прямо из списка */}
              <button
                onClick={async () => {
                  try {
                    await setChatMute(menuChat.id, menuChat.muted ? { minutes: null, forever: false } : { forever: true });
                    await load();
                  } catch { /* ignore */ }
                  setActiveChatMenu(null);
                  setMenuPosition(null);
                }}
                className="w-full px-3 py-3 rounded-xl text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-2.5 transition-colors"
              >
                {menuChat.muted
                  ? <><Bell size={16} className="text-green-600 dark:text-green-400" /> {t("mute.turnOn")}</>
                  : <><BellOff size={16} className="text-amber-600 dark:text-amber-400" /> {t("mute.turnOff")}</>}
              </button>
              <button
                onClick={() => { 
                  setActiveChatMenu(null); 
                  setMenuPosition(null);
                  refresh(); 
                  router.push(menuChat.is_prism ? `/prisme/${menuChat.id}` : `/messages/${menuChat.id}`); 
                }}
                className="w-full px-3 py-3 rounded-xl text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-2.5 transition-colors"
              >
                <MessageSquare size={16} className="text-gray-600 dark:text-white/60" /> {t("messages.openChat")}
              </button>
              <div className="h-px bg-gray-100 dark:bg-white/10 my-1" />
              <button
                onClick={() => {
                  const name = menuChat.is_group ? menuChat.name : menuChat.other?.display_name || t("common.chat");
                  setActiveChatMenu(null);
                  setMenuPosition(null);
                  deleteChat(menuChat.id, name);
                }}
                className="w-full px-3 py-3 rounded-xl text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-500/10 flex items-center gap-2.5 transition-colors"
              >
                <Trash2 size={16} className="text-red-600 dark:text-red-400" /> {t("messages.deleteChat")}
              </button>
            </div>
          </>
        );
      })()}

      {showCreateGroup && (
        <CreateGroupModal
          onClose={() => setShowCreateGroup(false)}
          onCreated={(chatId) => {
            setShowCreateGroup(false);
            router.push(`/messages/${chatId}`);
          }}
        />
      )}

      {/* 📢 МОДАЛКА СОЗДАНИЯ КАНАЛА */}
      {showCreateChannel && (
        <CreateChannelModal
          onClose={() => setShowCreateChannel(false)}
          onCreated={(channelId) => {
            setShowCreateChannel(false);
            load();
            router.push(`/channels/${channelId}`);
          }}
        />
      )}

      {/* МОДАЛКА ПРИЗМЫ */}
      {showPrismModal && (
        <>
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[2000]" onClick={() => { setShowPrismModal(false); setCreationLandscape(null); setSelectedCreationObject(null); }} />
          <div className="fixed inset-0 z-[2001] flex items-center justify-center p-4 pointer-events-none">
            <div className="w-full max-w-2xl bg-paper dark:bg-[#171717] border border-cyan-500/30 rounded-2xl shadow-[0_0_40px_rgba(34,211,238,0.1)] flex flex-col pointer-events-auto animate-in zoom-in-95 duration-200">
              
              {/* Шапка модалки */}
              <div className="p-4 border-b border-line dark:border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                    <ShieldCheck size={18} className="text-cyan-600 dark:text-cyan-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-white tracking-wide">
                      {creationLandscape ? "ВЫБЕРИТЕ КЛЮЧ" : "INITIATE PRISM"}
                    </h3>
                    <p className="text-[10px] text-cyan-400/70 uppercase tracking-widest">
                      {creationLandscape ? "Запомните этот объект для входа" : "Бесшовное E2E шифрование"}
                    </p>
                  </div>
                </div>
                <button onClick={() => { setShowPrismModal(false); setCreationLandscape(null); setSelectedCreationObject(null); }} className="text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white p-1">
                  <X size={18} />
                </button>
              </div>

              {/* ШАГ 1: Поиск пользователя */}
              {!creationLandscape && (
                <div className="p-4 space-y-4">
                  <p className="text-xs text-gray-600 dark:text-white/60 leading-relaxed">
                    Введите имя пользователя. После создания чата вам будет предложено выбрать визуальный ключ на пейзаже.
                  </p>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-white/40" />
                    <input
                      value={prismSearchQuery}
                      onChange={(e) => { setPrismSearchQuery(e.target.value); searchUsersForPrism(e.target.value); }}
                      placeholder="Поиск пользователя..."
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-line dark:border-white/10 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-cyan-500/50 text-sm"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {prismSearchResults.map((u: any) => (
                      <button
                        key={u.id}
                        onClick={() => initiatePrism()}
                        disabled={isCreatingPrism}
                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-cyan-500/10 border border-transparent hover:border-cyan-500/30 transition-all text-left disabled:opacity-50"
                      >
                        <Avatar src={u.avatar_url} name={u.display_name} id={u.id} size={36} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{u.display_name}</p>
                          <p className="text-xs text-gray-500 dark:text-white/40 truncate">@{u.username}</p>
                        </div>
                        <Lock size={14} className="text-cyan-400/50" />
                      </button>
                    ))}
                    {prismSearchQuery && prismSearchResults.length === 0 && !isCreatingPrism && (
                      <p className="text-center text-xs text-gray-500 dark:text-white/30 py-4">Пользователи не найдены</p>
                    )}
                    {isCreatingPrism && (
                      <div className="flex items-center justify-center gap-2 py-4 text-cyan-600 dark:text-cyan-400 text-xs">
                        <div className="w-4 h-4 border-2 border-cyan-600 dark:border-cyan-400 border-t-transparent rounded-full animate-spin" />
                        Генерация пейзажа...
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ШАГ 2: Выбор объекта на пейзаже */}
              {creationLandscape && (
                <div className="p-4 space-y-4">
                  <div className="relative bg-gray-100 dark:bg-white/5 rounded-xl p-2 border border-cyan-500/30">
                    <div dangerouslySetInnerHTML={{ __html: sanitizeSvg(creationLandscape.svg) }} className="absolute inset-0 opacity-60 pointer-events-none rounded-lg" />
                    <svg viewBox="0 0 800 600" className="relative w-full h-auto z-10">
                      {creationLandscape.objects.map(obj => {
                        const isSelected = selectedCreationObject === obj.id;
                        const commonProps = {
                          key: obj.id,
                          onClick: () => setSelectedCreationObject(obj.id),
                          className: `cursor-pointer transition-all duration-300 ${isSelected ? 'drop-shadow-[0_0_10px_rgba(0,255,255,0.8)]' : 'hover:opacity-80 hover:scale-110'}`,
                          style: { outline: isSelected ? '2px solid #00ffff' : 'none', outlineOffset: '2px' }
                        };
                        if (obj.type === 'star' || obj.type === 'moon') {
                          return <circle {...commonProps} cx={obj.x} cy={obj.y} r={obj.size * (isSelected ? 1.5 : 1)} fill={isSelected ? '#00ffff' : obj.color} />;
                        }
                        if (obj.type === 'window') {
                          return <rect {...commonProps} x={obj.x} y={obj.y} width={obj.size} height={obj.size * 1.5} fill={isSelected ? '#00ffff' : obj.color} />;
                        }
                        return null;
                      })}
                    </svg>
                  </div>
                  
                  <button
                    onClick={confirmPrismKey}
                    disabled={!selectedCreationObject || isCreatingPrism}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-all flex items-center justify-center gap-2"
                  >
                    {isCreatingPrism ? (
                      <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Сохранение...</>
                    ) : (
                      <><ShieldCheck size={18} /> Подтвердить и войти в чат</>
                    )}
                  </button>
                </div>
              )}

            </div>
          </div>
        </>
      )}
    </div>
  );
}