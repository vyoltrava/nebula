"use client";
import { useEffect, useState, useRef } from "react";
import { getToken } from "@/lib/auth";
import { useWebSocket } from "@/src/hooks/useWebSocket";
import { Sidebar } from "@/components/Sidebar";
import { Headphones, Send, Plus, Image as ImageIcon, X, RefreshCw, ChevronLeft, MessageSquare, Clock, ShieldCheck } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL;

interface Ticket {
  id: number;
  status: string;
  created_at: string;
  updated_at: string;
  last_message?: { text: string | null; is_mine: boolean; created_at: string } | null;
}

interface Message {
  id: number;
  sender_id: number;
  sender_name: string;
  sender_is_staff: boolean;
  text: string | null;
  media_url: string | null;
  media_type: string | null;
  created_at: string;
}

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newText, setNewText] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // === ЗАГРУЗКА СПИСКА ЗАЯВОК ===
  async function loadTickets() {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${API}/api/support/my-tickets`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setTickets(await res.json());
    } catch (e) { console.error("loadTickets error:", e); }
  }

  // === ЗАГРУЗКА СООБЩЕНИЙ ===
  async function loadMessages(ticketId: number) {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${API}/api/support/tickets/${ticketId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setMessages(await res.json());
    } catch (e) { console.error("loadMessages error:", e); }
  }

  useEffect(() => { loadTickets(); }, []);
  useEffect(() => {
    if (activeId) loadMessages(activeId);
  }, [activeId]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // === WEBSOCKET ===
  useWebSocket("support_new_message", (data: any) => {
    if (data.ticket_id === activeId) {
      setMessages(prev => prev.some(m => m.id === data.message.id) ? prev : [...prev, data.message]);
    }
    loadTickets(); // обновляем превью в списке
  });

  useWebSocket("support_ticket_closed", (data: any) => {
    if (data.ticket_id === activeId) {
      setMessages(prev => [...prev, {
        id: Date.now(), sender_id: 0, sender_name: "Система",
        sender_is_staff: false, text: "🔒 Заявка закрыта.",
        media_url: null, media_type: null,
        created_at: new Date().toISOString(),
      }]);
    }
    loadTickets();
  });

  useWebSocket("support_new_ticket", () => { loadTickets(); });

  // === СОЗДАНИЕ НОВОЙ ЗАЯВКИ ===
  async function createTicket() {
    if (creating || (!newText.trim() && !file)) return;
    setCreating(true);
    const token = getToken();
    const form = new FormData();
    if (newText.trim()) form.append("text", newText.trim());
    if (file) form.append("file", file);

    try {
      const res = await fetch(`${API}/api/support/start`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.ok) {
        const data = await res.json();
        setActiveId(data.ticket_id);
        setShowCreate(false);
        setNewText("");
        setFile(null);
        setPreviewUrl(null);
        await loadTickets();
        await loadMessages(data.ticket_id);
      }
    } catch (e) { console.error("createTicket error:", e); }
    finally { setCreating(false); }
  }

  // === ОТПРАВКА СООБЩЕНИЯ (OPTIMISTIC) ===
  async function sendMessage() {
    if ((!input.trim() && !file) || !activeId || sending) return;
    setSending(true);

    // Optimistic update
    const tempId = Date.now();
    const tempMsg: Message = {
      id: tempId, sender_id: -1, sender_name: "Вы",
      sender_is_staff: false, text: input.trim() || null,
      media_url: previewUrl, media_type: file ? "image" : null,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempMsg]);
    const savedInput = input;
    const savedFile = file;
    setInput("");
    setFile(null);
    setPreviewUrl(null);

    const token = getToken();
    const form = new FormData();
    form.append("ticket_id", String(activeId));
    if (savedInput.trim()) form.append("text", savedInput.trim());
    if (savedFile) form.append("file", savedFile);

    try {
      const res = await fetch(`${API}/api/support/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.ok) {
        const data = await res.json();
        // Заменяем временное на реальное
        setMessages(prev => prev.map(m => m.id === tempId ? data.message : m));
        loadTickets();
      } else {
        // Откат при ошибке
        setMessages(prev => prev.filter(m => m.id !== tempId));
        setInput(savedInput);
        setFile(savedFile);
        if (savedFile) setPreviewUrl(URL.createObjectURL(savedFile));
      }
    } catch {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setInput(savedInput);
      setFile(savedFile);
      if (savedFile) setPreviewUrl(URL.createObjectURL(savedFile));
    } finally { setSending(false); }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f && f.type.startsWith("image/")) {
      setFile(f);
      setPreviewUrl(URL.createObjectURL(f));
    }
  }

  const activeTicket = tickets.find(t => t.id === activeId);

  return (
    <div className="h-screen flex overflow-hidden bg-[#18181b]">
      <Sidebar />
      <div className="w-px shrink-0 bg-white/10 my-3" />

      {/* ОСНОВНОЙ КОНТЕНТ */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* ЛЕВАЯ КОЛОНКА: СПИСОК ЗАЯВОК */}
        <div className={`w-full md:w-80 lg:w-96 border-r border-white/10 flex flex-col bg-white/[0.02] ${activeId ? "hidden md:flex" : "flex"}`}>
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Headphones size={20} className="text-[#8b5cf6]" />
              <h2 className="font-bold text-white text-lg">Мои заявки</h2>
            </div>
            <button onClick={() => setShowCreate(true)}
              className="p-2 rounded-xl bg-[#8b5cf6] hover:bg-[#7c3aed] text-white transition-colors"
              title="Новая заявка">
              <Plus size={18} />
            </button>
          </div>

          {/* Форма создания новой заявки */}
          {showCreate && (
            <div className="p-3 border-b border-white/10 bg-[#8b5cf6]/5 space-y-2">
              <textarea value={newText} onChange={e => setNewText(e.target.value)}
                placeholder="Опишите проблему..." rows={3}
                className="w-full px-3 py-2 rounded-xl border border-white/15 bg-white/5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#8b5cf6] resize-none" />
              <div className="flex gap-2">
                <button onClick={createTicket} disabled={creating || (!newText.trim() && !file)}
                  className="flex-1 py-2 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white rounded-xl text-sm font-medium disabled:opacity-40 flex items-center justify-center gap-2">
                  {creating ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                  Создать
                </button>
                <button onClick={() => { setShowCreate(false); setNewText(""); setFile(null); setPreviewUrl(null); }}
                  className="px-3 py-2 rounded-xl border border-white/15 text-white/60 hover:text-white text-sm">
                  Отмена
                </button>
              </div>
            </div>
          )}

          {/* Список */}
          <div className="flex-1 overflow-y-auto">
            {tickets.length === 0 && !showCreate && (
              <div className="text-center py-12 px-4">
                <MessageSquare size={40} className="text-white/10 mx-auto mb-3" />
                <p className="text-white/40 text-sm">Заявок пока нет</p>
                <p className="text-white/25 text-xs mt-1">Нажмите + чтобы создать первую</p>
              </div>
            )}
            {tickets.map(t => (
              <button key={t.id} onClick={() => setActiveId(t.id)}
                className={`w-full text-left p-3 border-b border-white/5 transition-colors ${
                  activeId === t.id ? "bg-[#8b5cf6]/10 border-l-2 border-l-[#8b5cf6]" : "hover:bg-white/5 border-l-2 border-l-transparent"
                }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    t.status === "open" ? "bg-green-500/20 text-green-400" : "bg-white/10 text-white/40"
                  }`}>
                    {t.status === "open" ? "Открыта" : "Закрыта"}
                  </span>
                  <span className="text-[10px] text-white/30">
                    {new Date(t.updated_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                  </span>
                </div>
                <p className="text-sm text-white/70 truncate">
                  {t.last_message?.text || "Нет сообщений"}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* ПРАВАЯ КОЛОНКА: ЧАТ ВЫБРАННОЙ ЗАЯВКИ */}
        <div className={`flex-1 flex flex-col bg-[#18181b] ${activeId ? "flex" : "hidden md:flex"}`}>
          {!activeId ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-xs">
                <ShieldCheck size={48} className="text-white/10 mx-auto mb-4" />
                <h3 className="text-white/50 font-medium mb-2">Выберите заявку</h3>
                <p className="text-white/30 text-sm">Или создайте новую, нажав кнопку +</p>
              </div>
            </div>
          ) : (
            <>
              {/* Шапка чата */}
              <div className="p-3 border-b border-white/10 flex items-center gap-3 bg-white/[0.02]">
                <button onClick={() => setActiveId(null)}
                  className="md:hidden p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10">
                  <ChevronLeft size={20} />
                </button>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-white text-sm">Заявка #{activeId}</h3>
                  <p className={`text-xs font-medium ${activeTicket?.status === "open" ? "text-green-400" : "text-white/40"}`}>
                    {activeTicket?.status === "open" ? "● Открыта" : "○ Закрыта"}
                  </p>
                </div>
                <button onClick={loadMessages} className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10">
                  <RefreshCw size={16} />
                </button>
              </div>

              {/* Сообщения */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map(m => {
                  const isMine = m.sender_id !== 0 && !m.sender_is_staff;
                  const isSystem = m.sender_id === 0;
                  if (isSystem) {
                    return (
                      <div key={m.id} className="flex justify-center">
                        <span className="text-xs text-white/30 bg-white/5 px-3 py-1 rounded-full">{m.text}</span>
                      </div>
                    );
                  }
                  return (
                    <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                        isMine ? "bg-[#8b5cf6] text-white rounded-br-md" : "bg-white/10 text-white rounded-bl-md"
                      }`}>
                        {!isMine && <p className="text-[10px] text-[#a78bfa] font-bold mb-1">🛡️ {m.sender_name}</p>}
                        {m.text && <p className="text-sm whitespace-pre-wrap break-words">{m.text}</p>}
                        {m.media_url && m.media_type === "image" && (
                          <img src={m.media_url} alt="" className="mt-2 rounded-lg max-w-full max-h-60 object-contain" />
                        )}
                        <p className={`text-[10px] mt-1 text-right ${isMine ? "text-white/50" : "text-white/30"}`}>
                          {new Date(m.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {/* Ввод (только для открытых) */}
              {activeTicket?.status === "open" ? (
                <div className="p-3 border-t border-white/10 space-y-2 bg-white/[0.02]">
                  {previewUrl && (
                    <div className="relative inline-block">
                      <img src={previewUrl} alt="" className="h-16 rounded-lg border border-white/20" />
                      <button onClick={() => { setFile(null); setPreviewUrl(null); }}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5">
                        <X size={12} />
                      </button>
                    </div>
                  )}
                  <div className="flex gap-2 items-end">
                    <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
                    <button onClick={() => fileInputRef.current?.click()}
                      className="p-2.5 rounded-xl border border-white/15 text-white/50 hover:text-white hover:bg-white/10 shrink-0">
                      <ImageIcon size={18} />
                    </button>
                    <input value={input} onChange={e => setInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                      placeholder="Написать сообщение..." disabled={sending}
                      className="flex-1 px-4 py-2.5 rounded-xl border border-white/15 bg-white/5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#8b5cf6]" />
                    <button onClick={sendMessage} disabled={(!input.trim() && !file) || sending}
                      className="p-2.5 rounded-xl bg-[#8b5cf6] text-white hover:bg-[#7c3aed] disabled:opacity-40 shrink-0">
                      <Send size={18} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 border-t border-white/10 text-center">
                  <p className="text-white/30 text-sm flex items-center justify-center gap-2">
                    <Clock size={14} /> Эта заявка закрыта
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}