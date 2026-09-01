"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { getToken } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import { MessageSquare, Search, Users, ArrowLeft, Pin, PinOff, Trash2 } from "lucide-react";

export function ChatsSection({ me }: { me: any }) {
  const [chats, setChats] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [activeChat, setActiveChat] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadChats() {
    const token = getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/chats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setChats(await res.json());
  }

  useEffect(() => { loadChats(); }, []);

  async function openChat(chat: any) {
    setActiveChat(chat);
    setLoading(true);
    const token = getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/chats/${chat.id}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setMessages(await res.json());
    setLoading(false);
  }

  async function deleteMsg(msgId: number) {
    if (!confirm("Удалить сообщение?")) return;
    const token = getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${activeChat.id}/messages/${msgId}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) openChat(activeChat);
    else { const d = await res.json().catch(() => null); alert(d?.detail || "Ошибка"); }
  }

  async function togglePin(msg: any) {
    const token = getToken();
    const url = msg.pinned
      ? `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${activeChat.id}/messages/${msg.id}/unpin`
      : `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${activeChat.id}/messages/${msg.id}/pin`;
    const res = await fetch(url, {
      method: msg.pinned ? "DELETE" : "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) openChat(activeChat);
    else { const d = await res.json().catch(() => null); alert(d?.detail || "Нет права pin_messages"); }
  }

  const filtered = chats.filter((c) => (c.name || "").toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-col md:flex-row gap-4 h-[calc(100vh-200px)]">
      {/* Список чатов */}
      <div className={`w-full md:w-96 border border-line dark:border-white/10 rounded-xl bg-gray-100 dark:bg-white/5 flex flex-col ${activeChat ? "hidden md:flex" : "flex"}`}>
        <div className="p-3 border-b border-line dark:border-white/10">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-white/40" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск чата..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-cyan-600 dark:focus:border-cyan-400" />
          </div>
          <p className="text-xs text-gray-500 dark:text-white/40 mt-2">Всего: {chats.length} • Показано: {filtered.length}</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map((c) => (
            <button key={c.id} onClick={() => openChat(c)}
              className={`w-full flex items-center gap-3 p-3 border-b border-line dark:border-white/5 hover:bg-gray-100 dark:hover:bg-white/5 text-left ${activeChat?.id === c.id ? "bg-cyan-500/10" : ""}`}>
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0 overflow-hidden">
                {c.avatar_url ? <img src={mediaUrl(c.avatar_url)} alt="" className="w-full h-full object-cover" />
                  : c.is_group ? <Users size={20} className="text-gray-900 dark:text-white" /> : <MessageSquare size={18} className="text-gray-900 dark:text-white" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-gray-900 dark:text-white text-sm truncate">{c.name || (c.is_group ? "Группа" : "Диалог")}</p>
                <p className="text-[11px] text-gray-500 dark:text-white/40 truncate">
                  {c.is_group ? `${c.members_count} участников` : "Личный чат"}
                  {c.last_message && ` • ${c.last_message.text?.slice(0, 25) || "📎"}`}
                </p>
              </div>
            </button>
          ))}
          {filtered.length === 0 && <p className="text-center text-gray-500 dark:text-white/40 text-sm py-8">Чатов не найдено</p>}
        </div>
      </div>

      {/* Сообщения */}
      <div className={`flex-1 border border-line dark:border-white/10 rounded-xl bg-gray-100 dark:bg-white/5 flex flex-col ${activeChat ? "flex" : "hidden md:flex"}`}>
        {!activeChat ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare size={48} className="text-gray-500 dark:text-white/10 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-white/30 text-sm">Выбери чат для модерации</p>
            </div>
          </div>
        ) : (
          <>
            <div className="p-3 border-b border-line dark:border-white/10 flex items-center gap-3">
              <button onClick={() => setActiveChat(null)} className="p-2 rounded-lg text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 md:hidden">
                <ArrowLeft size={18} />
              </button>
              <p className="font-bold text-gray-900 dark:text-white text-sm truncate flex-1">{activeChat.name}</p>
              <span className="text-[10px] text-gray-500 dark:text-white/40">{activeChat.members_count} участников</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loading && <p className="text-center text-gray-500 dark:text-white/40 text-sm">Загрузка...</p>}
              {!loading && messages.length === 0 && <p className="text-center text-gray-500 dark:text-white/40 text-sm">Сообщений нет</p>}
              {!loading && messages.map((m) => (
                <div key={m.id} className="flex items-start gap-2.5">
                  <Avatar src={m.sender_avatar} name={m.sender_name} id={m.sender_id} size={32} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-gray-600 dark:text-white/50">
                      <span className="font-bold text-gray-800 dark:text-white/80">{m.sender_name}</span> •{" "}
                      {new Date(m.created_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      {m.pinned && <Pin size={10} className="inline ml-1 text-[#8b5cf6]" />}
                    </p>
                    <div className="text-sm text-gray-800 dark:text-white/90 break-words mt-0.5">
                      {m.media_type === "image" || m.media_type === "sticker"
                        ? <img src={mediaUrl(m.media_url)} alt="" className="max-w-[180px] rounded-lg" />
                        : m.media_type === "video" || m.media_type === "video_note"
                        ? <video src={mediaUrl(m.media_url)} controls className="max-w-[220px] rounded-lg" />
                        : m.media_type === "audio"
                        ? <audio src={mediaUrl(m.media_url)} controls className="max-w-[220px]" />
                        : m.text || "📎 Вложение"}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => togglePin(m)} className="p-1.5 rounded-lg text-gray-500 dark:text-white/40 hover:text-[#8b5cf6] hover:bg-gray-100 dark:hover:bg-white/10" title={m.pinned ? "Открепить" : "Закрепить"}>
                      {m.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                    </button>
                    {me.is_admin && (
                      <button onClick={() => deleteMsg(m.id)} className="p-1.5 rounded-lg text-gray-500 dark:text-white/40 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10" title="Удалить">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}