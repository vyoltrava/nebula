"use client";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";
import { useWebSocket } from "@/src/hooks/useWebSocket";
import { ArrowLeft, Send, ShieldCheck, Star } from "lucide-react";
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
  const [stars, setStars] = useState<Array<{x: number, y: number, size: number, opacity: number}>>([]);
  const [rotation, setRotation] = useState(0);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Генерация звёзд
  useEffect(() => {
    const newStars = Array.from({ length: 150 }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2 + 0.5,
      opacity: Math.random() * 0.8 + 0.2,
    }));
    setStars(newStars);
  }, []);

  // Анимация вращения
  useEffect(() => {
    let frame: number;
    const animate = () => {
      setRotation(r => (r + 0.05) % 360);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
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

  // Расчёт позиции сообщения в спирали
  const getSpiralPosition = (index: number, total: number) => {
    const angle = (index / total) * Math.PI * 4; // 2 полных оборота
    const radius = 80 + (index / total) * 300; // от 80px до 380px
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    return { x, y, angle: (angle * 180) / Math.PI };
  };

  return (
    <div 
      ref={containerRef}
      className="h-screen w-full bg-black text-white overflow-hidden relative"
    >
      {/* Звёздное небо */}
      <div className="absolute inset-0">
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
              animation: `twinkle ${2 + Math.random() * 3}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 2}s`,
            }}
          />
        ))}
      </div>

      {/* Туманность */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-600/20 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-50 p-4 flex items-center justify-between">
        <button 
          onClick={() => router.push("/messages")}
          className="p-2 hover:bg-white/10 rounded-full transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        
        <div className={`px-3 py-1.5 rounded-full border backdrop-blur-md ${
          syncStatus === 'entangled' 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
            : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
        }`}>
          <span className="text-xs tracking-wider">
            {syncStatus === 'entangled' ? '🌌 ENTANGLED' : ' DECRYPTING...'}
          </span>
        </div>
      </header>

      {/* Спираль сообщений */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div 
          className="relative"
          style={{ 
            transform: `rotate(${rotation}deg)`,
            transition: 'transform 0.1s linear'
          }}
        >
          {messages.map((msg, index) => {
            const { x, y, angle } = getSpiralPosition(index, messages.length);
            const isMine = msg.sender_id === currentUser?.id;
            
            return (
              <div
                key={msg.id}
                className="absolute"
                style={{
                  left: `${x}px`,
                  top: `${y}px`,
                  transform: `rotate(${-angle - rotation}deg)`,
                }}
              >
                <div className={`px-4 py-3 rounded-2xl backdrop-blur-md border max-w-xs ${
                  isMine 
                    ? 'bg-purple-600/30 border-purple-400/50' 
                    : 'bg-cyan-600/30 border-cyan-400/50'
                }`}>
                  <p className="text-sm text-white/90 break-words">
                    {msg.text}
                  </p>
                  <p className="text-[10px] text-white/40 mt-1">
                    {new Date(msg.created_at).toLocaleTimeString("ru-RU", {
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </p>
                </div>
              </div>
            );
          })}

          {/* Центральное ядро */}
          <div className="absolute -translate-x-1/2 -translate-y-1/2 left-1/2 top-1/2">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-400 to-purple-600 shadow-[0_0_60px_rgba(139,92,246,0.6)] flex items-center justify-center">
              <ShieldCheck size={32} className="text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Поле ввода */}
      <div className="absolute bottom-0 left-0 right-0 p-4 z-50">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-end gap-2 bg-black/60 backdrop-blur-md border border-white/20 rounded-2xl p-3">
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
              placeholder="Отправить сообщение в космос..."
              className="flex-1 bg-transparent border-none outline-none text-white placeholder-white/40 resize-none"
              rows={1}
              style={{ minHeight: '40px' }}
            />
            <button 
              onClick={sendMessage}
              disabled={!text.trim()}
              className="p-2 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-600 disabled:opacity-30 hover:scale-110 transition-transform"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}