"use client";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";
import { useWebSocket } from "@/src/hooks/useWebSocket";
import { Send, Terminal, ShieldCheck, Zap, ArrowLeft, LogOut } from "lucide-react";

export default function PrismChatPage() {
  const params = useParams();
  const chatId = params?.id as string;
  const router = useRouter();
  
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [chatInfo, setChatInfo] = useState<any>(null);
  const [syncStatus, setSyncStatus] = useState<"syncing" | "active">("syncing");
  
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);

  // 1. Загрузка данных и сообщений
  useEffect(() => {
    const token = getToken();
    if (!token) return router.push("/login");
    
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.json()).then(setCurrentUser);

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.json()).then(data => {
      setChatInfo(data);
      setSyncStatus("active");
    });

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.json()).then(data => {
      setMessages(Array.isArray(data) ? data : (data.messages ?? []));
    });

    // Помечаем как прочитанное
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
  }, [chatId, router]);

  // 2. Реальная отправка сообщения на бэкенд
  const sendMessage = async () => {
    if (sendingRef.current || !text.trim()) return;
    const token = getToken();
    if (!token) return;
    
    sendingRef.current = true;
    const tempText = text.trim();
    setText(""); // Очищаем поле сразу для UX

    try {
      const form = new FormData();
      form.append("text", tempText);
      
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (!res.ok) {
        alert("Не удалось отправить сообщение");
        setText(tempText); // Возвращаем текст при ошибке
      }
    } catch (err) {
      console.error(err);
      setText(tempText);
    } finally {
      sendingRef.current = false;
    }
  };

  // 3. Выход / Удаление чата
  const leaveChat = async () => {
    if (!confirm("Покинуть канал Призмы? История будет удалена.")) return;
    const token = getToken();
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      router.push("/messages");
    } catch (e) {
      alert("Ошибка при выходе");
    }
  };

  // 4. Веб-сокет для получения новых сообщений в реальном времени
  useWebSocket("new_message", (data: any) => {
    if (String(data.chat_id) !== String(chatId)) return;
    setMessages(prev => {
      if (prev.some(m => m.id === data.id)) return prev;
      return [...prev, { ...data, is_temp: false }];
    });
    // Автоскролл вниз
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, 100);
  });

  return (
    <div className="h-screen w-full flex flex-col bg-[#08080C] text-white font-mono overflow-hidden relative">
      {/* Фоновая сетка */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1a1a24_1px,transparent_1px),linear-gradient(to_bottom,#1a1a24_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-30 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#08080C]/50 to-[#08080C] pointer-events-none" />

      {/* 🧬 HEADER: Статус-панель с кнопками навигации */}
      <header className="relative z-10 border-b border-cyan-500/20 bg-[#0a0a0f]/90 backdrop-blur-md px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/messages")} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/60 hover:text-white">
            <ArrowLeft size={20} />
          </button>
          <div className={`w-2 h-2 rounded-full ${syncStatus === 'active' ? 'bg-cyan-400 shadow-[0_0_10px_#22d3ee]' : 'bg-yellow-400 animate-pulse'}`} />
          <div>
            <h1 className="text-xs tracking-[0.2em] text-cyan-400 font-bold">PRISM_LINK // {chatId.slice(0,6).toUpperCase()}</h1>
            <p className="text-[10px] text-white/40 mt-0.5">
              {syncStatus === 'active' ? `NODE_SYNC: ACTIVE · TARGET: ${chatInfo?.is_group ? chatInfo.name : chatInfo?.other?.display_name || 'UNKNOWN'}` : 'RECONSTRUCTING...'}
            </p>
          </div>
        </div>
        
        <button 
          onClick={leaveChat}
          className="p-2 hover:bg-red-500/20 rounded-lg transition-colors text-white/40 hover:text-red-400"
          title="Покинуть канал"
        >
          <LogOut size={18} />
        </button>
      </header>

      {/* 🌌 MESSAGE STREAM: Нейро-поток */}
      <main ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6 scroll-smooth">
        {messages.map((msg) => {
          const isMine = msg.sender_id === currentUser?.id;
          return (
            <div key={msg.id} className={`relative flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              {/* Световой спектр вместо пузыря */}
              <div className={`absolute top-0 bottom-0 w-[2px] ${
                isMine 
                  ? 'right-0 bg-gradient-to-b from-purple-500 via-purple-400 to-transparent shadow-[0_0_15px_rgba(168,85,247,0.5)]' 
                  : 'left-0 bg-gradient-to-b from-cyan-500 via-cyan-400 to-transparent shadow-[0_0_15px_rgba(34,211,238,0.5)]'
              }`} />
              
              <div className={`max-w-[85%] md:max-w-[70%] px-5 py-3 ${isMine ? 'pr-6' : 'pl-6'}`}>
                <div className="flex items-center gap-2 mb-1.5 opacity-50 text-[10px] uppercase tracking-wider">
                  <span className={isMine ? "text-purple-400" : "text-cyan-400"}>
                    {isMine ? 'SELF_NODE' : `NODE_${msg.sender_id}`}
                  </span>
                  <span>·</span>
                  <span>{new Date(msg.created_at).toLocaleTimeString("ru-RU", {hour: "2-digit", minute:"2-digit"})}</span>
                </div>
                <p className="text-[15px] leading-relaxed text-white/90 break-words whitespace-pre-wrap">
                  {msg.text}
                </p>
              </div>
            </div>
          );
        })}
        
        <div className="flex items-center gap-2 text-cyan-400/50 text-[10px] mt-8">
          <Terminal size={12} />
          <span>AWAITING_INPUT_STREAM...</span>
        </div>
      </main>

      {/* ⌨️ INPUT CONSOLE */}
      <footer className="relative z-10 p-4 md:p-6 bg-gradient-to-t from-[#08080C] via-[#08080C] to-transparent">
        <div className="max-w-4xl mx-auto flex items-center gap-3 bg-[#0f0f16] border border-cyan-500/20 rounded-lg px-4 py-3 shadow-[0_0_30px_rgba(34,211,238,0.05)] focus-within:border-cyan-500/50 transition-colors">
          <span className="text-cyan-400 font-bold text-lg select-none">{'>'}</span>
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="ENTER_TRANSMISSION..."
            className="flex-1 bg-transparent border-none outline-none text-white placeholder-white/20 font-mono text-sm tracking-wide"
            autoFocus
          />
          <button 
            onClick={sendMessage}
            disabled={!text.trim()}
            className="p-2 rounded-md bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:shadow-[0_0_15px_rgba(34,211,238,0.3)] active:scale-95"
          >
            <Zap size={18} />
          </button>
        </div>
        <p className="text-center text-[9px] text-white/20 mt-3 tracking-[0.2em]">
          TRANSMISSION SECURED BY TRELOD PRISM PROTOCOL
        </p>
      </footer>
    </div>
  );
}