"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { getToken } from "@/lib/auth";
import { Headphones, Send, RefreshCw, ArrowLeft } from "lucide-react";

export function SupportSection({ me }: { me: any }) {
  const [tickets, setTickets] = useState<any[]>([]);
  const [activeTicket, setActiveTicket] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadTickets() {
    const token = getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/support/tickets`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setTickets(await res.json());
  }

  async function loadMessages(ticketId: number) {
    const token = getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/support/tickets/${ticketId}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setMessages(await res.json());
  }

  useEffect(() => { loadTickets(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function sendMessage() {
    if (!input.trim() || !activeTicket || sending) return;
    setSending(true);
    const token = getToken();
    const form = new FormData();
    form.append("text", input.trim());
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/support/tickets/${activeTicket.id}/messages`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
      });
      if (res.ok) { setInput(""); loadMessages(activeTicket.id); loadTickets(); }
    } finally { setSending(false); }
  }

  async function closeTicket(ticketId: number) {
    if (!confirm("Закрыть тикет?")) return;
    const token = getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/support/tickets/${ticketId}/close`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) { setActiveTicket(null); loadTickets(); }
  }

  const openTickets = tickets.filter((t) => t.status === "open");
  const closedTickets = tickets.filter((t) => t.status !== "open");

  return (
    <div className="flex flex-col md:flex-row gap-4 h-[calc(100vh-200px)]">
      {/* Список тикетов */}
      <div className={`w-full md:w-96 border border-white/10 rounded-xl bg-white/5 flex flex-col ${activeTicket ? "hidden md:flex" : "flex"}`}>
        <div className="p-3 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Headphones size={18} className="text-green-400" />
            <h3 className="font-bold text-white">Тикеты</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-green-400 font-bold">{openTickets.length} открытых</span>
            <button onClick={loadTickets} className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {openTickets.length > 0 && <p className="px-3 py-2 text-[10px] font-bold text-white/40 uppercase">Открытые</p>}
          {openTickets.map((t) => (
            <button key={t.id} onClick={() => { setActiveTicket(t); loadMessages(t.id); }}
              className={`w-full flex items-center gap-3 p-3 border-b border-white/5 hover:bg-white/5 text-left ${activeTicket?.id === t.id ? "bg-green-500/10" : ""}`}>
              <Avatar src={t.user?.avatar_url} name={t.user?.display_name} id={t.user?.id} size={36} />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-white text-sm truncate">{t.user?.display_name || "Unknown"}</p>
                <p className="text-[11px] text-white/40 truncate">{t.last_message?.text?.slice(0, 40) || "Нет сообщений"}</p>
              </div>
              <span className="text-[10px] text-white/30 shrink-0">
                {new Date(t.updated_at || t.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
              </span>
            </button>
          ))}
          {closedTickets.length > 0 && <p className="px-3 py-2 text-[10px] font-bold text-white/40 uppercase">Закрытые</p>}
          {closedTickets.map((t) => (
            <button key={t.id} onClick={() => { setActiveTicket(t); loadMessages(t.id); }}
              className={`w-full flex items-center gap-3 p-3 border-b border-white/5 hover:bg-white/5 text-left opacity-60 ${activeTicket?.id === t.id ? "bg-green-500/10 opacity-100" : ""}`}>
              <Avatar src={t.user?.avatar_url} name={t.user?.display_name} id={t.user?.id} size={36} />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-white text-sm truncate">{t.user?.display_name || "Unknown"}</p>
                <p className="text-[11px] text-white/40 truncate">{t.last_message?.text?.slice(0, 40) || "Нет сообщений"}</p>
              </div>
            </button>
          ))}
          {tickets.length === 0 && <p className="text-center text-white/40 text-sm py-8">Тикетов пока нет</p>}
        </div>
      </div>

      {/* Переписка */}
      <div className={`flex-1 border border-white/10 rounded-xl bg-white/5 flex flex-col ${activeTicket ? "flex" : "hidden md:flex"}`}>
        {!activeTicket ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Headphones size={48} className="text-white/10 mx-auto mb-3" />
              <p className="text-white/30 text-sm">Выбери тикет для просмотра</p>
            </div>
          </div>
        ) : (
          <>
            <div className="p-3 border-b border-white/10 flex items-center gap-3">
              <button onClick={() => setActiveTicket(null)} className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 md:hidden">
                <ArrowLeft size={18} />
              </button>
              <Avatar src={activeTicket.user?.avatar_url} name={activeTicket.user?.display_name} id={activeTicket.user?.id} size={32} />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white text-sm truncate">{activeTicket.user?.display_name || "Unknown"}</p>
                <p className="text-[10px] text-white/40">@{activeTicket.user?.username}</p>
              </div>
              {activeTicket.status === "open" && (
                <button onClick={() => closeTicket(activeTicket.id)}
                  className="px-3 py-1.5 rounded-lg border border-red-400/30 text-red-400 text-xs font-bold hover:bg-red-500/10">
                  Закрыть тикет
                </button>
              )}
              {activeTicket.status !== "open" && (
                <span className="px-2 py-1 rounded-lg bg-white/10 text-white/50 text-[10px] font-bold uppercase">Закрыт</span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m) => {
                const isStaff = m.sender?.is_admin || m.sender?.is_moderator || (m.sender?.permissions || []).includes("manage_support");
                return (
                  <div key={m.id} className={`flex ${isStaff ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${isStaff ? "bg-[#8b5cf6] text-white rounded-br-md" : "bg-white/10 text-white rounded-bl-md"}`}>
                      {!isStaff && <p className="text-[10px] text-white/50 mb-1">{m.sender?.display_name || "Пользователь"}</p>}
                      <p className="text-sm whitespace-pre-wrap break-words">{m.text}</p>
                      <p className={`text-[10px] mt-1 ${isStaff ? "text-white/60" : "text-white/40"}`}>
                        {new Date(m.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
            {activeTicket.status === "open" && (
              <div className="p-3 border-t border-white/10 flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Написать ответ..."
                  className="flex-1 px-4 py-2.5 rounded-xl border border-white/15 bg-white/5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-green-400"
                  disabled={sending}
                />
                <button onClick={sendMessage} disabled={!input.trim() || sending}
                  className="px-4 py-2.5 rounded-xl bg-green-500 text-white hover:bg-green-600 disabled:opacity-40 flex items-center gap-2">
                  <Send size={16} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}