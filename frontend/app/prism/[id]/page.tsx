"use client";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";
import { useWebSocket } from "@/src/hooks/useWebSocket";
import { Sparkles, Zap, Activity, GitBranch } from "lucide-react";
import { extractDataFromImage } from "@/lib/prismCrypto";

export default function NeuralBridgePage() {
  const params = useParams();
  const chatId = params?.id as string;
  const router = useRouter();
  
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [syncStatus, setSyncStatus] = useState<"connecting" | "resonating" | "entangled">("connecting");
  const [neuralNodes, setNeuralNodes] = useState<Array<{id: string, x: number, y: number, energy: number}>>([]);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);

  // Инициализация "нейронной сети"
  useEffect(() => {
    const nodes = Array.from({ length: 20 }, (_, i) => ({
      id: `node-${i}`,
      x: Math.random() * 100,
      y: Math.random() * 100,
      energy: Math.random(),
    }));
    setNeuralNodes(nodes);
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
        setSyncStatus("resonating");
      }),
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(r => r.json()).then(data => {
        setMessages(Array.isArray(data) ? data : (data.messages ?? []));
        setSyncStatus("entangled");
      })
    ]);
  }, [chatId, router]);

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
  };

  // Сообщения расположены НЕ линейно, а как "вспышки сознания"
  const renderThoughtStream = () => {
    return messages.map((msg, idx) => {
      const isMine = msg.sender_id === currentUser?.id;
      const angle = (idx / messages.length) * 360;
      const radius = 20 + (idx * 3); // Чем старше, тем дальше от центра
      
      return (
        <div
          key={msg.id}
          className={`absolute transition-all duration-1000 ease-out`}
          style={{
            left: `${50 + Math.cos((angle * Math.PI) / 180) * (radius / 100) * 50}%`,
            top: `${50 + Math.sin((angle * Math.PI) / 180) * (radius / 100) * 50}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div className={`
            relative p-4 rounded-2xl backdrop-blur-xl border
            ${isMine 
              ? 'bg-purple-500/10 border-purple-400/30 shadow-[0_0_30px_rgba(168,85,247,0.3)]' 
              : 'bg-cyan-500/10 border-cyan-400/30 shadow-[0_0_30px_rgba(34,211,238,0.3)]'
            }
          `}>
            <p className="text-sm text-white/90 max-w-[200px]">{msg.text}</p>
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-white/30">
              {new Date(msg.created_at).toLocaleTimeString("ru-RU", {hour: "2-digit", minute:"2-digit"})}
            </div>
          </div>
        </div>
      );
    });
  };

  return (
    <div ref={containerRef} className="h-screen w-full bg-[#000] overflow-hidden relative">
      {/* Фон: живая нейронная сеть */}
      <div className="absolute inset-0">
        <svg className="w-full h-full">
          {neuralNodes.map((node, i) => (
            neuralNodes.slice(i + 1).map((target, j) => {
              const distance = Math.sqrt(
                Math.pow(node.x - target.x, 2) + Math.pow(node.y - target.y, 2)
              );
              if (distance < 30) {
                return (
                  <line
                    key={`${i}-${j}`}
                    x1={`${node.x}%`}
                    y1={`${node.y}%`}
                    x2={`${target.x}%`}
                    y2={`${target.y}%`}
                    stroke={`rgba(139, 92, 246, ${0.1 * (1 - distance / 30)})`}
                    strokeWidth="0.5"
                    className="animate-pulse"
                  />
                );
              }
              return null;
            })
          ))}
          {neuralNodes.map((node) => (
            <circle
              key={node.id}
              cx={`${node.x}%`}
              cy={`${node.y}%`}
              r={2 + node.energy * 3}
              fill={`rgba(139, 92, 246, ${0.3 + node.energy * 0.4})`}
              className="animate-pulse"
              style={{ animationDelay: `${node.energy * 2}s` }}
            />
          ))}
        </svg>
      </div>

      {/* Центр: "Ядро связи" — вместо поля ввода */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative">
          {/* Пульсирующее ядро */}
          <div className={`
            w-32 h-32 rounded-full backdrop-blur-2xl border-2
            flex items-center justify-center
            transition-all duration-500
            ${syncStatus === 'entangled' 
              ? 'bg-gradient-to-br from-purple-600/30 to-cyan-600/30 border-white/30 shadow-[0_0_60px_rgba(139,92,246,0.5)] animate-pulse' 
              : 'bg-white/5 border-white/10'
            }
          `}>
            <GitBranch size={40} className="text-white/60" />
          </div>
          
          {/* Орбиты */}
          <div className="absolute inset-0 animate-[spin_10s_linear_infinite]">
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.8)]" />
          </div>
          <div className="absolute inset-[-20px] animate-[spin_15s_linear_infinite_reverse]">
            <div className="absolute top-1/2 -right-2 -translate-y-1/2 w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.8)]" />
          </div>
        </div>
      </div>

      {/* Поток мыслей — сообщения как частицы вокруг ядра */}
      <div className="absolute inset-0">
        {renderThoughtStream()}
      </div>

      {/* Интерфейс ввода — НЕ снизу, а "всплывает" при фокусе */}
      <div className="absolute bottom-0 left-0 right-0 p-8">
        <div className="max-w-2xl mx-auto">
          <div 
            ref={inputRef}
            className={`
              relative group
              transition-all duration-500
              ${text ? 'opacity-100 translate-y-0' : 'opacity-60 translate-y-4'}
            `}
          >
            {/* Свечение при вводе */}
            <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 via-cyan-600 to-purple-600 rounded-2xl blur opacity-0 group-hover:opacity-30 transition-opacity animate-gradient" />
            
            <div className="relative flex items-center gap-4 p-6 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-2xl">
              <Activity size={20} className="text-purple-400 animate-pulse" />
              
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Передай мысль..."
                className="flex-1 bg-transparent border-none outline-none text-white placeholder-white/30 text-lg"
              />
              
              <button 
                onClick={sendMessage}
                disabled={!text.trim()}
                className="p-3 rounded-xl bg-gradient-to-br from-purple-600 to-cyan-600 text-white disabled:opacity-30 hover:scale-110 transition-transform"
              >
                <Zap size={20} />
              </button>
            </div>
            
            <p className="text-center mt-4 text-[10px] text-white/20 tracking-[0.5em]">
              NEURAL BRIDGE v3.0
            </p>
          </div>
        </div>
      </div>

      {/* Индикатор состояния связи */}
      <div className="absolute top-6 left-6 flex items-center gap-3">
        <div className={`
          w-2 h-2 rounded-full
          ${syncStatus === 'entangled' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}
        `} />
        <span className="text-[10px] text-white/40 tracking-[0.3em]">
          {syncStatus === 'entangled' ? 'QUANTUM_ENTANGLED' : 'ESTABLISHING_LINK'}
        </span>
      </div>

      <style jsx>{`
        @keyframes gradient {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient 3s ease infinite;
        }
      `}</style>
    </div>
  );
}