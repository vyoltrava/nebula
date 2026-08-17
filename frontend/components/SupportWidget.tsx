"use client";
import { useState, useEffect, useRef } from "react";
import { getToken } from "@/lib/auth";
import { useWebSocket } from "@/src/hooks/useWebSocket";
import { Headphones, X, Send, Loader2, MessageSquare } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL;

export function SupportWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<"loading" | "create" | "continue" | "chat">("loading");
  const [ticketId, setTicketId] = useState<number | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [firstText, setFirstText] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [myId, setMyId] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      const token = getToken();
      if (!token) { setView("create"); return; }
      const me = await fetch(`${API}/api/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (me) setMyId(me.id);

      const res = await fetch(`${API}/api/support/my-ticket`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        if (d.has_ticket) {
          setTicketId(d.ticket_id);
          setMessages(d.messages || []);
          setView("continue");
        } else setView("create");
      } else setView("create");
    })();
  }, [isOpen]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, view]);

  useWebSocket("support_new_message", (data: any) => {
    if (data.ticket_id !== ticketId) return;
    setMessages((prev) =>
      prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]
    );
  });

  useWebSocket("support_ticket_closed", (data: any) => {
    if (data.ticket_id === ticketId) {
      setMessages((prev) => [...prev, {
        id: Date.now(), sender_id: 0, sender_name: "Система",
        sender_is_staff: false, text: "🔒 Заявка закрыта.",
        created_at: new Date().toISOString(),
      }]);
    }
  });

  async function createTicket() {
    if (busy) return;
    setBusy(true);
    const token = getToken();
    const form = new FormData();
    form.append("text", firstText.trim());
    try {
      const res = await fetch(`${API}/api/support/start`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
      });
      if (res.ok) {
        const d = await res.json();
        setTicketId(d.ticket_id);
        const msgs = await fetch(`${API}/api/support/my-ticket`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then((r) => r.json());
        setMessages(msgs.messages || []);
        setView("chat");
        setFirstText("");
      }
    } finally { setBusy(false); }
  }

  async function sendMessage() {
    if (!input.trim() || !ticketId || busy) return;
    setBusy(true);
    const token = getToken();
    const form = new FormData();
    form.append("ticket_id", String(ticketId));
    form.append("text", input.trim());
    try {
      const res = await fetch(`${API}/api/support/messages`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
      });
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [...prev, data.message]);
        setInput("");
      }
    } finally { setBusy(false); }
  }

  if (!getToken()) return null;

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white rounded-full shadow-lg shadow-purple-500/30 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
      >
        {isOpen ? <X size={24} /> : <Headphones size={24} />}
      </button>

      {isOpen && (
        <div className="fixed bottom-24 right-6 z-40 w-80 md:w-96 bg-[#18181b] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200 flex flex-col max-h-[70vh]">
          <div className="shrink-0 p-4 border-b border-white/10 bg-white/5 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-white flex items-center gap-2">
                <Headphones size={18} className="text-[#8b5cf6]" />
                Поддержка
              </h3>
              <p className="text-xs text-white/50 mt-0.5">
                {view === "chat" ? "Переписка по заявке" : "Заявки в команду"}
              </p>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-white/40 hover:text-white p-1">
              <X size={16} />
            </button>
          </div>

          {view === "loading" && (
            <div className="p-8 text-center">
              <Loader2 className="animate-spin text-white/40 mx-auto" size={24} />
            </div>
          )}

          {view === "create" && (
            <div className="p-4 space-y-3">
              <p className="text-xs text-white/60">Опиши проблему — команда ответит в этой заявке.</p>
              <textarea
                value={firstText}
                onChange={(e) => setFirstText(e.target.value)}
                placeholder="Опиши проблему..."
                rows={4}
                className="w-full px-3 py-2.5 rounded-xl border border-white/15 bg-white/5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#8b5cf6] resize-none"
              />
              <button
                onClick={createTicket}
                disabled={busy || !firstText.trim()}
                className="w-full py-2.5 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white rounded-xl font-medium text-sm disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                Создать заявку
              </button>
            </div>
          )}

          {view === "continue" && (
            <div className="p-6 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-[#8b5cf6]/15 border border-[#8b5cf6]/30 flex items-center justify-center">
                <MessageSquare size={24} className="text-[#8b5cf6]" />
              </div>
              <div>
                <p className="font-bold text-white text-sm">У тебя открыта заявка</p>
                <p className="text-xs text-white/40 mt-1">Команда ответит в переписке.</p>
              </div>
              <button
                onClick={() => setView("chat")}
                className="w-full py-2.5 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white rounded-xl font-medium text-sm"
              >
                Продолжить переписку
              </button>
            </div>
          )}

          {view === "chat" && (
            <>
              <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[200px] max-h-[40vh]">
                {messages.map((m) => {
                  const isMine = m.sender_id === myId;
                  return (
                    <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                        isMine ? "bg-[#8b5cf6] text-white rounded-br-md" : "bg-white/10 text-white rounded-bl-md"
                      }`}>
                        {!isMine && (
                          <p className="text-[10px] text-[#a78bfa] font-bold mb-0.5">
                            {m.sender_is_staff ? "🛡️ Поддержка" : m.sender_name}
                          </p>
                        )}
                        <p className="text-sm whitespace-pre-wrap break-words">{m.text}</p>
                        <p className={`text-[10px] mt-1 ${isMine ? "text-white/60" : "text-white/40"}`}>
                          {new Date(m.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
              <div className="shrink-0 p-3 border-t border-white/10 flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Написать..."
                  className="flex-1 px-3 py-2 rounded-xl border border-white/15 bg-white/5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#8b5cf6]"
                  disabled={busy}
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || busy}
                  className="px-3 rounded-xl bg-[#8b5cf6] text-white hover:bg-[#7c3aed] disabled:opacity-40"
                >
                  <Send size={16} />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}