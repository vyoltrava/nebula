"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { getToken } from "@/lib/auth";
import { useWebSocket } from "@/src/hooks/useWebSocket";
import { Sidebar } from "@/components/Sidebar";
import { Headphones, Send, Plus, Image as ImageIcon, X, ChevronLeft, MessageSquare, Clock, ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n/LanguageProvider";

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
  const { t, locale } = useI18n();
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
  const [myId, setMyId] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeIdRef = useRef<number | null>(null);

  // Держим ref в синке со state для WebSocket callback
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  // Получаем свой ID при монтировании
  useEffect(() => {
    (async () => {
      const token = getToken();
      if (!token) return;
      try {
        const res = await fetch(`${API}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const me = await res.json();
          setMyId(me.id);
        }
      } catch {}
    })();
  }, []);

  // === ЗАГРУЗКА СПИСКА ЗАЯВОК ===
  const loadTickets = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${API}/api/support/my-tickets`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTickets(Array.isArray(data) ? data : []);
      }
    } catch {}
  }, []);

  // === ЗАГРУЗКА РЎРћРћР‘ЩР•РќРР™ ===
  const loadMessages = useCallback(async (ticketId: number) => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${API}/api/support/tickets/${ticketId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(Array.isArray(data) ? data : []);
      } else {
        setMessages([]);
      }
    } catch {
      setMessages([]);
    }
  }, []);

  useEffect(() => { loadTickets(); }, [loadTickets]);
  useEffect(() => {
    if (activeId) {
      setMessages([]); // очищаем при переключении
      loadMessages(activeId);
    }
  }, [activeId, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // === WEBSOCKET — МГНОВЕННЫЕ ОБНОВЛЕНИЯ ===
  useWebSocket("support_new_message", (data: any) => {
    const currentActiveId = activeIdRef.current;
    
    // Обновляем список заявок (превью последнего сообщения)
    setTickets(prev => prev.map(t => {
      if (t.id === data.ticket_id) {
        return {
          ...t,
          updated_at: data.message.created_at,
          last_message: {
            text: data.message.text || (data.message.media_url ? "📷 Фото" : ""),
            is_mine: data.message.sender_id === myId,
            created_at: data.message.created_at,
          },
        };
      }
      return t;
    }));

    // Если это активная заявка — добавляем сообщение в чат
    if (data.ticket_id === currentActiveId) {
      setMessages(prev => {
        // Не дублируем (optimistic update мог уже добавить)
        if (prev.some(m => m.id === data.message.id)) return prev;
        // Убираем temp сообщение с таким же текстом если есть
        const filtered = prev.filter(m => m.id > 0 || (m.text !== data.message.text));
        return [...filtered, data.message];
      });
    }
  });

  useWebSocket("support_ticket_closed", (data: any) => {
    const currentActiveId = activeIdRef.current;

    // Обновляем статус в списке
    setTickets(prev => prev.map(t =>
      t.id === data.ticket_id ? { ...t, status: "closed" } : t
    ));

    // Системное сообщение в чате
    if (data.ticket_id === currentActiveId) {
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender_id: 0,
        sender_name: t("support.system"),
        sender_is_staff: false,
        text: t("support.closed"),
        media_url: null,
        media_type: null,
        created_at: new Date().toISOString(),
      }]);
    }
  });

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
    } catch {} finally {
      setCreating(false);
    }
  }

   // === ОТПРАВКА РЎРћРћР‘ЩР•РќРРЇ (OPTIMISTIC) ===
  async function sendMessage() {
    if ((!input.trim() && !file) || !activeId || sending) return;
    setSending(true);

    const tempId = -Date.now(); // отрицательный ID для temp
    const tempMsg: Message = {
      id: tempId,
      sender_id: myId || -1,
      sender_name: t("support.you"),
      sender_is_staff: false,
      text: input.trim() || null,
      media_url: previewUrl,
      media_type: file ? "image" : null,
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
    
    // ✅ РРЎРџРРђР’Р›Р•РќРР• 1: ВСЕГДА отправляем text, даже если он пустой (FastAPI требует наличие поля)
    form.append("text", savedInput.trim() || ""); 
    
    if (savedFile) form.append("file", savedFile);

    try {
      const res = await fetch(`${API}/api/support/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      
        if (res.ok) {
          const data = await res.json();
          // Заменяем temp на реальное сообщение
          setMessages(prev => prev.map(m => m.id === tempId ? data.message : m));
          
          // Обновляем список заявок (Заменили t на ticket внутри map)
          setTickets(prev => prev.map(ticket => {
            if (ticket.id === activeId) {
              return {
                ...ticket,
                updated_at: data.message.created_at,
                last_message: {
                  text: data.message.text || (data.message.media_url ? t("support.photo") : ""),
                  is_mine: true,
                  created_at: data.message.created_at,
                },
              };
            }
            return ticket;
          }));
        
      } else {
        // ✅ РРЎРџРРђР’Р›Р•РќРР• 2: Читаем и показываем реальную ошибку от бэкенда
        const errData = await res.json().catch(() => ({}));
        console.error("Server Error Detail:", errData);
        alert(errData.detail || t("support.sendFailed"));
        
        // Откат (rollback)
        setMessages(prev => prev.filter(m => m.id !== tempId));
        setInput(savedInput);
        setFile(savedFile);
        if (savedFile) setPreviewUrl(URL.createObjectURL(savedFile));
      }
    } catch (error) {
      console.error("Network Error:", error);
      alert(t("support.network"));
      
      // Откат (rollback)
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setInput(savedInput);
      setFile(savedFile);
      if (savedFile) setPreviewUrl(URL.createObjectURL(savedFile));
    } finally {
      setSending(false);
    }
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
    <div className="h-screen flex overflow-hidden bg-ivory dark:bg-[#18181b]">
      <Sidebar />
      <div className="w-px shrink-0 bg-gray-100 dark:bg-white/10 my-3" />

      <main className="flex-1 flex overflow-hidden">
        
        {/* ЛЕВАЯ КОЛОНКА: СПИСОК ЗАЯВОК */}
        <div className={`w-full md:w-80 lg:w-96 border-r border-line dark:border-white/10 flex flex-col bg-white/[0.02] ${activeId ? "hidden md:flex" : "flex"}`}>
          <div className="p-4 border-b border-line dark:border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Headphones size={20} className="text-[#8b5cf6]" />
              <h2 className="font-bold text-gray-900 dark:text-white text-lg">{t("support.myTickets")}</h2>
            </div>
            <button onClick={() => setShowCreate(true)}
              className="p-2 rounded-xl bg-[#8b5cf6] hover:bg-[#7c3aed] text-white transition-colors"
              title={t("support.newTicket")}>
              <Plus size={18} />
            </button>
          </div>

          {showCreate && (
            <div className="p-3 border-b border-line dark:border-white/10 bg-[#8b5cf6]/5 space-y-2">
              <textarea value={newText} onChange={e => setNewText(e.target.value)}
                placeholder={t("support.describe")} rows={3}
                className="w-full px-3 py-2 rounded-xl border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:border-[#8b5cf6] resize-none" />
              <div className="flex gap-2">
                <button onClick={createTicket} disabled={creating || (!newText.trim() && !file)}
                  className="flex-1 py-2 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white rounded-xl text-sm font-medium disabled:opacity-40 flex items-center justify-center gap-2">
                  {creating ? (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                  ) : <Send size={14} />}
                  {t("support.create")}
                </button>
                <button onClick={() => { setShowCreate(false); setNewText(""); setFile(null); setPreviewUrl(null); }}
                  className="px-3 py-2 rounded-xl border border-line dark:border-white/15 text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white text-sm">
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {tickets.length === 0 && !showCreate && (
              <div className="text-center py-12 px-4">
                <MessageSquare size={40} className="text-gray-500 dark:text-white/10 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-white/40 text-sm">{t("support.empty")}</p>
                <p className="text-gray-500 dark:text-white/25 text-xs mt-1">{t("support.emptyHint")}</p>
              </div>
            )}
            {tickets.map(ticket => (
              <button key={ticket.id} onClick={() => setActiveId(ticket.id)}
                className={`w-full text-left p-3 border-b border-line dark:border-white/5 transition-colors ${
                  activeId === ticket.id ? "bg-[#8b5cf6]/10 border-l-2 border-l-[#8b5cf6]" : "hover:bg-gray-100 dark:hover:bg-white/5 border-l-2 border-l-transparent"
                }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    ticket.status === "open" ? "bg-green-500/20 text-green-600 dark:text-green-400" : "bg-gray-100 dark:bg-white/10 text-white/40"
                  }`}>
                    {ticket.status === "open" ? t("support.open") : t("support.closedStatus")}
                  </span>
                  <span className="text-[10px] text-gray-500 dark:text-white/30">
                    {new Date(ticket.updated_at).toLocaleDateString(locale === "en" ? "en-US" : "ru-RU", { day: "numeric", month: "short" })}
                  </span>
                </div>
                <p className="text-sm text-gray-800 dark:text-white/70 truncate">
                  {ticket.last_message?.text || t("support.noMessages")}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* ПРАВАЯ КОЛОНКА: ЧАТ */}
        <div className={`flex-1 flex flex-col bg-ivory dark:bg-[#18181b] ${activeId ? "flex" : "hidden md:flex"}`}>
          {!activeId ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-xs">
                <ShieldCheck size={48} className="text-gray-500 dark:text-white/10 mx-auto mb-4" />
                <h3 className="text-gray-600 dark:text-white/50 font-medium mb-2">{t("support.pick")}</h3>
                <p className="text-gray-500 dark:text-white/30 text-sm">{t("support.pickHint")}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="p-3 border-b border-line dark:border-white/10 flex items-center gap-3 bg-white/[0.02]">
                <button onClick={() => setActiveId(null)}
                  className="md:hidden p-2 rounded-lg text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10">
                  <ChevronLeft size={20} />
                </button>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-900 dark:text-white text-sm">{t("support.ticketN", { id: activeId })}</h3>
                  <p className={`text-xs font-medium ${activeTicket?.status === "open" ? "text-green-600 dark:text-green-400" : "text-gray-500 dark:text-white/40"}`}>
                    {activeTicket?.status === "open" ? t("support.openDot") : t("support.closedDot")}
                  </p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map(m => {
                  const isMine = m.sender_id === myId || m.sender_id === -1;
                  const isSystem = m.sender_id === 0;
                  if (isSystem) {
                    return (
                      <div key={m.id} className="flex justify-center">
                        <span className="text-xs text-gray-500 dark:text-white/30 bg-gray-100 dark:bg-white/5 px-3 py-1 rounded-full">{m.text}</span>
                      </div>
                    );
                  }
                  return (
                    <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                        isMine ? "bg-[#8b5cf6] text-white rounded-br-md" : "bg-gray-100 dark:bg-white/10 text-white rounded-bl-md"
                      }`}>
                        {!isMine && <p className="text-[10px] text-[#a78bfa] font-bold mb-1">🛡️ {m.sender_name}</p>}
                        {m.text && <p className="text-sm whitespace-pre-wrap break-words">{m.text}</p>}
                        {m.media_url && m.media_type === "image" && (
                          <img src={m.media_url} alt="" className="mt-2 rounded-lg max-w-full max-h-60 object-contain" />
                        )}
                        <p className={`text-[10px] mt-1 text-right ${isMine ? "text-gray-600 dark:text-white/50" : "text-gray-500 dark:text-white/30"}`}>
                          {new Date(m.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {activeTicket?.status === "open" ? (
                <div className="p-3 border-t border-line dark:border-white/10 space-y-2 bg-white/[0.02]">
                  {previewUrl && (
                    <div className="relative inline-block">
                      <img src={previewUrl} alt="" className="h-16 rounded-lg border border-line dark:border-white/20" />
                      <button onClick={() => { setFile(null); setPreviewUrl(null); }}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5">
                        <X size={12} />
                      </button>
                    </div>
                  )}
                  <div className="flex gap-2 items-end">
                    <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
                    <button onClick={() => fileInputRef.current?.click()}
                      className="p-2.5 rounded-xl border border-line dark:border-white/15 text-gray-600 dark:text-white/50 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 shrink-0">
                      <ImageIcon size={18} />
                    </button>
                    <input value={input} onChange={e => setInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                      placeholder="Написать сообщение..." disabled={sending}
                      className="flex-1 px-4 py-2.5 rounded-xl border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:border-[#8b5cf6]" />
                    <button onClick={sendMessage} disabled={(!input.trim() && !file) || sending}
                      className="p-2.5 rounded-xl bg-[#8b5cf6] text-white hover:bg-[#7c3aed] disabled:opacity-40 shrink-0">
                      <Send size={18} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 border-t border-line dark:border-white/10 text-center">
                  <p className="text-gray-500 dark:text-white/30 text-sm flex items-center justify-center gap-2">
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