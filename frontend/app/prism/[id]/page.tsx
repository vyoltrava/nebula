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
  const [currentIndex, setCurrentIndex] = useState(0);
  const [text, setText] = useState("");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [syncStatus, setSyncStatus] = useState<"connecting" | "decrypting" | "entangled">("connecting");
  const [showInput, setShowInput] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

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
        setSyncStatus("decrypting");
      }),
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(r => r.json()).then(data => {
        const msgs = Array.isArray(data) ? data : (data.messages ?? []);
        setMessages(msgs);
        setCurrentIndex(msgs.length - 1); // Показываем последнее
        setSyncStatus("entangled");
      })
    ]);
  }, [chatId, router]);

  // PIN с кэшированием
  useEffect(() => {
    const reconstructPrismKey = async () => {
      if (syncStatus !== "decrypting") return;

      const cachedKey = sessionStorage.getItem(`prism_key_${chatId}`);
      if (cachedKey) {
        setSyncStatus("entangled");
        return;
      }

      try {
        const chatInfo = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}`, {
          headers: { Authorization: `Bearer ${getToken()}` }
        }).then(r => r.json());

        const shard3_local = await extractDataFromImage(chatInfo.avatar_url);
        const genesisMsg = messages.find((m: any) => m.text?.startsWith("__PRISM_GENESIS__:"));
        if (!genesisMsg) throw new Error("Genesis not found");
        const shard2_genesis = genesisMsg.text.replace("__PRISM_GENESIS__:", "");
        
        const pin = prompt("🔐 PIN:");
        if (!pin) throw new Error("PIN cancelled");
        
        const shard1_decrypted = await decryptAnchorWithPin(chatInfo.prism_anchor, pin);
        const masterKey = reconstructKey(shard1_decrypted, shard2_genesis, shard3_local);
        
        sessionStorage.setItem(`prism_key_${chatId}`, masterKey);
        setSyncStatus("entangled");
      } catch (err) {
        console.error("❌ DECRYPTION FAILED:", err);
        router.push("/messages");
      }
    };

    if (syncStatus === "decrypting" && messages.length > 0) {
      reconstructPrismKey();
    }
  }, [syncStatus, messages, chatId, router]);

  // WebSocket
  useWebSocket("new_message", (data: any) => {
    if (String(data.chat_id) !== String(chatId)) return;
    setMessages(prev => {
      if (prev.some(m => m.id === data.id)) return prev;
      const newMessages = [...prev, { ...data }];
      setCurrentIndex(newMessages.length - 1); // Автопереход к новому
      return newMessages;
    });
  });

  // Свайпы
  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    touchStartX.current = clientX;
    touchStartY.current = clientY;

    // Долгое нажатие = показать инпут
    longPressTimer.current = setTimeout(() => {
      setShowInput(true);
    }, 500);
  };

  const handleTouchEnd = (e: React.TouchEvent | React.MouseEvent) => {
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

    // Определяем направление свайпа
    if (absDeltaX > absDeltaY && absDeltaX > 50) {
      // Горизонтальный свайп
      if (deltaX < 0) {
        // Свайп влево = следующее сообщение (новее)
        if (currentIndex < messages.length - 1) {
          setCurrentIndex(currentIndex + 1);
        }
      } else {
        // Свайп вправо = предыдущее сообщение (старше)
        if (currentIndex > 0) {
          setCurrentIndex(currentIndex - 1);
        }
      }
    } else if (absDeltaY > absDeltaX && absDeltaY > 50) {
      // Вертикальный свайп
      if (deltaY > 0) {
        // Свайп вниз = выход
        if (confirm("Выйти из чата?")) {
          router.push("/messages");
        }
      } else {
        // Свайп вверх = показать инпут
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
      {/* Кнопка назад (только для мобильных) */}
      <button 
        onClick={() => router.push("/messages")}
        className="absolute top-4 left-4 z-50 p-2 md:hidden"
      >
        <ArrowLeft size={20} className="text-white/60" />
      </button>

      {/* Индикатор прогресса */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-white/10 z-40">
        <div 
          className="h-full bg-gradient-to-r from-cyan-500 to-purple-600 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Статус связи */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-50">
        <div className={`w-2 h-2 rounded-full ${syncStatus === 'entangled' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
        <span className="text-[10px] text-white/40 tracking-wider hidden md:block">
          {syncStatus === 'entangled' ? 'ENTANGLED' : 'SYNCING'}
        </span>
      </div>

      {/* Сообщение по центру */}
      {currentMessage && (
        <div className="absolute inset-0 flex items-center justify-center px-8 md:px-16">
          <div className="max-w-3xl w-full">
            {/* Мета-информация */}
            <div className="flex items-center justify-between mb-6 text-xs text-white/40">
              <span>
                {currentMessage.sender_id === currentUser?.id ? 'YOU' : 'THEM'}
              </span>
              <span>
                {currentIndex + 1} / {messages.length}
              </span>
            </div>

            {/* Текст сообщения */}
            <p className="text-2xl md:text-4xl leading-relaxed font-light whitespace-pre-wrap break-words">
              {currentMessage.text}
            </p>

            {/* Время */}
            <div className="mt-8 text-xs text-white/30">
              {new Date(currentMessage.created_at).toLocaleString("ru-RU", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
        </div>
      )}

      {/* Инструкции (показываются только если нет сообщений) */}
      {messages.length === 0 && syncStatus === 'entangled' && (
        <div className="absolute inset-0 flex items-center justify-center text-center px-8">
          <div>
            <p className="text-lg text-white/60 mb-4">Нет сообщений</p>
            <p className="text-sm text-white/30">Свайп вверх чтобы написать</p>
          </div>
        </div>
      )}

      {/* Навигационные подсказки (десктоп) */}
      <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-8 text-xs text-white/30 hidden md:flex">
        <span>← Свайп вправо: назад</span>
        <span>↑ Свайп вверх: написать</span>
        <span>→ Свайп влево: вперёд</span>
        <span>↓ Свайп вниз: выход</span>
      </div>

      {/* Поле ввода (появляется по свайпу вверх или долгому нажатию) */}
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
                  if (e.key === 'Escape') {
                    setShowInput(false);
                  }
                }}
                placeholder="Написать сообщение..."
                className="w-full bg-transparent border-b-2 border-white/20 focus:border-cyan-500 outline-none text-xl md:text-2xl text-white placeholder-white/30 resize-none py-4 transition-colors"
                rows={3}
                autoFocus
              />
              <div className="flex items-center justify-between mt-6">
                <button
                  onClick={() => setShowInput(false)}
                  className="text-sm text-white/40 hover:text-white transition-colors"
                >
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