"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";
import { sanitizeSvg } from "@/lib/sanitize";
import { useWebSocket } from "@/src/hooks/useWebSocket";
import { ArrowLeft, Send, ShieldCheck, Lock, KeyRound } from "lucide-react";
import { encryptMessage, decryptMessage } from "@/lib/crypto";
import { decryptAnchorWithPin, reconstructKey } from "@/lib/prismCrypto";
import { prismStorage } from "@/lib/prismStorage";

interface PrismObject {
  id: string;
  type: string;
  x: number;
  y: number;
  size: number;
  color: string;
}

interface LandscapeData {
  shard2: string;
  prism_anchor: string;
  has_anchor?: boolean;
  genesis_type?: string | null;
  other?: { id: number; display_name: string; avatar_url: string | null };
  svg?: string;
  objects?: PrismObject[];
}

export default function PrismChatPage() {
  const params = useParams();
  const chatId = params?.id as string;
  const chatIdNum = Number(chatId);
  const router = useRouter();

  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [chatInfo, setChatInfo] = useState<any>(null);
  const [syncStatus, setSyncStatus] = useState<
    "connecting" | "pin_required" | "decrypting" | "puzzle" | "verifying" | "entangled" | "error"
  >("connecting");
  const [landscape, setLandscape] = useState<LandscapeData | null>(null);
  const [puzzleSvg, setPuzzleSvg] = useState<string | null>(null);
  const [puzzleObjects, setPuzzleObjects] = useState<PrismObject[]>([]);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [masterKey, setMasterKey] = useState<Uint8Array | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Загрузка данных чата
  useEffect(() => {
    const token = getToken();
    if (!token) return router.push("/login");

    const loadData = async () => {
      try {
        const [userRes, chatRes, msgsRes] = await Promise.all([
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (!chatRes.ok) throw new Error("Чат не найден");

        setCurrentUser(await userRes.json());
        const chatData = await chatRes.json();
        setChatInfo(chatData);

        const msgsData = await msgsRes.json();
        const rawMessages = Array.isArray(msgsData) ? msgsData : msgsData.messages ?? [];
        setMessages(rawMessages);

        if (chatData.is_prism) {
          // Загружаем landscape (shard2 + prism_anchor)
          const landscapeRes = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/prism-landscape`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (!landscapeRes.ok) throw new Error("Не удалось загрузить головоломку");

          const lData: LandscapeData = await landscapeRes.json();
          setLandscape(lData);

          // Нужен PIN для расшифровки shard1 (prism_anchor) и восстановления master key
          setSyncStatus("pin_required");
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

  // Обработка PIN-а: расшифровка shard1, восстановление master key, генерация пазла
  const handlePinSubmit = useCallback(async () => {
    if (!pin.trim() || !landscape) return;
    setPinError(null);
    setSyncStatus("decrypting");

    try {
      // 1. Расшифровываем shard1 из prism_anchor через PIN
      const shard1Base64 = await decryptAnchorWithPin(landscape.prism_anchor, pin);

      // 2. Получаем shard3 из локального хранилища
      const shard3 = await prismStorage.getShard(chatIdNum);
      if (!shard3) {
        throw new Error("Локальный фрагмент ключа (shard3) не найден. Войдите с устройства, на котором создавался чат.");
      }

      // 3. Восстанавливаем master key: shard1 XOR shard2 XOR shard3
      const key = reconstructKey(shard1Base64, landscape.shard2, shard3);

      // 4. Генерируем пазл из master key
      const { generatePrismPuzzleSVG } = await import("@/lib/prismPuzzle");
      const { svg, objects } = generatePrismPuzzleSVG(key);

      setMasterKey(key);
      setPuzzleSvg(svg);
      setPuzzleObjects(objects as unknown as PrismObject[]);
      setSyncStatus("puzzle");
    } catch (err: any) {
      console.error("PIN error:", err);
      setPinError(err.message || "Неверный PIN-код");
      setSyncStatus("pin_required");
    }
  }, [pin, landscape, chatIdNum]);

  // Выбор объекта на пазле
  const handleObjectSelect = useCallback(
    async (obj: PrismObject) => {
      if (syncStatus !== "puzzle" || !masterKey) return;

      setSelectedObjectId(obj.id);
      setSyncStatus("verifying");

      const token = getToken();
      const formData = new FormData();
      formData.append("object_id", obj.id);

      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/prism-enter`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          }
        );

        if (res.ok) {
          setSyncStatus("entangled");
        } else {
          const err = await res.json();
          throw new Error(err.detail || "Ошибка верификации");
        }
      } catch (err: any) {
        console.error(err);
        setSyncStatus("puzzle");
        setSelectedObjectId(null);
      }
    },
    [syncStatus, masterKey, chatId]
  );

  const handlePinKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handlePinSubmit();
    }
  };

  useWebSocket("new_message", (data: any) => {
    if (String(data.chat_id) !== String(chatId)) return;
    setMessages(prev => {
      if (prev.some(m => m.id === data.id)) return prev;
      return [...prev, { ...data }];
    });
  });

  const sendMessage = useCallback(async () => {
    if (!text.trim() || syncStatus !== "entangled" || !masterKey) return;

    const token = getToken();
    if (!token) return;

    // Шифруем текст AES-256-GCM с master key
    const ciphertext = encryptMessage(text.trim(), masterKey);

    const form = new FormData();
    form.append("ciphertext", ciphertext);
    form.append("text", "");

    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    setText("");
    if (inputRef.current) inputRef.current.style.height = "auto";
  }, [text, syncStatus, masterKey, chatId]);

  // Расшифровка входящего сообщения
  const decryptIncomingMessage = useCallback(
    (msg: any): string => {
      if (msg.text?.startsWith("__PRISM_GENESIS__")) return "";
      if (msg.ciphertext && masterKey) {
        try {
          return decryptMessage(msg.ciphertext, masterKey);
        } catch {
          return "[Ошибка расшифровки]";
        }
      }
      if (msg.text && !msg.ciphertext) return msg.text;
      return "[Зашифровано]";
    },
    [masterKey]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const otherUser = chatInfo?.other;
  const isEntangled = syncStatus === "entangled";

  // Экран ввода PIN-кода (нужен для расшифровки shard1 из prism_anchor)
  if (syncStatus === "pin_required" || syncStatus === "decrypting") {
    return (
      <div className="h-screen w-full bg-gray-50 dark:bg-[#050508] text-gray-900 dark:text-white flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_100%)] pointer-events-none" />
        <div className="relative w-full max-w-sm bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 rounded-2xl p-8 backdrop-blur-xl shadow-2xl">
          <div className="text-center mb-6">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <KeyRound size={26} className="text-gray-900 dark:text-white" />
            </div>
            <h2 className="text-xl font-bold">Введите PIN-код</h2>
            <p className="text-gray-500 dark:text-white/50 text-sm mt-1">
              PIN необходим для расшифровки фрагмента ключа (shard1)
            </p>
          </div>

          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={handlePinKeyDown}
            placeholder="ЕЕЕЕ"
            autoFocus
            disabled={syncStatus === "decrypting"}
            className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-line dark:border-white/10 text-center text-xl tracking-[0.5em] focus:outline-none focus:border-cyan-500/60 transition-colors"
          />

          {pinError && (
            <p className="mt-3 text-sm text-red-500 text-center">{pinError}</p>
          )}

          <button
            onClick={handlePinSubmit}
            disabled={!pin.trim() || syncStatus === "decrypting"}
            className={`w-full mt-5 py-3 rounded-xl font-semibold transition-all ${
              syncStatus === "decrypting"
                ? "bg-cyan-500/30 text-cyan-300 cursor-wait"
                : "bg-gradient-to-r from-cyan-500 to-purple-600 text-gray-900 dark:text-white hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-cyan-500/20"
            }`}
          >
            {syncStatus === "decrypting" ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-cyan-300 border-t-transparent rounded-full animate-spin" />
                Расшифровка...
              </span>
            ) : (
              "Разблокировать"
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-gray-50 dark:bg-[#050508] text-gray-900 dark:text-white overflow-hidden relative flex flex-col font-sans">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_100%)] pointer-events-none" />

      <header className="relative z-30 px-4 py-3 flex items-center justify-between border-b border-line dark:border-white/5 bg-gray-50 dark:bg-[#050508]/80 backdrop-blur-xl">
        <button onClick={() => router.push("/messages")} className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-full transition-colors text-gray-800 dark:text-white/70 hover:text-gray-900 dark:hover:text-white">
          <ArrowLeft size={20} />
        </button>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-600 p-[1px]">
              <div className="w-full h-full rounded-xl bg-[#0a0a0f] flex items-center justify-center overflow-hidden">
                {otherUser?.avatar_url ? (
                  <img src={otherUser.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm font-bold text-gray-800 dark:text-white/80">{otherUser?.display_name?.[0] || '?'}</span>
                )}
              </div>
            </div>
            {isEntangled && (
              <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-emerald-500 rounded-full border-2 border-[#050508] flex items-center justify-center">
                <Lock size={8} className="text-gray-900 dark:text-white" />
              </div>
            )}
          </div>
          <div>
            <p className="text-sm font-semibold tracking-wide">{otherUser?.display_name || "Prism Channel"}</p>
            <p className={`text-[10px] font-mono flex items-center gap-1.5 ${isEntangled ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400 animate-pulse'}`}>
              <ShieldCheck size={10} />
              {isEntangled ? 'PRISM PUZZLE ACTIVE' : 'ТРЕБУЕТСЯ АУТЕНТИФИКАЦИЯ'}
            </p>
          </div>
        </div>
        <div className="w-10" />
      </header>

      {(syncStatus === "puzzle" || syncStatus === "verifying") && puzzleSvg && (
        <div className="absolute inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-4">
          <div className="max-w-4xl w-full space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-cyan-600 dark:text-cyan-400 flex items-center justify-center gap-2">
                <Lock size={24} /> Prism Puzzle
              </h2>
              <p className="text-gray-600 dark:text-white/60">Найдите объект, который вы выбрали при создании чата</p>
            </div>

            <div className="relative bg-gray-100 dark:bg-white/5 rounded-2xl p-2 border border-cyan-500/30 shadow-[0_0_30px_rgba(34,211,238,0.1)]">
              <div dangerouslySetInnerHTML={{ __html: sanitizeSvg(puzzleSvg) }} className="absolute inset-0 opacity-50 pointer-events-none rounded-xl" />

              <svg viewBox="0 0 800 600" className="relative w-full h-auto z-10">
                {puzzleObjects.map(obj => {
                  const isSelected = selectedObjectId === obj.id;
                  const commonProps = {
                    key: obj.id,
                    onClick: () => handleObjectSelect(obj),
                    className: `cursor-pointer transition-all duration-300 ${isSelected ? 'drop-shadow-[0_0_10px_rgba(0,255,255,0.8)]' : 'hover:opacity-80 hover:scale-110'}`,
                    style: { outline: isSelected ? '2px solid #00ffff' : 'none', outlineOffset: '2px' }
                  };

                  return <circle {...commonProps} cx={obj.x} cy={obj.y} r={obj.size * (isSelected ? 1.5 : 1)} fill={isSelected ? '#00ffff' : obj.color} />;
                })}
              </svg>
            </div>

            <div className="text-center">
              {syncStatus === "verifying" ? (
                <p className="text-cyan-600 dark:text-cyan-400 text-sm animate-pulse">Проверка визуального ключа...</p>
              ) : (
                <p className="text-gray-500 dark:text-white/40 text-sm">Кликните на светящийся объект</p>
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
              <div className={`relative max-w-[85%] md:max-w-[70%] px-4 py-3 backdrop-blur-md border shadow-lg ${isMine ? 'bg-gradient-to-br from-purple-600/30 to-cyan-600/10 border-purple-500/30 rounded-2xl rounded-tr-sm' : 'bg-white/5 border-line dark:border-white/10 rounded-2xl rounded-tl-sm'}`}>
                <p className="relative text-[15px] leading-relaxed text-gray-800 dark:text-white/90 break-words">{decryptIncomingMessage(msg)}</p>
                <div className="relative flex items-center justify-end gap-1.5 mt-2">
                  <span className="text-[10px] text-gray-500 dark:text-white/30 font-mono">{time}</span>
                  {isMine && <span className="text-cyan-600 dark:text-cyan-400 text-[10px]">◆</span>}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} className="h-4" />
      </div>

      <div className="relative z-30 p-4 bg-gray-50 dark:bg-[#050508]/90 backdrop-blur-xl border-t border-line dark:border-white/5">
        <div className={`max-w-3xl mx-auto transition-all duration-300 ${isEntangled ? 'opacity-100 translate-y-0' : 'opacity-30 pointer-events-none translate-y-4'}`}>
          <div className="relative flex items-end gap-2 bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 rounded-2xl p-2 focus-within:border-cyan-500/50 focus-within:bg-white/[0.07] transition-all">
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => { setText(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
              onKeyDown={handleKeyDown}
              placeholder="Напишите защищенное сообщение..."
              className="flex-1 bg-transparent border-none outline-none text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 resize-none text-[15px] py-2.5 px-2 max-h-[120px]"
              rows={1}
              disabled={!isEntangled}
            />
            <button onClick={sendMessage} disabled={!text.trim() || !isEntangled} className="shrink-0 p-2.5 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-600 disabled:opacity-30 disabled:grayscale hover:scale-105 active:scale-95 transition-all shadow-lg shadow-purple-500/20">
              <Send size={18} className="text-gray-900 dark:text-white" />
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