"use client";
import { useTheme } from "next-themes";
import { resolveNickColor } from "@/lib/nickGlow";
import { useWebSocket } from "@/src/hooks/useWebSocket";
import { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Avatar } from "@/components/Avatar";
import { GroupMembersModal } from "@/components/GroupMembersModal";
import { GroupSettingsModal } from "@/components/GroupSettingsModal";
import { VideoNoteRecorder } from "@/components/VideoNoteRecorder";
import { VideoNotePlayer } from "@/components/VideoNotePlayer";
import { VideoPlayer } from "@/components/VideoPlayer";
import { MessageContextMenu } from "@/components/MessageContextMenu";
import CallButton from '@/components/CallButton';
import { MessageBubble } from "@/components/MessageBubble";
import LinkPreview  from "@/components/LinkPreview";
import { getToken } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import { initCryptoOnLogin } from "@/lib/cryptoInit";
import { formatChatTime } from "@/lib/time";
import { useDevicePermission } from "@/lib/useDevicePermission";
import { useSwipe } from "@/lib/useSwipe";
import { PermissionHelpModal } from "@/components/PermissionHelpModal";
import { AudioPlayer } from "@/components/AudioPlayer";
import { ChatWindowSkeleton } from "@/components/Skeletons";
import { isPushSubscribed } from "@/lib/push";
import { pinMessage, unpinMessage, getPinnedMessages } from "@/lib/api";
import type { PinnedMessage } from "@/lib/types";
import { EncryptedMediaPlayer } from "@/components/EncryptedMediaPlayer";
import dynamic from "next/dynamic";

// 🚀 react-markdown тяжёлый — ленивая загрузка
const MarkdownRenderer = dynamic(() => import("@/components/MarkdownRenderer").then(m => m.MarkdownRenderer), {
  ssr: false,
  loading: () => <div className="editor-loading animate-pulse text-sm opacity-50">📝 …</div>,
});
import { RichEditor, RichEditorHandle } from "@/components/RichEditor";
import { useDraft } from "@/src/hooks/useDraft";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { Button } from "@/components/ui/Button";
import { useCall } from "@/lib/CallContext";
import { useQuickReaction } from "@/lib/useQuickReaction";




import { isOnline, lastSeenText } from "@/lib/online";
import { useUnreadCounts } from "@/lib/UnreadCountsContext";
import {
  Send, Image as ImageIcon, X, Smile, Paperclip,
  FileText, Film, Edit2, Trash2, MoreVertical,
  Lock, Search, ShieldCheck, AlertTriangle,
  Check, CheckCheck, CheckSquare, Mic, Square, Users, Settings,
  Pin, PinOff, Video, Copy, SmilePlus,  Reply, Bookmark, Type, Plus
} from "lucide-react";
// ✅ НОВЫЕ ИМПОРТЫ:
import {
  getKeyPair, encryptMessage, decryptMessage,
  generateSessionKey, encryptSessionKeyForUser, decryptSessionKey,
} from "@/lib/crypto";

// 🛡️ НОВОЕ БЕЗОПАСНОЕ ХРАНИЛИЩЕ
import { 
  storeSessionKey, 
  loadSessionKey, 
  clearSessionKey 
} from "@/lib/secureSessionKeys";




// Компонент сообщения со свайпом
function SwipeableMessage({
  children,
  onSwipeRight,
  msgId,
  raised = false,
}: {
  children: React.ReactNode;
  onSwipeRight: () => void;
  msgId: number;
  raised?: boolean;
}) {
  const { offset, direction, isSwiping, handlers } = useSwipe({
    threshold: 80,
    maxOffset: 120,
    resistance: 0.3,
    onSwipeRight,
  });

  // Показываем иконку ответа при свайпе вправо
  const showReplyIcon = direction === "right" && offset > 30;
  const iconOpacity = Math.min((offset - 30) / 50, 1);

  return (
    <div
      className={`relative select-none ${raised ? "z-50" : ""}`}
      style={{ touchAction: "pan-y" }}
      {...handlers}
    >
      {/* Фон с иконкой ответа */}
      {showReplyIcon && (
        <div
          className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none"
          style={{ opacity: iconOpacity }}
        >
          <div className="w-10 h-10 rounded-full bg-[#8b5cf6]/20 border-2 border-[#8b5cf6] flex items-center justify-center">
            <Send size={18} className="text-[#8b5cf6] rotate-180" />
          </div>
        </div>
      )}

      {/* Сам контент сообщения со смещением */}
      <div
        className="relative z-10 transition-transform"
        style={{
          transform: `translateX(${isSwiping ? offset : 0}px)`,
          transition: isSwiping ? "none" : "transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default function ChatPage() {
  const { t, locale } = useI18n();
  const params = useParams();
  const chatId = params?.id as string;
  const router = useRouter();
  const { refresh } = useUnreadCounts();
  const { initiateCall } = useCall(); 


  const [messages, setMessages] = useState<any[]>([]);
  const [isSavedChat, setIsSavedChat] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [text, setText, clearDraft] = useDraft(`draft_chat_${chatId}`, "");
  const [files, setFiles] = useState<File[]>([]);
  const [replyTo, setReplyTo] = useState<any | null>(null); // 🆕 сообщение на которое отвечаем
  const [stickerPacks, setStickerPacks] = useState<any[]>([]);
  const [reactionPickerFor, setReactionPickerFor] = useState<number | null>(null);
  // 🆕 Long press для открытия реакций
  const [longPressMenu, setLongPressMenu] = useState<{
    msgId: number, x: number, y: number,
    msgTop?: number, msgBottom?: number, msgLeft?: number, msgRight?: number
} | null>(null);
  
  const isLongPressRef = useRef(false);
  const [activePackTab, setActivePackTab] = useState<number>(0);
  const [stickerPanelTab, setStickerPanelTab] = useState<"emoji" | "stickers">("emoji");
  const [stickerPanelPack, setStickerPanelPack] = useState<number>(0);
  const [showStickers, setShowStickers] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [showMediaGallery, setShowMediaGallery] = useState(false);
  const [mediaItems, setMediaItems] = useState<any[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<any | null>(null);
  const [activeMessageMenu, setActiveMessageMenu] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{
  msg: any;
  x: number;
  y: number;
} | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<RichEditorHandle>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [chatMembers, setChatMembers] = useState<any[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionSuggestions, setMentionSuggestions] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [chatPartner, setChatPartner] = useState<any>(null);
  const [chatInfo, setChatInfo] = useState<any>(null);
  const [isSecret, setIsSecret] = useState(false);

  // ✅ НОВЫЕ STATES:
  const [secretState, setSecretState] = useState<"loading" | "ready" | "waiting" | "error">("loading");
  const [secretError, setSecretError] = useState<string | null>(null);
  const [secretSessionKey, setSecretSessionKey] = useState<Uint8Array | null>(null);
  const secretInitRef = useRef(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Set<number>>(new Set());
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [showGroupMembers, setShowGroupMembers] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);

  const [forwardingMessage, setForwardingMessage] = useState<any | null>(null);
  const [forwardChats, setForwardChats] = useState<any[]>([]);
  const [showForwardModal, setShowForwardModal] = useState(false);

  const { reaction: quickReaction } = useQuickReaction();
   const [popReaction, setPopReaction] = useState<{content: string, type: 'emoji' | 'sticker', stickerId?: number, x: number, y: number, id: number, visible: boolean} | null>(null);
   const [showInputActions, setShowInputActions] = useState(false);

const handleContextMenu = (e: React.MouseEvent, msg: any) => {
  if (isSelectMode) return; // Убрал isSecret, чтобы меню открывалось везде
  e.preventDefault();
  
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  const menuWidth = 240;
  const menuHeight = 320; // С запасом на количество пунктов
  
  let x = e.clientX;
  let y = e.clientY;
  
  // Если меню вылезает за правый край, сдвигаем влево
  if (x + menuWidth > windowWidth) {
    x = windowWidth - menuWidth - 10;
  }
  // Если меню вылезает за нижний край, сдвигаем вверх
  if (y + menuHeight > windowHeight) {
    y = windowHeight - menuHeight - 10;
  }
  
  // Гарантируем, что координаты не отрицательные
  x = Math.max(10, x);
  y = Math.max(10, y);
  
  console.log("🖱️ Правый клик: открываем меню для msg.id =", msg.id, "координаты:", { x, y });
  setContextMenu({ msg, x, y });
};

const insertTextAtCursor = (textToInsert: string) => {
  const editor = editorRef.current;
  if (editor) {
    editor.insertText(textToInsert);
    sendLiveText(editor.getValue());
    return;
  }
  setText((prev) => prev + textToInsert);
  sendLiveText(text + textToInsert);
};

const openMessageMenu = (e: React.MouseEvent | React.PointerEvent, msg: any) => {
  e.stopPropagation();
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  const menuWidth = 220;
  const menuHeight = 300;
  
  // ✅ Позиционируем ПОД кнопкой, выровненное по правому краю кнопки
  let x = rect.right - menuWidth;
  let y = rect.bottom + 4;
  
  // Если вылезает за левый край
  if (x < 10) x = 10;
  // Если вылезает за правый край
  if (x + menuWidth > windowWidth) x = windowWidth - menuWidth - 10;
  // Если вылезает за нижний край — открываем ВЫШЕ кнопки
  if (y + menuHeight > windowHeight) {
    y = rect.top - menuHeight - 4;
  }
  
  y = Math.max(10, y);
  
  setContextMenu({ msg, x, y });
};
const handlePointerDown = (e: React.PointerEvent, msg: any) => {
  if (isSelectMode || isSecret) return;
  
  longPressTimerRef.current = setTimeout(() => {
    isLongPressRef.current = true;
    
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const menuWidth = 220;
    const menuHeight = 300;
    
    // ✅ Позиционируем ПОД пальцем/курсором
    let x = e.clientX - menuWidth / 2; // центрируем по горизонтали
    let y = e.clientY + 20; // чуть ниже пальца
    
    if (x < 10) x = 10;
    if (x + menuWidth > windowWidth) x = windowWidth - menuWidth - 10;
    if (y + menuHeight > windowHeight) y = e.clientY - menuHeight - 20;
    y = Math.max(10, y);
    
    setContextMenu({ msg, x, y }); // ✅ Открываем полное меню, а не longPressMenu
  }, 500);
};

const handlePointerUp = () => {
  if (longPressTimerRef.current) {
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }
};

const handlePointerLeave = () => {
  if (longPressTimerRef.current) {
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }
};

 const allAvailableReactions = useMemo(() => {
  const result: {type: 'emoji' | 'sticker', content: string, stickerId?: number, packName: string, locked: boolean, minLevel?: number}[] = [];
  
  if (!stickerPacks || stickerPacks.length === 0) {
    console.log("⚠️ stickerPacks пуст, реакции не сгенерированы");
    return result;
  }
  
  stickerPacks.forEach(pack => {
    const userLevel = currentUser?.level ?? 0;
    const locked = (pack.min_level || 0) > userLevel;
    pack.stickers?.forEach((s: any) => {
      result.push({
        // 🆕 Бэкенд отдаёт type: "emoji" | "image". Приводим к внутреннему формату:
        // "image" (картинка из стикер-пака) = стикер-реакция
        type: s.type === 'image' ? 'sticker' : 'emoji',
        content: s.content,
        stickerId: s.type === 'image' ? Number(s.id) : undefined,
        packName: pack.name,
        locked,
        minLevel: pack.min_level
      });
    });
  });
  
  console.log("✅ Итоговые доступные реакции для меню (всего):", result.length, "Первые 5:", result.slice(0, 5));
  return result;
}, [stickerPacks, currentUser]);


  // 🆕 ЖИВЫЕ СООБЩЕНИЯ: собеседники видят текст по мере набора
  const [liveTexts, setLiveTexts] = useState<Record<number, { text: string; name: string; ts: number; leaving?: boolean }>>({});
  const liveTextsRef = useRef(liveTexts);
  useEffect(() => { liveTextsRef.current = liveTexts; }, [liveTexts]);
  const liveThrottleRef = useRef(0);
    // 🆕 Настройки приватности живых сообщений
  const [liveSettings, setLiveSettings] = useState({ enabled: true, broadcast: true });
  const liveSettingsRef = useRef(liveSettings);
  useEffect(() => { liveSettingsRef.current = liveSettings; }, [liveSettings]);
  // 💬 "Печатает..."
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [typingUserName, setTypingUserName] = useState<string | null>(null); // для групп
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef<number>(0);


  const [mediaTab, setMediaTab] = useState<"image" | "video" | "video_note" | "audio">("image");

  const cancelRecordingRef = useRef(false);
  const micPerm = useDevicePermission("microphone");
  const camPerm = useDevicePermission("camera");
  const [permHelp, setPermHelp] = useState<null | "microphone" | "camera">(null);

  const [showVideoRecorder, setShowVideoRecorder] = useState(false);

  const [menuOpenUp, setMenuOpenUp] = useState(false);
  const menuOpenTimeRef = useRef(0);
  
  // 🆕 Состояния для кнопки отправки/записи
  const [showRecordMenu, setShowRecordMenu] = useState(false);
  const sendLongPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isSendLongPressRef = useRef(false);
  const suppressClickRef = useRef(false);
  const [selectedMenuItem, setSelectedMenuItem] = useState<'voice' | 'video' | null>(null);
  const menuItemRefs = useRef<{ voice: HTMLButtonElement | null; video: HTMLButtonElement | null }>({ voice: null, video: null });

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>([]);
  const [showPinnedList, setShowPinnedList] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const sendingRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasScrolledToUnreadRef = useRef(false);
  
  // 🆕 Фича: Скролл и кнопка "Вниз"
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 200;
    setShowScrollBtn(!isNearBottom);
    setIsAutoScrollEnabled(isNearBottom);
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    scrollContainerRef.current?.scrollTo({
      top: scrollContainerRef.current.scrollHeight,
      behavior
    });
  };

  const isGroup = !!chatInfo?.is_group;

  const getMediaClasses = (type: string) => {
    const base = "rounded-lg sm:rounded-xl mb-1.5 sm:mb-2 w-full";
    const sizes: Record<string, string> = {
      image: "max-h-52 sm:max-h-64",
      gif: "max-h-52 sm:max-h-64",
      video: "max-h-52 sm:max-h-64",
    };
    return `${base} ${sizes[type] || ""}`;
  };

  const pushActiveRef = useRef(false);

  useEffect(() => {
    isPushSubscribed().then((v) => { pushActiveRef.current = v; });
  }, []);

  function localNotify(title: string, body: string) {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    if (!document.hidden) return;        // вкладка открыта — не дублируем
    if (pushActiveRef.current) return;   // пуши включены — придёт с сервера
    try { new Notification(title, { body }); } catch {}
  }


  // ✅ НОВАЯ ФУНКЦИЯ: Инициализация секретного чата
async function initSecretChat() {
  if (!isSecret || !chatPartner || isGroup) return;
  const token = getToken();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!token || !apiUrl) return;

  setSecretState("loading");
  setSecretError(null);

  try {
    // 1. Проверяем локальный session key
    let sk = loadSessionKey(Number(chatId));

    if (sk) {
      setSecretSessionKey(sk);
      setSecretState("ready");
      return;
    }

    // 2. Пробуем загрузить с сервера
    const res = await fetch(`${apiUrl}/api/chats/${chatId}/session-key`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const data = await res.json();
      try {
        sk = decryptSessionKey(data.encrypted_session_key);
        storeSessionKey(Number(chatId), sk);
        setSecretSessionKey(sk);
        setSecretState("ready");
        return;
      } catch (e) {
        console.warn("[SecretChat] Stored session key invalid, creating new");
      }
    }

    // 3. Session key нет — создаём новый
    const pkRes = await fetch(`${apiUrl}/api/users/${chatPartner.id}/public-key`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!pkRes.ok) {
      setSecretState("waiting");
      setSecretError(t("messages.secretWaitOnline"));
      return;
    }

    const pkData = await pkRes.json();

    // Если ключи ещё placeholder — ждём
    if (pkData.is_pending || (pkData.public_key && pkData.public_key.startsWith("pending_"))) {
      setSecretState("waiting");
      setSecretError(t("messages.secretWaitVisit"));
      return;
    }

    // 4. Генерируем session key
    const myKeys = getKeyPair();
    if (!myKeys) {
      setSecretState("error");
      setSecretError(t("messages.keysNotLoaded"));
      return;
    }

    const newSk = generateSessionKey();

    // Шифруем для себя
    const forMe = encryptSessionKeyForUser(newSk, myKeys.publicKeyBase64);
    // Шифруем для собеседника
    const forPartner = encryptSessionKeyForUser(newSk, pkData.public_key);

    // Сохраняем для себя
    const myId = getMyUserIdFromToken();
    const fd1 = new FormData();
    fd1.append("recipient_id", String(myId));
    fd1.append("encrypted_session_key", forMe);
    await fetch(`${apiUrl}/api/chats/${chatId}/session-key`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd1,
    });

    // Сохраняем для собеседника
    const fd2 = new FormData();
    fd2.append("recipient_id", String(chatPartner.id));
    fd2.append("encrypted_session_key", forPartner);
    await fetch(`${apiUrl}/api/chats/${chatId}/session-key`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd2,
    });

    // Сохраняем локально
    storeSessionKey(Number(chatId), newSk);
    setSecretSessionKey(newSk);
    setSecretState("ready");

  } catch (err) {
    console.error("[SecretChat] Init error:", err);
    setSecretState("error");
    setSecretError(t("messages.encryptInitError"));
  }
}

// Вспомогательная: получить свой ID из токена
function getMyUserIdFromToken(): number {
  const token = getToken();
  if (!token) return 0;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return parseInt(payload.sub);
  } catch {
    return 0;
  }
}

