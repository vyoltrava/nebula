"use client";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";
import { useWebSocket } from "@/src/hooks/useWebSocket";
import { Send, ArrowLeft, LogOut, Sparkles, Activity } from "lucide-react";
import { extractDataFromImage, reconstructKey, decryptAnchorWithPin } from "@/lib/prismCrypto";

export default function PrismChatPage() {
  const params = useParams();
  const chatId = params?.id as string;
  const router = useRouter();
  
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [chatInfo, setChatInfo] = useState<any>(null);
  const [syncStatus, setSyncStatus] = useState<"syncing" | "active" | "decrypting">("syncing");
  const [particles, setParticles] = useState<Array<{id: number, x: number, delay: number}>>([]);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Генерация частиц фона
  useEffect(() => {
    const newParticles = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 5,
    }));
    setParticles(newParticles);
  }, []);

  // Загрузка данных
  useEffect(() => {
    const token = getToken();
    if (!token) return router.push("/login");
    
    Promise.all([
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(r => r.json()).then(setCurrentUser),
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(r => r.json()).then(data => {
        setChatInfo(data);
        setSyncStatus("decrypting");
      }),
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(r => r.json()).then(data => {
        setMessages(Array.isArray(data) ? data : (data.messages ?? []));
      })
    ]);

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
  }, [chatId, router]);

  // Расшифровка ключа
  useEffect(() => {
    const reconstructPrismKey = async () => {
      if (!chatInfo?.is_prism || messages.length === 0) return;

      try {
        const shard3_local = await extractDataFromImage(chatInfo.avatar_url);
        const genesisMsg = messages.find((m: any) => m.text?.startsWith("__PRISM_GENESIS__:"));
        if (!genesisMsg) throw new Error("Genesis not found");
        const shard2_genesis = genesisMsg.text.replace("__PRISM_GENESIS__:", "");
        
        const pin = prompt(" PRISM AUTH: Введите ключ доступа (PIN):");
        if (!pin) throw new Error("Auth cancelled");
        
        const shard1_decrypted = await decryptAnchorWithPin(chatInfo.prism_anchor, pin);
        const masterKey = reconstructKey(shard1_decrypted, shard2_genesis, shard3_local);
        
        console.log(" PRISM KEY RECONSTRUCTED:", masterKey);
        setSyncStatus("active");
      } catch (err) {
        console.error("❌ DECRYPTION FAILED:", err);
        router.push("/messages");
      }
    };

    if (chatInfo?.is_prism && messages.length > 0 && syncStatus === "decrypting") {
      reconstructPrismKey();
    }
  }, [chatInfo, messages, syncStatus, router]);

  // WebSocket
  useWebSocket("new_message", (data: any) => {
    if (String(data.chat_id) !== String(chatId)) return;
    setMessages(prev => {
      if (prev.some(m => m.id === data.id)) return prev;
      return [...prev, { ...data }];
    });
  });

  const sendMessage = async () => {
    if (sendingRef.current || !text.trim()) return;
    const token = getToken();
    if (!token) return;
    
    sendingRef.current = true;
    const tempText = text.trim();
    setText("");

    try {
      const form = new FormData();
      form.append("text", tempText);
      
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
    } catch (err) {
      console.error(err);
      setText(tempText);
    } finally {
      sendingRef.current = false;
    }
  };

  const leaveChat = async () => {
    if (!confirm("⚠️ TERMINATE PRISM LINK?")) return;
    const token = getToken();
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      router.push("/messages");
    } catch (e) {
      alert("Connection error");
    }
  };

  // Группировка сообщений по времени
  const getTimeGroup = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "NOW";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  return (
    <div ref={containerRef} className="h-screen w-full bg-[#020204] text-white overflow-hidden relative font-mono">
      {/* Квантовые частицы фона */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {particles.map((p) => (
          <div
            key={p.id}
            className="absolute w-px h-px bg-cyan-400/30 rounded-full animate-pulse"
            style={{
              left: `${p.x}%`,
              top: `${(p.id * 2) % 100}%`,
              animationDelay: `${p.delay}s`,
              boxShadow: "0 0 10px rgba(34,211,238,0.5)",
            }}
          />
        ))}
      </div>

      {/* Горизонтальные энергетические линии */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="absolute h-px bg-gradient-to-r from-transparent via-purple-500 to-transparent animate-pulse"
            style={{
              top: `${20 + i * 15}%`,
              animationDelay: `${i * 0.5}s`,
            }}
          />
        ))}
      </div>

      {/* HEADER — минималистичный */}
      <header className="relative z-20 flex items-center justify-between px-6 py-4 bg-gradient-to-b from-[#020204] to-transparent">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push("/messages")}
            className="group flex items-center gap-2 text-cyan-400/60 hover:text-cyan-400 transition-all"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            <span className="text-xs tracking-[0.3em]">BACK</span>
          </button>
          
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${syncStatus === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} 
                 style={{ boxShadow: syncStatus === 'active' ? '0 0 20px rgba(52,211,153,0.8)' : 'none' }} />
            <span className="text-[10px] text-white/40 tracking-[0.4em]">
              {syncStatus === 'active' ? 'ENCRYPTED' : 'SYNCING'}
            </span>
          </div>
        </div>

        <button 
          onClick={leaveChat}
          className="flex items-center gap-2 text-red-400/40 hover:text-red-400 hover:bg-red-500/10 px-3 py-1.5 rounded transition-all"
        >
          <LogOut size={14} />
          <span className="text-[10px] tracking-[0.3em]">TERMINATE</span>
        </button>
      </header>

      {/* ПОТОК СООБЩЕНИЙ — вертикальная временная шкала */}
      <main ref={scrollRef} className="relative z-10 h-[calc(100vh-140px)] overflow-y-auto px-4 md:px-12 py-8">
        <div className="max-w-3xl mx-auto">
          {/* Центральная линия времени */}
          <div className="absolute left-1/2 transform -translate-x-1/2 w-px h-full bg-gradient-to-b from-cyan-500/0 via-cyan-500/30 to-cyan-500/0" />

          {messages.map((msg, idx) => {
            const isMine = msg.sender_id === currentUser?.id;
            const timeGroup = getTimeGroup(msg.created_at);
            const showTime = idx === 0 || getTimeGroup(messages[idx - 1]?.created_at) !== timeGroup;

            return (
              <div key={msg.id} className="relative mb-8">
                {/* Индикатор времени */}
                {showTime && (
                  <div className="flex items-center justify-center mb-6">
                    <div className="px-4 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
                      <span className="text-[10px] text-cyan-400/60 tracking-[0.3em]">{timeGroup}</span>
                    </div>
                  </div>
                )}

                {/* Сообщение */}
                <div className={`flex items-center gap-6 ${isMine ? 'flex-row-reverse' : ''}`}>
                  {/* Точка на линии времени */}
                  <div className={`absolute left-1/2 transform -translate-x-1/2 w-3 h-3 rounded-full border-2 transition-all duration-500 ${
                    isMine 
                      ? 'bg-purple-500 border-purple-400 -translate-x-[calc(50%-3px)]' 
                      : 'bg-cyan-500 border-cyan-400 -translate-x-[calc(50%+3px)]'
                  }`} style={{ boxShadow: isMine ? '0 0 20px rgba(168,85,247,0.6)' : '0 0 20px rgba(34,211,238,0.6)' }} />

                  {/* Контент */}
                  <div className={`w-[calc(50%-30px)] ${isMine ? 'ml-auto' : ''}`}>
                    <div className={`group relative p-5 rounded-2xl backdrop-blur-md transition-all duration-500 hover:scale-[1.02] ${
                      isMine 
                        ? 'bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20' 
                        : 'bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border border-cyan-500/20'
                    }`}>
                      {/* Свечение при наведении */}
                      <div className={`absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none ${
                        isMine ? 'shadow-[0_0_40px_rgba(168,85,247,0.3)]' : 'shadow-[0_0_40px_rgba(34,211,238,0.3)]'
                      }`} />

                      {/* Мета-информация */}
                      <div className="flex items-center gap-2 mb-3 text-[10px] text-white/30 tracking-[0.2em]">
                        <Activity size={10} />
                        <span>{isMine ? 'OUTGOING' : 'INCOMING'}</span>
                        <span className="mx-2">·</span>
                        <span>{new Date(msg.created_at).toLocaleTimeString("ru-RU", {hour: "2-digit", minute:"2-digit"})}</span>
                      </div>

                      {/* Текст сообщения */}
                      <p className="text-sm leading-relaxed text-white/90 whitespace-pre-wrap break-words">
                        {msg.text}
                      </p>

                      {/* Декоративный уголок */}
                      <div className={`absolute top-0 w-8 h-8 border-t border-l rounded-tl-2xl opacity-30 ${
                        isMine ? 'right-0 border-purple-400' : 'left-0 border-cyan-400'
                      }`} />
                    </div>
                  </div>

                  {/* Пустое пространство для баланса */}
                  <div className="w-[calc(50%-30px)]" />
                </div>
              </div>
            );
          })}

          {/* Индикатор ожидания */}
          <div className="flex items-center justify-center gap-3 mt-12 text-cyan-400/30">
            <Sparkles size={14} className="animate-pulse" />
            <span className="text-[10px] tracking-[0.4em]">AWAITING TRANSMISSION</span>
            <Sparkles size={14} className="animate-pulse" />
          </div>
        </div>
      </main>

      {/* INPUT — голографическая панель */}
      <footer className="relative z-20 px-6 pb-6">
        <div className="max-w-3xl mx-auto">
          <div className="relative group">
            {/* Свечение фона */}
            <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/20 via-purple-500/20 to-cyan-500/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            
            <div className="relative flex items-center gap-4 p-2 bg-[#0a0a0f]/80 backdrop-blur-xl border border-white/10 rounded-2xl">
              {/* Индикатор шифрования */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                <div className={`w-1.5 h-1.5 rounded-full ${syncStatus === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                <span className="text-[9px] text-white/40 tracking-[0.2em]">E2EE</span>
              </div>

              {/* Поле ввода */}
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Введите сообщение..."
                className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder-white/20 px-3"
              />

              {/* Кнопка отправки */}
              <button 
                onClick={sendMessage}
                disabled={!text.trim() || syncStatus !== 'active'}
                className="group relative flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-600 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:scale-110 active:scale-95"
              >
                <Send size={18} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                <div className="absolute inset-0 rounded-xl bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </div>
          </div>

          {/* Подпись */}
          <p className="text-center mt-3 text-[9px] text-white/20 tracking-[0.4em]">
            PRISM PROTOCOL v2.0 · QUANTUM ENCRYPTED
          </p>
        </div>
      </footer>

      {/* CSS анимации */}
      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}