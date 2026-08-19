"use client";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";
import { useWebSocket } from "@/src/hooks/useWebSocket";
import { ArrowLeft } from "lucide-react";
import { extractDataFromImage, reconstructKey, decryptAnchorWithPin } from "@/lib/prismCrypto";

export default function PrismChatPage() {
  const params = useParams();
  const chatId = params?.id as string;
  const router = useRouter();
  
  const [messages, setMessages] = useState<any[]>([]);
  const [chatInfo, setChatInfo] = useState<any>(null); // ✅ ДОБАВЛЕНО
  const [currentIndex, setCurrentIndex] = useState(0);
  const [text, setText] = useState("");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [syncStatus, setSyncStatus] = useState<"connecting" | "decrypting" | "entangled">("connecting");
  const [showInput, setShowInput] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  // 1. Загрузка данных
  useEffect(() => {
    const token = getToken();
    if (!token) return router.push("/login");
    
    Promise.all([
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(r => r.json()).then(setCurrentUser),
      
      // ✅ ИСПРАВЛЕНО: теперь мы реально сохраняем chatInfo
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
        setCurrentIndex(msgs.length > 0 ? msgs.length - 1 : 0);
        setSyncStatus("entangled");
      })
    ]);
  }, [chatId, router]);

  // 2. Расшифровка ключа
  useEffect(() => {
    const reconstructPrismKey = async () => {
      // ✅ ТЕПЕРЬ ЭТО РАБОТАЕТ, так как chatInfo определен
      if (!chatInfo?.is_prism || messages.length === 0) {
        setSyncStatus("entangled");
        return;
      }

      const cachedKeyBase64 = sessionStorage.getItem(`prism_key_${chatId}`);
      if (cachedKeyBase64) {
        console.log("✅ Ключ восстановлен из кэша");
        setSyncStatus("entangled");
        return;
      }

      try {
        setSyncStatus("decrypting");
        
        const shard3_local = await extractDataFromImage(chatInfo.avatar_url);
        
        const genesisMsg = messages.find((m: any) => m.text?.startsWith("__PRISM_GENESIS__:"));
        if (!genesisMsg) throw new Error("Genesis message not found");
        const shard2_genesis = genesisMsg.text.replace("__PRISM_GENESIS__:", "");
        
        const pin = prompt("🔐 QUANTUM AUTH: Введите ключ доступа (PIN):");
        if (!pin) throw new Error("PIN отменен");
        
        const shard1_decrypted = await decryptAnchorWithPin(chatInfo.prism_anchor, pin);
        const masterKey = reconstructKey(shard1_decrypted, shard2_genesis, shard3_local);
        
        const masterKeyBase64 = btoa(String.fromCharCode(...masterKey));
        sessionStorage.setItem(`prism_key_${chatId}`, masterKeyBase64);
        
        console.log("✅ Ключ Призмы успешно восстановлен и закэширован!");
        setSyncStatus("entangled");
        
      } catch (err: any) {
        console.error("❌ Ошибка реконструкции ключа:", err);
        alert("Не удалось расшифровать канал. Проверьте PIN-код или целостность аватарки.");
        router.push("/messages");
      }
    };

    if (chatInfo && messages.length > 0 && syncStatus === "decrypting") {
      reconstructPrismKey();
    }
  }, [chatInfo, messages, syncStatus, router, chatId]);

  // 3. WebSocket
  useWebSocket("new_message", (data: any) => {
    if (String(data.chat_id) !== String(chatId)) return;
    setMessages(prev => {
      if (prev.some(m => m.id === data.id)) return prev;
      const newMessages = [...prev, { ...data }];
      setCurrentIndex(newMessages.length - 1);
      return newMessages;
    });
  });

  // 4. Обработка свайпов (с защитой от textarea)
  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    // ✅ ИГНОРИРУЕМ свайпы, если кликнули по полю ввода
    if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    touchStartX.current = clientX;
    touchStartY.current = clientY;

    longPressTimer.current = setTimeout(() => {
      setShowInput(true);
    }, 500);
  };

  const handleTouchEnd = (e: React.TouchEvent | React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;

    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    const clientX = 'changedTouches' in e ? e.changedTouches[0].clientX : e.clientX;
    const clientY = 'changedTouches' in e ? e.changedTouches[0].clientY : e.clientY;
    
    const deltaX = clientX - touchStartX.current;
    const deltaY = clientY - touchStartY.current;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    if (absDeltaX > absDeltaY && absDeltaX > 50) {
      if (deltaX < 0) {
        if (currentIndex < messages.length - 1) setCurrentIndex(currentIndex + 1);
      } else {
        if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
      }
    } else if (absDeltaY > absDeltaX && absDeltaY > 50) {
      if (deltaY > 0) {
        if (confirm("Выйти из чата?")) router.push("/messages");
      } else {
        setShowInput(true);
      }
    }
  };

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
    setShowInput(false);
  };

  const currentMessage = messages[currentIndex];
  const progress = messages.length > 0 ? ((currentIndex + 1) / messages.length) * 100 : 0;

  return (
    <div 
      ref={containerRef}
      className="h-screen w-full bg-[#000] text-white overflow-hidden relative select-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleTouchStart}
      onMouseUp={handleTouchEnd}
    >
      <button 
        onClick={() => router.push("/messages")}
        className="absolute top-4 left-4 z-50 p-2 md:hidden"
      >
        <ArrowLeft size={20} className="text-white/60" />
      </button>

      <div className="absolute top-0 left-0 right-0 h-1 bg-white/10 z-40">
        <div 
          className="h-full bg-gradient-to-r from-cyan-500 to-purple-600 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="absolute top-4 right-4 flex items-center gap-2 z-50">
        <div className={`w-2 h-2 rounded-full ${syncStatus === 'entangled' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
        <span className="text-[10px] text-white/40 tracking-wider hidden md:block">
          {syncStatus === 'entangled' ? 'ENTANGLED' : 'SYNCING'}
        </span>
      </div>

      {currentMessage && (
        <div className="absolute inset-0 flex items-center justify-center px-8 md:px-16">
          <div className="max-w-3xl w-full">
            <div className="flex items-center justify-between mb-6 text-xs text-white/40">
              <span>{currentMessage.sender_id === currentUser?.id ? 'YOU' : 'THEM'}</span>
              <span>{currentIndex + 1} / {messages.length}</span>
            </div>

            <p className="text-2xl md:text-4xl leading-relaxed font-light whitespace-pre-wrap break-words">
              {currentMessage.text}
            </p>

            <div className="mt-8 text-xs text-white/30">
              {new Date(currentMessage.created_at).toLocaleString("ru-RU", {
                day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
              })}
            </div>
          </div>
        </div>
      )}

      {messages.length === 0 && syncStatus === 'entangled' && (
        <div className="absolute inset-0 flex items-center justify-center text-center px-8">
          <div>
            <p className="text-lg text-white/60 mb-4">Нет сообщений</p>
            <p className="text-sm text-white/30">Свайп вверх чтобы написать</p>
          </div>
        </div>
      )}

      <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-8 text-xs text-white/30 hidden md:flex">
        <span>← Свайп вправо: назад</span>
        <span>↑ Свайп вверх: написать</span>
        <span>→ Свайп влево: вперёд</span>
        <span>↓ Свайп вниз: выход</span>
      </div>

      {showInput && (
        <div className="absolute inset-0 z-50 flex items-end bg-black/80 backdrop-blur-md">
          <div className="w-full p-6 md:p-12">
            <div className="max-w-3xl mx-auto">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                  if (e.key === 'Escape') setShowInput(false);
                }}
                placeholder="Написать сообщение..."
                className="w-full bg-transparent border-b-2 border-white/20 focus:border-cyan-500 outline-none text-xl md:text-2xl text-white placeholder-white/30 resize-none py-4 transition-colors"
                rows={3}
                autoFocus
              />
              <div className="flex items-center justify-between mt-6">
                <button onClick={() => setShowInput(false)} className="text-sm text-white/40 hover:text-white transition-colors">
                  Отмена (Esc)
                </button>
                <button
                  onClick={sendMessage}
                  disabled={!text.trim()}
                  className="px-6 py-2 rounded-full bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105 transition-transform"
                >
                  Отправить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}