// ✅ Шифрование текста
function encryptText(text: string): string | null {
  if (!secretSessionKey) return null;
  return encryptMessage(text, secretSessionKey);
}

// ✅ Расшифровка текста
function decryptText(ciphertext: string): string {
  if (!ciphertext || ciphertext === "[encrypted_media]") return "";
  if (!secretSessionKey) {
    const sk = loadSessionKey(Number(chatId));
    if (sk) {
      setSecretSessionKey(sk);
      return decryptMessage(ciphertext, sk);
    }
    return t("messages.keyNotLoaded");
  }
  return decryptMessage(ciphertext, secretSessionKey);
}

  async function loadForwardChats() {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const chats = await res.json();
        // Исключаем секретные чаты
        setForwardChats(chats.filter((c: any) => !c.is_secret));
      }
    } catch (err) {
      console.error("Failed to load chats for forwarding:", err);
    }
  }

  // Функция пересылки
  async function forwardToChat(targetChatId: number) {
    const token = getToken();
    if (!token || !forwardingMessage) return;
    try {
      const form = new FormData();
      form.append("target_chat_id", String(targetChatId));
      
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages/${forwardingMessage.id}/forward`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        }
      );
      
      if (res.ok) {
        setShowForwardModal(false);
        setForwardingMessage(null);
        alert(t("messages.forwarded"));
      } else {
        const err = await res.json().catch(() => ({ detail: t("common.error") }));
        alert(err.detail || t("messages.forwardFailed"));
      }
    } catch (err) {
      alert(t("common.networkError"));
    }
  }



  async function startRecording() {
    // ✅ Сначала проверяем разрешение, не спамим getUserMedia
    if (micPerm.status === "denied") { setPermHelp("microphone"); return; }
    if (micPerm.status !== "granted") {
      const ok = await micPerm.request();
      if (!ok) { setPermHelp("microphone"); return; }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        if (cancelRecordingRef.current) {
          cancelRecordingRef.current = false; // ❌ отменено — не отправляем
          return;
        }
        const audioFile = new File([audioBlob], 'voice-message.webm', { type: 'audio/webm' });
        await sendVoiceMessage(audioFile);
      };

      cancelRecordingRef.current = false;
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Microphone access denied:", err);
      alert(t("messages.micFailed"));
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  }


  function cancelRecording() {
    cancelRecordingRef.current = true;
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  }

async function sendVoiceMessage(audioFile: File) {
  const token = getToken();
  if (!token) return;
  try {
    if (isSecret) {
      // 🔒 СЕКРЕТНЫЙ ЧАТ
      if (secretState !== "ready") {
        alert(t("messages.encryptNotReady"));
        return;
      }
      const sk = secretSessionKey || loadSessionKey(Number(chatId));
      if (!sk) {
        alert(t("messages.sessionKeyLost"));
        return;
      }
      const { encryptMediaFile } = await import("@/lib/mediaCrypto");
      const encryptedBlob = await encryptMediaFile(audioFile, sk);

      const form = new FormData();
      form.append("file", encryptedBlob, audioFile.name);
      form.append("media_type", "audio");
      if (replyTo) form.append("reply_to_id", String(replyTo.id));

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages/encrypted-media`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        }
      );
      if (!res.ok) {
        alert(t("messages.voiceEncryptFailed"));
      }
    } else {
      // 📨 ОБЫЧНЫЙ ЧАТ
      const form = new FormData();
      form.append("file", audioFile);
      if (replyTo) form.append("reply_to_id", String(replyTo.id));
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) {
        alert(t("messages.voiceFailed"));
      }
    }
  } catch (err) {
    console.error("Failed to send voice:", err);
    alert(t("common.networkError"));
  }
}

  function formatRecordingTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

function getGlowColor(user: any): string | null {
if (user?.role?.color && (user?.role?.level ?? 0) >= 8) return user.role.color; // 🆕 роль 8-11 перекрывает флаги
if (user?.username === "trelod") return "#e4e4e7"; // Zinc-200
  if (user?.is_admin) return "#fff";
  if (user?.is_moderator) return "#3b82f6";
  if (user?.role?.color) return user.role.color;
  return null;
}

  const { resolvedTheme } = useTheme();
  function glowStyle(user: any): React.CSSProperties | undefined {
    const c = resolveNickColor(getGlowColor(user), resolvedTheme);
    if (!c) return undefined;
    return { color: c, textShadow: `0 0 6px ${c}B3, 0 0 14px ${c}66` };
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }


function extractFirstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"]+/);
  return m ? m[0].replace(/[.,;:!?)]+$/, "") : null;
}


  function toggleSelectMode() {
    setIsSelectMode((prev) => !prev);
    setSelectedMessages(new Set());
  }

  function toggleMessageSelection(id: number) {
    setSelectedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function deleteSelectedMessages() {
    if (selectedMessages.size === 0) return;
    if (!confirm(t("messages.deleteNConfirm", { n: selectedMessages.size }))) return;
    const token = getToken();
    if (!token) return;
    try {
      await Promise.all(
        Array.from(selectedMessages).map((id) =>
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          })
        )
      );
      setSelectedMessages(new Set());
      setIsSelectMode(false);
      loadMessages();
    } catch (err) {
      alert(t("messages.deleteMessagesFailed"));
    }
  }

  async function deleteChat() {
    const isOwner = chatInfo?.my_role === "owner";

    let confirmMsg: string;
    let url: string;

    if (isGroup && !isOwner) {
      confirmMsg = t("messages.leaveGroupConfirm");
      url = `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/members/${currentUser?.id}`;
    } else if (isGroup && isOwner) {
      confirmMsg = t("messages.deleteGroupConfirm");
      url = `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}`;
    } else {
      confirmMsg = t("messages.deleteChatAllConfirm");
      url = `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}`;
    }

    if (!confirm(confirmMsg)) return;

    const token = getToken();
    if (!token) return;

    try {
      const res = await fetch(url, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        router.push("/messages");
      } else {
        const err = await res.json().catch(() => ({ detail: t("common.error") }));
        alert(err.detail || t("messages.deleteChatFailed"));
      }
    } catch (err) {
      alert(t("common.networkError"));
    }
  }

 function decryptDisplayText(msg: any): string {
  if (!isSecret) return msg.text || "";
  if (!msg.ciphertext || msg.ciphertext === "[encrypted_media]") return "";
  return decryptText(msg.ciphertext);
}

// 🛡️ Глобальная проверка: мое ли это сообщение (с защитой для Избранного)
function isMessageMine(msg: any): boolean {
  if (isSavedChat) return true; // В Избранном все сообщения мои
  return msg.sender_id === currentUser?.id;
}

async function loadChatInfo() {
  const token = getToken();
  if (!token) return;
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 403) {
      router.push("/messages");
      return;
    }
    if (res.ok) {
      const data = await res.json();
      setChatInfo(data);
      setIsSecret(data.is_secret && !data.is_group);



      // 🛡️ Нормализованная проверка Избранного
      if (data.is_saved) {
        setIsSavedChat(true);
        setChatPartner(null);
        setIsSecret(false);
      } else if (data.is_group) {
        setChatPartner(null);
        setIsSavedChat(false);
      } else {
        setIsSavedChat(false);
        setChatPartner(data.other);
      }
    }
  } catch (err) {
    console.error("Failed to load chat info", err);
  }
}

  async function loadMessages() {
    // 🆕 Скелетон показываем только при первой загрузке (когда сообщений ещё нет).
    // Иначе фоновые обновления (закрепления, правки, реконнекты) выглядят как
    // "чат обновился с нуля".
    setLoadingMessages(messages.length === 0);
    const token = getToken();
    if (!token) {
      setLoadingMessages(false);
      return;
    }
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) {
        router.push("/messages");
        return;
      }
    if (res.ok) {
      const data = await res.json();
      // ✅ Совместимо со старым (массив) и новым ({messages, ...}) форматом
      setMessages(Array.isArray(data) ? data : (data.messages ?? []));
    }
    } catch (err) {
      console.error("Failed to load messages", err);
    } finally {
      setLoadingMessages(false);
    }
  }

  async function loadPinned() {
    try {
      const data = await getPinnedMessages(Number(chatId));
      setPinnedMessages(data);
    } catch (e) {
      console.error("Failed to load pinned messages:", e);
    }
  }

// 🆕 === АВТОДОПОЛНЕНИЕ УПОМИНАНИЙ ===
const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    sendLiveText(val);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPos);
    const match = textBeforeCursor.match(/@(\w*)$/);
    
    if (match) {
        const query = match[1].toLowerCase();
        setMentionQuery(query);
        const filtered = chatMembers
            .map(m => m.user)
            .filter(u => 
                u.username.toLowerCase().includes(query) || 
                (u.display_name && u.display_name.toLowerCase().includes(query))
            )
            .slice(0, 5);
        setMentionSuggestions(filtered);
    } else {
        setMentionQuery(null);
        setMentionSuggestions([]);
    }
};

const selectMention = (user: any) => {
    if (!textareaRef.current || mentionQuery === null) return;
    const val = textareaRef.current.value;
    const cursorPos = textareaRef.current.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPos);
    const textAfterCursor = val.slice(cursorPos);
    
    const lastAtIdx = textBeforeCursor.lastIndexOf('@');
    const newTextBefore = textBeforeCursor.slice(0, lastAtIdx) + `@${user.username} `;
    
    const newVal = newTextBefore + textAfterCursor;
    setText(newVal);
    sendLiveText(newVal);
    setMentionQuery(null);
    setMentionSuggestions([]);
    
    setTimeout(() => {
        if (textareaRef.current) {
            textareaRef.current.focus();
            const newCursorPos = newTextBefore.length;
            textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
    }, 0);
};




