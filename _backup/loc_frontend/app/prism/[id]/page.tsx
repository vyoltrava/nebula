"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";
import { useWebSocket } from "@/src/hooks/useWebSocket";
import { ArrowLeft, Send, ShieldCheck, Lock, Sparkles } from "lucide-react";

interface PrismObject {
  id: string;
  type: string;
  x: number;
  y: number;
  size: number;
  color: string;
}

export default function PrismChatPage() {
  const params = useParams();
  const chatId = params?.id as string;
  const router = useRouter();
  
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [chatInfo, setChatInfo] = useState<any>(null);
  const [syncStatus, setSyncStatus] = useState<"connecting" | "decrypting" | "puzzle" | "verifying" | "entangled" | "error">("connecting");
  const [landscape, setLandscape] = useState<{ svg: string; objects: PrismObject[] } | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
        
        if (chatData.is_prism) {
          const landscapeRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/prism-landscape`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (landscapeRes.ok) {
            const data = await landscapeRes.json();
            setLandscape(data);
            setSyncStatus("puzzle");
          } else {
            throw new Error("Не удалось загрузить головоломку");
          }
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

  const handleObjectSelect = async (obj: PrismObject) => {
    if (syncStatus !== "puzzle") return;
    
    setSelectedObjectId(obj.id);
    setSyncStatus("verifying");

    const token = getToken();
    const formData = new FormData();
    formData.append("object_id", obj.id);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/prism-enter`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        alert(`❌ Неверный объект: ${err.detail || "Попробуйте снова"}`);
        setSyncStatus("puzzle");
        setSelectedObjectId(null);
        return;
      }

      setSyncStatus("entangled");
    } catch (err) {
      alert("Ошибка сети при проверке ключа");
      setSyncStatus("puzzle");
      setSelectedObjectId(null);
    }
  };

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
    form.append("ciphertext", "[prism_encrypted]");
    
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    
    setText("");
    if (inputRef.current) inputRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const otherUser = chatInfo?.other;
  const isEntangled = syncStatus === "entangled";

  return (
    <div className="h-screen w-full bg-[#050508] text-white overflow-hidden relative flex flex-col font-sans">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_100%)] pointer-events-none" />

      <header className="relative z-30 px-4 py-3 flex items-center justify-between border-b border-white/5 bg-[#050508]/80 backdrop-blur-xl">
        <button onClick={() => router.push("/messages")} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/70 hover:text-white">
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
              {isEntangled ? 'PRISM PUZZLE ACTIVE' : 'ТРЕБУЕТСЯ АУТЕНТИФИКАЦИЯ'}
            </p>
          </div>
        </div>
        <div className="w-10" />
      </header>

      {(syncStatus === "puzzle" || syncStatus === "verifying") && landscape && (
        <div className="absolute inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-4">
          <div className="max-w-4xl w-full space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-cyan-400 flex items-center justify-center gap-2">
                <Sparkles size={24} /> Prism Puzzle
              </h2>
              <p className="text-white/60">Найдите объект, который вы выбрали при создании чата</p>
            </div>
            
            <div className="relative bg-white/5 rounded-2xl p-2 border border-cyan-500/30 shadow-[0_0_30px_rgba(34,211,238,0.1)]">
              <div dangerouslySetInnerHTML={{ __html: landscape.svg }} className="absolute inset-0 opacity-60 pointer-events-none rounded-xl" />
              
              <svg viewBox="0 0 800 600" className="relative w-full h-auto z-10">
                {landscape.objects.map(obj => {
                  const isSelected = selectedObjectId === obj.id;
                  const commonProps = {
                    key: obj.id,
                    onClick: () => handleObjectSelect(obj),
                    className: `cursor-pointer transition-all duration-300 ${isSelected ? 'drop-shadow-[0_0_10px_rgba(0,255,255,0.8)]' : 'hover:opacity-80 hover:scale-110'}`,
                    style: { outline: isSelected ? '2px solid #00ffff' : 'none', outlineOffset: '2px' }
                  };

                  if (obj.type === 'star' || obj.type === 'moon') {
                    return <circle {...commonProps} cx={obj.x} cy={obj.y} r={obj.size * (isSelected ? 1.5 : 1)} fill={isSelected ? '#00ffff' : obj.color} />;
                  }
                  if (obj.type === 'window') {
                    return <rect {...commonProps} x={obj.x} y={obj.y} width={obj.size} height={obj.size * 1.5} fill={isSelected ? '#00ffff' : obj.color} />;
                  }
                  return null;
                })}
              </svg>
            </div>
            
            <div className="text-center">
              {syncStatus === "verifying" ? (
                <p className="text-cyan-400 text-sm animate-pulse">Проверка визуального ключа...</p>
              ) : (
                <p className="text-white/40 text-sm">Кликните на светящийся объект</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="relative z-20 flex-1 overflow-y-auto px-4 py-6 space-y-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {messages.map((msg, index) => {
          if (msg.text?.startsWith("__PRISM_GENESIS__")) return null;
          const isMine = msg.sender_id === currentUser?.id;
          const time = new Date(msg.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
          
          return (
            <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'} animate-fade-in-up`} style={{ animationDelay: `${index * 0.05}s` }}>
              <div className={`relative max-w-[85%] md:max-w-[70%] px-4 py-3 backdrop-blur-md border shadow-lg ${isMine ? 'bg-gradient-to-br from-purple-600/30 to-cyan-600/10 border-purple-500/30 rounded-2xl rounded-tr-sm' : 'bg-white/5 border-white/10 rounded-2xl rounded-tl-sm'}`}>
                <p className="relative text-[15px] leading-relaxed text-white/90 break-words">{msg.text}</p>
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

      <div className="relative z-30 p-4 bg-[#050508]/90 backdrop-blur-xl border-t border-white/5">
        <div className={`max-w-3xl mx-auto transition-all duration-300 ${isEntangled ? 'opacity-100 translate-y-0' : 'opacity-30 pointer-events-none translate-y-4'}`}>
          <div className="relative flex items-end gap-2 bg-white/5 border border-white/10 rounded-2xl p-2 focus-within:border-cyan-500/50 focus-within:bg-white/[0.07] transition-all">
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => { setText(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
              onKeyDown={handleKeyDown}
              placeholder="Напишите защищенное сообщение..."
              className="flex-1 bg-transparent border-none outline-none text-white placeholder-white/30 resize-none text-[15px] py-2.5 px-2 max-h-[120px]"
              rows={1}
              disabled={!isEntangled}
            />
            <button onClick={sendMessage} disabled={!text.trim() || !isEntangled} className="shrink-0 p-2.5 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-600 disabled:opacity-30 disabled:grayscale hover:scale-105 active:scale-95 transition-all shadow-lg shadow-purple-500/20">
              <Send size={18} className="text-white" />
            </button>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes fade-in-up { 0% { opacity: 0; transform: translateY(10px); } 100% { opacity: 1; transform: translateY(0); } }
        .animate-fade-in-up { animation: fade-in-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}</style>
    </div>
  );
}