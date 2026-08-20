"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";
import { useWebSocket } from "@/src/hooks/useWebSocket"; // Проверь путь к твоему хуку
import { ArrowLeft, Send, ShieldCheck, Lock, Zap, Sparkles } from "lucide-react";
import { reconstructKey, decryptAnchorWithPin } from "@/lib/prismCrypto";
import { prismStorage } from "@/lib/prismStorage";

// ==========================================
// 🌟 АНИМАЦИЯ СЛИЯНИЯ ОСКОЛКОВ
// ==========================================
function ShardsMergeAnimation() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#050508]/95 backdrop-blur-2xl transition-opacity duration-700">
      <div className="relative w-64 h-64 mb-8">
        {/* Центральный импульс */}
        <div className="absolute inset-0 m-auto w-4 h-4 bg-white rounded-full animate-ping" />
        
        {/* Осколок 1: Якорь (Cyan) */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-12 bg-cyan-500/80 rotate-45 blur-md animate-shard-top" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-12 border border-cyan-300 rotate-45 animate-shard-top-delay" />
        
        {/* Осколок 2: Генезис (Purple) */}
        <div className="absolute bottom-0 left-0 w-12 h-12 bg-purple-500/80 rotate-45 blur-md animate-shard-bl" />
        <div className="absolute bottom-0 left-0 w-12 h-12 border border-purple-300 rotate-45 animate-shard-bl-delay" />
        
        {/* Осколок 3: Локальный (Pink) */}
        <div className="absolute bottom-0 right-0 w-12 h-12 bg-pink-500/80 rotate-45 blur-md animate-shard-br" />
        <div className="absolute bottom-0 right-0 w-12 h-12 border border-pink-300 rotate-45 animate-shard-br-delay" />

        {/* Орбитальные кольца */}
        <div className="absolute inset-0 border border-white/5 rounded-full animate-spin-slow" />
        <div className="absolute inset-4 border border-dashed border-cyan-500/20 rounded-full animate-spin-reverse" />
      </div>
      
      <div className="text-center space-y-2">
        <h3 className="text-cyan-400 font-mono text-sm tracking-[0.3em] animate-pulse">
          СИНХРОНИЗАЦИЯ СПЕКТРОВ
        </h3>
        <p className="text-white/30 text-xs max-w-[250px] mx-auto">
          Расшифровка якоря и восстановление мастер-ключа...
        </p>
      </div>

      <style jsx>{`
        @keyframes shard-top {
          0% { transform: translate(-50%, -100px) rotate(0deg); opacity: 0; }
          50% { opacity: 1; }
          100% { transform: translate(-50%, 0) rotate(45deg); opacity: 0; }
        }
        @keyframes shard-top-delay {
          0% { transform: translate(-50%, -100px) rotate(0deg); opacity: 0; }
          50% { opacity: 1; }
          100% { transform: translate(-50%, 0) rotate(45deg); opacity: 0; }
        }
        @keyframes shard-bl {
          0% { transform: translate(-100px, 100px) rotate(0deg); opacity: 0; }
          50% { opacity: 1; }
          100% { transform: translate(0, 0) rotate(45deg); opacity: 0; }
        }
        @keyframes shard-bl-delay {
          0% { transform: translate(-100px, 100px) rotate(0deg); opacity: 0; }
          50% { opacity: 1; }
          100% { transform: translate(0, 0) rotate(45deg); opacity: 0; }
        }
        @keyframes shard-br {
          0% { transform: translate(100px, 100px) rotate(0deg); opacity: 0; }
          50% { opacity: 1; }
          100% { transform: translate(0, 0) rotate(45deg); opacity: 0; }
        }
        @keyframes shard-br-delay {
          0% { transform: translate(100px, 100px) rotate(0deg); opacity: 0; }
          50% { opacity: 1; }
          100% { transform: translate(0, 0) rotate(45deg); opacity: 0; }
        }
        .animate-shard-top { animation: shard-top 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
        .animate-shard-top-delay { animation: shard-top-delay 2.5s cubic-bezier(0.4, 0, 0.2, 1) 0.1s infinite; }
        .animate-shard-bl { animation: shard-bl 2.5s cubic-bezier(0.4, 0, 0.2, 1) 0.2s infinite; }
        .animate-shard-bl-delay { animation: shard-bl-delay 2.5s cubic-bezier(0.4, 0, 0.2, 1) 0.3s infinite; }
        .animate-shard-br { animation: shard-br 2.5s cubic-bezier(0.4, 0, 0.2, 1) 0.4s infinite; }
        .animate-shard-br-delay { animation: shard-br-delay 2.5s cubic-bezier(0.4, 0, 0.2, 1) 0.5s infinite; }
        .animate-spin-slow { animation: spin 8s linear infinite; }
        .animate-spin-reverse { animation: spin 12s linear infinite reverse; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ==========================================
// 📄 ОСНОВНАЯ СТРАНИЦА ЧАТА
// ==========================================
export default function PrismChatPage() {
  const params = useParams();
  const chatId = params?.id as string;
  const router = useRouter();
  
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [chatInfo, setChatInfo] = useState<any>(null);
  const [syncStatus, setSyncStatus] = useState<"connecting" | "decrypting" | "entangled" | "error">("connecting");
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Авто-скролл вниз
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 1. Загрузка начальных данных
  useEffect(() => {
    const token = getToken();
    if (!token) return router.push("/login");
    
    const loadData = async () => {
      try {
        const [userRes, chatRes, msgsRes] = await Promise.all([
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        if (!chatRes.ok) throw new Error("Чат не найден");
        
        setCurrentUser(await userRes.json());
        const chatData = await chatRes.json();
        setChatInfo(chatData);
        
        const msgsData = await msgsRes.json();
        setMessages(Array.isArray(msgsData) ? msgsData : (msgsData.messages ?? []));
        
        // Если это призма, запускаем процесс расшифровки
        if (chatData.is_prism) {
          setSyncStatus("decrypting");
        } else {
          setSyncStatus("entangled");
        }
      } catch (err) {
        console.error(err);
        setSyncStatus("error");
      }
    };

    loadData();
  }, [chatId, router]);

  // 2. Процесс расшифровки (Слияние осколков)
  useEffect(() => {

    const reconstructPrismKey = async () => {
      if (syncStatus !== "decrypting" || !chatInfo || !currentUser) return;

      try {
        const shard3 = await prismStorage.getShard(Number(chatId));
        if (!shard3) {
          throw new Error("Локальный ключ (Спектр 3) не найден. Чат был создан на другом устройстве.");
        }

        const genesisMsg = messages.find((m: any) => m.text?.startsWith("__PRISM_GENESIS__:"));
        if (!genesisMsg) throw new Error("Сообщение Генезиса повреждено или отсутствует.");
        
        // 🔥 АГРЕССИВНАЯ ОЧИСТКА shard2
        const shard2 = genesisMsg.text.replace("__PRISM_GENESIS__:", "").replace(/\s+/g, "");

        await new Promise(r => setTimeout(r, 1500)); // Задержка для анимации
        
        const pin = prompt("🔐 Введите 4-значный PIN-код канала:");
        if (!pin || pin.length < 4) throw new Error("Неверный формат PIN-кода");
        
        // 🔥 АГРЕССИВНАЯ ОЧИСТКА shard1 из профиля пользователя
        const rawShard1 = currentUser.prism_anchor;
        if (!rawShard1) throw new Error("Якорь (shard1) не найден в профиле пользователя.");
        
        const shard1 = await decryptAnchorWithPin(rawShard1.replace(/\s+/g, ""), pin);
        
        // 🔥 АГРЕССИВНАЯ ОЧИСТКА shard3
        const cleanShard3 = shard3.replace(/\s+/g, "");

        const masterKey = reconstructKey(shard1, shard2, cleanShard3);
        
        sessionStorage.setItem(`prism_key_${chatId}`, btoa(String.fromCharCode(...masterKey)));
        setSyncStatus("entangled");
      } catch (err: any) {
        console.error("❌ ОШИБКА РАСШИФРОВКИ:", err);
        alert(`Не удалось установить защищенное соединение.\n\nПричина: ${err.message}`);
        router.push("/messages");
      }
    };

    if (syncStatus === "decrypting") {
      reconstructPrismKey();
    }
  }, [syncStatus, chatInfo, currentUser, messages, chatId, router]);

  // 3. WebSocket для новых сообщений
  useWebSocket("new_message", (data: any) => {
    if (String(data.chat_id) !== String(chatId)) return;
    setMessages(prev => {
      if (prev.some(m => m.id === data.id)) return prev;
      return [...prev, { ...data }];
    });
  });

  const sendMessage = async () => {
    if (!text.trim() || syncStatus !== "entangled") return;
    const token = getToken();
    if (!token) return;

    const form = new FormData();
    form.append("text", text.trim());
    // Здесь можно добавить шифрование текста через masterKey из sessionStorage перед отправкой
    
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    
    setText("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const otherUser = chatInfo?.other;
  const isEntangled = syncStatus === "entangled";

  // Фильтруем системные сообщения
  const visibleMessages = messages.filter(m => !m.text?.startsWith("__PRISM_GENESIS__:"));

  return (
    <div className="h-screen w-full bg-[#050508] text-white overflow-hidden relative flex flex-col font-sans">
      
      {/* Анимация слияния (показывается только при decrypting) */}
      {syncStatus === "decrypting" && <ShardsMergeAnimation />}

      {/* Фоновая сетка для премиального вида */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_100%)] pointer-events-none" />

      {/* Header */}
      <header className="relative z-30 px-4 py-3 flex items-center justify-between border-b border-white/5 bg-[#050508]/80 backdrop-blur-xl">
        <button 
          onClick={() => router.push("/messages")}
          className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/70 hover:text-white"
        >
          <ArrowLeft size={20} />
        </button>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-purple-600 p-[1px]">
              <div className="w-full h-full rounded-full bg-[#0a0a0f] flex items-center justify-center overflow-hidden">
                {otherUser?.avatar_url ? (
                  <img src={otherUser.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm font-bold text-white/80">{otherUser?.display_name?.[0] || '?'}</span>
                )}
              </div>
            </div>
            {isEntangled && (
              <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-emerald-500 rounded-full border-2 border-[#050508] flex items-center justify-center">
                <Lock size={8} className="text-white" />
              </div>
            )}
          </div>
          <div>
            <p className="text-sm font-semibold tracking-wide">{otherUser?.display_name || "Prism Channel"}</p>
            <p className={`text-[10px] font-mono flex items-center gap-1.5 ${isEntangled ? 'text-emerald-400' : 'text-amber-400 animate-pulse'}`}>
              <ShieldCheck size={10} />
              {isEntangled ? 'E2EE АКТИВНО' : 'УСТАНОВКА СОЕДИНЕНИЯ...'}
            </p>
          </div>
        </div>

        <div className="w-10" /> {/* Spacer for centering */}
      </header>

      {/* Область сообщений */}
      <div className="relative z-20 flex-1 overflow-y-auto px-4 py-6 space-y-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {visibleMessages.length === 0 && isEntangled && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-60">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center">
              <Sparkles size={28} className="text-cyan-400" />
            </div>
            <div>
              <h3 className="text-white font-medium">Канал защищен</h3>
              <p className="text-white/40 text-sm mt-1">Сообщения шифруются на вашем устройстве.<br/>Никто, кроме вас, не может их прочитать.</p>
            </div>
          </div>
        )}

        {visibleMessages.map((msg, index) => {
          const isMine = msg.sender_id === currentUser?.id;
          const time = new Date(msg.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
          
          return (
            <div
              key={msg.id}
              className={`flex ${isMine ? 'justify-end' : 'justify-start'} animate-fade-in-up`}
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <div className={`
                relative max-w-[85%] md:max-w-[70%] px-4 py-3 
                backdrop-blur-md border shadow-lg
                ${isMine 
                  ? 'bg-gradient-to-br from-purple-600/30 to-cyan-600/10 border-purple-500/30 rounded-2xl rounded-tr-sm' 
                  : 'bg-white/5 border-white/10 rounded-2xl rounded-tl-sm'
                }
              `}>
                <p className="relative text-[15px] leading-relaxed text-white/90 break-words">
                  {msg.text}
                </p>
                
                <div className="relative flex items-center justify-end gap-1.5 mt-2">
                  <span className="text-[10px] text-white/30 font-mono">{time}</span>
                  {isMine && <span className="text-cyan-400 text-[10px]">◆</span>}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} className="h-4" />
      </div>

      {/* Панель ввода */}
      <div className="relative z-30 p-4 bg-[#050508]/90 backdrop-blur-xl border-t border-white/5">
        <div className={`max-w-3xl mx-auto transition-all duration-300 ${isEntangled ? 'opacity-100 translate-y-0' : 'opacity-30 pointer-events-none translate-y-4'}`}>
          <div className="relative flex items-end gap-2 bg-white/5 border border-white/10 rounded-2xl p-2 focus-within:border-cyan-500/50 focus-within:bg-white/[0.07] transition-all">
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
              }}
              onKeyDown={handleKeyDown}
              placeholder="Напишите защищенное сообщение..."
              className="flex-1 bg-transparent border-none outline-none text-white placeholder-white/30 resize-none text-[15px] py-2.5 px-2 max-h-[120px]"
              rows={1}
              disabled={!isEntangled}
            />
            <button 
              onClick={sendMessage}
              disabled={!text.trim() || !isEntangled}
              className="shrink-0 p-2.5 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-600 disabled:opacity-30 disabled:grayscale hover:scale-105 active:scale-95 transition-all shadow-lg shadow-purple-500/20"
            >
              <Send size={18} className="text-white" />
            </button>
          </div>
          <p className="text-center text-[10px] text-white/20 mt-2 font-mono">
            ENTER для отправки • SHIFT+ENTER для новой строки
          </p>
        </div>
      </div>

      <style jsx global>{`
        @keyframes fade-in-up {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>
  );
}