async function sendMessage() {
  if (sendingRef.current) return;
  const token = getToken();
  if (!token) return;
  if (!text.trim() && files.length === 0) return;

  // ✅ НОВОЕ: Если мы в режиме редактирования — отправляем правку, а не новое сообщение
  if (editingMessageId) {
    await submitEdit();
    return;
  }

  sendingRef.current = true;
    try {
      const messagesToSend: { text: string; file: File | null }[] = [];
      if (files.length > 0) {
        files.forEach((f, i) => messagesToSend.push({ text: i === 0 ? text.trim() : "", file: f }));
      } else {
        messagesToSend.push({ text: text.trim(), file: null });
      }

      const tempText = text.trim();
      const tempId = Date.now();
      if (!isSecret && tempText) {
        const tempMsg = {
          id: tempId,
          sender_id: currentUser?.id,
          sender_name: currentUser?.display_name,
          sender_avatar: currentUser?.avatar_url,
          text: tempText,
          media_url: null,
          media_type: null,
          read: false,
          created_at: new Date().toISOString(),
          is_temp: true,
        };
        setMessages((prev) => [...prev, tempMsg]);
      }

      setText("");
      clearDraft();
      setFiles([]);
      setReplyTo(null);
      sendLiveText(""); // 🆕 гасим живой текст у собеседников


for (const msg of messagesToSend) {
  // 🆕 ШИФРОВАННОЕ МЕДИА для секретных чатов
  if (isSecret && msg.file) {
    if (secretState !== "ready") {
      alert(t("messages.encryptNotReady"));
      return;
    }
    let sk = secretSessionKey || loadSessionKey(Number(chatId));
    if (!sk) {
      alert(t("messages.sessionKeyLost"));
      return;
    }

    // ✅ СОЗДАЁМ ВРЕМЕННОЕ СООБЩЕНИЕ ДЛЯ ШИФРОВАННОГО МЕДИА
    const tempMediaId = Date.now();
    let mediaType = "image";
    if (msg.file.type.startsWith("video/")) mediaType = "video";
    if (msg.file.type.startsWith("audio/")) mediaType = "audio";
    if (msg.file.name.endsWith(".gif")) mediaType = "gif";

    const tempMediaMsg = {
      id: tempMediaId,
      sender_id: currentUser?.id,
      sender_name: currentUser?.display_name,
      sender_avatar: currentUser?.avatar_url,
      text: null,
      ciphertext: "[encrypted_media]",
      media_url: "temp_encrypted_media", // временный URL
      media_type: mediaType,
      is_encrypted_media: true,
      read: false,
      created_at: new Date().toISOString(),
      is_temp: true,
    };
    setMessages((prev) => [...prev, tempMediaMsg]);

    const { encryptMediaFile } = await import("@/lib/mediaCrypto");
    const encryptedBlob = await encryptMediaFile(msg.file, sk);

    const form = new FormData();
    form.append("file", encryptedBlob, msg.file.name);
    form.append("media_type", mediaType);
    if (replyTo) form.append("reply_to_id", String(replyTo.id)); // 🆕

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages/encrypted-media`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      }
    );

    if (!res.ok) {
      // Удаляем временное сообщение если ошибка
      setMessages((prev) => prev.filter((m) => m.id !== tempMediaId));
      alert(t("messages.mediaEncryptFailed"));
      return;
    }
    
    // Удаляем временное сообщение — реальное придёт через WebSocket
    setMessages((prev) => prev.filter((m) => m.id !== tempMediaId));
    
    // Если был ещё и текст — отправляем отдельно
    if (msg.text) {
      const textForm = new FormData();
      textForm.append("ciphertext", encryptMessage(msg.text, sk));
      textForm.append("text", "");
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: textForm,
      });
    }
  }
 

        // 🆕 ШИФРОВАННЫЙ ТЕКСТ + обычное медиа
        else if (isSecret && msg.text) {
          if (secretState !== "ready") {
            alert(t("messages.encryptNotReady"));
            return;
          }
          let sk = secretSessionKey || loadSessionKey(Number(chatId));
          if (!sk) {
            alert(t("messages.sessionKeyLost"));
            return;
          }
          const form = new FormData();
          const encrypted = encryptText(msg.text);
          if (!encrypted) {
            alert(t("messages.encryptError"));
            return;
          }
          form.append("ciphertext", encrypted);
          form.append("text", "");
          if (replyTo) form.append("reply_to_id", String(replyTo.id)); 

          if (msg.file) {
            const { encryptMediaFile } = await import("@/lib/mediaCrypto");
            const encryptedBlob = await encryptMediaFile(msg.file, sk);
            
            let mediaType = "image";
            if (msg.file.type.startsWith("video/")) mediaType = "video";
            if (msg.file.type.startsWith("audio/")) mediaType = "audio";
            
            form.append("file", encryptedBlob, msg.file.name);
            form.append("media_type", mediaType);
            form.append("is_encrypted_media", "true");
          }

          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: form,
          });

          if (res.status === 403) {
            alert(t("messages.noChatAccess"));
            router.push("/messages");
            return;
          }
        }
        // Обычное сообщение
                    // Обычное сообщение
                    else {
                        // 🆕 Временное сообщение-плейсхолдер с анимацией загрузки для медиа
                        const mediaTempId = tempId + 1;
                        if (msg.file) {
                            let upType: string = "image";
                            if (msg.file.type.startsWith("video/")) upType = "video";
                            if (msg.file.type.startsWith("audio/")) upType = "audio";
                            if (msg.file.name.endsWith(".gif")) upType = "gif";
                            setMessages((prev) => [...prev, {
                                id: mediaTempId,
                                sender_id: currentUser?.id,
                                sender_name: currentUser?.display_name,
                                sender_avatar: currentUser?.avatar_url,
                                text: msg.text || null,
                                media_url: null,
                                media_type: upType,
                                is_uploading: true,
                                read: false,
                                created_at: new Date().toISOString(),
                                is_temp: true,
                            }]);
                        }

                        const form = new FormData();
                        if (msg.text) form.append("text", msg.text);
                        if (msg.file) form.append("file", msg.file);
                        if (replyTo) form.append("reply_to_id", String(replyTo.id)); // 🆕

                        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages`, {
                            method: "POST",
                            headers: { Authorization: `Bearer ${token}` },
                            body: form,
                        });

                        if (res.status === 403) {
                            alert(t("messages.noChatAccess"));
                            router.push("/messages");
                            return;
                        }

                        if (!res.ok) {
                            const err = await res.json().catch(() => null);
                            console.error("❌ Send message failed:", res.status, err);
                            alert(err?.detail || `Ошибка отправки (${res.status})`);
                            setMessages((prev) => prev.filter((m) => m.id !== tempId && m.id !== mediaTempId));
                            return;
                        }

                        const saved = await res.json().catch(() => null);

                        if (saved && saved.id) {
                            setMessages((prev) => {
                                const temp = prev.find((m) => m.id === tempId && m.is_temp);

                                const base = temp || {
                                    sender_id: currentUser?.id,
                                    sender_name: currentUser?.display_name,
                                    sender_avatar: currentUser?.avatar_url,
                                };

                                const real = {
                                    ...base,
                                    ...saved,
                                    is_temp: false,
                                };

                                const withoutTemp = prev.filter((m) => !(m.id === tempId && m.is_temp) && !(m.id === mediaTempId && m.is_temp));

                                if (withoutTemp.some((m) => m.id === real.id)) {
                                    return withoutTemp;
                                }

                                return [...withoutTemp, real];
                            });
                        }
                    }
      }



      if (!isSecret && tempText) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
      }

      if (isSecret) await loadMessages();
    } catch (err) {
      console.error("Failed to send:", err);
      alert(t("messages.sendFailed"));
    } finally {
      sendingRef.current = false;
    }
  }

  async function deleteMessage(messageId: number) {
    if (!confirm(t("messages.deleteMsgConfirm"))) return;
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages/${messageId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) loadMessages();
    } catch (err) {
      alert(t("common.networkError"));
    }
  }

async function submitEdit() {
  if (!editingMessageId || !text.trim()) return;
  if (isSecret) {
    alert(t("messages.editSecretUnavailable"));
    cancelEdit();
    return;
  }
  const token = getToken();
  if (!token) return;
  try {
    const form = new FormData();
    form.append("text", text.trim());
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages/${editingMessageId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (res.ok) {
      cancelEdit(); // ✅ Очищаем инпут и сбрасываем editingMessageId
      loadMessages();
    }
  } catch (err) {
    alert(t("common.networkError"));
  }
}

function startEdit(msg: any) {
  if (isSecret) {
    alert(t("messages.editSecretOff"));
    return;
  }
  setEditingMessageId(msg.id);
  setText(msg.text || ""); // ✅ Переносим текст в инпут
  
  // Фокусируем textarea и ставим курсор в конец
  setTimeout(() => {
    textareaRef.current?.focus();
    if (textareaRef.current) {
      const len = msg.text?.length || 0;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, 50);
  
  setActiveMessageMenu(null);
  setContextMenu(null); // Закрываем меню, если оно открыто
}

function cancelEdit() {
  setEditingMessageId(null);
  setText(""); // Очищаем инпут
  textareaRef.current?.blur();
}

  function startReply(msg: any) {
    setReplyTo(msg);
    setActiveMessageMenu(null);
  }

async function loadStickerPacks() {
  const token = getToken();
  if (!token) return;
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/sticker-packs`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      console.log("📦 ЗАГРУЖЕНЫ СТИКЕР-ПАКИ С СЕРВЕРА:", data);
      setStickerPacks(Array.isArray(data) ? data : []);
    }
  } catch (err) {
    console.error("Failed to load sticker packs:", err);
  }
}

async function toggleReaction(msgId: number, stickerId?: number | string, emoji?: string) {
  const token = getToken();
  if (!token) return;

  //  Строгая проверка: если нет ни стикера, ни эмодзи — не отправляем запрос
  if (!stickerId && !emoji) {
    console.error("❌ toggleReaction вызван без sticker_id и emoji");
    return;
  }

  const form = new FormData();
  
  // 🆕 Безопасная конвертация sticker_id в строку для FormData
  // Бэкенд ждет Form(None), поэтому undefined/null просто не добавляем
  if (stickerId !== undefined && stickerId !== null) {
    const numId = Number(stickerId);
    if (!isNaN(numId)) {
      form.append("sticker_id", String(numId));
      console.log("🎯 Отправляем реакцию стикером:", { msgId, sticker_id: numId });
    } else {
      console.error(" Неверный sticker_id:", stickerId);
      return;
    }
  }
  
  if (emoji) {
    form.append("emoji", String(emoji));
    console.log("🎯 Отправляем реакцию эмодзи:", { msgId, emoji });
  }

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages/${msgId}/reactions`,
      { 
        method: "POST", 
        headers: { Authorization: `Bearer ${token}` }, 
        body: form 
      }
    );
    
    if (res.ok) {
      const data = await res.json();
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reactions: data.reactions } : m));
      setReactionPickerFor(null);
    } else {
      const err = await res.json().catch(() => null);
      console.error("❌ Ошибка реакции (статус " + res.status + "):", err);
      
      // 🆕 Специфичные ошибки от FastAPI
      if (res.status === 400) {
        alert("Неверный формат данных. Стикеры могут не поддерживаться.");
      } else if (res.status === 404) {
        alert("Сообщение не найдено.");
      } else {
        alert(err?.detail || t("messages.reactionFailed"));
      }
    }
  } catch (e) {
    console.error("❌ Ошибка сети при реакции:", e);
    alert(t("common.networkError"));
  }
}

  // 🆕 Отправка живого текста: пустой — сразу, остальное с троттлингом 300мс
  function sendLiveText(v: string) {
    setText(v);
    if (isSecret) return; // секретные чаты — без live
    if (!liveSettingsRef.current.broadcast) return; // 🛡️ приватность: не транслируем мой набор
    const isEmpty = !v.trim();
    const now = Date.now();
    if (!isEmpty && now - liveThrottleRef.current < 300) return;
    liveThrottleRef.current = now;
    const token = getToken();
    if (!token) return;
    const body = new FormData();
    body.append("text", v.slice(0, 2000));
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/live-text`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body,
    }).catch(() => {});
  }


    // 🆕 Плавное исчезновение пузыря: fade-out → потом удаляем из состояния
  function dismissLive(userId: number) {
    setLiveTexts((prev) => {
      const cur = prev[userId];
      if (!cur || cur.leaving) return prev;
      return { ...prev, [userId]: { ...cur, leaving: true } };
    });
    setTimeout(() => {
      setLiveTexts((prev) => {
        const cur = prev[userId];
        if (!cur || !cur.leaving) return prev; // текст снова пошёл — не трогаем
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    }, 300); // = duration анимации
  }

  async function sendStickerMessage(stickerId: number) {
    const token = getToken();
    if (!token) return;
    const form = new FormData();
    form.append("sticker_id", String(stickerId));
    if (replyTo) form.append("reply_to_id", String(replyTo.id));
    
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages/sticker`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        alert(err?.detail || t("messages.stickerFailed"));
      }
      setShowStickers(false);
    } catch {
      alert(t("common.networkError"));
    }
  }

