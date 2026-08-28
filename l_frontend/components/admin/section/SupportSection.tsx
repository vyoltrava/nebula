"use client";
import { useEffect, useState, useRef } from "react";
import { Avatar } from "@/components/Avatar";
import { getToken } from "@/lib/auth";
import { useWebSocket } from "@/src/hooks/useWebSocket";
import { Headphones, Send, RefreshCw, ArrowLeft, Image as ImageIcon, X, Loader2 } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL;

export function SupportSection({ me }: { me: any }) {
  const [tickets, setTickets] = useState<any[]>([]);
  const [activeTicket, setActiveTicket] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadTickets() {
    const token = getToken();
    try {
      const res = await fetch(`${API}/api/support/tickets`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTickets(data);
      }
    } catch (error) {
      console.error("Failed to load tickets:", error);
    }
  }

  async function loadMessages(ticketId: number) {
    const token = getToken();
    try {
      const res = await fetch(`${API}/api/support/tickets/${ticketId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (error) {
      console.error("Failed to load messages:", error);
    }
  }

  useEffect(() => {
    loadTickets();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useWebSocket("support_new_message", (data: any) => {
    if (!activeTicket || data.ticket_id !== activeTicket.id) {
      loadTickets();
      return;
    }
    setMessages((prev) =>
      prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]
    );
  });

  useWebSocket("support_ticket_closed", (data: any) => {
    if (activeTicket && data.ticket_id === activeTicket.id) {
      setActiveTicket({ ...activeTicket, status: "closed" });
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          sender_id: 0,
          sender_name: "Система",
          sender_is_staff: false,
          text: "🔒 Заявка закрыта.",
          created_at: new Date().toISOString(),
        },
      ]);
    }
    loadTickets();
  });

  useWebSocket("support_new_ticket", () => {
    loadTickets();
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // ✅ ДОБАВЛЕНО: проверка что это вообще картинка
      if (!selectedFile.type.startsWith("image/")) {
        alert("Можно загружать только изображения (JPG, PNG, GIF, WEBP)");
        return;
      }
      
      if (selectedFile.size > 10 * 1024 * 1024) {
        alert("Файл слишком большой (максимум 10 МБ)");
        return;
      }
      
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(selectedFile);
    }
  };

  const removeFile = () => {
    setFile(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  async function sendMessage() {
    if ((!input.trim() && !file) || !activeTicket || sending) return;
    
    // 🚀 Optimistic update
    const tempId = Date.now();
    const tempMessage = {
      id: tempId,
      sender_id: me.id,
      sender_name: me.display_name,
      sender_is_staff: true,
      text: input.trim(),
      media_url: preview,
      media_type: file ? "image" : null,
      created_at: new Date().toISOString(),
      pending: true,
    };
    
    setMessages((prev) => [...prev, tempMessage]);
    const currentInput = input;
    const currentFile = file;
    const currentPreview = preview;
    
    setInput("");
    removeFile();
    setSending(true);

    const token = getToken();
    const form = new FormData();
    form.append("ticket_id", String(activeTicket.id));
    form.append("text", currentInput); // всегда отправляем, даже если пустой
    if (currentFile) form.append("file", currentFile);

    try {
      const res = await fetch(`${API}/api/support/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? data.message : m))
        );
        loadTickets();
      } else {
        // ✅ ПОКАЗЫВАЕМ РЕАЛЬНУЮ ОШИБКУ ОТ БЭКЕНДА
        const errData = await res.json().catch(() => ({}));
        console.error("[SupportSection] Server Error:", errData);
        alert(errData.detail || "Не удалось отправить сообщение");
        
        // Откат (rollback)
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setInput(currentInput);
        if (currentFile) {
          setFile(currentFile);
          setPreview(currentPreview);
        }
      }
    } catch (error) {
      console.error("[SupportSection] Network Error:", error);
      alert("Ошибка сети. Проверьте интернет-соединение.");
      
      // Откат (rollback)
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInput(currentInput);
      if (currentFile) {
        setFile(currentFile);
        setPreview(currentPreview);
      }
    } finally {
      setSending(false);
    }
  }

  async function closeTicket(ticketId: number) {
    if (!confirm("Закрыть тикет?")) return;
    const token = getToken();
    try {
      const res = await fetch(`${API}/api/support/tickets/${ticketId}/close`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setActiveTicket(null);
        loadTickets();
      }
    } catch (error) {
      console.error("Failed to close ticket:", error);
    }
  }

  const openTickets = tickets.filter((t) => t.status === "open");
  const closedTickets = tickets.filter((t) => t.status !== "open");

  return (
    <div className="flex flex-col md:flex-row gap-4 h-[calc(100vh-200px)]">
      <div className={`w-full md:w-96 border border-line dark:border-white/10 rounded-xl bg-gray-100 dark:bg-white/5 flex flex-col ${activeTicket ? "hidden md:flex" : "flex"}`}>
        <div className="p-3 border-b border-line dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Headphones size={18} className="text-green-600 dark:text-green-400" />
            <h3 className="font-bold text-gray-900 dark:text-white">Заявки</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-green-600 dark:text-green-400 font-bold">{openTickets.length} открытых</span>
            <button onClick={loadTickets} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {openTickets.length > 0 && <p className="px-3 py-2 text-[10px] font-bold text-gray-500 dark:text-white/40 uppercase">Открытые</p>}
          {openTickets.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setActiveTicket(t);
                loadMessages(t.id);
              }}
              className={`w-full flex items-center gap-3 p-3 border-b border-line dark:border-white/5 hover:bg-gray-100 dark:hover:bg-white/5 text-left ${
                activeTicket?.id === t.id ? "bg-green-500/10" : ""
              }`}
            >
              <Avatar src={t.user?.avatar_url} name={t.user?.display_name} id={t.user?.id} size={36} />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-gray-900 dark:text-white text-sm truncate">{t.user?.display_name || "Unknown"}</p>
                <p className="text-[11px] text-gray-500 dark:text-white/40 truncate">
                  {t.last_message?.text?.slice(0, 40) || "Нет сообщений"}
                </p>
              </div>
              <span className="text-[10px] text-gray-500 dark:text-white/30 shrink-0">
                {new Date(t.updated_at || t.created_at).toLocaleDateString("ru-RU", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            </button>
          ))}
          {closedTickets.length > 0 && <p className="px-3 py-2 text-[10px] font-bold text-gray-500 dark:text-white/40 uppercase">Закрытые</p>}
          {closedTickets.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setActiveTicket(t);
                loadMessages(t.id);
              }}
              className={`w-full flex items-center gap-3 p-3 border-b border-line dark:border-white/5 hover:bg-gray-100 dark:hover:bg-white/5 text-left opacity-60 ${
                activeTicket?.id === t.id ? "bg-green-500/10 opacity-100" : ""
              }`}
            >
              <Avatar src={t.user?.avatar_url} name={t.user?.display_name} id={t.user?.id} size={36} />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-gray-900 dark:text-white text-sm truncate">{t.user?.display_name || "Unknown"}</p>
                <p className="text-[11px] text-gray-500 dark:text-white/40 truncate">
                  {t.last_message?.text?.slice(0, 40) || "Нет сообщений"}
                </p>
              </div>
            </button>
          ))}
          {tickets.length === 0 && <p className="text-center text-gray-500 dark:text-white/40 text-sm py-8">Заявок пока нет</p>}
        </div>
      </div>

      <div className={`flex-1 border border-line dark:border-white/10 rounded-xl bg-gray-100 dark:bg-white/5 flex flex-col ${activeTicket ? "flex" : "hidden md:flex"}`}>
        {!activeTicket ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Headphones size={48} className="text-gray-500 dark:text-white/10 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-white/30 text-sm">Выбери заявку для просмотра</p>
            </div>
          </div>
        ) : (
          <>
            <div className="p-3 border-b border-line dark:border-white/10 flex items-center gap-3">
              <button
                onClick={() => setActiveTicket(null)}
                className="p-2 rounded-lg text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 md:hidden"
              >
                <ArrowLeft size={18} />
              </button>
              <Avatar src={activeTicket.user?.avatar_url} name={activeTicket.user?.display_name} id={activeTicket.user?.id} size={32} />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 dark:text-white text-sm truncate">{activeTicket.user?.display_name || "Unknown"}</p>
                <p className="text-[10px] text-gray-500 dark:text-white/40">@{activeTicket.user?.username}</p>
              </div>
              {activeTicket.status === "open" && (
                <button
                  onClick={() => closeTicket(activeTicket.id)}
                  className="px-3 py-1.5 rounded-lg border border-red-400/30 text-red-600 dark:text-red-400 text-xs font-bold hover:bg-red-500/10"
                >
                  Закрыть
                </button>
              )}
              {activeTicket.status !== "open" && (
                <span className="px-2 py-1 rounded-lg bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-white/50 text-[10px] font-bold uppercase">Закрыта</span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.sender_is_staff ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                      m.sender_is_staff ? "bg-[#8b5cf6] text-white rounded-br-md" : "bg-gray-100 dark:bg-white/10 text-white rounded-bl-md"
                    } ${m.pending ? "opacity-60" : ""}`}
                  >
                    {!m.sender_is_staff && <p className="text-[10px] text-gray-600 dark:text-white/50 mb-1">{m.sender_name || "Пользователь"}</p>}
                    {m.text && <p className="text-sm whitespace-pre-wrap break-words">{m.text}</p>}
                    {m.media_url && (
                      <img
                        src={m.media_url}
                        alt="Attachment"
                        className="mt-2 rounded-lg max-w-full cursor-pointer hover:opacity-90"
                        onClick={() => window.open(m.media_url, "_blank")}
                      />
                    )}
                    <p className={`text-[10px] mt-1 ${m.sender_is_staff ? "text-gray-600 dark:text-white/60" : "text-gray-500 dark:text-white/40"}`}>
                      {new Date(m.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            {activeTicket.status === "open" && (
              <div className="p-3 border-t border-line dark:border-white/10 space-y-2">
                {preview && (
                  <div className="relative inline-block">
                    <img src={preview} alt="Preview" className="w-20 h-20 object-cover rounded-lg" />
                    <button
                      onClick={removeFile}
                      className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
                
                <div className="flex gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-2.5 rounded-xl border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10"
                    disabled={sending}
                  >
                    <ImageIcon size={16} />
                  </button>
                  
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder="Написать ответ..."
                    className="flex-1 px-4 py-2.5 rounded-xl border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:border-green-600 dark:focus:border-green-400"
                    disabled={sending}
                  />
                  
                  <button
                    onClick={sendMessage}
                    disabled={(!input.trim() && !file) || sending}
                    className="px-4 py-2.5 rounded-xl bg-green-500 text-white hover:bg-green-600 disabled:opacity-40 flex items-center gap-2"
                  >
                    {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}