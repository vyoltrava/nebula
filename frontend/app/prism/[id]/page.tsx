"use client";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";
import { useWebSocket } from "@/src/hooks/useWebSocket";
import { ArrowLeft, Send, ShieldCheck, Lock, Sparkles, Zap } from "lucide-react";
import { extractDataFromImage, reconstructKey, decryptAnchorWithPin } from "@/lib/prismCrypto";

export default function PrismChatPage() {
  const params = useParams();
  const chatId = params?.id as string;
  const router = useRouter();
  
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [chatInfo, setChatInfo] = useState<any>(null);
  const [syncStatus, setSyncStatus] = useState<"connecting" | "decrypting" | "entangled">("connecting");
  const [lightParticles, setLightParticles] = useState<Array<{id: number, x: number, y: number, size: number, color: string, delay: number}>>([]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Генерация световых частиц
  useEffect(() => {
    const colors = ['#06b6d4', '#8b5cf6', '#ec4899', '#22d3ee', '#a855f7'];
    const particles = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 5,
    }));
    setLightParticles(particles);
  }, []);

  useEffect(() => {
    if (isInputOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isInputOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
        const msgs = Array.isArray(data) ? data : (data.messages ?? []);
        setMessages(msgs);
      })
    ]);
  }, [chatId, router]);

  useEffect(() => {
    const reconstructPrismKey = async () => {
      if (!chatInfo?.is_prism || messages.length === 0) {
        setSyncStatus("entangled");
        return;
      }

      const cachedKey = sessionStorage.getItem(`prism_key_${chatId}`);
      if (cachedKey) {
        setSyncStatus("entangled");
        return;
      }

      try {
        setSyncStatus("decrypting");
        const shard3 = await extractDataFromImage(chatInfo.avatar_url);
        const genesisMsg = messages.find((m: any) => m.text?.startsWith("__PRISM_GENESIS__:"));
        if (!genesisMsg) throw new Error("Genesis not found");
        const shard2 = genesisMsg.text.replace("__PRISM_GENESIS__:", "");
        
        const pin = prompt("🔐 PIN-код канала:");
        if (!pin) throw new Error("Cancelled");
        
        const shard1 = await decryptAnchorWithPin(chatInfo.prism_anchor, pin);
        const masterKey = reconstructKey(shard1, shard2, shard3);
        
        sessionStorage.setItem(`prism_key_${chatId}`, btoa(String.fromCharCode(...masterKey)));
        setSyncStatus("entangled");
      } catch (err) {
        console.error(err);
        router.push("/messages");
      }
    };

    if (chatInfo?.is_prism && messages.length > 0 && syncStatus === "decrypting") {
      reconstructPrismKey();
    }
  }, [chatInfo, messages, syncStatus, chatId, router]);

  useWebSocket("new_message", (data: any) => {
    if (String(data.chat_id) !== String(chatId)) return;
    setMessages(prev => {
      if (prev.some(m => m.id === data.id)) return prev;
      return [...prev, { ...data }];
    });
  });

  const sendMessage = async () => {
    if (!text.trim()) return;
    const token = getToken();
    if (!token) return;

    const form = new FormData();
    form.append("text", text.trim());
    
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    
    setText("");
    setIsInputOpen(false);
  };

  const otherUser = chatInfo?.other;
  const isEntangled = syncStatus === "entangled";

  return (
    <div className="h-screen w-full bg-black text-white overflow-hidden relative flex flex-col">
      {/* Призматический фон с лучами */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Центральные лучи света */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] opacity-30">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="absolute top-1/2 left-1/2 w-px h-[600px] origin-top animate-pulse"
              style={{
                background: `linear-gradient(to bottom, ${['#06b6d4', '#8b5cf6', '#ec4899'][i % 3]}, transparent)`,
                transform: `translate(-50%, -100%) rotate(${i * 45}deg)`,
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </div>

        {/* Градиентные кольца */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-cyan-500/10 rounded-full animate-ping" style={{ animationDuration: '4s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] border border-purple-500/10 rounded-full animate-ping" style={{ animationDuration: '3s', animationDelay: '0.5s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] border border-pink-500/10 rounded-full animate-ping" style={{ animationDuration: '2s', animationDelay: '1s' }} />

        {/* Летающие частицы света */}
        {lightParticles.map((p) => (
          <div
            key={p.id}
            className="absolute rounded-full animate-float"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              background: p.color,
              boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
              animation: `float ${6 + Math.random() * 4}s ease-in-out infinite`,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}
      </div>

      {/* Header */}
      <header className="relative z-30 p-4 flex items-center justify-between backdrop-blur-md bg-black/20">
        <button 
          onClick={() => router.push("/messages")}
          className="p-2 hover:bg-white/10 rounded-full transition-all"
        >
          <ArrowLeft size={20} />
        </button>
        
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-purple-600 p-[1px]">
            <div className="w-full h-full rounded-full bg-black flex items-center justify-center">
              {otherUser?.avatar_url ? (
                <img src={otherUser.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
              ) : (
                <span className="text-xs font-bold">{otherUser?.display_name?.[0] || '?'}</span>
              )}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold">{otherUser?.display_name || "Prism"}</p>
            <p className="text-[10px] text-cyan-400 flex items-center gap-1">
              <ShieldCheck size={8} />
              {isEntangled ? 'Защищено' : 'Шифрование...'}
            </p>
          </div>
        </div>

        <div className="w-8" />
      </header>

      {/* Сообщения как кристаллы/призмы */}
      <div className="relative z-20 flex-1 overflow-y-auto px-4 py-8 space-y-6">
        {messages.filter(m => !m.text?.startsWith("__PRISM_GENESIS__:")).map((msg, index) => {
          const isMine = msg.sender_id === currentUser?.id;
          const time = new Date(msg.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
          
          return (
            <div
              key={msg.id}
              className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
              style={{
                animation: `crystalAppear 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) ${index * 0.05}s both`,
              }}
            >
              <div className={`
                relative max-w-[80%] px-5 py-3 
                backdrop-blur-xl border 
                transform transition-all hover:scale-105
                ${isMine 
                  ? 'bg-gradient-to-br from-purple-600/40 to-cyan-600/20 border-purple-400/40 rounded-2xl rounded-tr-sm' 
                  : 'bg-gradient-to-br from-cyan-600/30 to-purple-600/10 border-cyan-400/40 rounded-2xl rounded-tl-sm'
                }
              `}>
                {/* Эффект преломления света */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
                
                {/* Блик */}
                <div className={`absolute top-0 ${isMine ? 'right-2' : 'left-2'} w-12 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent`} />

                <p className="relative text-sm leading-relaxed text-white/95">
                  {msg.text}
                </p>
                
                <p className="relative text-[10px] mt-2 text-white/40 flex items-center gap-1">
                  {time}
                  {isMine && <span className="text-cyan-400">◆</span>}
                </p>

                {/* Угловые акценты */}
                <div className={`absolute -top-px ${isMine ? '-right-px' : '-left-px'} w-3 h-3 border-t border-${isMine ? 'purple' : 'cyan'}-400/60 ${isMine ? 'border-r' : 'border-l'}`} />
              </div>
            </div>
          );
        })}
        
        <div ref={messagesEndRef} />

        {messages.filter(m => !m.text?.startsWith("__PRISM_GENESIS__:")).length === 0 && isEntangled && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="relative w-32 h-32 mb-6">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500 to-purple-600 blur-3xl opacity-40 animate-pulse" />
              <div className="relative w-full h-full flex items-center justify-center">
                <div className="w-20 h-20 border-2 border-cyan-400/30 rounded-full flex items-center justify-center animate-spin" style={{ animationDuration: '10s' }}>
                  <div className="w-16 h-16 border-2 border-purple-400/30 rounded-full flex items-center justify-center animate-spin" style={{ animationDuration: '8s', animationDirection: 'reverse' }}>
                    <Zap size={24} className="text-cyan-300" />
                  </div>
                </div>
              </div>
            </div>
            <h2 className="text-lg font-semibold mb-2 bg-gradient-to-r from-cyan-300 via-purple-300 to-pink-300 bg-clip-text text-transparent">
              Канал активирован
            </h2>
            <p className="text-xs text-white/40 max-w-xs">
              Нажмите на кристалл внизу чтобы отправить сообщение
            </p>
          </div>
        )}
      </div>

      {/* Плавающий кристалл-инпут */}
      <div className="relative z-40 pb-8">
        <div className="flex justify-center">
          {!isInputOpen ? (
            <button
              onClick={() => setIsInputOpen(true)}
              disabled={!isEntangled}
              className="group relative w-16 h-16 disabled:opacity-30"
            >
              {/* Пульсирующие кольца */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-cyan-500 to-purple-600 animate-ping opacity-20" />
              <div className="absolute inset-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-600 animate-ping opacity-20" style={{ animationDelay: '0.5s' }} />
              
              {/* Сам кристалл */}
              <div className="relative w-full h-full rounded-full bg-gradient-to-br from-cyan-400 via-purple-500 to-pink-500 p-[2px] shadow-[0_0_40px_rgba(139,92,246,0.6)] group-hover:shadow-[0_0_60px_rgba(139,92,246,0.8)] transition-all group-hover:scale-110">
                <div className="w-full h-full rounded-full bg-black/40 backdrop-blur-xl flex items-center justify-center">
                  <Send size={24} className="text-white transform -rotate-12 group-hover:rotate-0 transition-transform" />
                </div>
              </div>

              {/* Световые лучи вокруг */}
              <div className="absolute inset-0 rounded-full animate-spin" style={{ animationDuration: '8s' }}>
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="absolute top-0 left-1/2 w-px h-full origin-bottom"
                    style={{
                      background: 'linear-gradient(to bottom, rgba(139,92,246,0.4), transparent)',
                      transform: `translateX(-50%) rotate(${i * 60}deg)`,
                    }}
                  />
                ))}
              </div>
            </button>
          ) : (
            <div 
              className="relative w-full max-w-md mx-4 animate-inputSlide"
              style={{
                animation: 'inputSlide 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}
            >
              {/* Свечение вокруг инпута */}
              <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 rounded-2xl blur opacity-40" />
              
              <div className="relative flex items-end gap-2 bg-black/80 backdrop-blur-2xl border border-white/20 rounded-2xl p-3">
                <textarea
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                    if (e.key === 'Escape') {
                      setIsInputOpen(false);
                      setText("");
                    }
                  }}
                  placeholder="Введите сообщение..."
                  className="flex-1 bg-transparent border-none outline-none text-white placeholder-white/30 resize-none text-sm"
                  rows={1}
                  style={{ minHeight: '40px', maxHeight: '120px' }}
                />
                <button 
                  onClick={sendMessage}
                  disabled={!text.trim()}
                  className="shrink-0 p-2 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-600 disabled:opacity-30 hover:scale-110 transition-transform shadow-lg"
                >
                  <Send size={18} className="text-white" />
                </button>
              </div>

              {/* Подсказка */}
              <p className="text-center text-[10px] text-white/30 mt-2">
                Enter — отправить • Esc — закрыть
              </p>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
        @keyframes crystalAppear {
          0% { 
            opacity: 0; 
            transform: translateY(20px) scale(0.9) rotateX(-15deg);
          }
          100% { 
            opacity: 1; 
            transform: translateY(0) scale(1) rotateX(0deg);
          }
        }
        @keyframes inputSlide {
          0% {
            opacity: 0;
            transform: scale(0.8) translateY(20px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );
}