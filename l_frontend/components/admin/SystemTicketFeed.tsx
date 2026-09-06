"use client";

/**
 * 📨 Лента системного чата заявок (внутри вкладок админки reports/support/bugs).
 * Показывает системный чат, привязанный к разделу, + input для ответа.
 * Отдельная система — не обычные чаты.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getToken } from "@/lib/auth";
import { socket } from "@/lib/websocket";

const PANEL_LABELS: Record<string, string> = {
  reports: "Жалобы",
  support: "Поддержка",
  bugs: "Баг-трекер",
};

export function SystemTicketFeed({ panel, color = "#8b5cf6" }: { panel: string; color?: string }) {
  const [chat, setChat] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const chatsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/system-chats?panel=${panel}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const chats = chatsRes.ok ? await chatsRes.json() : [];
      setChat(chats[0] || null);
      if (chats[0]) {
        const mRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/system-chats/${chats[0].id}/messages`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setMessages(mRes.ok ? await mRes.json() : []);
      } else {
        setMessages([]);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [panel]);

  useEffect(() => { load(); }, [load]);

  // 🔔 Live-обновление по WS
  useEffect(() => {
    const unsub = socket.on("system_chat_message", (d: any) => {
      if (d?.panel !== panel || !chat || d.chat_id !== chat.id) return;
      setMessages((prev) => [...prev, d.message]);
      setTimeout(() => feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight }), 50);
    });
    return unsub;
  }, [panel, chat]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight });
  }, [messages.length]);

  async function send() {
    if (!chat || !text.trim() || sending) return;
    setSending(true);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/system-chats/${chat.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ text: text.trim() }),
      });
      setText("");
    } catch { /* ignore */ }
    setSending(false);
  }

  if (loading) return null;
  if (!chat) return null;

  return (
    <div className="mb-6 rounded-2xl border border-line dark:border-white/10 bg-gray-50 dark:bg-white/[0.03] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-line dark:border-white/10 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: color }} />
        <p className="text-xs font-black uppercase tracking-wider text-gray-700 dark:text-white/70">
          📨 Лента заявок · {chat.name}
        </p>
        <span className="text-[10px] text-gray-500 dark:text-white/40">
          {PANEL_LABELS[panel]} · {chat.members.length} уч.
        </span>
      </div>
      <div ref={feedRef} className="max-h-64 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-xs text-gray-500 dark:text-white/40 text-center py-4">Заявок пока нет</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="rounded-xl bg-white dark:bg-white/5 border border-line dark:border-white/10 px-3 py-2">
            <div className="flex items-center gap-2">
              <p className="text-xs font-bold text-gray-900 dark:text-white">{m.sender_name}</p>
              <p className="text-[10px] text-gray-400 dark:text-white/30">
                {new Date(m.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            <p className="text-sm text-gray-800 dark:text-white/85 whitespace-pre-wrap break-words mt-0.5">{m.text}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-2 p-3 border-t border-line dark:border-white/10">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Написать в ленту…"
          className="flex-1 px-3 py-2 rounded-xl border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:border-[#8b5cf6]"
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          className="px-4 py-2 rounded-xl text-white text-sm font-bold disabled:opacity-50"
          style={{ backgroundColor: color }}
        >
          Отправить
        </button>
      </div>
    </div>
  );
}