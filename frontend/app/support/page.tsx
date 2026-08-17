"use client";
import { useState, useEffect, useRef } from "react";
import { Sidebar } from "@/components/Sidebar";
import { getToken } from "@/lib/auth";
import { useWebSocket } from "@/src/hooks/useWebSocket";
import { Headphones, Send, Loader2, Image as ImageIcon, X, MessageSquare, Clock, Shield } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL;

export default function SupportPage() {
  const [view, setView] = useState<"loading" | "create" | "continue" | "chat">("loading");
  const [ticketId, setTicketId] = useState<number | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [firstText, setFirstText] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [myId, setMyId] = useState<number | null>(null);
  const [myName, setMyName] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const token = getToken();
      if (!token) { setView("create"); return; }
      
      try {
        const me = await fetch(`${API}/api/me`, { 
          headers: { Authorization: `Bearer ${token}` } 
        }).then((r) => (r.ok ? r.json() : null));
        
        if (me) {
          setMyId(me.id);
          setMyName(me.display_name);
        }

        const res = await fetch(`${API}/api/support/my-ticket`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (res.ok) {
          const d = await res.json();
          if (d.has_ticket) {
            setTicketId(d.ticket_id);
            setMessages(d.messages || []);
            setView("chat");
          } else {
            setView("create");
          }
        } else {
          setView("create");
        }
      } catch (error) {
        console.error("Failed to load support data:", error);
        setView("create");
      }
    })();
  }, []);

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
        id: Date.now(),
        sender_id: 0,
        sender_name: "Система",
        sender_is_staff: false,
        text: "🔒 Заявка закрыта.",
        created_at: new Date().toISOString(),
      }]);
    }
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
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

  async function createTicket() {
    if (busy || (!firstText.trim() && !file)) return;
    setBusy(true);
    
    const token = getToken();
    const form = new FormData();
    form.append("text", firstText.trim());
    if (file) form.append("file", file);
    
    try {
      const res = await fetch(`${API}/api/support/start`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
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
        removeFile();
      } else {
        alert("Ошибка создания заявки");
      }
    } catch (error) {
      console.error("Failed to create ticket:", error);
      alert("Ошибка сети. Попробуйте позже.");
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage() {
    if ((!input.trim() && !file) || !ticketId || busy) return;
    
    // 🚀 Optimistic update - сразу добавляем сообщение
    const tempId = Date.now();
    const tempMessage = {
      id: tempId,
      sender_id: myId,
      sender_name: myName,
      sender_is_staff: false,
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
    setBusy(true);

    const token = getToken();
    const form = new FormData();
    form.append("ticket_id", String(ticketId));
    form.append("text", currentInput);
    if (currentFile) form.append("file", currentFile);

    try {
      const res = await fetch(`${API}/api/support/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (res.ok) {
        const data = await res.json();
        // Заменяем временное сообщение на реальное
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? data.message : m))
        );
      } else {
        // Удаляем временное сообщение при ошибке
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setInput(currentInput);
        if (currentFile) {
          setFile(currentFile);
          setPreview(currentPreview);
        }
        alert("Ошибка отправки сообщения");
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      // Удаляем временное сообщение при ошибке сети
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInput(currentInput);
      if (currentFile) {
        setFile(currentFile);
        setPreview(currentPreview);
      }
      alert("Ошибка сети. Попробуйте снова.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-screen flex overflow-hidden bg-[#18181b]">
      <Sidebar />
      <div className="w-px shrink-0 bg-white/10 my-3" />
      <main className="flex-1 overflow-hidden border-x border-white/10 flex flex-col">
        <div className="shrink-0 p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Headphones size={32} className="text-[#8b5cf6]" />
            <h1 className="text-3xl font-black text-white">Поддержка</h1>
          </div>
        </div>

        {view === "loading" && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="animate-spin text-white/40" size={48} />
          </div>
        )}

        {view === "create" && (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto p-8">
              <div className="space-y-4 mb-8">
                <div className="border border-white/10 rounded-xl p-5 bg-white/5">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare size={18} className="text-[#8b5cf6]" />
                    <h3 className="font-bold text-white">Как это работает?</h3>
                  </div>
                  <p className="text-sm text-white/60">
                    Опишите проблему ниже — создастся заявка.
                    Вся переписка ведётся прямо здесь.
                  </p>
                </div>
                <div className="border border-white/10 rounded-xl p-5 bg-white/5">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock size={18} className="text-yellow-400" />
                    <h3 className="font-bold text-white">Время ответа</h3>
                  </div>
                  <p className="text-sm text-white/60">Обычно 1–3 часа в рабочее время.</p>
                </div>
                <div className="border border-white/10 rounded-xl p-5 bg-white/5">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield size={18} className="text-green-400" />
                    <h3 className="font-bold text-white">Конфиденциальность</h3>
                  </div>
                  <p className="text-sm text-white/60">Ваше обращение видит только команда поддержки.</p>
                </div>
              </div>

              <div className="border border-white/10 rounded-xl p-6 bg-white/5 space-y-4">
                <h3 className="font-bold text-white text-lg">Создать заявку</h3>
                <textarea
                  value={firstText}
                  onChange={(e) => setFirstText(e.target.value)}
                  placeholder="Опишите проблему подробно..."
                  rows={6}
                  className="w-full px-4 py-3 rounded-xl border border-white/15 bg-white/5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#8b5cf6] resize-none"
                />
                
                {preview && (
                  <div className="relative inline-block">
                    <img src={preview} alt="Preview" className="w-32 h-32 object-cover rounded-lg" />
                    <button
                      onClick={removeFile}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600"
                    >
                      <X size={14} />
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
                    className="px-4 py-2.5 rounded-xl border border-white/15 bg-white/5 text-white text-sm hover:bg-white/10 flex items-center gap-2"
                  >
                    <ImageIcon size={16} />
                    Прикрепить изображение
                  </button>
                </div>
                
                <button
                  onClick={createTicket}
                  disabled={busy || (!firstText.trim() && !file)}
                  className="w-full py-3 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white rounded-xl font-medium text-sm disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  Создать заявку
                </button>
              </div>
            </div>
          </div>
        )}

        {(view === "continue" || view === "chat") && (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {messages.map((m) => {
                const isMine = m.sender_id === myId;
                return (
                  <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                      isMine ? "bg-[#8b5cf6] text-white rounded-br-md" : "bg-white/10 text-white rounded-bl-md"
                    } ${m.pending ? "opacity-60" : ""}`}>
                      {!isMine && (
                        <p className="text-[10px] text-[#a78bfa] font-bold mb-1">
                          {m.sender_is_staff ? "🛡️ Поддержка" : m.sender_name}
                        </p>
                      )}
                      {m.text && <p className="text-sm whitespace-pre-wrap break-words">{m.text}</p>}
                      {m.media_url && (
                        <img
                          src={m.media_url}
                          alt="Attachment"
                          className="mt-2 rounded-lg max-w-full cursor-pointer hover:opacity-90"
                          onClick={() => window.open(m.media_url, "_blank")}
                        />
                      )}
                      <p className={`text-[10px] mt-2 ${isMine ? "text-white/60" : "text-white/40"}`}>
                        {new Date(m.created_at).toLocaleTimeString("ru-RU", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <div className="shrink-0 p-4 border-t border-white/10 space-y-2">
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
                  className="px-3 py-2.5 rounded-xl border border-white/15 bg-white/5 text-white hover:bg-white/10"
                  disabled={busy}
                >
                  <ImageIcon size={18} />
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
                  placeholder="Написать сообщение..."
                  className="flex-1 px-4 py-2.5 rounded-xl border border-white/15 bg-white/5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#8b5cf6]"
                  disabled={busy}
                />
                
                <button
                  onClick={sendMessage}
                  disabled={(!input.trim() && !file) || busy}
                  className="px-4 py-2.5 rounded-xl bg-[#8b5cf6] text-white hover:bg-[#7c3aed] disabled:opacity-40 flex items-center gap-2"
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}