function getMessageMenuItems(msg: any): { icon: any; label: string; onClick: () => void; danger?: boolean }[] {
  const isMine = isSavedChat ? true : (msg.sender_id === currentUser?.id);
  const items: { icon: any; label: string; onClick: () => void; danger?: boolean }[] = [];

  // Ответить (всегда доступно)
  items.push({
    icon: Reply,
    label: t("messages.reply"),
    onClick: () => startReply(msg),
  });

  // Выбрать
  items.push({
    icon: CheckSquare,
    label: t("messages.select"),
    onClick: () => {
      setIsSelectMode(true);
      toggleMessageSelection(msg.id);
    },
  });

  // Копировать (только если есть текст и не секретный)
  if (msg.text && !isSecret) {
    items.push({
      icon: Copy,
      label: t("messages.copy"),
      onClick: () => navigator.clipboard.writeText(decryptDisplayText(msg)),
    });
  }

  // Переслать (не секретный)
  if (!isSecret) {
    items.push({
      icon: Send,
      label: t("messages.forward"),
      onClick: async () => {
        setForwardingMessage(msg);
        await loadForwardChats();
        setShowForwardModal(true);
      },
    });
  }

  // Редактировать (своё, с текстом)
  if (isMine && msg.text && !isSecret) {
    items.push({
      icon: Edit2,
      label: t("messages.edit"),
      onClick: () => startEdit(msg),
    });
  }

  // Удалить (своё)
  if (isMine) {
    items.push({
      icon: Trash2,
      label: t("messages.delete"),
      onClick: () => deleteMessage(msg.id),
      danger: true,
    });
  }

  // Закрепить/Открепить: личный чат — все участники; группа — owner/admin.
  // (Финальную проверку прав всегда выполняет бэкенд.)
  const canPinMessages =
    !isGroup ||
    chatInfo?.my_role === "owner" ||
    chatInfo?.my_role === "admin";
  if (canPinMessages && !msg.pinned) {
      items.push({
        icon: Pin,
        label: t("messages.pin"),
        onClick: async () => {
          try {
            await pinMessage(Number(chatId), msg.id);
            await loadPinned();
            await loadMessages();
          } catch (e: any) {
            alert(e?.message || t("messages.pinFailed"));
          }
        },
      });
  } else if (canPinMessages && msg.pinned) {
      items.push({
        icon: PinOff,
        label: t("messages.unpin"),
        onClick: async () => {
          try {
            await unpinMessage(Number(chatId), msg.id);
            await loadPinned();
            await loadMessages();
          } catch (e: any) {
            alert(e?.message || t("messages.unpinFailed"));
          }
        },
      });
  }

  return items;
}


  function cancelReply() {
    setReplyTo(null);
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

async function sendEncryptedMedia(file: File, mediaType: string) {
  const token = getToken();
  if (!token) return;

  if (secretState !== "ready") {
    alert(t("messages.encryptNotReady"));
    return;
  }

  const sk = secretSessionKey || loadSessionKey(Number(chatId));
  if (!sk) {
    alert(t("messages.sessionKeyLost"));
    return;
  }

  const { encryptMediaFile } = await import("@/lib/mediaCrypto");
  const encryptedBlob = await encryptMediaFile(file, sk);

  const form = new FormData();
  form.append("file", encryptedBlob);
  form.append("media_type", mediaType);
  if (replyTo) form.append("reply_to_id", String(replyTo.id));

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages/encrypted-media`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }
  );

  if (!res.ok) {
    alert(t("messages.mediaEncryptFailed"));
  }
}

  const handleSendPointerDown = (e: React.PointerEvent) => {
    if (text.trim() || files.length > 0) return;
    isSendLongPressRef.current = false;
    sendLongPressTimerRef.current = setTimeout(() => {
      isSendLongPressRef.current = true;
      setShowRecordMenu(true);
    }, 400);
  };

const handleSendButtonPointerUp = () => {
  if (!showRecordMenu && sendLongPressTimerRef.current) {
    clearTimeout(sendLongPressTimerRef.current);
    sendLongPressTimerRef.current = null;
  }
};

const handleSendClick = () => {
  if (isSendLongPressRef.current || suppressClickRef.current) {
    isSendLongPressRef.current = false;
    suppressClickRef.current = false;
    return;
  }
  sendMessage();
};

  // 🖥️📱 Пока меню записи открыто — следим за движением и отпусканием ГЛОБАЛЬНО.
  // На ПК onPointerLeave раньше закрывал меню при попытке дотянуться до пунктов.
  useEffect(() => {
    if (!showRecordMenu) return;

    const track = (clientY: number) => {
      const voiceRect = menuItemRefs.current.voice?.getBoundingClientRect();
      const videoRect = menuItemRefs.current.video?.getBoundingClientRect();
      if (voiceRect && clientY >= voiceRect.top && clientY <= voiceRect.bottom) {
        setSelectedMenuItem("voice");
      } else if (videoRect && clientY >= videoRect.top && clientY <= videoRect.bottom) {
        setSelectedMenuItem("video");
      } else {
        setSelectedMenuItem(null);
      }
    };

    const finish = () => {
      if (selectedMenuItem === "voice") {
        startRecording();
      } else if (selectedMenuItem === "video") {
        (async () => {
          if (camPerm.status === "denied") { setPermHelp("camera"); return; }
          if (camPerm.status !== "granted") {
            const ok = await camPerm.request();
            if (!ok) { setPermHelp("camera"); return; }
          }
          setShowVideoRecorder(true);
        })();
      }
      setShowRecordMenu(false);
      setSelectedMenuItem(null);
    suppressClickRef.current = true;
    setTimeout(() => { suppressClickRef.current = false; }, 350);
    isSendLongPressRef.current = false;
    };

    const onMouseMove = (e: MouseEvent) => track(e.clientY);
    const onTouchMove = (e: TouchEvent) => { if (e.touches.length) track(e.touches[0].clientY); };
    const onMouseUp = () => finish();
    const onTouchEnd = () => finish();

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchend", onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRecordMenu, selectedMenuItem]);

  useEffect(() => {
    hasScrolledToUnreadRef.current = false; // 🆕 сбрасываем при смене чата
 
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
        // 🆕 настройки живых сообщений
fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me/live-text-settings`, {
  headers: { Authorization: `Bearer ${token}` },
  signal,
})
.then((r) => r.json())
.then((settings) => {
  // Обновляем только настройки, не трогая основной объект currentUser
  setLiveSettings(settings); 
})
.catch(() => {});

    loadChatInfo();
    loadMessages();
    loadPinned();
    loadStickerPacks(); // 🆕

    // 🆕 Загружаем участников для автодополнения упоминаний
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/members`, {
        headers: { Authorization: `Bearer ${getToken()}` }
    }).then(r => r.json()).then(data => {
        if (Array.isArray(data)) setChatMembers(data);
    }).catch(() => {});

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      signal,
    })
      .then(() => refresh())
      .catch(() => {});

    return () => {
      controller.abort();
      // 🆕 гасим живой текст при выходе/смене чата
      const t = getToken();
      if (t && !isSecret && liveSettingsRef.current.broadcast) {
        const body = new FormData();
        body.append("text", "");
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/live-text`, {
          method: "POST",
          headers: { Authorization: `Bearer ${t}` },
          body,
        }).catch(() => {});
      }
      setLiveTexts({});
    };
  }, [chatId]);



