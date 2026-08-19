"use client";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";
import { useWebSocket } from "@/src/hooks/useWebSocket";
import { ArrowLeft, Send, ShieldCheck, Lock, Sparkles } from "lucide-react";
import { extractDataFromImage, reconstructKey, decryptAnchorWithPin } from "@/lib/prismCrypto";

export default function PrismChatPage() {
  const params = useParams();
  const chatId = params?.id as string;
  const router = useRouter();
  
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [chatInfo, setChatInfo] = useState<any>(null);
  const [syncStatus, setSyncStatus] = useState<"connecting" | "decrypting" | "entangled">("connecting");
  const [stars, setStars] = useState<Array<{x: number, y: number, size: number, opacity: number, delay: number}>>([]);
  const [newMsgIds, setNewMsgIds] = useState<Set<string>>(new Set());
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Генерация звёзд (меньше, более рассеянные)
  useEffect(() => {
    const newStars = Array.from({ length: 80 }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 1.5 + 0.3,
      opacity: Math.random() * 0.6 + 0.2,
      delay: Math.random() * 5,
    }));
    setStars(newStars);
  }, []);

  // Автопрокрутка вниз
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
        const msgs = Array.isArray(data) ? data : (data.messages ?? []);
        setMessages(msgs);
      })
    ]);
  }, [chatId, router]);

  // Расшифровка
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
        
        const pin = prompt("🔐 Введите PIN-код канала:");
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

  // WebSocket
  useWebSocket("new_message", (data: any) => {
    if (String(data.chat_id) !== String(chatId)) return;
    setMessages(prev => {
      if (prev.some(m => m.id === data.id)) return prev;
      return [...prev, { ...data }];
    });
    // Пометить новое сообщение для анимации
    setNewMsgIds(prev => new Set(prev).add(String(data.id)));
    setTimeout(() => {
      setNewMsgIds(prev => {
        const next = new Set(prev);
        next.delete(String(data.id));
        return next;
      });
    }, 2000);
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
    inputRef.current?.focus();
  };

  const otherUser = chatInfo?.other;
  const isEntangled = syncStatus === "entangled";

  return (
    <div className="h-screen w-full bg-[#05050a] text-white overflow-hidden relative flex flex-col">
      {/* Звёздное небо */}
      <div className="absolute inset-0 pointer-events-none">
        {stars.map((star, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              opacity: star.opacity,
              animation: `twinkle ${3 + Math.random() * 4}s ease-in-out infinite`,
              animationDelay: `${star.delay}s`,
            }}
          />
        ))}
      </div>

      {/* Туманность — очень лёгкая, по краям */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] bg-cyan-600/10 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-indigo-500/5 rounded-full blur-[100px]" />
      </div>

      {/* Сетка/матрица на фоне */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Header */}
      <header className="relative z-30 border-b border-white/5 bg-black/40 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <button 
            onClick={() => router.push("/messages")}
            className="p-2 hover:bg-white/10 rounded-xl transition-colors shrink-0"
            aria-label="Назад"
          >
            <ArrowLeft size={20} />
          </button>
          
          <div className="flex items-center gap-3 flex-1 min-w-0 justify-center">
            {/* Аватар собеседника */}
            {otherUser && (
              <div className="relative shrink-0">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-purple-600 p-[2px]">
                  <div className="w-full h-full rounded-full bg-[#0a0a14] flex items-center justify-center overflow-hidden">
                    {otherUser.avatar_url ? (
                      <img src={otherUser.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs font-bold">{otherUser.display_name?.[0] || '?'}</span>
                    )}
                  </div>
                </div>
                {isEntangled && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0a0a14] animate-pulse" />
                )}
              </div>
            )}

            <div className="min-w-0 text-left">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm truncate">
                  {otherUser?.display_name || "Prism Channel"}
                </p>
                <Lock size={12} className="text-cyan-400 shrink-0" />
              </div>
              <p className="text-[11px] text-white/50 truncate flex items-center gap-1.5">
                <ShieldCheck size={10} className="text-cyan-400" />
                {isEntangled ? "Квантовый канал защищён" : "Установка связи..."}
              </p>
            </div>
          </div>
          
          {/* Статус */}
          <div className={`shrink-0 px-3 py-1.5 rounded-full border flex items-center gap-1.5 transition-all ${
            isEntangled 
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
              : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${isEntangled ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-pulse'}`} />
            <span className="text-[10px] font-semibold tracking-wider uppercase">
              {isEntangled ? 'Entangled' : 'Syncing'}
            </span>
          </div>
        </div>

        {/* Квантовая линия-разделитель */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />
      </header>

      {/* Область сообщений */}
      <div 
        ref={scrollContainerRef}
        className="relative z-20 flex-1 overflow-y-auto"
      >
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-1">
          
          {/* Начальный блок "Entanglement established" */}
          {messages.length > 0 && isEntangled && (
            <div className="flex justify-center my-6">
              <div className="px-4 py-2 rounded-full bg-white/5 border border-cyan-500/20 backdrop-blur-md flex items-center gap-2">
                <Sparkles size={12} className="text-cyan-400" />
                <span className="text-[11px] text-cyan-200/80 tracking-wide">
                  Квантовая запутанность установлена
                </span>
                <Sparkles size={12} className="text-purple-400" />
              </div>
            </div>
          )}

          {/* Сообщения */}
          {messages.filter(m => !m.text?.startsWith("__PRISM_GENESIS__:")).map((msg, index) => {
            const isMine = msg.sender_id === currentUser?.id;
            const isNew = newMsgIds.has(String(msg.id));
            
            // Проверка: предыдущее сообщение от того же отправителя?
            const filteredMsgs = messages.filter(m => !m.text?.startsWith("__PRISM_GENESIS__:"));
            const prevMsg = index > 0 ? filteredMsgs[index - 1] : null;
            const isFirstInGroup = !prevMsg || prevMsg.sender_id !== msg.sender_id;

            return (
              <div
                key={msg.id}
                className={`flex ${isMine ? 'justify-end' : 'justify-start'} ${isFirstInGroup ? 'mt-4' : 'mt-0.5'}`}
              >
                {/* Аватар собеседника (только в начале группы) */}
                {!isMine && (
                  <div className="shrink-0 w-8">
                    {isFirstInGroup && (
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500/30 to-cyan-500/10 border border-cyan-500/30 flex items-center justify-center overflow-hidden">
                        {otherUser?.avatar_url ? (
                          <img src={otherUser.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px] font-bold text-cyan-300">
                            {otherUser?.display_name?.[0] || '?'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Сообщение */}
                <div className={`max-w-[75%] md:max-w-[65%] ${isMine ? 'items-end' : 'items-start'} flex flex-col ${isMine ? 'mr-1' : 'ml-2'}`}>
                  {isFirstInGroup && !isMine && (
                    <p className="text-[11px] text-cyan-300/70 mb-1 ml-1 font-medium">
                      {otherUser?.display_name}
                    </p>
                  )}
                  
                  <div
                    className={`
                      relative px-4 py-2.5 backdrop-blur-md border transition-all duration-300
                      ${isMine 
                        ? 'bg-gradient-to-br from-purple-600/30 to-purple-800/20 border-purple-400/30 rounded-2xl rounded-tr-md' 
                        : 'bg-gradient-to-br from-cyan-600/20 to-cyan-900/10 border-cyan-400/25 rounded-2xl rounded-tl-md'
                      }
                      ${isNew ? 'ring-2 ring-cyan-400/50 shadow-[0_0_20px_rgba(34,211,238,0.3)]' : ''}
                    `}
                    style={{
                      animation: isNew ? 'msgAppear 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' : undefined,
                    }}
                  >
                    {/* Декоративный угловой акцент */}
                    <div className={`absolute top-0 ${isMine ? 'right-0' : 'left-0'} w-16 h-px ${
                      isMine 
                        ? 'bg-gradient-to-l from-purple-400/60 to-transparent' 
                        : 'bg-gradient-to-r from-cyan-400/60 to-transparent'
                    }`} />

                    <p className="text-[14px] leading-relaxed text-white/95 break-words whitespace-pre-wrap">
                      {msg.text}
                    </p>
                    
                    <p className={`text-[10px] mt-1 ${isMine ? 'text-purple-200/50 text-right' : 'text-cyan-200/50'}`}>
                      {new Date(msg.created_at).toLocaleTimeString("ru-RU", {
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </p>
                  </div>
                </div>

                {/* Пустой spacer для своих сообщений */}
                {isMine && <div className="shrink-0 w-8" />}
              </div>
            );
          })}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Пустое состояние */}
        {messages.filter(m => !m.text?.startsWith("__PRISM_GENESIS__:")).length === 0 && isEntangled && (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="relative w-24 h-24 mb-6">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-cyan-500 to-purple-600 blur-2xl opacity-40 animate-pulse" />
              <div className="relative w-full h-full rounded-full bg-gradient-to-br from-cyan-500/20 to-purple-600/20 border border-white/10 flex items-center justify-center">
                <ShieldCheck size={36} className="text-cyan-300" />
              </div>
            </div>
            <h2 className="text-xl font-semibold mb-2 bg-gradient-to-r from-cyan-300 to-purple-300 bg-clip-text text-transparent">
              Канал активен
            </h2>
            <p className="text-sm text-white/50 max-w-sm">
              Сообщения здесь защищены сквозным шифрованием с разделением ключа на три спектра. Отправьте первое сообщение.
            </p>
          </div>
        )}
      </div>

      {/* Поле ввода */}
      <div className="relative z-30 border-t border-white/5 bg-black/60 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto p-3 md:p-4">
          {/* Индикатор безопасности */}
          <div className="flex items-center gap-1.5 mb-2 px-1">
            <Lock size={10} className="text-cyan-400/70" />
            <span className="text-[10px] text-white/40 tracking-wide">
              End-to-end encrypted · Prism Protocol
            </span>
          </div>

          <div className="flex items-end gap-2 bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-2xl p-2 focus-within:border-cyan-500/40 transition-colors">
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Напишите сообщение..."
              className="flex-1 bg-transparent border-none outline-none text-white placeholder-white/30 resize-none text-sm px-2 py-1.5"
              rows={1}
              style={{ minHeight: '40px', maxHeight: '120px' }}
              disabled={!isEntangled}
            />
            <button 
              onClick={sendMessage}
              disabled={!text.trim() || !isEntangled}
              className="shrink-0 p-2.5 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-600 disabled:opacity-30 disabled:cursor-not-allowed hover:shadow-[0_0_20px_rgba(34,211,238,0.4)] active:scale-95 transition-all"
              aria-label="Отправить"
            >
              <Send size={18} className="text-white" />
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.9; }
        }
        @keyframes msgAppear {
          0% { 
            opacity: 0; 
            transform: translateY(8px) scale(0.95);
          }
          100% { 
            opacity: 1; 
            transform: translateY(0) scale(1);
          }
        }
        
        /* Тонкий скроллбар */
        div::-webkit-scrollbar {
          width: 6px;
        }
        div::-webkit-scrollbar-track {
          background: transparent;
        }
        div::-webkit-scrollbar-thumb {
          background: rgba(139, 92, 246, 0.3);
          border-radius: 3px;
        }
        div::-webkit-scrollbar-thumb:hover {
          background: rgba(139, 92, 246, 0.5);
        }
      `}</style>
    </div>
  );
}