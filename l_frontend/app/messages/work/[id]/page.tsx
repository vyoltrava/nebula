"use client";
// 🏢 Рабочий чат отдела — переписка (plain text, без E2EE).
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getToken } from "@/lib/auth";
import { socket } from "@/lib/websocket";
import { Avatar } from "@/components/Avatar";
import { ArrowLeft, Send, Briefcase, Zap, Check, Play, Clock3 } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

type WMsg = {
  id: number; sender_id: number | null; sender_username: string | null;
  sender_display_name: string | null; text: string; kind: string; ticket_id: number | null;
  created_at: string | null;
};
type WChat = {
  id: number; name: string; is_active: boolean; member_count: number;
  members: { user_id: number; username: string | null; display_name: string | null; role: string; on_shift: boolean }[];
};
type WTicket = {
  id: number; title: string; section: string; priority: string; status: string;
  assignee_id: number | null; assignee_username: string | null; description: string | null;
};

export default function WorkChatPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const chatId = Number(params?.id);
  const [chat, setChat] = useState<WChat | null>(null);
  const [me, setMe] = useState<any>(null);
  const [msgs, setMsgs] = useState<WMsg[]>([]);
  const [tickets, setTickets] = useState<WTicket[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  async function loadChat() {
    const token = getToken();
    if (!token) return router.push("/login");
    const res = await fetch(`${API_URL}/api/work/chats`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return router.push("/messages");
    const list: WChat[] = await res.json();
    const found = list.find((c) => c.id === chatId);
    if (!found) return router.push("/messages");
    setChat(found);
    const meRes = await fetch(`${API_URL}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (meRes.ok) setMe(await meRes.json());
  }
async function loadMsgs(reset = false) {
    const token = getToken();
    const before = reset ? 0 : (msgs.length ? msgs[0].id : 0);
    const res = await fetch(`${API_URL}/api/work/chats/${chatId}/messages?limit=40&before=${before}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const batch: WMsg[] = await res.json();
    setHasMore(batch.length === 40);
    if (reset) {
      setMsgs(batch);
      setPage(0);
    } else if (batch.length) {
      setMsgs([...batch, ...msgs]);
      setPage(page + 1);
    }
  }

  async function loadTickets() {
    const token = getToken();
    const res = await fetch(`${API_URL}/api/work/tickets?chat_id=${chatId}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok) setTickets(await res.json());
  }

  useEffect(() => { loadChat(); }, [chatId]);
  useEffect(() => { if (chat) { loadMsgs(true); loadTickets(); setLoading(false); } }, [chat]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length]);

  // WS: live-сообщения
  useEffect(() => {
    if (!socket) return;
    const onMsg = (p: any) => {
      if (Number(p?.chat_id) !== chatId) return;
      if (p?.message) setMsgs((prev) => [...prev, p.message]);
      if (p?.ticket) setTickets((prev) => [p.ticket, ...prev.filter((t) => t.id !== p.ticket.id)]);
    };
    socket.on("work_new_message", onMsg);
    socket.on("work_ticket_new", onMsg);
    socket.on("work_ticket_taken", onMsg);
    socket.on("work_ticket_closed", onMsg);
    return () => {
      socket.off("work_new_message", onMsg);
      socket.off("work_ticket_new", onMsg);
      socket.off("work_ticket_taken", onMsg);
      socket.off("work_ticket_closed", onMsg);
    };
  }, [chatId]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    await fetch(`${API_URL}/api/work/chats/${chatId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ text }),
    });
    setDraft("");
    setSending(false);
    loadMsgs(true);
  }

  async function takeTicket(tid: number) {
    await fetch(`${API_URL}/api/work/tickets/${tid}/take`, {
      method: "POST", headers: { Authorization: `Bearer ${getToken()}` },
    });
    loadTickets();
  }

  async function closeTicket(tid: number) {
    await fetch(`${API_URL}/api/work/tickets/${tid}/close`, {
      method: "POST", headers: { Authorization: `Bearer ${getToken()}` },
    });
    loadTickets();
  }

  const myRole = chat?.members.find((m) => m.user_id === me?.id)?.role;

  function fmt(iso: string | null) {
    if (!iso) return "";
    try { return new Date(iso).toLocaleString("ru-RU"); } catch { return ""; }
  }

  const PRIORITY_LABEL: Record<string, string> = { low: "низкий", medium: "средний", high: "высокий" };
return (
    <div className="h-screen flex overflow-hidden bg-ivory dark:bg-[#18181b]">
      <main className="flex-1 flex flex-col min-h-0">
        <div className="shrink-0 border-b border-line dark:border-white/10 sticky top-0 bg-paper dark:bg-[#171717]/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-3 px-4 py-3">
            <Link href="/messages" className="p-2 rounded-lg bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white"><ArrowLeft size={20} /></Link>
            <div className="w-10 h-10 rounded-xl bg-[#8b5cf6]/15 text-[#8b5cf6] flex items-center justify-center shrink-0"><Briefcase size={20} /></div>
            <div className="flex-1 min-w-0">
              <h1 className="text-gray-900 dark:text-white font-black truncate">{chat?.name || "Рабочий чат"}</h1>
              <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-white/40 truncate">
                <Zap size={11} /> {chat?.member_count || 0} участников
                {myRole && <> · <span className="font-bold text-purple-600 dark:text-purple-400">{myRole}</span></>}
              </p>
            </div>
            {tickets.filter((t) => t.status === "open").length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300 text-[11px] font-bold shrink-0">Очередь: {tickets.filter((t) => t.status === "open").length}</span>
            )}
          </div>
        </div>

        <div className="flex-1 flex gap-4 min-h-0 p-2">
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex-1 overflow-y-auto px-3 space-y-2">
              {loading && <p className="text-center text-gray-500 dark:text-white/40 text-sm py-16">Загрузка…</p>}
              {!loading && msgs.length === 0 && (
                <div className="text-center py-16">
                  <Briefcase size={40} className="mx-auto text-gray-400 dark:text-white/20 mb-3" />
                  <p className="text-gray-600 dark:text-white/50 text-sm">Пока нет сообщений</p>
                </div>
              )}
              {msgs.map((m) => {
                const isBot = !m.sender_id;
                const mine = m.sender_id === me?.id;
                return (
                  <div key={m.id} className={`flex gap-2.5 ${mine ? "justify-end" : ""}`}>
                    {!mine && <Avatar src={undefined} name={m.sender_display_name || "Бот"} id={m.sender_id || 0} size={32} />}
                    <div className={`max-w-[75%] p-2.5 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed break-words ${mine ? "bg-[#8b5cf6]/15 text-gray-900 dark:text-white" : isBot ? "bg-amber-500/10 border border-amber-500/20 text-gray-900 dark:text-white" : "bg-gray-200 dark:bg-white/10 text-gray-900 dark:text-white"}`}>
                      {!mine && <p className="text-[10px] text-gray-500 dark:text-white/40 mb-0.5">{isBot ? "Бот отдела" : (m.sender_display_name || m.sender_username)}</p>}
                      <p>{m.text}</p>
                      <p className="text-[9px] text-gray-500 dark:text-white/30 text-right mt-0.5">{fmt(m.created_at)}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
            <div className="shrink-0 border-t border-line dark:border-white/10 p-2 flex gap-2 bg-paper dark:bg-[#171717]/60">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Сообщение…"
                className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none" />
              <button onClick={send} disabled={sending || !draft.trim()}
                className="p-2.5 rounded-xl bg-[#8b5cf6] text-white disabled:opacity-40 hover:bg-[#7c3aed] transition-all">
                <Send size={18} />
              </button>
            </div>
          </div>
<div className="w-72 shrink-0 hidden md:flex flex-col border rounded-2xl bg-gray-100 dark:bg-white/5 overflow-hidden">
            <h3 className="px-3 py-2 text-[11px] font-black uppercase text-gray-600 dark:text-white/50 border-b border-line dark:border-white/10 flex items-center gap-1"><Clock3 size={13} /> Заявки отдела</h3>
            <div className="flex-1 overflow-y-auto px-2 space-y-1.5 mt-1">
              {tickets.length === 0 && <p className="text-center text-gray-500 dark:text-white/40 text-xs py-8">Заявок нет</p>}
              {tickets.map((t) => (
                <div key={t.id} className={`p-2.5 rounded-xl border text-xs ${t.status === "done" ? "border-green-500/30 bg-green-500/5 opacity-60" : "border-line dark:border-white/10 bg-gray-200 dark:bg-white/10"}`}>
                  <div className="flex items-center justify-between gap-1.5 mb-1">
                    <span className="text-[10px] font-black uppercase text-gray-600 dark:text-white/50">{t.section}</span>
                    <span className={`text-[9px] font-bold ${t.priority === "high" ? "text-red-600 dark:text-red-400" : t.priority === "low" ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}>{PRIORITY_LABEL[t.priority] || t.priority}</span>
                  </div>
                  <p className="text-gray-900 dark:text-white font-bold line-clamp-2">{t.title}</p>
                  {t.status === "open" && myRole && (
                    <button onClick={() => takeTicket(t.id)} className="w-full mt-1 py-1 rounded-lg bg-[#8b5cf6]/15 text-[#8b5cf6] text-[10px] font-bold hover:bg-[#8b5cf6]/30 flex items-center justify-center gap-1">
                      <Play size={11} /> Взять в работу
                    </button>
                  )}
                  {t.status === "assigned" && myRole && (t.assignee_id === me?.id || myRole === "head" || myRole === "deputy") && (
                    <button onClick={() => closeTicket(t.id)} className="w-full mt-1 py-1 rounded-lg bg-green-500/15 text-green-600 dark:text-green-400 text-[10px] font-bold hover:bg-green-500/25 flex items-center justify-center gap-1">
                      <Check size={11} /> Закрыть
                    </button>
                  )}
                  {t.assignee_username && <p className="text-[9px] text-gray-500 dark:text-white/40 mt-0.5">{t.status === "done" ? "закрыл" : "исполнитель"} @{t.assignee_username}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