// 📤 Отправляем "печатает" на бэк (с троттлингом раз в 3 сек)
useEffect(() => {
  if (!text.trim() || !currentUser) return;
  
  const now = Date.now();
  if (now - lastTypingSentRef.current < 3000) return;
  lastTypingSentRef.current = now;
  
  const token = getToken();
  if (!token) return;
  
  fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/typing`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
}, [text, chatId, currentUser]);

// ⏱ Сбрасываем индикатор "печатает" через 4 сек после последнего события
useEffect(() => {
  if (partnerTyping) {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setPartnerTyping(false);
      setTypingUserName(null);
    }, 4000);
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }
}, [partnerTyping]);




  useEffect(() => {
    if (!messages.length) return;

    if (!hasScrolledToUnreadRef.current) {
      hasScrolledToUnreadRef.current = true;
      const firstUnread = messages.find((m) => !m.read && m.sender_id !== currentUser?.id);

      if (firstUnread) {
        setTimeout(() => {
            const el = document.getElementById(`msg-${firstUnread.id}`);
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                el.classList.add("msg-soft-glow");
                setTimeout(() => el.classList.remove("msg-soft-glow"), 3500); // Длительность анимации
            }
        }, 150);
      } else {
        setTimeout(() => scrollToBottom(), 100);
      }
      return;
    }

    // 🆕 При новых сообщениях скроллим вниз ТОЛЬКО если пользователь и так был внизу
    if (isAutoScrollEnabled) {
      scrollToBottom();
    } else {
      // Если пользователь читает историю, просто показываем кнопку "Вниз"
      setShowScrollBtn(true);
    }
  }, [messages, currentUser, isAutoScrollEnabled]);

    // 🆕 живой текст — доскроллить только если пользователь уже внизу
  useEffect(() => {
    if (!Object.keys(liveTexts).length) return;
    const container = messagesEndRef.current?.parentElement;
    if (!container) return;
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    if (nearBottom) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [liveTexts]);

// ✅ НОВЫЙ useEffect: инициализация крипто при загрузке
useEffect(() => {
  initCryptoOnLogin();
}, []);

// ✅ НОВЫЙ useEffect: инициализация секретного чата
useEffect(() => {
  if (isGroup) {
    setIsSecret(false);
    setSecretState("ready");
    return;
  }
  if (isSecret && chatPartner && currentUser) {
    if (secretInitRef.current) return;
    secretInitRef.current = true;
    initSecretChat();
  }
}, [isSecret, chatPartner, currentUser, isGroup]);

// ✅ НОВЫЙ useEffect: сброс при смене чата
useEffect(() => {
  secretInitRef.current = false;
  setSecretState("loading");
  setSecretError(null);
  setSecretSessionKey(null);
}, [chatId]);

// ✅ НОВЫЙ useEffect: периодическая проверка если waiting
useEffect(() => {
  if (secretState !== "waiting") return;
  const interval = setInterval(() => {
    secretInitRef.current = false;
    initSecretChat();
  }, 5000);
  return () => clearInterval(interval);
}, [secretState]);

useWebSocket("new_message", (data: any) => {
  if (String(data.chat_id) !== String(chatId)) return;

  // 🆕 плавно гасим живой текст — пришло настоящее сообщение
  dismissLive(data.sender_id);

  setMessages((prev) => {
    // 1. Проверяем, есть ли уже такое сообщение в списке (защита от дублей при реконнекте)
    if (prev.some((m) => m.id === data.id)) {
      return prev;
    }

    // 2. Ищем временное сообщение, которое мы создали при отправке
    // Сопоставляем по: автору, тексту (если есть) и типу медиа (если есть)
    const tempIndex = prev.findIndex((m) => {
      if (!m.is_temp) return false;
      if (m.sender_id !== data.sender_id) return false;
      
      // Если есть текст, он должен совпадать
      if (data.text && m.text !== data.text) return false;
      
      // Если есть медиа, типы должны совпадать
      // 🆕 Для временного сообщения "загрузка…" media_url ещё null — не считаем это несовпадением
      if (data.media_url && m.media_url && m.media_url !== data.media_url) return false; 
      // Для зашифрованных медиа URL может быть разным, проверяем тип
      if (data.is_encrypted_media && m.is_encrypted_media) return true;

      return true;
    });

    if (tempIndex !== -1) {
      // Заменяем временное сообщение на реальное, сохраняя позицию в массиве
      const newMessages = [...prev];
      newMessages[tempIndex] = {
        ...data,
        is_temp: false,
      };
      return newMessages;
    }

    // 3. Если временного не нашли (или это чужое сообщение), просто добавляем в конец
    return [...prev, { ...data, is_temp: false }];
  });

  // Уведомление для чужих сообщений
  if (data.sender_id !== currentUser?.id) {
    localNotify(
      `💬 ${data.sender_name}`,
      data.ciphertext === "[encrypted_media]" ? `🔒 ${t("messages.encryptedMedia")}` : (data.text || t("messages.newMessage"))
    );
  }


  // Отметка прочита
  // нных (только если мы внизу чата)
  const token = getToken();
  if (token && isAutoScrollEnabled) {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })
    .then(() => refresh())
    .catch(() => {});
  }
  
  if (isGroup) loadChatInfo();
});

useWebSocket("chat_deleted", (data: any) => {
  if (String(data.chat_id) === String(chatId)) {
    // 🛡️ Очищаем ключ из оперативной памяти
    clearSessionKey(Number(chatId));
    alert(t("messages.chatDeleted"));
    router.push("/messages");
  }
});

// ✅ НОВЫЙ: Собеседник зарегистрировал ключи
useWebSocket("secret_chat_created", (data: any) => {
  if (String(data.chat_id) !== String(chatId)) return;
  loadChatInfo();
});

// ✅ НОВЫЙ: Session key стал доступен
useWebSocket("session_key_available", (data: any) => {
  if (String(data.chat_id) !== String(chatId)) return;
  secretInitRef.current = false;
  initSecretChat();
});

  useWebSocket("group_member_added", (data: any) => {
    if (String(data.chat_id) === String(chatId)) loadChatInfo();
  });

  useWebSocket("group_member_removed", (data: any) => {
    if (String(data.chat_id) === String(chatId)) loadChatInfo();
  });

  useWebSocket("group_info_updated", (data: any) => {
    if (String(data.chat_id) === String(chatId)) loadChatInfo();
  });

  useWebSocket("message_pinned", (data: any) => {
    if (String(data.chat_id) === String(chatId)) {
      loadPinned();
      loadMessages();
    }
  });

  useWebSocket("message_reaction", (data: any) => {
    if (String(data.chat_id) !== String(chatId)) return;
    setMessages(prev => prev.map(m =>
      m.id === data.message_id ? { ...m, reactions: data.reactions } : m
    ));
  });

// 💬 "печатает..." от собеседника
useWebSocket("typing", (data: any) => {
  if (String(data.chat_id) !== String(chatId)) return;
  if (data.user_id === currentUser?.id) return; // своё игнорируем
  
  setPartnerTyping(true);
  setTypingUserName(data.user_name || data.display_name || null);
});

// 🆕 ЖИВОЙ ТЕКСТ от собеседника
useWebSocket("live_text", (data: any) => {
  if (String(data.chat_id) !== String(chatId)) return;
  if (data.user_id === currentUser?.id) return;
  if (!liveSettingsRef.current.enabled) return; // 🛡️ функция выключена — игнорируем
  if (!data.text || !data.text.trim()) {
    dismissLive(data.user_id); // 🆕 плавно гасим
    return;
  }
  setLiveTexts((prev) => ({
    ...prev,
    [data.user_id]: { text: data.text, name: data.user_name || "…", ts: Date.now(), leaving: false },
  }));
});

// 🆕 Протухший живой текст (нет обновлений > 5 сек) — убираем
useEffect(() => {
  const int = setInterval(() => {
    const now = Date.now();
    Object.entries(liveTextsRef.current).forEach(([uid, lt]) => {
      if (!lt.leaving && now - lt.ts > 5000) dismissLive(Number(uid)); // 🆕 тоже плавно
    });
  }, 1000);
  return () => clearInterval(int);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);


// 🆕 Пришло настоящее сообщение — убираем живой пузырь автора
useEffect(() => {
  // вешаем на messages: если сообщение от юзера с живым текстом — чистим
}, []);

// ✓✓ Галочки прочитано — собеседник открыл чат
useWebSocket("message_read", (data: any) => {
  if (String(data.chat_id) !== String(chatId)) return;
  if (data.reader_id === currentUser?.id) return; // своё игнорируем
  
  setMessages(prev => prev.map(m => {
    // Помечаем прочитанными все МОИ сообщения до last_read_message_id
    if (m.sender_id === currentUser?.id && m.id <= data.last_read_message_id && !m.read) {
      return { ...m, read: true };
    }
    return m;
  }));
});


 

  function onFiles(newFiles: FileList | null) {
    if (!newFiles) return;
    setFiles((prev) => [...prev, ...Array.from(newFiles)].slice(0, 5));
  }

  function insertSticker(emoji: string) {
    setText((prev) => prev + emoji);
  }

const filteredMessages = messages.filter((msg) => {
  if (!searchQuery.trim()) return true;
  const q = searchQuery.toLowerCase();
  const displayText = decryptDisplayText(msg).toLowerCase();
  return displayText.includes(q);
});

// 🆕 Разделители дат и группировка
const preparedMessages = useMemo(() => {
  const result: any[] = [];
  let lastDate = '';
  let lastSenderId: number | null = null;
  let lastTime = 0;

  filteredMessages.forEach((msg) => {
    const d = new Date(msg.created_at);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    let dateLabel = '';
    if (d.toDateString() === today.toDateString()) dateLabel = t("common.today");
    else if (d.toDateString() === yesterday.toDateString()) dateLabel = t("common.yesterday");
    else dateLabel = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

    if (dateLabel !== lastDate) {
      result.push({ type: 'date', id: `date-${msg.id}`, text: dateLabel });
      lastDate = dateLabel;
      lastSenderId = null;
    }

    const msgTime = d.getTime();
    const isGrouped = lastSenderId === msg.sender_id && (msgTime - lastTime < 5 * 60 * 1000);
    result.push({ ...msg, isGrouped });
    lastSenderId = msg.sender_id;
    lastTime = msgTime;
  });
  return result;
}, [filteredMessages]);

const partnerGlow = getGlowColor(chatPartner);


const ChatHeader = () => (
  <div className="border-b border-line dark:border-white/10 backdrop-blur-md sticky top-0 z-30 bg-paper dark:bg-[#171717]/80">
    {/* Основной блок */}
    <div className="p-3 sm:p-4 md:p-4">
      <div className="flex items-center gap-2 sm:gap-3 md:gap-3">
        <button
          onClick={() => router.push("/messages")}
          className="text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white shrink-0 p-2 sm:p-1 -ml-1 sm:ml-0 active:scale-95 transition-transform"
          title={t("common.back")}
        >
          <span className="text-lg sm:text-base">←</span>
          <span className="hidden sm:inline ml-1 text-sm">{t("common.back")}</span>
        </button>

        {isGroup ? (
          <button
            onClick={() => setShowGroupMembers(true)}
            className="flex items-center gap-3 sm:gap-3 group flex-1 min-w-0 text-left active:opacity-70 transition-opacity"
          >
            <div className="shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-xl overflow-hidden bg-gradient-to-br from-purple-500 via-violet-600 to-indigo-600 flex items-center justify-center ring-2 ring-white/10">
              {chatInfo?.avatar_url ? (
                <img
                  src={mediaUrl(chatInfo.avatar_url)}
                  alt={chatInfo.name || t("common.group")}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Users size={22} className="text-gray-900 dark:text-white" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold truncate break-words text-[15px] sm:text-base md:text-lg text-gray-900 dark:text-white group-hover:text-[#8b5cf6] transition-colors leading-tight">
                {chatInfo.name}
              </p>
              <p className="text-[11px] sm:text-xs text-gray-600 dark:text-white/50 mt-0.5">
                {partnerTyping && typingUserName
                  ? <span className="text-[#8b5cf6]">✎ {t("messages.typingName", { name: typingUserName })}</span>
                  : (chatInfo.members_count === 1 ? t("messages.membersOne", { n: chatInfo.members_count }) : chatInfo.members_count < 5 ? t("messages.membersFew", { n: chatInfo.members_count }) : t("messages.membersMore", { n: chatInfo.members_count }))
                }
              </p>
            </div>
          </button>
        ) : isSavedChat ? (
          // 🆕 ЧАТ С САМИМ СОБОЙ (ИЗБРАННОЕ) — стиль как в списке чатов
          <div className="flex items-center gap-3 sm:gap-3 flex-1 min-w-0">
            <div className="shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center">
              <Bookmark size={22} className="text-yellow-600 dark:text-yellow-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold truncate text-[15px] sm:text-base md:text-lg text-yellow-600 dark:text-yellow-400 leading-tight">
                {t("messages.saved")}
              </p>
              <p className="text-[11px] sm:text-xs text-gray-600 dark:text-white/50 mt-0.5">
                {t("messages.notesHint")}
              </p>
            </div>
          </div>
        ) : chatPartner ? (
          <Link href={`/user/${chatPartner.id}`} className="flex items-center gap-3 sm:gap-3 group flex-1 min-w-0 active:opacity-70 transition-opacity">
            <div
              className="shrink-0 relative"
              style={partnerGlow ? { filter: `drop-shadow(0 0 6px ${partnerGlow})` } : undefined}
            >
              <Avatar
                src={chatPartner.avatar_url}
                name={chatPartner.display_name}
                id={chatPartner.id}
                size={44}
              />
              {isSecret && (
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 sm:w-4 sm:h-4 rounded-full bg-emerald-500 border-2 border-[#171717] flex items-center justify-center">
                  <Lock size={8} className="text-gray-900 dark:text-white" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p
                  className={`font-bold truncate text-[15px] sm:text-base md:text-lg transition-all group-hover:opacity-80 leading-tight ${
                    glowStyle(chatPartner) ? "" : "text-gray-900 dark:text-white"
                  }`}
                  style={glowStyle(chatPartner)}
                >
                  {chatPartner.display_name}
                </p>
                {isSecret && (
                  <span className="inline-flex items-center gap-1 px-1.5 sm:px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[9px] sm:text-[10px] font-black uppercase tracking-widest border border-emerald-500/30 shrink-0">
                    <Lock size={8} />
                    <span className="hidden sm:inline">E2EE</span>
                  </span>
                )}
              </div>
              <p className={`text-[11px] sm:text-xs mt-0.5 transition-colors ${
                partnerTyping ? "text-[#8b5cf6] animate-pulse" : isOnline(chatPartner.last_seen) ? "text-green-600 dark:text-green-400" : "text-gray-600 dark:text-white/50"
              }`}>
                {partnerTyping
                  ? `✎ ${t("messages.typing")}`
                  : isOnline(chatPartner.last_seen)
                    ? t("messages.onlineDot")
                    : lastSeenText(chatPartner.last_seen)
                }
              </p>
            </div>
          </Link>
        ) : (
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 dark:text-white text-[15px] sm:text-base">
              {chatInfo ? t("common.loading") : t("messages.chatNotFound")}
            </p>
          </div>
        )}

                {/* Кнопки справа */}
                <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                  
                  {/* 🔥 ЗВОНКИ: Кнопки аудио и видео (показываем только если это не группа и не избранное) */}
{!isGroup && !isSavedChat && chatPartner && (
  <>
    <CallButton
      userId={chatPartner.id}
      userName={chatPartner.display_name}
      userAvatar={chatPartner.avatar_url || ''}
      callType="audio"
      size="sm"
      onCall={(uid, type) => initiateCall(uid, type, chatPartner.display_name, chatPartner.avatar_url || '')}
    />
    <CallButton
      userId={chatPartner.id}
      userName={chatPartner.display_name}
      userAvatar={chatPartner.avatar_url || ''}
      callType="video"
      size="sm"
      onCall={(uid, type) => initiateCall(uid, type, chatPartner.display_name, chatPartner.avatar_url || '')}
    />
  </>
)}

                  
                  
                  <button
                    onClick={() => { setMediaTab("image"); loadMedia(); setShowMediaGallery(true); }}
                    className="hidden sm:flex p-2.5 sm:p-2 text-gray-600 dark:text-white/60 hover:text-[#8b5cf6] transition-colors active:scale-95"
                    title={t("messages.media")}
                  >
                    <ImageIcon size={19} className="sm:w-5 sm:h-5" />
                  </button>
                  
                  {isGroup && (chatInfo?.my_role === 'owner' || chatInfo?.my_role === 'admin') && (
                    <button
                      onClick={() => setShowGroupSettings(true)}
                      className="hidden sm:flex p-2.5 sm:p-2 text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white transition-colors active:scale-95"
                      title={t("messages.groupSettings")}
                    >
                      <Settings size={19} className="sm:w-5 sm:h-5" />
                    </button>
                  )}

                  {/* Меню "Ещё" */}
                  <div className="relative">
                    <button
                      onClick={() => {
                        if (!showChatMenu) menuOpenTimeRef.current = Date.now();
                        setShowChatMenu((prev) => !prev);
                      }}
                      className="p-2.5 sm:p-2 text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white transition-colors active:scale-95"
                      title={t("common.more")}
                    >
                      <MoreVertical size={19} className="sm:w-5 sm:h-5" />
                    </button>

    
    {showChatMenu && (
      <>
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => { if (Date.now() - menuOpenTimeRef.current < 400) return; setShowChatMenu(false); }} 
        />
                <div className="absolute right-0 top-full mt-2 bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-xl shadow-2xl overflow-hidden min-w-[180px] sm:min-w-[180px] z-50">
          
          {/* 📱 МОБИЛЬНЫЕ КНОПКИ (скрыты на ПК) */}
          <button
            onClick={() => { setMediaTab("image"); loadMedia(); setShowMediaGallery(true); setShowChatMenu(false); }}
            className="sm:hidden w-full px-3 py-2.5 text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-2 transition-colors"
          >
            <ImageIcon size={15} /> {t("messages.mediaFiles")}
          </button>
          {isGroup && (chatInfo?.my_role === 'owner' || chatInfo?.my_role === 'admin') && (
            <button
              onClick={() => { setShowGroupSettings(true); setShowChatMenu(false); }}
              className="sm:hidden w-full px-3 py-2.5 text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-2 transition-colors"
            >
              <Settings size={15} /> {t("messages.groupSettings")}
            </button>
          )}
          
          {/* Разделитель только для мобильных */}
          <div className="sm:hidden h-px bg-gray-100 dark:bg-white/10 my-1" />

          {/* 🖥️ ОБЩИЕ КНОПКИ МЕНЮ */}
          {isGroup && (
            <button
              onClick={() => { setShowGroupMembers(true); setShowChatMenu(false); }}
              className="w-full px-3 py-2.5 text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-2 transition-colors"
            >
              <Users size={15} /> {t("messages.membersTitle")}
            </button>
          )}
          <button
            onClick={() => { deleteChat(); setShowChatMenu(false); }}
            className="w-full px-3 py-2.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-500/10 flex items-center gap-2 transition-colors"
          >
            <Trash2 size={15} />
            {isGroup ? (chatInfo?.my_role === "owner" ? t("messages.deleteGroup") : t("messages.leaveGroup")) : t("messages.deleteChat")}
          </button>
        </div>
      </>
    )}
  </div>
</div>
      </div>
    </div>

    {/* Разделитель */}
    {pinnedMessages.length > 0 && (
      <div className="border-t border-line dark:border-white/5" />
    )}
    {pinnedMessages.length > 0 && (
      <div className="px-3 sm:px-4 md:px-4 py-2 border-t border-line dark:border-white/5">
        <button
          onClick={() => setShowPinnedList(!showPinnedList)}
          className="flex items-center gap-2 text-xs sm:text-xs text-gray-600 dark:text-white/60 hover:text-gray-800 dark:hover:text-white/80 font-medium transition-colors w-full"
        >
          <Pin size={12} className="text-[#8b5cf6] shrink-0" />
          <span className="font-semibold">
            {pinnedMessages.length === 1 ? t("messages.pinnedOne", { n: pinnedMessages.length }) : t("messages.pinnedMany", { n: pinnedMessages.length })}
          </span>
          <span className="text-gray-500 dark:text-white/30 ml-auto">{showPinnedList ? '▲' : '▼'}</span>
        </button>
        {showPinnedList && (
          <div className="mt-2 space-y-1 max-h-32 sm:max-h-40 overflow-y-auto">
            {pinnedMessages.map((msg) => (
              <div
                key={msg.id}
            onClick={() => {
                const el = document.getElementById(`msg-${msg.id}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.classList.add('msg-soft-glow');
                    setTimeout(() => {
                        el.classList.remove('msg-soft-glow');
                    }, 3500);
                    setShowPinnedList(false);
                } else { 
                    alert(t("messages.msgNotFound"));
                  }
                }}
                className="flex items-start gap-2 text-[11px] sm:text-xs text-gray-600 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg px-2.5 py-1.5 transition-colors cursor-pointer active:scale-[0.98]"
              >
                <Pin size={10} className="text-[#8b5cf6] shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <span className="text-gray-800 dark:text-white/80 font-medium">{msg.sender_name}:</span>{' '}
                  <span className="text-gray-600 dark:text-white/50">
                    {msg.text || (msg.media_type === 'image' ? `📷 ${t('common.photo')}` : msg.media_type === 'audio' ? `🎙️ ${t('common.audio')}` : msg.media_type === 'video' ? `🎬 ${t('common.video')}` : ` ${t('common.attachment')}`)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )}

    {showSearch && (
      <div className="px-3 sm:px-4 md:px-4 py-2.5 border-t border-line dark:border-white/5">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-white/40" />
<input
  value={searchQuery}
  onChange={(e) => setSearchQuery(e.target.value)}
  placeholder={isSecret ? t("messages.searchDecrypted") : t("messages.searchInChat")}
  className="w-full pl-10 pr-9 py-2 rounded-xl border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 text-sm focus:outline-none focus:border-[#8b5cf6] focus:bg-gray-100 dark:focus:bg-white/10 transition-all"
  autoFocus
/>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white p-1"
            >
              <X size={15} />
            </button>
          )}
        </div>
        {searchQuery && (
          <p className="text-[11px] sm:text-xs text-gray-500 dark:text-white/40 mt-1.5">
            {t("messages.ofMessages", { n: filteredMessages.length, m: messages.length })}
          </p>
        )}
      </div>
    )}
  </div>
);

  return (
    <div className="h-screen flex overflow-hidden">
      <style>{`
  @keyframes popIn { 0% { transform: scale(0.5); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
  
  /* 🆕 Мягкое и прозрачное фиолетовое свечение */
  @keyframes softGlowAura {
    0% { box-shadow: 0 0 0px 0px rgba(139, 92, 246, 0); }
    40% { box-shadow: 0 0 40px 15px rgba(139, 92, 246, 0.12); } /* Очень прозрачное и мягкое свечение */
    100% { box-shadow: 0 0 0px 0px rgba(139, 92, 246, 0); }
  }
  .msg-soft-glow {
    animation: softGlowAura 3.5s cubic-bezier(0.25, 0.1, 0.25, 1) forwards;
    border-radius: 24px; /* Скругляем саму ауру, чтобы она красиво огибала пузырь */
  }
`}</style>
      <Sidebar />
      <div className="w-px shrink-0 bg-gray-100 dark:bg-white/10 my-3 hidden md:block" />
<main className="flex-1 flex flex-col border-x border-line dark:border-white/10 overflow-hidden">
        {isSelectMode ? (
          <div className="p-3 sm:p-3 md:p-4 border-b border-line dark:border-white/10 bg-paper dark:bg-[#171717]/95 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSelectMode}
                className="text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white transition-colors p-2 -ml-1 active:scale-95"
              >
                <X size={20} />
              </button>
              <span className="font-bold text-gray-900 dark:text-white text-sm md:text-base">
                {t("messages.selectedN", { n: selectedMessages.size })}
              </span>
            </div>
            <button
              onClick={deleteSelectedMessages}
              disabled={selectedMessages.size === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/20 text-red-600 dark:text-red-400 text-sm font-bold hover:bg-red-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors active:scale-95"
            >
              <Trash2 size={15} />
              <span className="hidden xs:inline">{t("common.delete")}</span>
            </button>
          </div>
        ) : (
          <ChatHeader />
        )}

        {loadingMessages ? (
          <ChatWindowSkeleton />
        ) : (
          <>
{isSecret && messages.length === 0 && secretState !== "error" && secretState !== "waiting" && (
              <div className="p-3 sm:p-4 bg-emerald-500/5 border-b border-emerald-500/20">
                <div className="flex items-start gap-2 max-w-2xl mx-auto text-center">
                  <Lock size={15} className="text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                  <div className="text-xs sm:text-sm text-emerald-100/80">
                    <p className="font-bold text-emerald-600 dark:text-emerald-300 mb-0.5 sm:mb-1">{t("profile.secretChat")}</p>
                    <p className="text-[11px] sm:text-xs">
                      {t("messages.secretHint")}
                    </p>
                  </div>
                </div>
              </div>
            )}

{/* Ожидание собеседника */}
{isSecret && secretState === "waiting" && (
  <div className="p-3 sm:p-4 bg-amber-500/10 border-b border-amber-500/30">
    <div className="flex items-start gap-2 max-w-2xl mx-auto">
      <Lock size={15} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="text-xs sm:text-sm text-amber-600 dark:text-amber-300 font-bold">{t("messages.waitingPeer")}</p>
        <p className="text-[11px] sm:text-xs text-amber-200/70 mt-1">{secretError}</p>
        <button
          onClick={() => { secretInitRef.current = false; initSecretChat(); }}
          className="mt-2 text-[11px] px-3 py-1 rounded bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 border border-amber-500/30"
        >
          {t("messages.checkAgain")}
        </button>
      </div>
    </div>
  </div>
)}

{/* Ошибка шифрования */}
{isSecret && secretState === "error" && (
  <div className="p-3 sm:p-4 bg-red-500/10 border-b border-red-500/30">
    <div className="flex items-start gap-2 max-w-2xl mx-auto">
      <AlertTriangle size={15} className="text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="text-xs sm:text-sm text-red-600 dark:text-red-300 font-bold">{secretError}</p>
        <button
          onClick={() => { secretInitRef.current = false; initSecretChat(); }}
          className="mt-2 text-[11px] px-3 py-1 rounded bg-red-500/20 text-red-200 hover:bg-red-500/30 border border-red-500/30"
        >
          {t("messages.tryAgain")}
        </button>
      </div>
    </div>
  </div>
)}

              <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-3 md:p-4 space-y-1 overscroll-contain touch-pan-y"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >


{currentUser && preparedMessages.map((msg) => {
  if (msg.type === 'date') {
    return (
      <div key={msg.id} className="flex items-center justify-center my-4">
        <span className="px-3 py-1 rounded-full bg-white/5 border border-line dark:border-white/10 text-[11px] font-bold text-gray-600 dark:text-white/50 backdrop-blur-sm">
          {msg.text}
        </span>
      </div>
    );
  }

  const isMine = isMessageMine(msg);
  const displayText = decryptDisplayText(msg);
  const isSelected = selectedMessages.has(msg.id);
  const senderGlow = getGlowColor(msg);

  return (
 <MessageBubble
  key={msg.id}
  msg={msg}
  isMine={isMine}
  isGroup={isGroup}
  isSecret={isSecret}
  isSelectMode={isSelectMode}
  isSelected={isSelected}
  isEditing={editingMessageId === msg.id}
  editText={editText}
  displayText={displayText}
  senderGlow={senderGlow}
  isPinned={!!msg.pinned}
  chatId={chatId}
  getMediaClasses={getMediaClasses}
  extractFirstUrl={extractFirstUrl}
  onEditChange={setEditText}
  onSubmitEdit={submitEdit}
  onCancelEdit={cancelEdit}
  onSelect={() => toggleMessageSelection(msg.id)}
  onReply={() => startReply(msg)}
  onContextMenu={(e) => handleContextMenu(e, msg)}
  
  // ✅ ИСПРАВЛЕНО: Long press для открытия меню
  onPointerDown={(e) => handlePointerDown(e, msg)}
  onPointerUp={handlePointerUp}
  onPointerLeave={handlePointerLeave}
  
onDoubleClick={(e) => {
  if (isSecret) return;
  const reactionToSend = quickReaction || { type: 'emoji', content: '❤️' };
  
  // ✅ ЯВНОЕ РАЗДЕЛЕНИЕ: стикер или эмодзи
  if (reactionToSend.type === 'sticker') {
    toggleReaction(msg.id, reactionToSend.stickerId, undefined);
  } else {
    toggleReaction(msg.id, undefined, reactionToSend.content);
  }

  setPopReaction({
    content: reactionToSend.content,
    type: reactionToSend.type,
    stickerId: reactionToSend.stickerId,
    x: e.clientX,
    y: e.clientY,
    id: msg.id,
    visible: true
  });
  setTimeout(() => {
    setPopReaction(prev => prev ? { ...prev, visible: false } : null);
  }, 700);
}}
  
  onReactionClick={() => { setReactionPickerFor(reactionPickerFor === msg.id ? null : msg.id); }}
  
  // ✅ ИСПРАВЛЕНО: Открытие меню по клику на "три точки"
  onMenuClick={(e) => openMessageMenu(e, msg)}
  
  activeMessageMenu={activeMessageMenu === msg.id}
  menuOpenUp={menuOpenUp}
  onSwipeRight={() => startReply(msg)}
  onToggleReaction={toggleReaction}
/>
    
  );
})}
              {/* 🆕 ЖИВЫЕ ПУЗЫРИ — плавное появление / рост / исчезновение */}
              {!isSecret &&
                Object.entries(liveTexts).map(([uid, lt]) => (
                  <div
                    key={uid}
                    className={`flex justify-start ${
                      lt.leaving
                        ? "animate-out fade-out slide-out-to-bottom-2 zoom-out-95 duration-300"
                        : "animate-in fade-in slide-in-from-bottom-2 zoom-in-95 duration-300"
                    }`}
                  >
                    <div className="max-w-[85%] sm:max-w-[75%] px-3 sm:px-3.5 py-2 rounded-tl-2xl rounded-tr-2xl rounded-br-2xl rounded-bl-[4px] bg-gray-100 dark:bg-white/5 border border-[#8b5cf6]/40 shadow-[0_0_14px_rgba(139,92,246,0.15)] transition-all duration-200 ease-out">
                      <p className="text-[11px] font-bold text-[#8b5cf6] mb-0.5">
                        {lt.name} · {t("messages.liveTyping")}
                      </p>
                      <p className="whitespace-pre-wrap break-words text-[15px] sm:text-sm text-gray-800 dark:text-white/80 leading-snug">
                        {lt.text}
                        <span className="inline-block w-[2px] h-4 bg-[#8b5cf6] ml-0.5 align-middle animate-pulse" />
                      </p>
                    </div>
                  </div>
                ))}
              <div ref={messagesEndRef} />
            </div>

            {/* 🆕 КНОПКА "ПРОКРУТИТЬ ВНИЗ" */}
            {showScrollBtn && (
              <button
                onClick={() => scrollToBottom()}
                className="absolute bottom-28 right-6 w-10 h-10 rounded-full bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 shadow-2xl flex items-center justify-center text-gray-800 dark:text-white/80 hover:text-[#8b5cf6] hover:border-[#8b5cf6] transition-all active:scale-90 z-20 animate-in fade-in zoom-in-50 duration-200"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </button>
            )}
            {files.length > 0 && (
              <div className="px-3 sm:px-3 py-2.5 border-t border-line dark:border-white/10 bg-gray-100 dark:bg-white/5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] sm:text-xs font-bold text-gray-800 dark:text-white/70">
                    {t("messages.attachmentsN", { n: files.length })}
                  </span>
                  <button onClick={() => setFiles([])} className="text-[11px] sm:text-xs text-red-600 dark:text-red-400 px-2 py-1">
                    {t("messages.clear")}
                  </button>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-2 sm:-mx-3 px-2 sm:px-3">
                  {files.map((f, i) => (
                    <div
                      key={i}
                      className="relative group border border-line dark:border-white/15 rounded-lg overflow-hidden bg-gray-100 dark:bg-white/5 shrink-0"
                    >
                      {f.type.startsWith("image/") ? (
                        <img src={URL.createObjectURL(f)} alt="" className="w-16 h-16 sm:w-16 sm:h-16 md:w-20 md:h-20 object-cover" />
                      ) : (
                        <div className="w-16 h-16 sm:w-16 sm:h-16 md:w-20 md:h-20 flex flex-col items-center justify-center gap-0.5 p-1">
                          <FileText size={16} className="text-gray-600 dark:text-white/60" />
                          <span className="text-[9px] sm:text-[9px] text-gray-600 dark:text-white/60 truncate w-full px-1 text-center">{f.name}</span>
                          <span className="text-[8px] sm:text-[8px] text-gray-500 dark:text-white/40">{formatSize(f.size)}</span>
                        </div>
                      )}
                      <button
                        onClick={() => setFiles(files.filter((_, j) => j !== i))}
                        className="absolute top-1 right-1 bg-red-500/90 text-white rounded-full p-1 active:scale-90"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}


{!isSelectMode && (
  <div className="relative z-30 p-3 sm:p-3 md:p-4 border-t border-line dark:border-white/10 bg-paper dark:bg-[#171717]/80 backdrop-blur-md">
    {isRecording ? (
      <div className="flex items-center gap-2.5 sm:gap-3">
        <div className="relative w-2.5 h-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
        </div>
        <span className="text-sm font-bold text-red-600 dark:text-red-400 tabular-nums shrink-0">
          {formatRecordingTime(recordingTime)}
        </span>
        <div className="flex-1 flex items-end justify-between gap-[2px] h-5 overflow-hidden">
          {Array.from({ length: 28 }).map((_, i) => (
            <span
              key={i}
              className="eq-bar w-[3px] rounded-full bg-red-400/70"
              style={{ animationDelay: `${(i % 7) * 0.09}s`, animationDuration: `${0.8 + (i % 5) * 0.12}s` }}
            />
          ))}
        </div>
        <button onClick={stopRecording} className="shrink-0 px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-bold hover:bg-red-600 active:scale-95 transition-all flex items-center gap-1.5">
          <Square size={11} fill="currentColor" /> Стоп
        </button>
        <button onClick={cancelRecording} className="shrink-0 p-1.5 rounded-lg text-gray-500 dark:text-white/50 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 active:scale-95 transition-all" title={t("messages.cancelRec")}>
          <X size={16} />
        </button>
      </div>
    ) : (
      <div className="flex flex-col gap-0">

{/* ✅ НОВОЕ: Плашка редактирования сообщения */}
{editingMessageId && (
  <div className="flex items-center gap-2.5 px-3 py-2 mb-1.5 bg-[#8b5cf6]/10 border border-[#8b5cf6]/30 rounded-xl">
    <Edit2 size={14} className="text-[#8b5cf6] shrink-0" />
    <div className="flex-1 min-w-0 border-l-2 border-[#8b5cf6] pl-2.5">
      <p className="text-[11px] font-bold text-[#8b5cf6]">Редактирование</p>
      <p className="text-[11px] text-gray-600 dark:text-white/50 truncate">{text}</p>
    </div>
    <button 
      onClick={cancelEdit} 
      className="p-1 text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors shrink-0"
    >
      <X size={14} />
    </button>
  </div>
)}



        {/* Панель ответа */}
        {replyTo && (
          <div className="flex items-center gap-2.5 px-3 py-2 mb-1.5 bg-[#8b5cf6]/10 border border-[#8b5cf6]/30 rounded-xl">
            <Send size={14} className="rotate-180 text-[#8b5cf6] shrink-0" />
            <div className="flex-1 min-w-0 border-l-2 border-[#8b5cf6] pl-2.5">
              <p className="text-[11px] font-bold text-[#8b5cf6]">{replyTo.sender_name}</p>
              <p className="text-[11px] text-gray-600 dark:text-white/50 truncate">
                {decryptDisplayText(replyTo) || (replyTo.media_type === 'audio' ? '🎙️ Голосовое' : replyTo.media_type === 'video' ? '🎬 Видео' : replyTo.media_type === 'image' ? '📷 Фото' : '📎 Вложение')}
              </p>
            </div>
            <button onClick={cancelReply} className="p-1 text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors shrink-0">
              <X size={14} />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2 sm:gap-2 w-full">
          <input ref={fileRef} type="file" accept="image/*,image/gif,video/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />

          {/* 🆕 КНОПКА "+" С ВЫПАДАЮЩИМ МЕНЮ */}
          <div className="relative shrink-0 flex items-end pb-1">
            <button
              onClick={() => setShowInputActions(!showInputActions)}
              className={`p-2.5 sm:p-2 rounded-full transition-all active:scale-95 ${showInputActions ? "text-[#8b5cf6] bg-[#8b5cf6]/10" : "text-gray-500 dark:text-white/60 hover:text-[#8b5cf6] hover:bg-gray-200 dark:hover:bg-white/5"}`}
              title={t("messages.actions")}
            >
              <Plus size={22} className="sm:w-5 sm:h-5" />
            </button>

            {showInputActions && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowInputActions(false)} />
                <div className="absolute bottom-full left-0 mb-2 bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-xl shadow-2xl overflow-hidden min-w-[220px] z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <button onClick={() => { fileRef.current?.click(); setShowInputActions(false); }} className="w-full px-4 py-3 text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-3 transition-colors">
                    <Paperclip size={18} className="text-gray-600 dark:text-white/60" /> <span>Прикрепить файл</span>
                  </button>
                  <button 
                    onClick={() => { 
                      setShowStickers(true); 
                      setShowInputActions(false); 
                    }} 
                    className="w-full px-4 py-3 text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-3 transition-colors border-t border-line dark:border-white/5"
                  >
                    <Smile size={18} className="text-gray-600 dark:text-white/60" /> <span>Смайлы и стикеры</span>
                  </button>
<button
  onClick={(e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    editorRef.current?.openMenuAt(rect.left + rect.width / 2, rect.top - 8);
    setShowInputActions(false);
  }}
  className="w-full px-4 py-3 text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-3 transition-colors border-t border-line dark:border-white/5"
>
  <Type size={18} className="text-gray-600 dark:text-white/60" /> <span>{t("messages.formatText")}</span>
</button>
                </div>
              </>
            )}
          </div>


{/* 🆕 ПОЛЕ ВВОДА — ТЕПЕРЬ WYSIWYG */}
<div className="relative flex-1 flex items-end">
  {mentionSuggestions.length > 0 && mentionQuery !== null && (
    <div className="absolute bottom-full left-0 mb-2 w-64 bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
      {mentionSuggestions.map((u) => (
        <button key={u.id} type="button" onClick={() => selectMention(u)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-white/10 text-left transition-colors">
          <Avatar src={u.avatar_url} name={u.display_name} id={u.id} size={28} />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-gray-900 dark:text-white font-medium truncate">{u.display_name}</p>
            <p className="text-xs text-gray-500 dark:text-white/40 truncate">@{u.username}</p>
          </div>
        </button>
      ))}
    </div>
  )}
  {/* 🎨 ОБЁРТКА С РАМКОЙ — единый стиль с CreatePost */}
  <div className="chat-input-shell flex-1 rounded-xl border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 overflow-hidden focus-within:border-[#8b5cf6] transition-all">
    <RichEditor
      ref={editorRef}
      value={text}
      onChange={(v) => {
        setText(v);
        // упоминания — парсим markdown
        const lastAt = v.lastIndexOf("@");
        if (lastAt !== -1) {
          const q = v.slice(lastAt + 1).toLowerCase();
          if (/^[\w]*$/.test(q) && !/\s/.test(q)) {
            setMentionQuery(q);
            setMentionSuggestions(
              chatMembers
                .map(m => m.user)
                .filter(u => u.username.toLowerCase().includes(q) || (u.display_name && u.display_name.toLowerCase().includes(q)))
                .slice(0, 5)
            );
            return;
          }
        }
        setMentionQuery(null);
        setMentionSuggestions([]);
        sendLiveText(v);
      }}
      placeholder={isSecret ? (secretState === "ready" ? t("messages.encryptedPlaceholder") : t("messages.waitingEncrypt")) : isGroup ? t("messages.groupPlaceholder") : t("messages.msgPlaceholder")}
      className="w-full bg-transparent text-gray-900 dark:text-white text-[15px] sm:text-sm md:text-base placeholder-gray-400 dark:placeholder-white/40 px-3 py-2.5 min-h-[48px] max-h-32 overflow-y-auto disabled:opacity-50 disabled:cursor-not-allowed leading-snug"
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      }}
    />
  </div>
</div>

          {/* Кнопка отправки */}
          <div className="relative shrink-0 flex items-end pb-1">
            <button
              onPointerDown={handleSendPointerDown}
              onPointerUp={handleSendButtonPointerUp}
              onClick={handleSendClick}
              disabled={isSecret && secretState !== "ready"}
              className={`p-2.5 sm:p-2.5 md:p-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-all min-w-[44px] sm:min-w-[40px] md:min-w-[44px] min-h-[44px] sm:min-h-[40px] md:min-h-[44px] flex items-center justify-center active:scale-95 select-none touch-none ${
                isSecret
                  ? "border border-emerald-500 bg-emerald-600 text-gray-900 dark:text-white hover:bg-emerald-700"
                  : "border border-[#8b5cf6] bg-[#8b5cf6] text-white hover:bg-[#7c3aed]"
              }`}
            >
              <Send size={19} className="sm:w-[18px] sm:h-[18px]" />
            </button>
            
            {/* Меню записи (остается как было) */}
            {showRecordMenu && (
              <div className="absolute bottom-full right-0 mb-2 bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-xl shadow-2xl overflow-hidden min-w-[180px] z-[100] animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-none">
                <button ref={(el) => { menuItemRefs.current.voice = el; }} className={`w-full px-4 py-3 flex items-center gap-3 text-left text-sm transition-colors ${selectedMenuItem === 'voice' ? 'bg-gray-100 dark:bg-white/20' : ''} text-gray-900 dark:text-white`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${selectedMenuItem === 'voice' ? 'bg-red-500/30 text-red-600 dark:text-red-300' : 'bg-red-500/20 text-red-600 dark:text-red-400'}`}>
                    <Mic size={18} />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-medium">Голосовое</span>
                    <span className="text-[10px] text-gray-500 dark:text-white/40">Аудиосообщение</span>
                  </div>
                </button>
                <div className="h-px bg-gray-100 dark:bg-white/10" />
                <button ref={(el) => { menuItemRefs.current.video = el; }} className={`w-full px-4 py-3 flex items-center gap-3 text-left text-sm transition-colors ${selectedMenuItem === 'video' ? 'bg-gray-100 dark:bg-white/20' : ''} text-gray-900 dark:text-white`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${selectedMenuItem === 'video' ? 'bg-blue-500/30 text-blue-600 dark:text-blue-300' : 'bg-blue-500/20 text-blue-600 dark:text-blue-400'}`}>
                    <Video size={18} />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-medium">Видео</span>
                    <span className="text-[10px] text-gray-500 dark:text-white/40">Видео-квадрат</span>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )}
  </div>
)}
          </>
        )}

        {isSelectMode && <div className="h-2" />}

        {/* 🆕 ПИКЕР РЕАКЦИЙ С ПАКАМИ */}
 {reactionPickerFor !== null && (
  <>
    <div className="fixed inset-0 z-[260] bg-black/60 backdrop-blur-sm" onClick={() => setReactionPickerFor(null)} />
    <div className="fixed inset-0 z-[261] flex items-center justify-center p-4 pointer-events-none">
      <div className="w-full max-w-sm max-h-[80vh] bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-2xl shadow-2xl flex flex-col pointer-events-auto">
        {/* Шапка — всегда видна */}
        <div className="shrink-0 p-3 pb-2 border-b border-line dark:border-white/10">
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-xs font-bold text-gray-600 dark:text-white/60">Выбрать реакцию</p>
            <button onClick={() => setReactionPickerFor(null)} className="text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white p-1">
              <X size={14} />
            </button>
          </div>

          {/* Вкладки паков */}
          <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-1">
            {stickerPacks.map((pack, i) => (
              <button
                key={pack.id}
                onClick={() => setActivePackTab(i)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 transition-all ${
                  activePackTab === i
                    ? "bg-[#8b5cf6] text-white"
                    : "bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/50 hover:bg-gray-100 dark:hover:bg-white/10"
                }`}
              >
                {pack.locked && <Lock size={10} className="text-yellow-600 dark:text-yellow-400" />}
                {pack.name}
              </button>
            ))}
          </div>
        </div>

        {/* Контент — скроллится */}
        <div className="flex-1 overflow-y-auto p-3 min-h-0">
          {stickerPacks[activePackTab] && (
            stickerPacks[activePackTab].locked ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <div className="w-12 h-12 rounded-full bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center">
                  <Lock size={18} className="text-yellow-600 dark:text-yellow-400" />
                </div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">Пак заблокирован</p>
                <p className="text-[11px] text-gray-500 dark:text-white/40 max-w-[220px]">
                  Доступен с уровня {stickerPacks[activePackTab].min_level}. 
                  Повысь уровень, чтобы использовать эти реакции.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-6 gap-1.5">
                {stickerPacks[activePackTab].stickers.map((s: any) => (
<button
  key={s.id}
  onClick={() => {
    // ✅ ЯВНОЕ РАЗДЕЛЕНИЕ
    if (s.type === "emoji") {
      toggleReaction(reactionPickerFor!, undefined, s.content);
    } else {
      toggleReaction(reactionPickerFor!, Number(s.id), undefined);
    }
  }}
  className="aspect-square flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 active:scale-90 transition-all"
>
                    {s.type === "emoji" ? (
                      <span className="text-2xl">{s.content}</span>
                    ) : (
                      <img src={s.content} alt="" className="w-10 h-10 object-contain" />
                    )}
                  </button>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  </>

        )}

        {/* 🆕 Контекстное меню по ПКМ */}
        {contextMenu && (
          <MessageContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={getMessageMenuItems(contextMenu.msg)}
            onClose={() => setContextMenu(null)}
          />
        )}
        {/* 🆕 Анимация вылетающей реакции при двойном тапе */}
        {popReaction && (
          <div
            className={`fixed pointer-events-none z-[300] drop-shadow-lg transition-all duration-700 ease-out ${
              popReaction.visible 
                ? 'opacity-100 scale-100 translate-y-0' 
                : 'opacity-0 scale-150 -translate-y-12'
            }`}
style={{
  left: '50%',
  top: '20%',
  transform: 'translate(-50%, -50%)'
}}
          >
            {popReaction.type === 'emoji' ? (
              <span className="text-5xl">{popReaction.content}</span>
            ) : (
              <img src={popReaction.content} alt="" className="w-12 h-12 object-contain" />
            )}
          </div>
        )}

{/* 🆕 СОЧНОЕ МЕНЮ ПО LONG PRESS */}
{longPressMenu && (() => {
    // 📐 Вычисляем позицию меню относительно сообщения
    const MENU_WIDTH = 280;
    const MENU_HEIGHT = 56;
    const GAP = 8;
    const msgWidth = (longPressMenu.msgRight ?? 0) - (longPressMenu.msgLeft ?? 0);
    const msgCenterX = (longPressMenu.msgLeft ?? 0) + msgWidth / 2;
    
    // Центрируем меню по горизонтали относительно сообщения
    const rawLeft = msgCenterX - MENU_WIDTH / 2;
    const left = Math.max(12, Math.min(rawLeft, window.innerWidth - MENU_WIDTH - 12));
    
    // Если сообщение в верхней половине экрана — меню снизу, иначе сверху
    const isTopHalf = (longPressMenu.msgBottom ?? 0) < window.innerHeight / 2;
    const rawTop = isTopHalf 
        ? (longPressMenu.msgBottom ?? 0) + GAP 
        : (longPressMenu.msgTop ?? 0) - MENU_HEIGHT - GAP;
    const top = Math.max(12, rawTop);
    
    return (
        <>
            {/* Фон */}
            <div
                className="fixed inset-0 z-[250] bg-black/40 backdrop-blur-[2px]"
                onClick={() => setLongPressMenu(null)}
            />
            {/* Меню реакций */}
            {/* Меню реакций */}
            <div
                className="fixed z-[251] bg-[#1c1c1e]/95 backdrop-blur-xl border border-line dark:border-white/10 rounded-2xl shadow-2xl p-2 flex items-center gap-1"
                style={{
                    left,
                    top,
                    width: 'fit-content',
                    maxWidth: '90vw',
                    animation: 'popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
                }}
>
                {allAvailableReactions.length > 0 ? (
                  allAvailableReactions.slice(0, 4).map((r, i) => (
<button
  key={`${r.type}-${r.stickerId || r.content}`}
  disabled={r.locked}
  onClick={() => {
    if (!r.locked) {
      // ✅ ЯВНОЕ РАЗДЕЛЕНИЕ
      if (r.type === 'sticker') {
        toggleReaction(longPressMenu.msgId, r.stickerId, undefined);
      } else {
        toggleReaction(longPressMenu.msgId, undefined, r.content);
      }
      setLongPressMenu(null);
    }
  }}
  className={`text-2xl p-2 rounded-full transition-all ${r.locked ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-100 dark:hover:bg-white/10 active:scale-110'}`}
  style={{ animation: `popIn 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) backwards`, animationDelay: `${i * 30}ms` }}
  title={r.locked ? t("messages.needLevel", { n: r.minLevel ?? 0 }) : r.packName}
>
  {r.type === "emoji" ? r.content : <img src={r.content} alt="" className="w-7 h-7 object-contain" />}
</button>
                  ))
                ) : (
                  <div className="px-3 py-2 text-xs text-gray-600 dark:text-white/50 whitespace-nowrap">
                    {stickerPacks.length === 0 ? t("messages.loadingPacks") : t("messages.noReactions")}
                  </div>
                )}
                
                <div className="w-px h-8 bg-gray-100 dark:bg-white/10 mx-0.5" />
                
                <button
                  onClick={() => {
                    setReactionPickerFor(longPressMenu.msgId);
                    setLongPressMenu(null);
                  }}
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 dark:bg-white/5 hover:bg-[#8b5cf6]/20 hover:text-[#8b5cf6] active:scale-90 transition-all text-white/70"
                  style={{ animation: 'popIn 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) backwards', animationDelay: '180ms' }}
                  title={t("messages.allReactions")}
                >
                  <SmilePlus size={16} />
                </button>
            </div>
        </>
    );
})()}




      </main>


 {showMediaGallery && (
  <>
    {/* Оверлей — только на мобилке */}
    <div
      className="fixed inset-0 bg-black/60 z-[199] md:hidden"
      onClick={() => setShowMediaGallery(false)}
    />

    {/* Панель медиа */}
    <div
      className={`
        fixed z-[200]
        /* Мобилка: fullscreen */
        inset-0
        /* Десктоп: компактная панель справа */
        md:inset-auto md:top-0 md:right-0 md:bottom-0 md:w-[420px]
        bg-paper dark:bg-[#171717]/95 md:bg-paper dark:bg-[#171717]
        backdrop-blur-md
        border-l border-line dark:border-white/10
        flex flex-col
        animate-in slide-in-from-right-4 duration-200
      `}
    >
      {/* Шапка с вкладками — ВСЕГДА сверху, не меняется */}
      <div className="shrink-0 border-b border-line dark:border-white/10 bg-paper dark:bg-[#171717]/80">
        <div className="flex items-center justify-between px-3 py-2.5">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Медиа</h2>
          <button
            onClick={() => setShowMediaGallery(false)}
            className="text-gray-600 dark:text-white/50 hover:text-gray-900 dark:hover:text-white p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 active:scale-95 transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Вкладки с счётчиками */}
        <div className="flex gap-1 px-3 pb-2 overflow-x-auto scrollbar-hide">
          {[
            { key: "image", label: t("common.photo"), icon: <ImageIcon size={12} /> },
            { key: "video", label: t("common.video"), icon: <Film size={12} /> },
            { key: "video_note", label: t("messages.squares"), icon: <Video size={12} /> },
            { key: "audio", label: t("messages.voices"), icon: <Mic size={12} /> },
          ].map((t) => {
            const count = mediaItems.filter((m) =>
              t.key === "image" ? (m.media_type === "image" || m.media_type === "gif") : m.media_type === t.key
            ).length;
            const active = mediaTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setMediaTab(t.key as any)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all shrink-0 ${
                  active
                    ? "bg-[#8b5cf6] text-white"
                    : "bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/50 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-800 dark:hover:text-white/80"
                }`}
              >
                {t.icon}
                {t.label}
                <span className={`${active ? "text-gray-800 dark:text-white/70" : "text-gray-500 dark:text-white/30"}`}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Контент — скроллится, шапка на месте */}
      <div className="flex-1 overflow-y-auto p-3">
        {mediaItems.filter((m) =>
          mediaTab === "image" ? (m.media_type === "image" || m.media_type === "gif") : m.media_type === mediaTab
        ).length === 0 ? null : mediaTab === "image" || mediaTab === "video" ? (
          /* Сетка для фото/видео */
          <div className="grid grid-cols-3 gap-1.5">
            {mediaItems
              .filter((m) =>
                mediaTab === "image" ? (m.media_type === "image" || m.media_type === "gif") : m.media_type === "video"
              )
              .map((item) => (
                <div
                  key={item.id}
                  className="aspect-square relative cursor-pointer group rounded-lg overflow-hidden border border-line dark:border-white/10 hover:border-[#8b5cf6]/50 transition-colors"
                  onClick={() => setSelectedMedia(item)}
                >
                  {mediaTab === "image" ? (
                    <img src={mediaUrl(item.media_url)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <video src={mediaUrl(item.media_url)} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
                        <Film size={20} className="text-gray-800 dark:text-white/70" />
                      </div>
                    </>
                  )}
                </div>
              ))}
          </div>
        ) : (
          /* Список для квадратов и голосовых */
          <div className="space-y-2">
            {mediaItems
              .filter((m) => m.media_type === mediaTab)
              .map((item) => (
                <div key={item.id} className="p-2 rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10">
                  {mediaTab === "video_note" ? (
                    <div className="max-w-[200px]">
                      <VideoNotePlayer
                        src={mediaUrl(item.media_url)}
                        trackId={`gallery-${item.id}`}
                      />
                    </div>
                  ) : (
                    <AudioPlayer
                      src={mediaUrl(item.media_url)}
                      trackId={`gallery-${item.id}`}
                      title={t("common.audio")}
                    />
                  )}
                  <p className="text-[10px] text-gray-500 dark:text-white/30 mt-1.5">
                    {formatChatTime(item.created_at)}
                  </p>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  </>
)}

      {selectedMedia && (
        <div
          className="fixed inset-0 z-[201] bg-black/95 flex items-center justify-center p-3 sm:p-4"
          onClick={() => setSelectedMedia(null)}
        >
          <button
            onClick={() => setSelectedMedia(null)}
            className="absolute top-3 sm:top-4 right-3 sm:right-4 text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white p-2 z-10"
          >
            <X size={24} />
          </button>
          <div className="max-w-[95vw] sm:max-w-[90vw] max-h-[95vh] sm:max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            {(selectedMedia.media_type === "image" || selectedMedia.media_type === "gif") && (
              <img
                src={mediaUrl(selectedMedia.media_url)}
                alt=""
                className="max-w-full max-h-[95vh] sm:max-h-[90vh] rounded-lg"
              />
            )}
            {selectedMedia.media_type === "video" && (
              <video
                src={mediaUrl(selectedMedia.media_url)}
                controls
                autoPlay
                className="max-w-full max-h-[95vh] sm:max-h-[90vh] rounded-lg"
              />
            )}
          </div>
        </div>
      )}

{showGroupMembers && isGroup && (
  <div className="fixed inset-0 z-[9999]">
    <GroupMembersModal
      chatId={Number(chatId)}
      myRole={chatInfo?.my_role || null}
      onClose={() => setShowGroupMembers(false)}
      onChanged={() => loadChatInfo()}
    />
  </div>
)}

{showGroupSettings && (
  <div className="fixed inset-0 z-[9999]">
    <GroupSettingsModal
      chatId={Number(chatId)}
      chat={chatInfo}
      onClose={() => setShowGroupSettings(false)}
      onUpdate={() => { loadChatInfo(); loadPinned(); }}
    />
  </div>
)}


{showVideoRecorder && (
  <VideoNoteRecorder
    onCancel={() => setShowVideoRecorder(false)}
    onRecorded={async (file) => {
      setShowVideoRecorder(false);
      const token = getToken();
      if (!token) return;

      try {
        if (isSecret) {
          if (secretState !== "ready") {
            alert(t("messages.encryptNotReady"));
            return;
          }
          const sk = secretSessionKey || loadSessionKey(Number(chatId));
          if (!sk) {
            alert(t("messages.sessionKeyLost"));
            return;
          }
          const { encryptMediaFile } = await import("@/lib/mediaCrypto");
          const encryptedBlob = await encryptMediaFile(file, sk);

          const form = new FormData();
          form.append("file", encryptedBlob, file.name);
          form.append("media_type", "video_note");
          if (replyTo) form.append("reply_to_id", String(replyTo.id));

          const res = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages/encrypted-media`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
              body: form,
            }
          );
          if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: t("common.error") }));
            alert(err.detail || t("messages.videoEncryptFailed"));
          }
        } else {
          // 🆕 Мгновенный плейсхолдер "загрузка…" пока видеокружок уходит на сервер
          const tempVnId = Date.now();
          setMessages((prev) => [...prev, {
            id: tempVnId,
            sender_id: currentUser?.id,
            sender_name: currentUser?.display_name,
            sender_avatar: currentUser?.avatar_url,
            text: null,
            media_url: null,
            media_type: "video_note",
            is_uploading: true,
            read: false,
            created_at: new Date().toISOString(),
            is_temp: true,
          }]);

          const form = new FormData();
          form.append("file", file);
          form.append("media_type", "video_note");
          if (replyTo) form.append("reply_to_id", String(replyTo.id));

          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: form,
          });
          if (!res.ok) {
            setMessages((prev) => prev.filter((m) => m.id !== tempVnId));
            const err = await res.json().catch(() => ({ detail: t("common.error") }));
            alert(err.detail || "Не удалось отправить видеосообщение");
          } else {
            const saved = await res.json().catch(() => null);
            setMessages((prev) => {
              const without = prev.filter((m) => m.id !== tempVnId);
              if (saved && saved.id && !without.some((m) => m.id === saved.id)) {
                return [...without, saved];
              }
              return without;
            });
          }
        }
      } catch (err) {
        console.error("Failed to send video note:", err);
        alert(t("common.networkError"));
      }
    }}
    maxDuration={60}
  />
)}
{permHelp && (
  <PermissionHelpModal device={permHelp} onClose={() => setPermHelp(null)} />
)}


