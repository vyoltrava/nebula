// app/prism/[id]/page.tsx (или pages/prism/[id].tsx)
"use client";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";
import { useWebSocket } from "@/src/hooks/useWebSocket";
import { Send, Terminal, ShieldCheck, Wifi, Zap } from "lucide-react";

export default function PrismChatPage() {
  const params = useParams();
  const chatId = params?.id as string;
  const router = useRouter();
  
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [partner, setPartner] = useState<any>(null);
  const [syncStatus, setSyncStatus] = useState<"syncing" | "active" | "error">("syncing");
  
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Загрузка инфо и ключей (тут будет логика сборки Призмы)
  useEffect(() => {
    const token = getToken();
    if (!token) return router.push("/login");
    
    // Имитация сборки ключа из "Генезиса" и "Якоря"
    setTimeout(() => setSyncStatus("active"), 1500);

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.json()).then(data => {
      setPartner(data.other);
      // Загрузка сообщений...
    });
    
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.json()).then(setCurrentUser);
  }, [chatId]);

  const sendMessage = () => {
    if (!text.trim()) return;
    // Логика отправки (шифрование на лету)
    setMessages(prev => [...prev, { id: Date.now(), text, sender_id: currentUser?.id, created_at: new Date().toISOString() }]);
    setText("");
  };

  return (
    <div className="h-screen w-full flex flex-col bg-[#08080C] text-white font-mono overflow-hidden relative">
      {/* Фоновая сетка (Эффект нейросети) */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1a1a24_1px,transparent_1px),linear-gradient(to_bottom,#1a1a24_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-30 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#08080C]/50 to-[#08080C] pointer-events-none" />

      {/* 🧬 HEADER: Статус-панель вместо обычной шапки */}
      <header className="relative z-10 border-b border-cyan-500/20 bg-[#0a0a0f]/80 backdrop-blur-md px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`w-3 h-3 rounded-full ${syncStatus === 'active' ? 'bg-cyan-400 shadow-[0_0_10px_#22d3ee]' : 'bg-yellow-400 animate-pulse'}`} />
          <div>
            <h1 className="text-xs tracking-[0.3em] text-cyan-400 font-bold">PRISM_LINK // {chatId.slice(0,8).toUpperCase()}</h1>
            <p className="text-[10px] text-white/40 mt-0.5">
              {syncStatus === 'active' ? `NODE_SYNC: ACTIVE · TARGET: @${partner?.username || '...'}` : 'RECONSTRUCTING SPECTRUM...'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-white/30">
          <ShieldCheck size={12} className="text-cyan-400" />
          <span>E2E_SPECTRAL</span>
        </div>
      </header>

      {/* 🌌 MESSAGE STREAM: Нейро-поток (Никаких пузырей!) */}
      <main ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto px-6 py-8 space-y-6 scroll-smooth">
        {messages.map((msg) => {
          const isMine = msg.sender_id === currentUser?.id;
          return (
            <div key={msg.id} className={`relative flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              {/* Световой спектр (Замена пузырей) */}
              <div className={`absolute top-0 bottom-0 w-[2px] ${
                isMine 
                  ? 'right-0 bg-gradient-to-b from-purple-500 via-purple-400 to-transparent shadow-[0_0_15px_rgba(168,85,247,0.5)]' 
                  : 'left-0 bg-gradient-to-b from-cyan-500 via-cyan-400 to-transparent shadow-[0_0_15px_rgba(34,211,238,0.5)]'
              }`} />
              
              {/* Контент сообщения */}
              <div className={`max-w-[70%] px-6 py-3 ${isMine ? 'pr-8' : 'pl-8'}`}>
                <div className="flex items-center gap-2 mb-1.5 opacity-50 text-[10px]">
                  <span>{isMine ? 'SELF' : `@${partner?.username}`}</span>
                  <span>·</span>
                  <span>{new Date(msg.created_at).toLocaleTimeString()}</span>
                </div>
                <p className="text-[15px] leading-relaxed text-white/90 break-words">
                  {msg.text}
                </p>
              </div>
            </div>
          );
        })}
        
        {/* Индикатор набора (если есть) */}
        <div className="flex items-center gap-2 text-cyan-400 text-xs opacity-70">
          <Terminal size={12} />
          <span>AWAITING_INPUT...</span>
        </div>
      </main>

      {/* ⌨️ INPUT CONSOLE: Плавающая консоль */}
      <footer className="relative z-10 p-6 bg-gradient-to-t from-[#08080C] via-[#08080C] to-transparent">
        <div className="max-w-4xl mx-auto flex items-center gap-4 bg-[#0f0f16] border border-cyan-500/20 rounded-lg px-5 py-3 shadow-[0_0_30px_rgba(34,211,238,0.05)]">
          <span className="text-cyan-400 font-bold text-lg select-none">{'>'}</span>
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="ENTER_TRANSMISSION..."
            className="flex-1 bg-transparent border-none outline-none text-white placeholder-white/20 font-mono text-sm tracking-wide"
          />
          <button 
            onClick={sendMessage}
            className="p-2 rounded-md bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-all hover:shadow-[0_0_15px_rgba(34,211,238,0.3)]"
          >
            <Zap size={18} />
          </button>
        </div>
        <p className="text-center text-[9px] text-white/20 mt-3 tracking-widest">
          TRANSMISSION SECURED BY TRELOD PRISM PROTOCOL
        </p>
      </footer>
    </div>
  );
}