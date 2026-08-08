"use client";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Avatar } from "@/components/Avatar";
import { getToken } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import { STICKERS } from "@/lib/stickers";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useCallback } from "react";
import { isOnline, lastSeenText } from "@/lib/online";
import { triggerCountersRefresh } from "@/lib/events";
import {
  Send, Image as ImageIcon, X, Smile, Paperclip,
  FileText, Film, Edit2, Trash2, MoreVertical,
  Lock, Search, ShieldCheck, AlertTriangle,
  Check, CheckCheck,
} from "lucide-react";
import {
  ensureKeyPair,
  getKeyPair,
  bytesToBase64,
  base64ToBytes,
  encryptMessage,
  decryptMessage,
  generateSessionKey,
  encryptSessionKeyForUser,
  decryptSessionKey,
  storeSessionKey,
  loadSessionKey,
  fingerprint,
} from "@/lib/crypto";

export default function ChatPage() {
  const params = useParams();
  const chatId = params?.id as string;
  const router = useRouter();

  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [showStickers, setShowStickers] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [showMediaGallery, setShowMediaGallery] = useState(false);
  const [mediaItems, setMediaItems] = useState<any[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<any | null>(null);
  const [activeMessageMenu, setActiveMessageMenu] = useState<number | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [chatPartner, setChatPartner] = useState<any>(null);
  const [chatInfo, setChatInfo] = useState<any>(null);
  const [isSecret, setIsSecret] = useState(false);
  const [cryptoError, setCryptoError] = useState<string | null>(null);
  const [showVerify, setShowVerify] = useState(false);
  const [myFingerprint, setMyFingerprint] = useState("");
  const [partnerFingerprint, setPartnerFingerprint] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

  function getGlowColor(user: any): string | null {
    if (user?.is_admin) return "#8b5cf6";
    if (user?.is_moderator) return "#3b82f6";
    if (user?.role?.color) return user.role.color;
    return null;
  }

  function glowStyle(user: any): React.CSSProperties | undefined {
    const c = getGlowColor(user);
    if (!c) return undefined;
    return { color: c, textShadow: `0 0 6px ${c}B3, 0 0 14px ${c}66` };
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // ========== ДЕШИФРОВАНИЕ СООБЩЕНИЙ ==========

  /** Дешифрует одно сообщение для отображения */
  function decryptDisplayText(msg: any): string {
    if (!isSecret) return msg.text || "";
    if (!msg.ciphertext) return "[нет данных]";
    const sk = loadSessionKey(Number(chatId));
    if (!sk) return "[Сессия не установлена]";
    return decryptMessage(msg.ciphertext, sk);
  }

  // ========== ЗАГРУЗКА ДАННЫХ ==========

  async function loadChatInfo() {
    const token = getToken();
    if (!token) return;
    try {
      // Получаем список чатов и находим наш
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const chats = await res.json();
        const mine = chats.find((c: any) => String(c.id) === chatId);
        if (mine) {
          setChatInfo(mine);
          setIsSecret(mine.is_secret);
          setChatPartner(mine.other);
        }
      }
    } catch (err) {
      console.error("Failed to load chat info", err);
    }
  }

  async function loadMessages() {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) {
        router.push("/messages");
        return;
      }
      if (res.ok) {
        setMessages(await res.json());
      }
    } catch (err) {
      console.error("Failed to load messages", err);
    }
  }

  async function initCryptoForSecretChat() {
    if (!isSecret || !chatPartner) return;
    const token = getToken();
    if (!token) return;

    try {
      // 1. Убеждаемся, что у нас есть ключи
      const myKeyData = await ensureKeyPair(token, process.env.NEXT_PUBLIC_API_URL!);
      const myKeys = await getKeyPair();
      setMyFingerprint(myKeyData.fingerprint);

      // 2. Пробуем загрузить session key с сервера
      let sk = loadSessionKey(Number(chatId));
      if (!sk) {
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/session-key`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            const myKeys = getKeyPair();
            if (!myKeys) {
              setCryptoError("Не удалось загрузить ключи");
              return;
            }
          sk = decryptSessionKey(data.encrypted_session_key);
            storeSessionKey(Number(chatId), sk);
          }
        } catch {
          // Если не удалось — создаём новый session key
          await establishNewSession();
        }
      }
    } catch (err) {
      console.error("Crypto init failed:", err);
      setCryptoError("Ошибка инициализации E2EE");
    }
  }

  async function establishNewSession() {
    const token = getToken();
    if (!token || !chatPartner) return;

    try {
      const myKeys = await getKeyPair();
      if (!myKeys) {
        setCryptoError("Не удалось загрузить ключи");
        return;
      }
      const pkRes = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/users/${chatPartner.id}/public-key`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!pkRes.ok) {
        setCryptoError("У собеседника нет ключа. Он должен зайти в приложение.");
        return;
      }
      const pkData = await pkRes.json();
      const partnerPub = base64ToBytes(pkData.public_key);
      setPartnerFingerprint(pkData.fingerprint);

      // Генерируем новый session key
      const sk = generateSessionKey();

      // Шифруем для обоих
      const forMe = encryptSessionKeyForUser(sk, myKeys.publicKeyBase64);
      const forOther = encryptSessionKeyForUser(sk, pkData.public_key);

      // Отправляем на сервер
      for (const [uid, enc] of [
        [currentUser.id, forMe],
        [chatPartner.id, forOther],
      ] as [number, string][]) {
        const fd = new FormData();
        fd.append("recipient_id", String(uid));
        fd.append("encrypted_session_key", enc);
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/session-key`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
      }

      storeSessionKey(Number(chatId), sk);
      setCryptoError(null);
    } catch (err) {
      console.error("establishNewSession failed:", err);
      setCryptoError("Не удалось установить защищённую сессию");
    }
  }

  // ========== ОТПРАВКА СООБЩЕНИЙ ==========

  async function sendMessage() {
    const token = getToken();
    if (!token) return;
    if (!text.trim() && files.length === 0) return;

    const messagesToSend: { text: string; file: File | null }[] = [];
    if (files.length > 0) {
      files.forEach((f, i) => messagesToSend.push({ text: i === 0 ? text.trim() : "", file: f }));
    } else {
      messagesToSend.push({ text: text.trim(), file: null });
    }

        // 🆕 Оптимистично добавляем своё сообщение в список
    if (!isSecret && text.trim()) {
      const tempMsg = {
        id: Date.now(), // временный ID
        sender_id: currentUser?.id,
        sender_name: currentUser?.display_name,
        sender_avatar: currentUser?.avatar_url,
        text: text.trim(),
        media_url: null,
        media_type: null,
        read: false,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempMsg]);
    }

    try {
      for (const msg of messagesToSend) {
        const form = new FormData();

        if (isSecret && msg.text) {
          // Секретный чат: шифруем на клиенте
          const sk = loadSessionKey(Number(chatId));
          if (!sk) {
            await establishNewSession();
            const skNew = loadSessionKey(Number(chatId));
            if (!skNew) throw new Error("Нет session key");
            form.append("ciphertext", encryptMessage(msg.text, skNew));
          } else {
            form.append("ciphertext", encryptMessage(msg.text, sk));
          }
          form.append("text", ""); // пусто на сервере
        } else {
          if (msg.text) form.append("text", msg.text);
        }

        if (msg.file) form.append("file", msg.file);

        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });

        if (res.status === 403) {
          alert("Нет доступа к чату");
          router.push("/messages");
          return;
        }
      }

      setText("");
      setFiles([]);
    } catch (err) {
      console.error("Failed to send:", err);
      alert("Не удалось отправить сообщение");
    }
  }

  async function deleteMessage(messageId: number) {
    if (!confirm("Удалить сообщение?")) return;
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages/${messageId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) loadMessages();
    } catch (err) {
      alert("Ошибка сети");
    }
  }

  async function submitEdit() {
    if (!editingMessageId || !editText.trim()) return;
    // Для секретных чатов редактирование пока не поддерживаем (сложно)
    if (isSecret) {
      alert("Редактирование пока недоступно для секретных чатов");
      cancelEdit();
      return;
    }
    const token = getToken();
    if (!token) return;
    try {
      const form = new FormData();
      form.append("text", editText);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages/${editingMessageId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.ok) {
        setEditingMessageId(null);
        setEditText("");
        loadMessages();
      }
    } catch (err) {
      alert("Ошибка сети");
    }
  }

  function startEdit(msg: any) {
    if (isSecret) {
      alert("Редактирование недоступно в секретных чатах");
      return;
    }
    setEditingMessageId(msg.id);
    setEditText(msg.text || "");
    setActiveMessageMenu(null);
  }

  function cancelEdit() {
    setEditingMessageId(null);
    setEditText("");
  }

  async function loadMedia() {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/media`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setMediaItems(await res.json());
    } catch (err) {
      console.error("Failed to load media", err);
    }
  }

  // ========== ЭФФЕКТЫ ==========

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }

    const controller = new AbortController();
    const signal = controller.signal;

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    })
      .then((r) => r.json())
      .then(setCurrentUser)
      .catch(() => {});

    loadChatInfo();
    loadMessages();

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      signal,
    })
      .then(() => {
        triggerCountersRefresh();
      })
      .catch(() => {});

  return () => {
    controller.abort();
  };
  }, [chatId]);

  // Когда узнали, что чат секретный — инициализируем криптографию
  useEffect(() => {
    if (isSecret && chatPartner && currentUser) {
      initCryptoForSecretChat();
    }
  }, [isSecret, chatPartner, currentUser]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ========== РЕНДЕР ==========

  // ========== WEBSOCKET: ПОЛУЧЕНИЕ НОВЫХ СООБЩЕНИЙ ==========
  const handleNewMessage = useCallback((data: any) => {
    if (String(data.chat_id) !== String(chatId)) return;
    if (data.sender_id === currentUser?.id) return;
    
    setMessages((prev) => {
      if (prev.some((m) => m.id === data.id)) return prev;
      return [...prev, data];
    });
    
    const token = getToken();
    if (token) {
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).then(() => triggerCountersRefresh()).catch(() => {});
    }
  }, [chatId, currentUser?.id]);

  useWebSocket("new_message", handleNewMessage);


  function onFiles(newFiles: FileList | null) {
    if (!newFiles) return;
    setFiles((prev) => [...prev, ...Array.from(newFiles)].slice(0, 5));
  }

  function insertSticker(code: string) {
    setText((prev) => prev + ` ${code} `);
  }

  // Локальный поиск по расшифрованным сообщениям
  const filteredMessages = messages.filter((msg) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const displayText = decryptDisplayText(msg).toLowerCase();
    return displayText.includes(q);
  });

  const partnerGlow = getGlowColor(chatPartner);

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />
      <div className="w-px shrink-0 bg-white/10 my-3" />
      <main className="flex-1 flex flex-col border-x border-white/10">
        {/* Шапка чата */}
        <div className={`p-3 md:p-4 border-b border-white/10 backdrop-blur-md sticky top-0 z-10 ${
          isSecret ? "bg-emerald-950/40" : "bg-[#171717]/80"
        }`}>
          <div className="flex items-center gap-2 md:gap-3">
            <button onClick={() => router.push("/messages")} className="text-white/60 hover:text-white shrink-0">
              ← Назад
            </button>

            {chatPartner && (
              <Link href={`/user/${chatPartner.id}`} className="flex items-center gap-3 group flex-1 min-w-0">
                <div className="shrink-0 relative" style={partnerGlow ? { filter: `drop-shadow(0 0 8px ${partnerGlow})` } : undefined}>
<Avatar src={chatPartner.avatar_url} name={chatPartner.display_name} id={chatPartner.id} size={40} online={isOnline(chatPartner.last_seen)} />                  {isSecret && (
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-[#171717] flex items-center justify-center">
                      <Lock size={8} className="text-white" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p
                      className={`font-bold truncate transition-all group-hover:opacity-80 ${
                        glowStyle(chatPartner) ? "" : "text-white"
                      }`}
                      style={glowStyle(chatPartner)}
                    >
                      {chatPartner.display_name}
                    </p>
                    {isSecret && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[9px] font-black uppercase tracking-widest border border-emerald-500/30 shrink-0">
                        <Lock size={8} />
                        E2EE
                      </span>
                    )}
                  </div>
                  <p className={`text-xs ${isOnline(chatPartner.last_seen) ? "text-green-400" : "text-white/50"}`}>
                    {isOnline(chatPartner.last_seen) ? "● в сети" : lastSeenText(chatPartner.last_seen)}
                  </p>
                </div>
              </Link>
            )}

            {/* Кнопки */}
            <button
              onClick={() => setShowSearch(!showSearch)}
              className={`p-2 rounded-lg transition-colors shrink-0 ${showSearch ? "text-[#8b5cf6] bg-[#8b5cf6]/10" : "text-white/60 hover:text-[#8b5cf6]"}`}
              title="Поиск"
            >
              <Search size={18} />
            </button>

            {isSecret && (
              <button
                onClick={() => setShowVerify(true)}
                className="p-2 text-emerald-400 hover:text-emerald-300 transition-colors shrink-0"
                title="Проверить шифрование"
              >
                <ShieldCheck size={18} />
              </button>
            )}

            <button
              onClick={() => { loadMedia(); setShowMediaGallery(true); }}
              className="p-2 text-white/60 hover:text-[#8b5cf6] transition-colors shrink-0"
              title="Медиа"
            >
              <ImageIcon size={18} />
            </button>
          </div>

          {/* Панель поиска */}
          {showSearch && (
            <div className="mt-3 pt-3 border-t border-white/10">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={isSecret ? "Поиск в расшифрованных сообщениях..." : "Поиск в сообщениях..."}
                  className="w-full pl-9 pr-8 py-1.5 rounded-lg border border-white/10 bg-white/5 text-white placeholder-white/40 focus:outline-none focus:border-[#8b5cf6] text-sm"
                  autoFocus
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              {searchQuery && (
                <p className="text-xs text-white/40 mt-1.5">
                  {filteredMessages.length} из {messages.length} сообщений
                </p>
              )}
            </div>
          )}
        </div>

        {/* Баннер секретного чата */}
        {isSecret && messages.length === 0 && !cryptoError && (
          <div className="p-4 bg-emerald-500/5 border-b border-emerald-500/20">
            <div className="flex items-start gap-2 max-w-2xl mx-auto text-center">
              <Lock size={16} className="text-emerald-400 mt-0.5 shrink-0" />
              <div className="text-sm text-emerald-100/80">
                <p className="font-bold text-emerald-300 mb-1">Секретный чат</p>
                <p className="text-xs">
                  Сообщения зашифрованы端到端. Сервер NEBULA не может их прочитать.
                  Ключи хранятся только на устройствах участников.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Ошибка криптографии */}
        {cryptoError && (
          <div className="p-4 bg-red-500/10 border-b border-red-500/30">
            <div className="flex items-start gap-2 max-w-2xl mx-auto">
              <AlertTriangle size={16} className="text-red-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-red-300 font-bold">{cryptoError}</p>
                <button
                  onClick={establishNewSession}
                  className="mt-2 text-xs px-3 py-1 rounded bg-red-500/20 text-red-200 hover:bg-red-500/30 border border-red-500/30"
                >
                  Попробовать снова
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Сообщения */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {currentUser && filteredMessages.map((msg) => {
            const isMine = msg.sender_id === currentUser.id;
            const isEditing = editingMessageId === msg.id;
            const displayText = decryptDisplayText(msg);

            return (
              <div key={msg.id} className={`flex gap-2 ${isMine ? "justify-end" : "justify-start"}`}>
                {!isMine && chatPartner && (
                  <Link href={`/user/${chatPartner.id}`} className="shrink-0">
                    <div style={partnerGlow ? { filter: `drop-shadow(0 0 6px ${partnerGlow})` } : undefined}>
                      <Avatar src={msg.sender_avatar} name={msg.sender_name} id={msg.sender_id} size={32} />
                    </div>
                  </Link>
                )}

                <div className={`max-w-[75%] md:max-w-[70%] flex flex-col ${isMine ? "items-end" : "items-start"}`}>
                  <div
                    className={`rounded-2xl px-3 md:px-4 py-2 ${
                      isMine
                        ? isSecret
                          ? "bg-emerald-600 text-white"
                          : "bg-[#8b5cf6] text-white"
                        : "bg-white/10 text-white border border-white/15"
                    }`}
                  >
                    {msg.media_url && msg.media_type === "image" && (
                      <img src={mediaUrl(msg.media_url)} alt="" className="rounded-xl max-h-64 mb-2 cursor-pointer" onClick={() => setSelectedMedia(msg)} />
                    )}
                    {msg.media_url && msg.media_type === "gif" && (
                      <img src={mediaUrl(msg.media_url)} alt="" className="rounded-xl max-h-64 mb-2 cursor-pointer" onClick={() => setSelectedMedia(msg)} />
                    )}
                    {msg.media_url && msg.media_type === "video" && (
                      <video src={mediaUrl(msg.media_url)} controls className="rounded-xl max-h-64 mb-2" />
                    )}

                    {isEditing ? (
                      <div className="flex gap-2 items-start">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitEdit(); }
                            if (e.key === "Escape") cancelEdit();
                          }}
                          className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#8b5cf6] resize-none"
                          rows={2}
                          autoFocus
                        />
                        <div className="flex flex-col gap-1">
                          <button onClick={submitEdit} className="text-green-400 text-xs font-bold">✓</button>
                          <button onClick={cancelEdit} className="text-red-400 text-xs font-bold">✕</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {displayText && <p className="whitespace-pre-wrap break-words">{displayText}</p>}
                      </>
                    )}
                  </div>

                  {!isEditing && (
                    <div className={`flex items-center gap-2 mt-1 px-1 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
                      <p className={`text-[10px] flex items-center gap-1 ${isMine ? "text-white/60" : "text-white/40"}`}>
                        {new Date(msg.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                        {isMine && (
                          msg.read
                            ? <CheckCheck size={12} className="text-sky-300" />
                            : <Check size={12} className="text-white/50" />
                        )}
                      </p>
                      {isMine && !isSecret && (
                        <div className="relative">
                          <button
                            onClick={() => setActiveMessageMenu(activeMessageMenu === msg.id ? null : msg.id)}
                            className="p-1 text-white/40 hover:text-white"
                          >
                            <MoreVertical size={12} />
                          </button>
                          {activeMessageMenu === msg.id && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setActiveMessageMenu(null)} />
                              <div className={`absolute ${isMine ? "right-0" : "left-0"} top-full mt-1 bg-[#1f1f23] border border-white/15 rounded-lg shadow-xl overflow-hidden min-w-[140px] z-50`}>
                                {msg.text && (
                                  <button onClick={() => startEdit(msg)} className="w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10 flex items-center gap-2">
                                    <Edit2 size={14} /> Редактировать
                                  </button>
                                )}
                                <button
                                  onClick={() => { deleteMessage(msg.id); setActiveMessageMenu(null); }}
                                  className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                                >
                                  <Trash2 size={14} /> Удалить
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Вложения */}
        {files.length > 0 && (
          <div className="px-4 py-3 border-t border-white/10 bg-white/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-white/70">Вложения ({files.length}/5)</span>
              <button onClick={() => setFiles([])} className="text-xs text-red-400">Очистить все</button>
            </div>
            <div className="flex gap-2 flex-wrap">
              {files.map((f, i) => (
                <div key={i} className="relative group border border-white/15 rounded-xl overflow-hidden bg-white/5">
                  {f.type.startsWith("image/") ? (
                    <img src={URL.createObjectURL(f)} alt="" className="w-24 h-24 object-cover" />
                  ) : (
                    <div className="w-24 h-24 flex flex-col items-center justify-center gap-1 p-2">
                      <FileText size={24} className="text-white/60" />
                      <span className="text-[10px] text-white/60 truncate w-full px-1">{f.name}</span>
                      <span className="text-[9px] text-white/40">{formatSize(f.size)}</span>
                    </div>
                  )}
                  <button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="absolute top-1 right-1 bg-red-500/90 text-white rounded-full p-1 opacity-0 group-hover:opacity-100">
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Поле ввода */}
        <div className="p-3 md:p-4 border-t border-white/10 bg-[#171717]/80 backdrop-blur-md">
          <div className="flex items-end gap-2">
            <input ref={fileRef} type="file" accept="image/*,image/gif,video/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />

            <div className="relative">
              <button
                onClick={() => setShowStickers(!showStickers)}
                className={`p-2 rounded-xl transition-colors ${showStickers ? "text-[#8b5cf6] bg-[#8b5cf6]/10" : "text-white/60 hover:text-[#8b5cf6] hover:bg-white/5"}`}
              >
                <Smile size={20} />
              </button>
              {showStickers && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowStickers(false)} />
                  <div className="absolute bottom-full left-0 mb-2 w-72 bg-[#1f1f23] border border-white/15 rounded-2xl shadow-2xl z-50">
                    <div className="p-3 border-b border-white/10 flex items-center justify-between">
                      <span className="text-sm font-bold text-white">Стикеры</span>
                      <button onClick={() => setShowStickers(false)} className="text-white/60 hover:text-white">
                        <X size={16} />
                      </button>
                    </div>
                    <div className="p-2 grid grid-cols-6 gap-1 max-h-64 overflow-y-auto">
                      {STICKERS.map((s) => (
                        <button
                          key={s.code}
                          onClick={() => { insertSticker(s.code); setShowStickers(false); }}
                          className="aspect-square flex items-center justify-center text-2xl hover:bg-white/10 rounded-lg"
                        >
                          {s.emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={() => fileRef.current?.click()}
              className={`p-2 rounded-xl transition-colors relative ${files.length > 0 ? "text-[#8b5cf6] bg-[#8b5cf6]/10" : "text-white/60 hover:text-[#8b5cf6] hover:bg-white/5"}`}
            >
              <Paperclip size={20} />
              {files.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#8b5cf6] text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {files.length}
                </span>
              )}
            </button>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={isSecret ? "Зашифрованное сообщение..." : "Напишите сообщение..."}
              rows={1}
              className={`flex-1 border rounded-xl px-3 md:px-4 py-2 bg-white/5 text-white placeholder-white/40 focus:outline-none resize-none max-h-32 ${
                isSecret ? "border-emerald-500/40 focus:border-emerald-500" : "border-white/15 focus:border-[#8b5cf6]"
              }`}
            />

            <button
              onClick={sendMessage}
              disabled={(!text.trim() && files.length === 0) || !!cryptoError}
              className={`p-2.5 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-all ${
                isSecret
                  ? "border border-emerald-500 bg-emerald-600 text-white hover:bg-emerald-700"
                  : "border border-[#8b5cf6] bg-[#8b5cf6] text-white hover:bg-[#7c3aed]"
              }`}
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      </main>

      {/* Модалка верификации ключей */}
      {showVerify && (
        <>
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200]" onClick={() => setShowVerify(false)} />
          <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
            <div className="w-full max-w-md border border-emerald-500/30 rounded-2xl bg-[#1f1f23]/95 backdrop-blur-md shadow-2xl p-6 pointer-events-auto">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="text-emerald-400" size={24} />
                  <h2 className="text-xl font-black text-white">Проверка шифрования</h2>
                </div>
                <button onClick={() => setShowVerify(false)} className="text-white/60 hover:text-white">
                  <X size={20} />
                </button>
              </div>

              <p className="text-sm text-white/60 mb-4">
                Сравните эти отпечатки с собеседником через другой канал (голосом или лично).
                Если они совпадают — канал защищён от перехвата.
              </p>

              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-xs text-white/50 mb-1">Ваш отпечаток:</p>
                  <p className="font-mono text-sm text-emerald-300 tracking-wider">{myFingerprint || "—"}</p>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-xs text-white/50 mb-1">Отпечаток @{chatPartner?.username}:</p>
                  <p className="font-mono text-sm text-emerald-300 tracking-wider">{partnerFingerprint || "—"}</p>
                </div>
              </div>

              <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <p className="text-xs text-emerald-200">
                  🔒 Сообщения шифруются на вашем устройстве и расшифровываются только на устройстве собеседника.
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Галерея медиа */}
      {showMediaGallery && (
        <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Медиа из чата</h2>
              <button onClick={() => setShowMediaGallery(false)} className="text-white/60 hover:text-white p-2">
                <X size={24} />
              </button>
            </div>
            {mediaItems.length === 0 ? (
              <p className="text-white/60 text-center py-12">Нет медиа</p>
            ) : (
              <div className="flex-1 overflow-y-auto grid grid-cols-3 md:grid-cols-4 gap-3">
                {mediaItems.map((item) => (
                  <div key={item.id} className="aspect-square relative cursor-pointer group rounded-lg overflow-hidden border border-white/10" onClick={() => setSelectedMedia(item)}>
                    {(item.media_type === "image" || item.media_type === "gif") && (
                      <img src={mediaUrl(item.media_url)} alt="" className="w-full h-full object-cover" />
                    )}
                    {item.media_type === "video" && (
                      <>
                        <video src={mediaUrl(item.media_url)} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                          <Film size={32} className="text-white" />
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {selectedMedia && (
        <div className="fixed inset-0 z-[201] bg-black/95 flex items-center justify-center p-4" onClick={() => setSelectedMedia(null)}>
          <button onClick={() => setSelectedMedia(null)} className="absolute top-4 right-4 text-white/60 hover:text-white p-2 z-10">
            <X size={28} />
          </button>
          <div className="max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            {(selectedMedia.media_type === "image" || selectedMedia.media_type === "gif") && (
              <img src={mediaUrl(selectedMedia.media_url)} alt="" className="max-w-full max-h-[90vh] rounded-lg" />
            )}
            {selectedMedia.media_type === "video" && (
              <video src={mediaUrl(selectedMedia.media_url)} controls autoPlay className="max-w-full max-h-[90vh] rounded-lg" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}