{showForwardModal && forwardingMessage && (
  <>
    <div
      className="fixed inset-0 bg-black/80 z-[200]"
      onClick={() => { setShowForwardModal(false); setForwardingMessage(null); }}
    />
    <div className="fixed inset-0 z-[201] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-2xl shadow-2xl max-h-[70vh] flex flex-col">
        <div className="p-4 border-b border-line dark:border-white/10 flex items-center justify-between">
          <h3 className="font-bold text-gray-900 dark:text-white">Переслать сообщение</h3>
          <button
            onClick={() => { setShowForwardModal(false); setForwardingMessage(null); }}
            className="text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white p-1"
          >
            <X size={18} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2">
          {forwardChats.map((c) => (
            <button
              key={c.id}
              onClick={() => forwardToChat(c.id)}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shrink-0">
                {c.is_group ? (
                  <Users size={18} className="text-gray-900 dark:text-white" />
                ) : c.other?.avatar_url ? (
                  <img src={mediaUrl(c.other.avatar_url)} alt="" className="w-full h-full rounded-xl object-cover" />
                ) : (
                  <span className="text-gray-900 dark:text-white font-bold">{(c.other?.display_name || "?")[0]}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900 dark:text-white truncate">
                  {c.is_group ? c.name : c.other?.display_name}
                </p>
                <p className="text-xs text-gray-500 dark:text-white/40 truncate">
                  {c.is_group ? `${c.members_count} участников` : `@${c.other?.username}`}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  </>
)}


        {/* 🆕 ПАНЕЛЬ ОТПРАВКИ СТИКЕРОВ (БЫЛА ОТСУТСТВУЕТ В JSX) */}
        {showStickers && (
          <>
            <div 
              className="fixed inset-0 z-[260] bg-black/60 backdrop-blur-sm" 
              onClick={() => setShowStickers(false)} 
            />
            <div className="fixed inset-x-0 bottom-0 z-[261] md:inset-auto md:bottom-4 md:right-4 md:w-80 bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col max-h-[70vh] md:max-h-[500px] animate-in slide-in-from-bottom-10 duration-200">
              <div className="shrink-0 p-3 border-b border-line dark:border-white/10 flex items-center justify-between">
                <p className="text-sm font-bold text-gray-900 dark:text-white">Стикеры</p>
                <button onClick={() => setShowStickers(false)} className="text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                  <X size={16} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-3 min-h-0">
                {stickerPacks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center mb-2">
                      <Smile size={20} className="text-gray-500 dark:text-white/30" />
                    </div>
                    <p className="text-sm text-gray-600 dark:text-white/60">Загрузка стикеров...</p>
                  </div>
                ) : (
                  stickerPacks.map((pack) => {
                    const userLevel = currentUser?.level ?? 0;
                    const isLocked = (pack.min_level || 0) > userLevel;
                    
                    return (
                      <div key={pack.id} className="mb-4 last:mb-0">
                        <div className="flex items-center gap-2 mb-2 px-1">
                          <span className="text-xs font-bold text-gray-600 dark:text-white/60">{pack.name}</span>
                          {isLocked && <Lock size={12} className="text-yellow-600 dark:text-yellow-400" />}
                        </div>
                        
                        {isLocked ? (
                          <div className="p-4 rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 text-center">
                            <Lock size={20} className="text-yellow-600 dark:text-yellow-400 mx-auto mb-1" />
                            <p className="text-xs text-gray-500 dark:text-white/40">Доступно с {pack.min_level} уровня</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-5 gap-2">
{pack.stickers?.map((s: any) => (
  <button
    key={s.id}
    onClick={(e) => {
      e.stopPropagation(); // Предотвращаем случайное всплытие клика
      console.log("🎯 Клик по элементу в панели стикеров:", s);
      
      // ✅ ИСПРАВЛЕНО: Эмодзи вставляем в текст, стикеры отправляем
      if (s.type === "emoji") {
        insertTextAtCursor(s.content);
        // Панель НЕ закрываем, чтобы можно было добавить несколько смайлов
      } else {
        sendStickerMessage(Number(s.id));
        setShowStickers(false); // Панель закрываем после отправки стикера
      }
    }}
    className="aspect-square flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 active:scale-90 transition-all"
    title={s.type === "emoji" ? "Вставить в текст" : "Отправить стикер"}
  >
    {s.type === "emoji" ? (
      <span className="text-2xl">{s.content}</span>
    ) : (
      <img src={s.content} alt="" className="w-10 h-10 object-contain" />
    )}
  </button>
))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}



    </div>
  );
}