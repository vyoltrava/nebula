"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Avatar } from "@/components/Avatar";
import { getToken } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import { ArrowLeft, MessageSquare, Search, Trash2, Pin, PinOff, Users } from "lucide-react";

export default function AdminChatsPage() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [chats, setChats] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [activeChat, setActiveChat] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.push("/login"); return; }
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        if (!data.is_admin && !data.permissions?.includes("manage_groups")) {
          router.push("/admin");
          return;
        }
        setMe(data);
        loadChats();
      });
  }, []);

  async function loadChats() {
    const token = getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/chats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setChats(await res.json());
  }

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
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) openChat(activeChat);
    else {
      const d = await res.json().catch(() => null);
      alert(d?.detail || "Ошибка удаления (возможно, только для Founder)");
    }
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
    else {
      const d = await res.json().catch(() => null);
      alert(d?.detail || "Нет права pin_messages");
    }
  }

  const filtered = chats.filter((c) =>
    (c.name || "").toLowerCase().includes(search.toLowerCase())
  );

  if (!me) {
    return <div className="h-screen flex items-center justify-center bg-[#18181b]"><p className="text-white/60 animate-pulse">Загрузка...</p></div>;
  }

  return (
    <div className="h-screen flex overflow-hidden bg-[#18181b]">
      <Sidebar />
      <div className="w-px shrink-0 bg-white/10 my-3 hidden md:block" />
      <main className="flex-1 flex overflow-hidden border-x border-white/10">
        {/* СПИСОК ЧАТОВ */}
        <div className={`w-full md:w-96 md:border-r border-white/10 flex flex-col ${activeChat ? "hidden md:flex" : "flex"}`}>
          <div className="p-4 border-b border-white/10 bg-[#171717]/80 backdrop-blur-md">
            <div className="flex items-center gap-3 mb-3">
              <button onClick={() => router.push("/admin")} className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10">
                <ArrowLeft size={18} />
              </button>
              <MessageSquare size={20} className="text-cyan-400" />
              <h1 className="text-lg font-black text-white">Модерация чатов</h1>
            </div>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск чата..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-white/15 bg-white/5 text-white text-sm placeholder-white/40 focus:outline-none focus:border-cyan-400"
              />
            </div>
            <p className="text-xs text-white/40 mt-2">
              Всего: {chats.length} · Показано: {filtered.length}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => openChat(c)}
                className={`w-full flex items-center gap-3 p-3 border-b border-white/5 hover:bg-white/5 transition-colors text-left ${
                  activeChat?.id === c.id ? "bg-cyan-500/10" : ""
                }`}
              >
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0 overflow-hidden">
                  {c.avatar_url ? (
                    <img src={mediaUrl(c.avatar_url)} alt="" className="w-full h-full object-cover" />
                  ) : c.is_group ? (
                    <Users size={20} className="text-white" />
                  ) : (
                    <MessageSquare size={18} className="text-white" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-white text-sm truncate">
                    {c.name || (c.is_group ? "Группа" : "Диалог")}
                  </p>
                  <p className="text-[11px] text-white/40 truncate">
                    {c.is_group ? `${c.members_count} участников` : "Личный чат"}
                    {c.last_message && ` · ${c.last_message.text?.slice(0, 25) || "📎"}`}
                  </p>
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-white/40 text-sm py-8">Чатов не найдено</p>
            )}
          </div>
        </div>

        {/* СООБЩЕНИЯ */}
        <div className={`flex-1 flex flex-col ${activeChat ? "flex" : "hidden md:flex"}`}>
          {!activeChat ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare size={48} className="text-white/10 mx-auto mb-3" />
                <p className="text-white/30 text-sm">Выбери чат для модерации</p>
              </div>
            </div>
          ) : (
            <>
              <div className="p-3 border-b border-white/10 bg-[#171717]/80 backdrop-blur-md flex items-center gap-3">
                <button
                  onClick={() => setActiveChat(null)}
                  className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 md:hidden"
                >
                  <ArrowLeft size={18} />
                </button>
                <p className="font-bold text-white text-sm truncate flex-1">{activeChat.name}</p>
                <span className="text-[10px] text-white/40">{activeChat.members_count} участников</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loading && <p className="text-center text-white/40 text-sm">Загрузка...</p>}
                {!loading && messages.length === 0 && (
                  <p className="text-center text-white/40 text-sm">Сообщений нет</p>
                )}
                {!loading && messages.map((m) => (
                  <div key={m.id} className="flex items-start gap-2.5">
                    <Avatar src={m.sender_avatar} name={m.sender_name} id={m.sender_id} size={32} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-white/50">
                        <span className="font-bold text-white/80">{m.sender_name}</span> ·{" "}
                        {new Date(m.created_at).toLocaleString("ru-RU", {
                          day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                        })}
                        {m.pinned && <Pin size={10} className="inline ml-1 text-[#8b5cf6]" />}
                      </p>
                      <div className="text-sm text-white/90 break-words mt-0.5">
                        {m.media_type === "image" || m.media_type === "sticker" ? (
                          <img src={mediaUrl(m.media_url)} alt="" className="max-w-[180px] rounded-lg" />
                        ) : m.media_type === "video" || m.media_type === "video_note" ? (
                          <video src={mediaUrl(m.media_url)} controls className="max-w-[220px] rounded-lg" />
                        ) : m.media_type === "audio" ? (
                          <audio src={mediaUrl(m.media_url)} controls className="max-w-[220px]" />
                        ) : (
                          m.text || "📎 Вложение"
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => togglePin(m)}
                        className="p-1.5 rounded-lg text-white/40 hover:text-[#8b5cf6] hover:bg-white/10"
                        title={m.pinned ? "Открепить" : "Закрепить"}
                      >
                        {m.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                      </button>
                      {me.is_admin && (
                        <button
                          onClick={() => deleteMsg(m.id)}
                          className="p-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10"
                          title="Удалить (только Founder)"
                        >
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
      </main>
    </div>
  );
}