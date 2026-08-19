"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";
import { useWebSocket } from "@/src/hooks/useWebSocket";
import { ArrowLeft, Send, ShieldCheck, Sparkles } from "lucide-react";
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
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [scrollY, setScrollY] = useState(0);

  // 1. Загрузка данных
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
        // Небольшая задержка, чтобы DOM отрисовался перед скроллом вниз
        setTimeout(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
        }, 100);
      })
    ]);
  }, [chatId, router]);

  // 2. Расшифровка ключа с кэшированием
  useEffect(() => {
    const reconstructPrismKey = async () => {
      if (!chatInfo?.is_prism || messages.length === 0) {
        setSyncStatus("entangled");
        return;
      }

      const cachedKeyBase64 = sessionStorage.getItem(`prism_key_${chatId}`);
      if (cachedKeyBase64) {
        setSyncStatus("entangled");
        return;
      }

      try {
        setSyncStatus("decrypting");
        const shard3_local = await extractDataFromImage(chatInfo.avatar_url);
        
        const genesisMsg = messages.find((m: any) => m.text?.startsWith("__PRISM_GENESIS__:"));
        if (!genesisMsg) throw new Error("Genesis not found");
        const shard2_genesis = genesisMsg.text.replace("__PRISM_GENESIS__:", "");
        
        const pin = prompt("🔐 QUANTUM AUTH: Введите ключ доступа (PIN):");
        if (!pin) throw new Error("PIN отменен");
        
        const shard1_decrypted = await decryptAnchorWithPin(chatInfo.prism_anchor, pin);
        const masterKey = reconstructKey(shard1_decrypted, shard2_genesis, shard3_local);
        
        sessionStorage.setItem(`prism_key_${chatId}`, btoa(String.fromCharCode(...masterKey)));
        setSyncStatus("entangled");
      } catch (err) {
        console.error("❌ DECRYPTION FAILED:", err);
        router.push("/messages");
      }
    };

    if (chatInfo?.is_prism && messages.length > 0 && syncStatus === "decrypting") {
      reconstructPrismKey();
    }
  }, [chatInfo, messages, syncStatus, chatId, router]);

  // 3. WebSocket
  useWebSocket("new_message", (data: any) => {
    if (String(data.chat_id) !== String(chatId)) return;
    setMessages(prev => {
      if (prev.some(m => m.id === data.id)) return prev;
      const newMsgs = [...prev, { ...data }];
      // Автоскролл к новому сообщению
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
        }
      }, 50);
      return newMsgs;
    });
  });

  // 4. Математика 4D-скролла
  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      setScrollY(scrollRef.current.scrollTop);
    }
  }, []);

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
    // Возвращаем фокус на поле ввода
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div className="h-screen w-full bg-[#050508] text-white overflow-hidden relative font-sans">
      {/* Фоновая сетка 4D-пространства */}
      <div className="absolute inset-0 pointer-events-none opacity-20" 
           style={{ 
             backgroundImage: `linear-gradient(rgba(34, 211, 238, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(34, 211, 238, 0.1) 1px, transparent 1px)`,
             backgroundSize: '40px 40px',
             transform: `translateY(${scrollY * 0.1}px)` // Параллакс фона
           }} 
      />

      {/* HEADER */}
      <header className="absolute top-0 left-0 right-0 z-50 p-4 flex items-center justify-between bg-gradient-to-b from-[#050508] to-transparent">
        <button onClick={() => router.push("/messages")} className="p-2 hover:bg-white/10 rounded-full transition-colors">
          <ArrowLeft size={20} className="text-white/70" />
        </button>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md">
          <div className={`w-2 h-2 rounded-full ${syncStatus === 'entangled' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
          <span className="text-[10px] text-white/50 tracking-widest uppercase">
            {syncStatus === 'entangled' ? 'Entangled' : 'Syncing'}
          </span>
        </div>
      </header>

      {/* 4D MESSAGE STREAM */}
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full w-full overflow-y-auto overflow-x-hidden px-4 md:px-0"
        style={{ perspective: "1000px" }}
      >
        <div className="max-w-2xl mx-auto py-[50vh] space-y-12"> {/* Большие отступы сверху и снизу для эффекта туннеля */}
          {messages.map((msg, index) => {
            const isMine = msg.sender_id === currentUser?.id;
            
            // Вычисляем позицию сообщения относительно центра экрана
            // 50vh - это примерный центр контейнера
            const messageCenterY = (index * 120) + 60; // Примерная высота блока + margin
            const distance = Math.abs(scrollY + (window.innerHeight / 2) - messageCenterY);
            
            // 4D Математика: чем дальше от центра, тем меньше масштаб, больше размытие и ниже прозрачность
            const maxDistance = 600; // Дистанция, на которой сообщение исчезает
            const progress = Math.min(distance / maxDistance, 1);
            
            const scale = 1 - (progress * 0.4); // Уменьшается до 60%
            const blur = progress * 8; // Размытие до 8px
            const opacity = 1 - (progress * 0.8); // Прозрачность до 20%
            const rotateX = (scrollY - messageCenterY) * 0.02; // Легкий наклон для 3D-эффекта

            return (
              <div
                key={msg.id}
                className={`relative flex w-full transition-all duration-300 ease-out ${isMine ? 'justify-end' : 'justify-start'}`}
                style={{
                  transform: `translateZ(${-distance * 0.5}px) scale(${scale}) rotateX(${rotateX}deg)`,
                  filter: `blur(${blur}px)`,
                  opacity: opacity,
                  zIndex: Math.floor(100 - distance),
                }}
              >
                <div className={`max-w-[85%] md:max-w-[70%] p-5 rounded-2xl backdrop-blur-xl border transition-colors ${
                  isMine 
                    ? 'bg-purple-500/10 border-purple-500/30 rounded-br-none' 
                    : 'bg-cyan-500/10 border-cyan-500/30 rounded-bl-none'
                }`}>
                  {/* Мета-данные (время) */}
                  <div className="flex items-center gap-2 mb-2 text-[10px] text-white/40 uppercase tracking-wider">
                    <span>{isMine ? 'Outgoing' : 'Incoming'}</span>
                    <span>•</span>
                    <span>{new Date(msg.created_at).toLocaleTimeString("ru-RU", {hour: "2-digit", minute:"2-digit"})}</span>
                  </div>
                  
                  {/* Текст сообщения */}
                  <p className="text-base md:text-lg leading-relaxed text-white/90 whitespace-pre-wrap break-words">
                    {msg.text}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* INPUT CONSOLE (W-Dimension: появляется и адаптируется) */}
      <div className="absolute bottom-0 left-0 right-0 z-50 p-4 md:p-6 bg-gradient-to-t from-[#050508] via-[#050508] to-transparent">
        <div className="max-w-2xl mx-auto">
          <div className="relative group">
            {/* Свечение при фокусе */}
            <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-2xl opacity-0 group-focus-within:opacity-50 blur transition-opacity duration-500" />
            
            <div className="relative flex items-end gap-3 p-2 bg-[#0a0a0f]/90 backdrop-blur-xl border border-white/10 rounded-2xl">
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
                placeholder="Введите сообщение..."
                className="flex-1 bg-transparent border-none outline-none text-white placeholder-white/30 resize-none py-3 px-3 max-h-32 min-h-[48px]"
                rows={1}
                style={{ height: 'auto', minHeight: '48px' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = Math.min(target.scrollHeight, 128) + 'px';
                }}
              />
              <button 
                onClick={sendMessage}
                disabled={!text.trim()}
                className="mb-1 p-3 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-600 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105 active:scale-95 transition-all shadow-lg shadow-purple-500/20"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
          <p className="text-center mt-3 text-[9px] text-white/20 tracking-[0.3em] flex items-center justify-center gap-2">
            <ShieldCheck size={10} /> PRISM PROTOCOL v2.0
          </p>
        </div>
      </div>
    </div>
  );
}