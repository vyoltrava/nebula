"use client";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Avatar } from "@/components/Avatar";
import { getToken } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import { STICKERS } from "@/lib/stickers";
import { API_URL } from "@/lib/api";
import { 
  Send, Image as ImageIcon, X, Smile, Paperclip, 
  FileText, Film, Edit2, Trash2, MoreVertical
} from "lucide-react";

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
  const fileRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  function getGlowColor(user: any): string | null {
    if (user?.is_admin) return "#8b5cf6";
    if (user?.is_moderator) return "#3b82f6";
    if (user?.role?.color) return user.role.color;
    return null;
  }

  function glowStyle(user: any): React.CSSProperties | undefined {
    const c = getGlowColor(user);
    if (!c) return undefined;
    return {
      color: c,
      textShadow: `0 0 6px ${c}B3, 0 0 14px ${c}66`,
    };
  }

async function loadChatPartner() {
  const token = getToken();
  if (!token) return;
  try {
    const res = await fetch(`http://${API_URL}/api/chats/${chatId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 403) {
      router.push("/messages");
      return;
    }
    if (res.ok) {
      setChatPartner(await res.json());
    }
  } catch (err) {
    console.error("Failed to load chat partner", err);
  }
}

async function loadMessages() {
  const token = getToken();
  if (!token) return;
  try {
    const res = await fetch(`http://${API_URL}/api/chats/${chatId}/messages`, {
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
    // Игнорируем ошибки при размонтировании
    console.error("Failed to load messages", err);
  }
}

useEffect(() => {
  const token = getToken();
  if (!token) {
    router.push("/login");
    return;
  }

  const controller = new AbortController();
  const signal = controller.signal;

  // Загрузка текущего пользователя
  fetch('http://${API_URL}/api/me', {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  })
    .then((r) => r.json())
    .then(setCurrentUser)
    .catch((err) => {
      if (err.name !== "AbortError") {
        console.error("Failed to load user:", err);
      }
    });

  // Загрузка собеседника
  loadChatPartner();
  loadMessages();

  // Помечаем чат как прочитанный
  fetch(`http://${API_URL}/api/chats/${chatId}/read`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    signal,
  }).catch((err) => {
    if (err.name !== "AbortError") {
      console.error("Failed to mark chat as read:", err);
    }
  });

  // Автообновление сообщений каждые 3 секунды
  const interval = setInterval(() => {
    if (!signal.aborted) {
      loadMessages();
    }
  }, 3000);

  // Cleanup при размонтировании
  return () => {
    controller.abort();
    clearInterval(interval);
  };
}, [chatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function onFiles(newFiles: FileList | null) {
    if (!newFiles) return;
    const arr = Array.from(newFiles);
    setFiles((prev) => [...prev, ...arr].slice(0, 5));
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function insertSticker(code: string) {
    setText((prev) => prev + ` ${code} `);
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function sendMessage() {
  const token = getToken();
  if (!token) return;
  if (!text.trim() && files.length === 0) return;

  const messagesToSend: { text: string; file: File | null }[] = [];
  
  if (files.length > 0) {
    files.forEach((f, i) => {
      messagesToSend.push({
        text: i === 0 ? text.trim() : "",
        file: f,
      });
    });
  } else {
    messagesToSend.push({ text: text.trim(), file: null });
  }

  try {
    for (const msg of messagesToSend) {
      const form = new FormData();
      if (msg.text) form.append("text", msg.text);
      if (msg.file) form.append("file", msg.file);

      const res = await fetch(`http://${API_URL}/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (res.status === 403) {
        alert("У вас нет доступа к этому чату");
        router.push("/messages");
        return;
      }
    }

    setText("");
    setFiles([]);
    loadMessages();
  } catch (err) {
    console.error("Failed to send message:", err);
    alert("Не удалось отправить сообщение. Проверьте подключение.");
  }
}

  async function loadMedia() {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`http://${API_URL}/api/chats/${chatId}/media`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setMediaItems(await res.json());
      }
    } catch (err) {
      console.error("Failed to load media", err);
    }
  }

  async function deleteMessage(messageId: number) {
  if (!confirm("Удалить сообщение?")) return;
  const token = getToken();
  if (!token) return;

  try {
    const res = await fetch(`http://${API_URL}/api/chats/${chatId}/messages/${messageId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 403) {
      alert("Нет прав для удаления");
      return;
    }

    if (res.ok) {
      loadMessages();
    }
  } catch (err) {
    console.error("Failed to delete message:", err);
    alert("Ошибка сети");
  }
}

async function submitEdit() {
  if (!editingMessageId || !editText.trim()) return;
  const token = getToken();
  if (!token) return;

  try {
    const form = new FormData();
    form.append("text", editText);

    const res = await fetch(`http://${API_URL}/api/chats/${chatId}/messages/${editingMessageId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    if (res.status === 403) {
      alert("Нет прав для редактирования");
      cancelEdit();
      return;
    }

    if (res.ok) {
      setEditingMessageId(null);
      setEditText("");
      loadMessages();
    }
  } catch (err) {
    console.error("Failed to edit message:", err);
    alert("Ошибка сети");
  }
}


function startEdit(msg: any) {
  setEditingMessageId(msg.id);
  setEditText(msg.text || "");
  setActiveMessageMenu(null);
  setTimeout(() => {
    const input = document.querySelector(`[data-edit-input="${msg.id}"]`) as HTMLTextAreaElement;
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }, 50);
}

// ← ДОБАВЬТЕ ЭТУ ФУНКЦИЮ:
function cancelEdit() {
  setEditingMessageId(null);
  setEditText("");
}

  const partnerGlow = getGlowColor(chatPartner);

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />
      <div className="w-px shrink-0 bg-white/10 my-3" />
      <main className="flex-1 flex flex-col border-x border-white/10">
        {/* Шапка чата */}
        <div className="p-4 border-b border-white/10 bg-[#171717]/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/messages")}
              className="text-white/60 hover:text-white transition-colors shrink-0"
            >
              ← Назад
            </button>
            
            {chatPartner && (
              <Link
                href={`/user/${chatPartner.id}`}
                className="flex items-center gap-3 group flex-1"
              >
                <div
                  className="shrink-0"
                  style={
                    partnerGlow
                      ? { filter: `drop-shadow(0 0 8px ${partnerGlow})` }
                      : undefined
                  }
                >
                  <Avatar
                    src={chatPartner.avatar_url}
                    name={chatPartner.display_name}
                    id={chatPartner.id}
                    size={40}
                  />
                </div>
                <div>
                  <p
                    className={`font-bold transition-all group-hover:opacity-80 ${
                      glowStyle(chatPartner) ? "" : "text-white group-hover:text-[#8b5cf6]"
                    }`}
                    style={glowStyle(chatPartner)}
                  >
                    {chatPartner.display_name}
                  </p>
                  <p className="text-xs text-white/50">@{chatPartner.username}</p>
                </div>
              </Link>
            )}

            <button
              onClick={() => {
                loadMedia();
                setShowMediaGallery(true);
              }}
              className="p-2 text-white/60 hover:text-[#8b5cf6] transition-colors shrink-0"
              title="Медиа"
            >
              <ImageIcon size={20} />
            </button>
          </div>
        </div>

        {/* Сообщения */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {currentUser && messages.map((msg) => {
            const isMine = msg.sender_id === currentUser.id;
            const isEditing = editingMessageId === msg.id;
            
            return (
              <div
                key={msg.id}
                className={`flex gap-2 ${isMine ? "justify-end" : "justify-start"}`}
              >
                {!isMine && chatPartner && (
                  <Link href={`/user/${chatPartner.id}`} className="shrink-0">
                    <div
                      style={
                        partnerGlow
                          ? { filter: `drop-shadow(0 0 6px ${partnerGlow})` }
                          : undefined
                      }
                    >
                      <Avatar
                        src={msg.sender_avatar}
                        name={msg.sender_name}
                        id={msg.sender_id}
                        size={32}
                      />
                    </div>
                  </Link>
                )}
                
                <div className={`max-w-[70%] ${isMine ? "items-end" : "items-start"} flex flex-col`}>
                  <div
                    className={`rounded-2xl px-4 py-2 ${
                      isMine
                        ? "bg-[#8b5cf6] text-white"
                        : "bg-white/10 text-white border border-white/15"
                    }`}
                  >
                    {msg.media_url && msg.media_type === "image" && (
                      <img
                        src={mediaUrl(msg.media_url)}
                        alt=""
                        className="rounded-xl max-h-64 mb-2 cursor-pointer hover:opacity-90"
                        onClick={() => setSelectedMedia(msg)}
                      />
                    )}
                    {msg.media_url && msg.media_type === "gif" && (
                      <img
                        src={mediaUrl(msg.media_url)}
                        alt=""
                        className="rounded-xl max-h-64 mb-2 cursor-pointer hover:opacity-90"
                        onClick={() => setSelectedMedia(msg)}
                      />
                    )}
                    {msg.media_url && msg.media_type === "video" && (
                      <video
                        src={mediaUrl(msg.media_url)}
                        controls
                        className="rounded-xl max-h-64 mb-2"
                      />
                    )}
                    
                    {isEditing ? (
                      <div className="flex gap-2 items-start">
                        <textarea
                          data-edit-input={msg.id}
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              submitEdit();
                            }
                            if (e.key === "Escape") {
                              cancelEdit();
                            }
                          }}
                          className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#8b5cf6] resize-none"
                          rows={2}
                        />
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={submitEdit}
                            className="text-green-400 hover:text-green-300 text-xs font-bold"
                          >
                            ✓
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="text-red-400 hover:text-red-300 text-xs font-bold"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}
                      </>
                    )}
                  </div>

                  {/* Время и меню под пузырём */}
                  {!isEditing && (
                    <div className={`flex items-center gap-2 mt-1 px-1 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
                      <p className={`text-[10px] ${isMine ? "text-white/60" : "text-white/40"}`}>
                        {new Date(msg.created_at).toLocaleTimeString("ru-RU", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {msg.edited && <span className="ml-1 italic">(ред.)</span>}
                      </p>
                      
                      {isMine && (
                        <div className="relative">
                          <button
                            onClick={() => setActiveMessageMenu(activeMessageMenu === msg.id ? null : msg.id)}
                            className="p-1 text-white/40 hover:text-white transition-all"
                          >
                            <MoreVertical size={12} />
                          </button>
                          
                          {activeMessageMenu === msg.id && (
                            <>
                              <div
                                className="fixed inset-0 z-40"
                                onClick={() => setActiveMessageMenu(null)}
                              />
                              <div className={`absolute ${isMine ? "right-0" : "left-0"} top-full mt-1 bg-[#1f1f23] border border-white/15 rounded-lg shadow-xl overflow-hidden min-w-[140px] z-50`}>
                                {msg.text && (
                                  <button
                                    onClick={() => startEdit(msg)}
                                    className="w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10 flex items-center gap-2 transition-colors"
                                  >
                                    <Edit2 size={14} />
                                    Редактировать
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    deleteMessage(msg.id);
                                    setActiveMessageMenu(null);
                                  }}
                                  className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2 transition-colors"
                                >
                                  <Trash2 size={14} />
                                  Удалить
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

        {files.length > 0 && (
          <div className="px-4 py-3 border-t border-white/10 bg-white/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-white/70">
                Вложения ({files.length}/5)
              </span>
              <button
                onClick={() => setFiles([])}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Очистить все
              </button>
            </div>
            <div className="flex gap-2 flex-wrap">
              {files.map((f, i) => (
                <div
                  key={i}
                  className="relative group border border-white/15 rounded-xl overflow-hidden bg-white/5 hover:border-white/30 transition-colors"
                >
                  {f.type.startsWith("image/") ? (
                    <img
                      src={URL.createObjectURL(f)}
                      alt=""
                      className="w-24 h-24 object-cover"
                    />
                  ) : (
                    <div className="w-24 h-24 flex flex-col items-center justify-center gap-1 p-2">
                      <FileText size={24} className="text-white/60" />
                      <span className="text-[10px] text-white/60 text-center truncate w-full px-1">
                        {f.name}
                      </span>
                      <span className="text-[9px] text-white/40">{formatSize(f.size)}</span>
                    </div>
                  )}
                  <button
                    onClick={() => removeFile(i)}
                    className="absolute top-1 right-1 bg-red-500/90 hover:bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={10} />
                  </button>
                  {f.type.startsWith("video/") && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
                      <Film size={24} className="text-white" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="p-4 border-t border-white/10 bg-[#171717]/80 backdrop-blur-md">
          <div className="flex items-end gap-2 relative">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,image/gif,video/*"
              multiple
              className="hidden"
              onChange={(e) => onFiles(e.target.files)}
            />

            <div className="relative">
              <button
                onClick={() => setShowStickers(!showStickers)}
                className={`p-2 rounded-xl transition-colors ${
                  showStickers
                    ? "text-[#8b5cf6] bg-[#8b5cf6]/10"
                    : "text-white/60 hover:text-[#8b5cf6] hover:bg-white/5"
                }`}
                title="Стикеры"
              >
                <Smile size={20} />
              </button>
              {showStickers && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowStickers(false)} />
                  <div className="absolute bottom-full left-0 mb-2 w-72 bg-[#1f1f23] border border-white/15 rounded-2xl shadow-2xl z-50 overflow-hidden">
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
                          onClick={() => {
                            insertSticker(s.code);
                            setShowStickers(false);
                          }}
                          className="aspect-square flex items-center justify-center text-2xl hover:bg-white/10 rounded-lg transition-colors"
                          title={s.label}
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
              className={`p-2 rounded-xl transition-colors relative ${
                files.length > 0
                  ? "text-[#8b5cf6] bg-[#8b5cf6]/10"
                  : "text-white/60 hover:text-[#8b5cf6] hover:bg-white/5"
              }`}
              title="Прикрепить файлы"
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
              placeholder="Напишите сообщение..."
              rows={1}
              className="flex-1 border border-white/15 rounded-xl px-4 py-2 bg-white/5 text-white placeholder-white/40 focus:outline-none focus:border-[#8b5cf6] resize-none max-h-32"
            />

            <button
              onClick={sendMessage}
              disabled={!text.trim() && files.length === 0}
              className="p-2.5 border border-[#8b5cf6] bg-[#8b5cf6] text-white rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#7c3aed] transition-all"
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      </main>

      {/* Галерея медиа */}
      {showMediaGallery && (
        <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Медиа из чата</h2>
              <button
                onClick={() => setShowMediaGallery(false)}
                className="text-white/60 hover:text-white p-2"
              >
                <X size={24} />
              </button>
            </div>
            
            {mediaItems.length === 0 ? (
              <p className="text-white/60 text-center py-12">Нет медиа-файлов</p>
            ) : (
              <div className="flex-1 overflow-y-auto grid grid-cols-3 md:grid-cols-4 gap-3">
                {mediaItems.map((item) => (
                  <div
                    key={item.id}
                    className="aspect-square relative cursor-pointer group rounded-lg overflow-hidden border border-white/10 hover:border-white/30 transition-colors"
                    onClick={() => setSelectedMedia(item)}
                  >
                    {(item.media_type === "image" || item.media_type === "gif") && (
                      <img
                        src={mediaUrl(item.media_url)}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    )}
                    {item.media_type === "video" && (
                      <>
                        <video
                          src={mediaUrl(item.media_url)}
                          className="w-full h-full object-cover"
                        />
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

      {/* Просмотр медиа */}
      {selectedMedia && (
        <div
          className="fixed inset-0 z-[201] bg-black/95 flex items-center justify-center p-4"
          onClick={() => setSelectedMedia(null)}
        >
          <button
            onClick={() => setSelectedMedia(null)}
            className="absolute top-4 right-4 text-white/60 hover:text-white p-2 z-10"
          >
            <X size={28} />
          </button>
          
          <div className="max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            {(selectedMedia.media_type === "image" || selectedMedia.media_type === "gif") && (
              <img
                src={mediaUrl(selectedMedia.media_url)}
                alt=""
                className="max-w-full max-h-[90vh] rounded-lg"
              />
            )}
            {selectedMedia.media_type === "video" && (
              <video
                src={mediaUrl(selectedMedia.media_url)}
                controls
                autoPlay
                className="max-w-full max-h-[90vh] rounded-lg"
              />
            )}
            
            <div className="mt-4 text-center">
              <p className="text-white/60 text-sm">
                {new Date(selectedMedia.created_at).toLocaleString("ru-RU")}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}