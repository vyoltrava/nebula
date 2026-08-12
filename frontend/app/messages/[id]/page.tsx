"use client";

import { useWebSocket } from "@/src/hooks/useWebSocket";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

import { Sidebar } from "@/components/Sidebar";
import { Avatar } from "@/components/Avatar";
import { GroupMembersModal } from "@/components/GroupMembersModal";
import { GroupSettingsModal } from "@/components/GroupSettingsModal";
import { VideoNoteRecorder } from "@/components/VideoNoteRecorder";
import { VideoNotePlayer } from "@/components/VideoNotePlayer";
import { VideoPlayer } from "@/components/VideoPlayer";
import { getToken } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import { STICKERS } from "@/lib/stickers";
import { AudioPlayer } from "@/components/AudioPlayer";
import { ChatWindowSkeleton } from "@/components/Skeletons";
import {
  pinMessage,
  unpinMessage,
  getPinnedMessages,
} from "@/lib/api";
import type { PinnedMessage } from "@/lib/types";
import { EncryptedMediaPlayer } from "@/components/EncryptedMediaPlayer";

import { isOnline, lastSeenText } from "@/lib/online";
import { useUnreadCounts } from "@/lib/UnreadCountsContext";

import {
  Send,
  Image as ImageIcon,
  X,
  Smile,
  Paperclip,
  FileText,
  Film,
  Edit2,
  Trash2,
  MoreVertical,
  Lock,
  Search,
  ShieldCheck,
  AlertTriangle,
  Check,
  CheckCheck,
  CheckSquare,
  Mic,
  Square,
  Users,
  Settings,
  Pin,
  PinOff,
  Video,
} from "lucide-react";

import {
  ensureKeyPair,
  getKeyPair,
  encryptMessage,
  decryptMessage,
  generateSessionKey,
  encryptSessionKeyForUser,
  decryptSessionKey,
  storeSessionKey,
  loadSessionKey,
  exportKeyPairPayload,
  importKeyPairPayload,
} from "@/lib/crypto";

import { QRCodeSVG } from "qrcode.react";
import { Html5Qrcode } from "html5-qrcode";

export default function ChatPage() {
  const params = useParams();
  const chatId = params?.id as string;
  const router = useRouter();
  const { refresh } = useUnreadCounts();

  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);

  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const [showStickers, setShowStickers] = useState(false);

  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  const [showMediaGallery, setShowMediaGallery] = useState(false);
  const [mediaItems, setMediaItems] = useState<any[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<any | null>(null);

  const [activeMessageMenu, setActiveMessageMenu] = useState<number | null>(
    null
  );

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [chatPartner, setChatPartner] = useState<any>(null);
  const [chatInfo, setChatInfo] = useState<any>(null);

  const [isSecret, setIsSecret] = useState(false);
  const [cryptoError, setCryptoError] = useState<string | null>(null);

  const [showVerify, setShowVerify] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const scannerRef = useRef<any>(null);

  const [myFingerprint, setMyFingerprint] = useState("");
  const [partnerFingerprint, setPartnerFingerprint] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Set<number>>(
    new Set()
  );

  const [showChatMenu, setShowChatMenu] = useState(false);
  const [showGroupMembers, setShowGroupMembers] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);

  const [showVideoRecorder, setShowVideoRecorder] = useState(false);

  /*
   * Меню записи при удержании кнопки отправки.
   */
  const [showRecordMenu, setShowRecordMenu] = useState(false);
  const [isLongPress, setIsLongPress] = useState(false);

  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressTriggeredRef = useRef(false);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>([]);
  const [showPinnedList, setShowPinnedList] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const sendingRef = useRef(false);
  const skRefreshedForRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  /*
   * ============================================================
   * ГОЛОСОВЫЕ СООБЩЕНИЯ
   * ============================================================
   */

  async function startRecording() {
    if (isRecording) return;

    try {
      if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        alert("Ваш браузер не поддерживает запись аудио");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      let mimeType = "audio/webm;codecs=opus";

      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "audio/webm";
      }

      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "";
      }

      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        try {
          const audioMimeType = mimeType || "audio/webm";

          const audioBlob = new Blob(audioChunksRef.current, {
            type: audioMimeType,
          });

          if (audioBlob.size === 0) {
            return;
          }

          const audioFile = new File(
            [audioBlob],
            "voice-message.webm",
            {
              type: audioMimeType,
            }
          );

          await sendVoiceMessage(audioFile);
        } catch (err) {
          console.error("Failed to process voice recording:", err);
          alert("Не удалось обработать голосовое сообщение");
        } finally {
          stream.getTracks().forEach((track) => track.stop());
          mediaRecorderRef.current = null;
          audioChunksRef.current = [];
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error("MediaRecorder error:", event);
      };

      mediaRecorder.start(250);

      setIsRecording(true);
      setRecordingTime(0);

      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Microphone access denied:", err);
      alert("Не удалось получить доступ к микрофону");
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;

    if (!recorder) {
      setIsRecording(false);

      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }

      return;
    }

    if (recorder.state !== "inactive") {
      recorder.stop();
    }

    setIsRecording(false);

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }

  async function sendVoiceMessage(audioFile: File) {
    const token = getToken();

    if (!token) return;

    try {
      const form = new FormData();

      form.append("file", audioFile);

      /*
       * Сохраняем текущую серверную схему.
       *
       * В секретном чате голосовые пока отправляются как media,
       * как и в исходной реализации.
       */
      if (isSecret) {
        form.append("text", "");
      }

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: form,
        }
      );

      if (!res.ok) {
        alert("Не удалось отправить голосовое сообщение");
        return;
      }

      /*
       * В secret chat обновляем сообщения сразу после отправки,
       * поскольку серверный response может не содержать
       * расшифрованного состояния.
       */
      if (isSecret) {
        await loadMessages();
      }
    } catch (err) {
      console.error("Failed to send voice:", err);
      alert("Ошибка сети");
    }
  }

  function formatRecordingTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;

    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  /*
   * ============================================================
   * LONG PRESS КНОПКИ ОТПРАВКИ
   * ============================================================
   */

  function clearLongPressTimer() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function handleSendPointerDown() {
    if (isRecording) return;
    if (cryptoError) return;

    /*
     * Даже если поле пустое, long press должен работать,
     * потому что именно так пользователь начинает запись.
     */
    longPressTriggeredRef.current = false;

    clearLongPressTimer();

    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setIsLongPress(true);
      setShowRecordMenu(true);
      longPressTimerRef.current = null;
    }, 500);
  }

  function handleSendPointerUp() {
    clearLongPressTimer();
  }

  function handleSendPointerCancel() {
    clearLongPressTimer();
  }

  function handleSendClick() {
    /*
     * Если клик произошёл после long press,
     * обычное сообщение отправлять нельзя.
     */
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }

    /*
     * При обычном тапе отправляем сообщение.
     * sendMessage() сам проверяет пустой текст/файлы.
     */
    sendMessage();
  }

  function closeRecordMenu() {
    setShowRecordMenu(false);
    setIsLongPress(false);
    clearLongPressTimer();

    /*
     * Не сбрасываем longPressTriggeredRef здесь.
     *
     * После выбора пункта меню браузер может сгенерировать
     * pointerup/click от исходного касания.
     */
  }

  function handleVoiceRecord() {
    longPressTriggeredRef.current = false;
    closeRecordMenu();
    startRecording();
  }

  function handleVideoRecord() {
    longPressTriggeredRef.current = false;
    closeRecordMenu();
    setShowVideoRecorder(true);
  }

  /*
   * ============================================================
   * ПРОФИЛИ / РОЛИ
   * ============================================================
   */

  function getGlowColor(user: any): string | null {
    if (user?.is_admin) return "#8b5cf6";
    if (user?.is_moderator) return "#3b82f6";
    if (user?.role?.color) return user.role.color;

    return null;
  }

  function glowStyle(
    user: any
  ): React.CSSProperties | undefined {
    const c = getGlowColor(user);

    if (!c) return undefined;

    return {
      color: c,
      textShadow: `0 0 6px ${c}B3, 0 0 14px ${c}66`,
    };
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;

    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /*
   * ============================================================
   * ВЫБОР СООБЩЕНИЙ
   * ============================================================
   */

  function toggleSelectMode() {
    setIsSelectMode((prev) => !prev);
    setSelectedMessages(new Set());
  }

  function toggleMessageSelection(id: number) {
    setSelectedMessages((prev) => {
      const next = new Set(prev);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  async function deleteSelectedMessages() {
    if (selectedMessages.size === 0) return;

    if (
      !confirm(
        `Удалить ${selectedMessages.size} сообщений?`
      )
    ) {
      return;
    }

    const token = getToken();

    if (!token) return;

    try {
      await Promise.all(
        Array.from(selectedMessages).map((id) =>
          fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages/${id}`,
            {
              method: "DELETE",
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          )
        )
      );

      setSelectedMessages(new Set());
      setIsSelectMode(false);

      await loadMessages();
    } catch (err) {
      console.error("Failed to delete selected messages:", err);
      alert("Ошибка при удалении сообщений");
    }
  }

  /*
   * ============================================================
   * УДАЛЕНИЕ ЧАТА
   * ============================================================
   */

  async function deleteChat() {
    const isOwner = chatInfo?.my_role === "owner";

    let confirmMsg: string;
    let url: string;

    if (isGroup && !isOwner) {
      confirmMsg =
        "Покинуть группу? Вы больше не будете получать сообщения из неё.";

      url = `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/members/${currentUser?.id}`;
    } else if (isGroup && isOwner) {
      confirmMsg =
        "⚠️ Удалить группу для ВСЕХ участников?\nВсе сообщения будут стёрты. Это действие нельзя отменить.";

      url = `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}`;
    } else {
      confirmMsg =
        "Удалить чат? Все сообщения будут удалены. Это действие нельзя отменить.";

      url = `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}`;
    }

    if (!confirm(confirmMsg)) return;

    const token = getToken();

    if (!token) return;

    try {
      const res = await fetch(url, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        router.push("/messages");
      } else {
        const err = await res
          .json()
          .catch(() => ({ detail: "Ошибка" }));

        alert(err.detail || "Не удалось удалить чат");
      }
    } catch (err) {
      console.error("Failed to delete chat:", err);
      alert("Ошибка сети");
    }
  }

  /*
   * ============================================================
   * E2EE
   * ============================================================
   */

  function decryptDisplayText(msg: any): string {
    if (!isSecret) {
      return msg.text || "";
    }

    if (!msg.ciphertext) {
      return "[нет данных]";
    }

    const sk = loadSessionKey(Number(chatId));

    if (!sk) {
      return "[Сессия не установлена]";
    }

    return decryptMessage(msg.ciphertext, sk);
  }

  /*
   * ============================================================
   * ЗАГРУЗКА CHAT INFO
   * ============================================================
   */

  async function loadChatInfo() {
    const token = getToken();

    if (!token) return;

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (res.status === 403) {
        router.push("/messages");
        return;
      }

      if (res.ok) {
        const data = await res.json();

        setChatInfo(data);

        setIsSecret(
          data.is_secret && !data.is_group
        );

        if (data.is_group) {
          setChatPartner(null);
        } else {
          setChatPartner(data.other);
        }
      }
    } catch (err) {
      console.error("Failed to load chat info", err);
    }
  }

  /*
   * ============================================================
   * ЗАГРУЗКА СООБЩЕНИЙ
   * ============================================================
   */

  async function loadMessages() {
    setLoadingMessages(true);

    const token = getToken();

    if (!token) {
      setLoadingMessages(false);
      return;
    }

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (res.status === 403) {
        router.push("/messages");
        return;
      }

      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (err) {
      console.error("Failed to load messages", err);
    } finally {
      setLoadingMessages(false);
    }
  }

  /*
   * ============================================================
   * PINNED
   * ============================================================
   */

  async function loadPinned() {
    try {
      const data = await getPinnedMessages(
        Number(chatId)
      );

      setPinnedMessages(data);
    } catch (e) {
      console.error(
        "Failed to load pinned messages:",
        e
      );
    }
  }

  /*
   * ============================================================
   * E2EE INIT
   * ============================================================
   */

  async function initCryptoForSecretChat() {
    if (!isSecret || !chatPartner || isGroup) {
      return;
    }

    const token = getToken();

    if (!token) return;

    try {
      const myKeyData = await ensureKeyPair(
        token,
        process.env.NEXT_PUBLIC_API_URL!
      );

      getKeyPair();

      setMyFingerprint(myKeyData.fingerprint);

      let sk = loadSessionKey(
        Number(chatId)
      );

      if (!sk) {
        try {
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/session-key`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );

          if (res.ok) {
            const data = await res.json();

            const keys = getKeyPair();

            if (!keys) {
              setCryptoError(
                "Не удалось загрузить ключи"
              );

              return;
            }

            try {
              sk = decryptSessionKey(
                data.encrypted_session_key
              );

              storeSessionKey(
                Number(chatId),
                sk
              );
            } catch (e) {
              console.error(
                "Failed to decrypt session key:",
                e
              );

              await establishNewSession();
            }
          } else if (res.status === 404) {
            await establishNewSession();
          }
        } catch {
          await establishNewSession();
        }
      }
    } catch (err) {
      console.error(
        "Crypto init failed:",
        err
      );

      setCryptoError(
        "Ошибка инициализации E2EE"
      );
    }
  }

  async function establishNewSession() {
    const token = getToken();

    if (!token || !chatPartner) return;

    try {
      const myKeys = getKeyPair();

      if (!myKeys) {
        setCryptoError(
          "Не удалось загрузить ключи"
        );

        return;
      }

      const pkRes = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/users/${chatPartner.id}/public-key`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!pkRes.ok) {
        setCryptoError(
          "Собеседник ещё не активировал шифрование. " +
            "Он должен хотя бы раз открыть любой секретный чат, " +
            "чтобы сгенерировать ключи на своём устройстве."
        );

        return;
      }

      const pkData = await pkRes.json();

      setPartnerFingerprint(
        pkData.fingerprint
      );

      const sk = generateSessionKey();

      const forMe =
        encryptSessionKeyForUser(
          sk,
          myKeys.publicKeyBase64
        );

      const forOther =
        encryptSessionKeyForUser(
          sk,
          pkData.public_key
        );

      for (const [uid, enc] of [
        [currentUser.id, forMe],
        [chatPartner.id, forOther],
      ] as [number, string][]) {
        const fd = new FormData();

        fd.append(
          "recipient_id",
          String(uid)
        );

        fd.append(
          "encrypted_session_key",
          enc
        );

        await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/session-key`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: fd,
          }
        );
      }

      storeSessionKey(
        Number(chatId),
        sk
      );

      setCryptoError(null);
    } catch (err) {
      console.error(
        "establishNewSession failed:",
        err
      );

      setCryptoError(
        "Не удалось установить защищённую сессию"
      );
    }
  }

  /*
   * ============================================================
   * SEND MESSAGE
   * ============================================================
   */

  async function sendMessage() {
    if (sendingRef.current) return;

    const token = getToken();

    if (!token) return;

    if (!text.trim() && files.length === 0) {
      return;
    }

    sendingRef.current = true;

    try {
      const messagesToSend: {
        text: string;
        file: File | null;
      }[] = [];

      if (files.length > 0) {
        files.forEach((f, i) => {
          messagesToSend.push({
            text: i === 0 ? text.trim() : "",
            file: f,
          });
        });
      } else {
        messagesToSend.push({
          text: text.trim(),
          file: null,
        });
      }

      /*
       * Optimistic message только для обычного текста.
       */
      if (!isSecret && text.trim()) {
        const tempMsg = {
          id: Date.now(),
          sender_id: currentUser?.id,
          sender_name:
            currentUser?.display_name,
          sender_avatar:
            currentUser?.avatar_url,
          text: text.trim(),
          media_url: null,
          media_type: null,
          read: false,
          created_at:
            new Date().toISOString(),
        };

        setMessages((prev) => [
          ...prev,
          tempMsg,
        ]);
      }

      for (const msg of messagesToSend) {
        const form = new FormData();

        if (isSecret && msg.text) {
          let sk = loadSessionKey(
            Number(chatId)
          );

          if (!sk) {
            await establishNewSession();

            sk = loadSessionKey(
              Number(chatId)
            );

            if (!sk) {
              throw new Error(
                "Нет session key"
              );
            }
          }

          form.append(
            "ciphertext",
            encryptMessage(
              msg.text,
              sk
            )
          );

          form.append("text", "");
        } else {
          if (msg.text) {
            form.append(
              "text",
              msg.text
            );
          }
        }

        if (msg.file) {
          form.append(
            "file",
            msg.file
          );
        }

        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: form,
          }
        );

        if (res.status === 403) {
          alert("Нет доступа к чату");
          router.push("/messages");
          return;
        }

        if (!res.ok) {
          throw new Error(
            "Message send failed"
          );
        }
      }

      setText("");
      setFiles([]);

      if (isSecret) {
        await loadMessages();
      }
    } catch (err) {
      console.error(
        "Failed to send:",
        err
      );

      alert(
        "Не удалось отправить сообщение"
      );
    } finally {
      sendingRef.current = false;
    }
  }

  /*
   * ============================================================
   * DELETE / EDIT MESSAGE
   * ============================================================
   */

  async function deleteMessage(
    messageId: number
  ) {
    if (!confirm("Удалить сообщение?")) {
      return;
    }

    const token = getToken();

    if (!token) return;

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages/${messageId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (res.ok) {
        await loadMessages();
      }
    } catch (err) {
      console.error(
        "Failed to delete message:",
        err
      );

      alert("Ошибка сети");
    }
  }

  async function submitEdit() {
    if (!editingMessageId || !editText.trim()) {
      return;
    }

    if (isSecret) {
      alert(
        "Редактирование пока недоступно для секретных чатов"
      );

      cancelEdit();
      return;
    }

    const token = getToken();

    if (!token) return;

    try {
      const form = new FormData();

      form.append(
        "text",
        editText
      );

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages/${editingMessageId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: form,
        }
      );

      if (res.ok) {
        setEditingMessageId(null);
        setEditText("");

        await loadMessages();
      }
    } catch (err) {
      console.error(
        "Failed to edit message:",
        err
      );

      alert("Ошибка сети");
    }
  }

  function startEdit(msg: any) {
    if (isSecret) {
      alert(
        "Редактирование недоступно в секретных чатах"
      );

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

  /*
   * ============================================================
   * MEDIA
   * ============================================================
   */

  async function loadMedia() {
    const token = getToken();

    if (!token) return;

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/media`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (res.ok) {
        setMediaItems(await res.json());
      }
    } catch (err) {
      console.error(
        "Failed to load media",
        err
      );
    }
  }

  async function sendEncryptedMedia(
    file: File,
    mediaType: string
  ) {
    const token = getToken();

    if (!token) return;

    let sk = loadSessionKey(
      Number(chatId)
    );

    if (!sk) {
      await establishNewSession();

      sk = loadSessionKey(
        Number(chatId)
      );
    }

    if (!sk) {
      alert(
        "Не удалось установить защищённую сессию"
      );

      return;
    }

    const {
      encryptMediaFile,
    } = await import(
      "@/lib/mediaCrypto"
    );

    const sessionKey =
      loadSessionKey(
        Number(chatId)
      );

    if (!sessionKey) {
      alert("Нет ключа сессии");
      return;
    }

    const encryptedBlob =
      await encryptMediaFile(
        file,
        sessionKey
      );

    const form = new FormData();

    form.append(
      "file",
      encryptedBlob
    );

    form.append(
      "media_type",
      mediaType
    );

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages/encrypted-media`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: form,
      }
    );

    if (!res.ok) {
      alert(
        "Не удалось отправить шифрованное медиа"
      );
    }
  }

  /*
   * ============================================================
   * EFFECTS
   * ============================================================
   */

  useEffect(() => {
    const token = getToken();

    if (!token) {
      router.push("/login");
      return;
    }

    const controller =
      new AbortController();

    const signal =
      controller.signal;

    fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/me`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal,
      }
    )
      .then((r) => r.json())
      .then(setCurrentUser)
      .catch(() => {});

    loadChatInfo();
    loadMessages();
    loadPinned();

    fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/read`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal,
      }
    )
      .then(() => refresh())
      .catch(() => {});

    return () => {
      controller.abort();
    };
  }, [chatId]);

  useEffect(() => {
    if (isGroup) {
      setIsSecret(false);
      setCryptoError(null);
      return;
    }

    if (
      isSecret &&
      chatPartner &&
      currentUser
    ) {
      initCryptoForSecretChat();
    }
  }, [
    isSecret,
    chatPartner,
    currentUser,
    isGroup,
  ]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => {
    if (!isSecret) return;

    if (
      skRefreshedForRef.current ===
      chatId
    ) {
      return;
    }

    const sk = loadSessionKey(
      Number(chatId)
    );

    if (!sk) return;

    const hasFail =
      messages.some(
        (m) =>
          m.ciphertext &&
          decryptMessage(
            m.ciphertext,
            sk
          ) ===
            "[Ошибка расшифровки]"
      );

    if (!hasFail) return;

    skRefreshedForRef.current =
      chatId;

    const token = getToken();

    if (!token) return;

    fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/session-key`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )
      .then(async (res) => {
        if (!res.ok) return;

        const d =
          await res.json();

        const keys =
          getKeyPair();

        if (!keys) return;

        const newSk =
          decryptSessionKey(
            d.encrypted_session_key
          );

        storeSessionKey(
          Number(chatId),
          newSk
        );

        setMessages((prev) => [
          ...prev,
        ]);
      })
      .catch((e) =>
        console.error(
          "SK refresh failed:",
          e
        )
      );
  }, [
    messages,
    isSecret,
    chatId,
  ]);

  /*
   * ============================================================
   * WEBSOCKET
   * ============================================================
   */

  useWebSocket(
    "new_message",
    (data: any) => {
      if (
        String(data.chat_id) !==
        String(chatId)
      ) {
        return;
      }

      if (
        data.sender_id ===
        currentUser?.id
      ) {
        return;
      }

      if (
        isSecret &&
        !loadSessionKey(
          Number(chatId)
        )
      ) {
        const token = getToken();

        if (token) {
          fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/session-key`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          )
            .then(async (res) => {
              if (res.ok) {
                const d =
                  await res.json();

                const keys =
                  getKeyPair();

                if (keys) {
                  try {
                    const sk =
                      decryptSessionKey(
                        d.encrypted_session_key
                      );

                    storeSessionKey(
                      Number(chatId),
                      sk
                    );

                    loadMessages();
                  } catch (e) {
                    console.error(
                      "Failed to restore session key:",
                      e
                    );
                  }
                }
              }
            })
            .catch((e) =>
              console.error(
                "Failed to restore session key:",
                e
              )
            );
        }
      }

      setMessages((prev) => {
        if (
          prev.some(
            (m) =>
              m.id === data.id
          )
        ) {
          return prev;
        }

        return [
          ...prev,
          data,
        ];
      });

      const token = getToken();

      if (token) {
        fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/read`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        )
          .then(() => refresh())
          .catch(() => {});
      }

      if (isGroup) {
        loadChatInfo();
      }
    }
  );

  useWebSocket(
    "chat_deleted",
    (data: any) => {
      if (
        String(data.chat_id) ===
        String(chatId)
      ) {
        alert(
          "Этот чат был удалён"
        );

        router.push("/messages");
      }
    }
  );

  useWebSocket(
    "group_member_added",
    (data: any) => {
      if (
        String(data.chat_id) ===
        String(chatId)
      ) {
        loadChatInfo();
      }
    }
  );

  useWebSocket(
    "group_member_removed",
    (data: any) => {
      if (
        String(data.chat_id) ===
        String(chatId)
      ) {
        loadChatInfo();
      }
    }
  );

  useWebSocket(
    "group_info_updated",
    (data: any) => {
      if (
        String(data.chat_id) ===
        String(chatId)
      ) {
        loadChatInfo();
      }
    }
  );

  useWebSocket(
    "message_pinned",
    (data: any) => {
      if (
        String(data.chat_id) ===
        String(chatId)
      ) {
        loadPinned();
        loadMessages();
      }
    }
  );

  /*
   * ============================================================
   * QR SCANNER
   * ============================================================
   */

  useEffect(() => {
    if (!showScanner) return;

    let cancelled = false;

    const t = setTimeout(
      async () => {
        try {
          const scanner =
            new Html5Qrcode(
              "qr-scanner-region"
            );

          scannerRef.current =
            scanner;

          await scanner.start(
            {
              facingMode:
                "environment",
            },
            {
              fps: 10,
              qrbox: {
                width: 220,
                height: 220,
              },
            },
            (decoded: string) => {
              if (cancelled) return;

              if (
                importKeyPairPayload(
                  decoded
                )
              ) {
                cancelled = true;

                setShowScanner(false);

                alert(
                  "Ключ импортирован! Перезагружаем страницу..."
                );

                window.location.reload();
              }
            },
            () => {}
          );
        } catch (e) {
          console.error(
            "Scanner error:",
            e
          );

          alert(
            "Не удалось получить доступ к камере"
          );

          setShowScanner(false);
        }
      },
      150
    );

    return () => {
      cancelled = true;

      clearTimeout(t);

      if (scannerRef.current) {
        scannerRef.current
          .stop()
          .catch(() => {});

        scannerRef.current =
          null;
      }
    };
  }, [showScanner]);

  /*
   * При смене чата чистим таймер long press,
   * чтобы старый таймер не мог сработать.
   */
  useEffect(() => {
    return () => {
      clearLongPressTimer();

      if (recordingTimerRef.current) {
        clearInterval(
          recordingTimerRef.current
        );

        recordingTimerRef.current =
          null;
      }
    };
  }, [chatId]);

  /*
   * ============================================================
   * FILES / STICKERS
   * ============================================================
   */

  function onFiles(
    newFiles: FileList | null
  ) {
    if (!newFiles) return;

    setFiles((prev) =>
      [
        ...prev,
        ...Array.from(newFiles),
      ].slice(0, 5)
    );
  }

  function insertSticker(
    emoji: string
  ) {
    setText(
      (prev) => prev + emoji
    );
  }

  /*
   * ============================================================
   * FILTER
   * ============================================================
   */

  const filteredMessages =
    messages.filter((msg) => {
      if (!searchQuery.trim()) {
        return true;
      }

      const q =
        searchQuery.toLowerCase();

      const displayText =
        decryptDisplayText(
          msg
        ).toLowerCase();

      return displayText.includes(q);
    });

  const partnerGlow =
    getGlowColor(chatPartner);

  /*
   * ============================================================
   * HEADER
   * ============================================================
   */

  const ChatHeader = () => (
    <div
      className={`p-3 sm:p-4 md:p-4 border-b border-white/10 backdrop-blur-md sticky top-0 z-10 ${
        isSecret
          ? "bg-emerald-950/40"
          : isGroup
          ? "bg-purple-950/20"
          : "bg-[#171717]/80"
      }`}
    >
      <div className="flex items-center gap-2 sm:gap-3 md:gap-3">
        <button
          onClick={() =>
            router.push("/messages")
          }
          className="text-white/60 hover:text-white shrink-0 p-2 sm:p-1 -ml-1 sm:ml-0 active:scale-95 transition-transform"
          title="Назад"
        >
          <span className="text-lg sm:text-base">
            ←
          </span>

          <span className="hidden sm:inline ml-1 text-sm">
            Назад
          </span>
        </button>

        {isGroup ? (
          <button
            onClick={() =>
              setShowGroupMembers(true)
            }
            className="flex items-center gap-3 sm:gap-3 group flex-1 min-w-0 text-left active:opacity-70 transition-opacity"
          >
            <div className="shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-full overflow-hidden bg-gradient-to-br from-purple-500 via-violet-600 to-indigo-600 flex items-center justify-center ring-2 ring-white/10">
              {chatInfo?.avatar_url ? (
                <img
                  src={mediaUrl(
                    chatInfo.avatar_url
                  )}
                  alt={
                    chatInfo.name ||
                    "Группа"
                  }
                  className="w-full h-full object-cover"
                />
              ) : (
                <Users
                  size={22}
                  className="text-white"
                />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="font-bold truncate text-[15px] sm:text-base md:text-lg text-white group-hover:text-[#8b5cf6] transition-colors leading-tight">
                {chatInfo.name}
              </p>

              <p className="text-[11px] sm:text-xs text-white/50 mt-0.5">
                {chatInfo.members_count}{" "}
                участник
                {chatInfo.members_count ===
                1
                  ? ""
                  : chatInfo.members_count <
                    5
                  ? "а"
                  : "ов"}{" "}
                · подробнее
              </p>
            </div>
          </button>
        ) : chatPartner ? (
          <Link
            href={`/user/${chatPartner.id}`}
            className="flex items-center gap-3 sm:gap-3 group flex-1 min-w-0 active:opacity-70 transition-opacity"
          >
            <div
              className="shrink-0 relative"
              style={
                partnerGlow
                  ? {
                      filter: `drop-shadow(0 0 6px ${partnerGlow})`,
                    }
                  : undefined
              }
            >
              <Avatar
                src={
                  chatPartner.avatar_url
                }
                name={
                  chatPartner.display_name
                }
                id={chatPartner.id}
                size={44}
                online={isOnline(
                  chatPartner.last_seen
                )}
              />

              {isSecret && (
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 sm:w-4 sm:h-4 rounded-full bg-emerald-500 border-2 border-[#171717] flex items-center justify-center">
                  <Lock
                    size={8}
                    className="text-white"
                  />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p
                  className={`font-bold truncate text-[15px] sm:text-base md:text-lg transition-all group-hover:opacity-80 leading-tight ${
                    glowStyle(
                      chatPartner
                    )
                      ? ""
                      : "text-white"
                  }`}
                  style={glowStyle(
                    chatPartner
                  )}
                >
                  {
                    chatPartner.display_name
                  }
                </p>

                {isSecret && (
                  <span className="inline-flex items-center gap-1 px-1.5 sm:px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[9px] sm:text-[10px] font-black uppercase tracking-widest border border-emerald-500/30 shrink-0">
                    <Lock size={8} />

                    <span className="hidden sm:inline">
                      E2EE
                    </span>
                  </span>
                )}
              </div>

              <p
                className={`text-[11px] sm:text-xs mt-0.5 ${
                  isOnline(
                    chatPartner.last_seen
                  )
                    ? "text-green-400"
                    : "text-white/50"
                }`}
              >
                {isOnline(
                  chatPartner.last_seen
                )
                  ? "● в сети"
                  : lastSeenText(
                      chatPartner.last_seen
                    )}
              </p>
            </div>
          </Link>
        ) : (
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white text-[15px] sm:text-base">
              Загрузка...
            </p>
          </div>
        )}

        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <button
            onClick={() =>
              setShowSearch(
                !showSearch
              )
            }
            className={`p-2.5 sm:p-2 rounded-lg transition-colors active:scale-95 ${
              showSearch
                ? "text-[#8b5cf6] bg-[#8b5cf6]/10"
                : "text-white/60 hover:text-[#8b5cf6]"
            }`}
            title="Поиск"
          >
            <Search
              size={19}
              className="sm:w-5 sm:h-5"
            />
          </button>

          {isSecret &&
            !isGroup && (
              <button
                onClick={() =>
                  setShowVerify(true)
                }
                className="p-2.5 sm:p-2 text-emerald-400 hover:text-emerald-300 transition-colors active:scale-95"
                title="Проверить шифрование"
              >
                <ShieldCheck
                  size={19}
                  className="sm:w-5 sm:h-5"
                />
              </button>
            )}

          <button
            onClick={() => {
              loadMedia();
              setShowMediaGallery(
                true
              );
            }}
            className="p-2.5 sm:p-2 text-white/60 hover:text-[#8b5cf6] transition-colors active:scale-95"
            title="Медиа"
          >
            <ImageIcon
              size={19}
              className="sm:w-5 sm:h-5"
            />
          </button>

          {isGroup &&
            (chatInfo?.my_role ===
              "owner" ||
              chatInfo?.my_role ===
                "admin") && (
              <button
                onClick={() =>
                  setShowGroupSettings(
                    true
                  )
                }
                className="p-2.5 sm:p-2 text-white/60 hover:text-white transition-colors active:scale-95"
                title="Настройки группы"
              >
                <Settings
                  size={19}
                  className="sm:w-5 sm:h-5"
                />
              </button>
            )}

          <div className="relative">
            <button
              onClick={() =>
                setShowChatMenu(
                  (prev) => !prev
                )
              }
              className="p-2.5 sm:p-2 text-white/60 hover:text-white transition-colors active:scale-95"
              title="Ещё"
            >
              <MoreVertical
                size={19}
                className="sm:w-5 sm:h-5"
              />
            </button>

            {showChatMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() =>
                    setShowChatMenu(
                      false
                    )
                  }
                />

                <div className="absolute right-0 top-full mt-2 bg-[#1f1f23] border border-white/15 rounded-xl shadow-2xl overflow-hidden min-w-[160px] sm:min-w-[180px] z-50">
                  {isGroup && (
                    <button
                      onClick={() => {
                        setShowGroupMembers(
                          true
                        );
                        setShowChatMenu(
                          false
                        );
                      }}
                      className="w-full px-3 sm:px-3 py-3 sm:py-2.5 text-left text-sm sm:text-sm text-white hover:bg-white/10 flex items-center gap-2 transition-colors"
                    >
                      <Users size={15} />
                      Участники
                    </button>
                  )}

                  <button
                    onClick={() => {
                      deleteChat();
                      setShowChatMenu(
                        false
                      );
                    }}
                    className="w-full px-3 sm:px-3 py-3 sm:py-2.5 text-left text-sm sm:text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2 transition-colors"
                  >
                    <Trash2 size={15} />

                    {isGroup
                      ? chatInfo?.my_role ===
                        "owner"
                        ? "Удалить группу"
                        : "Покинуть группу"
                      : "Удалить чат"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      /*
       * Закреплённые сообщения
       */
      {pinnedMessages.length >
        0 && (
        <div className="px-0 py-2 sm:py-2 bg-[#8b5cf6]/5 border-b border-[#8b5cf6]/10 mt-2.5 sm:mt-3 pt-2.5 sm:pt-3 border-t border-white/10">
          <button
            onClick={() =>
              setShowPinnedList(
                !showPinnedList
              )
            }
            className="flex items-center gap-2 text-xs sm:text-xs text-[#8b5cf6] font-bold hover:text-[#a78bfa] transition-colors"
          >
            <Pin
              size={13}
              className="text-white/60 shrink-0"
            />

            {pinnedMessages.length}{" "}
            закреплённ
            {pinnedMessages.length ===
            1
              ? "ое"
              : "ых"}

            <span className="text-white/40">
              {showPinnedList
                ? "▲"
                : "▼"}
            </span>
          </button>

          {showPinnedList && (
            <div className="mt-2 space-y-1.5 max-h-32 sm:max-h-40 overflow-y-auto">
              {pinnedMessages.map(
                (msg) => (
                  <div
                    key={msg.id}
                    className="flex items-center gap-2 text-[11px] sm:text-xs text-white/70 bg-white/5 rounded-lg px-3 py-2"
                  >
                    <Pin
                      size={11}
                      className="text-[#8b5cf6] shrink-0"
                    />

                    <span className="truncate flex-1">
                      <span className="text-white/90 font-semibold">
                        {
                          msg.sender_name
                        }
                        :
                      </span>{" "}
                      {msg.text ||
                        (msg.media_type ===
                        "image"
                          ? "📷 Изображение"
                          : msg.media_type ===
                            "audio"
                          ? "🎙️ Голосовое"
                          : msg.media_type ===
                            "video"
                          ? "🎬 Видео"
                          : "Медиа")}
                    </span>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      )}

      {showSearch && (
        <div className="mt-2.5 sm:mt-3 pt-2.5 sm:pt-3 border-t border-white/10">
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
            />

            <input
              value={searchQuery}
              onChange={(e) =>
                setSearchQuery(
                  e.target.value
                )
              }
              placeholder={
                isSecret
                  ? "Поиск в расшифрованных..."
                  : "Поиск в сообщениях..."
              }
              className="w-full pl-10 pr-9 py-2.5 sm:py-2 rounded-lg border border-white/10 bg-white/5 text-white placeholder-white/40 focus:outline-none focus:border-[#8b5cf6] text-sm sm:text-sm"
              autoFocus
            />

            {searchQuery && (
              <button
                onClick={() =>
                  setSearchQuery("")
                }
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white p-1"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {searchQuery && (
            <p className="text-[11px] sm:text-xs text-white/40 mt-1.5">
              {
                filteredMessages.length
              }{" "}
              из {messages.length}{" "}
              сообщений
            </p>
          )}
        </div>
      )}
    </div>
  );

  /*
   * ============================================================
   * RENDER
   * ============================================================
   */

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />

      <div className="w-px shrink-0 bg-white/10 my-3 hidden md:block" />

      <main className="flex-1 flex flex-col border-x border-white/10">
        {isSelectMode ? (
          <div className="p-3 sm:p-3 md:p-4 border-b border-white/10 bg-[#171717]/95 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={
                  toggleSelectMode
                }
                className="text-white/60 hover:text-white transition-colors p-2 -ml-1 active:scale-95"
              >
                <X size={20} />
              </button>

              <span className="font-bold text-white text-sm md:text-base">
                {
                  selectedMessages.size
                }{" "}
                выбрано
              </span>
            </div>

            <button
              onClick={
                deleteSelectedMessages
              }
              disabled={
                selectedMessages.size ===
                0
              }
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/20 text-red-400 text-sm font-bold hover:bg-red-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors active:scale-95"
            >
              <Trash2 size={15} />

              <span className="hidden xs:inline">
                Удалить
              </span>
            </button>
          </div>
        ) : (
          <ChatHeader />
        )}

        {loadingMessages ? (
          <ChatWindowSkeleton />
        ) : (
          <>
            {isSecret &&
              messages.length ===
                0 &&
              !cryptoError && (
                <div className="p-3 sm:p-4 bg-emerald-500/5 border-b border-emerald-500/20">
                  <div className="flex items-start gap-2 max-w-2xl mx-auto text-center">
                    <Lock
                      size={15}
                      className="text-emerald-400 mt-0.5 shrink-0"
                    />

                    <div className="text-xs sm:text-sm text-emerald-100/80">
                      <p className="font-bold text-emerald-300 mb-0.5 sm:mb-1">
                        Секретный чат
                      </p>

                      <p className="text-[11px] sm:text-xs">
                        Сообщения зашифрованы
                        end-to-end.
                        Сервер не может их
                        прочитать. Ключи
                        хранятся только на
                        устройствах
                        участников.
                      </p>
                    </div>
                  </div>
                </div>
              )}

            {cryptoError && (
              <div className="p-3 sm:p-4 bg-red-500/10 border-b border-red-500/30">
                <div className="flex items-start gap-2 max-w-2xl mx-auto">
                  <AlertTriangle
                    size={15}
                    className="text-red-400 mt-0.5 shrink-0"
                  />

                  <div className="flex-1">
                    <p className="text-xs sm:text-sm text-red-300 font-bold">
                      {cryptoError}
                    </p>

                    <button
                      onClick={
                        establishNewSession
                      }
                      className="mt-2 text-[11px] sm:text-xs px-3 py-1 rounded bg-red-500/20 text-red-200 hover:bg-red-500/30 border border-red-500/30"
                    >
                      Попробовать снова
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-3 sm:p-3 md:p-4 space-y-2.5 sm:space-y-3">
              {currentUser &&
                filteredMessages.map(
                  (msg) => {
                    const isMine =
                      msg.sender_id ===
                      currentUser.id;

                    const isEditing =
                      editingMessageId ===
                      msg.id;

                    const displayText =
                      decryptDisplayText(
                        msg
                      );

                    const isSelected =
                      selectedMessages.has(
                        msg.id
                      );

                    const senderGlow =
                      getGlowColor(msg);

                    const isPinned =
                      !!msg.pinned;

                    const bubbleRadius =
                      isMine
                        ? "rounded-tl-2xl rounded-tr-2xl rounded-bl-2xl rounded-br-[4px]"
                        : "rounded-tl-2xl rounded-tr-2xl rounded-br-2xl rounded-bl-[4px]";

                    return (
                      <div
                        key={msg.id}
                        className={`flex gap-2 sm:gap-2 ${
                          isMine
                            ? "justify-end"
                            : "justify-start"
                        } ${
                          isSelectMode
                            ? "cursor-pointer select-none"
                            : ""
                        }`}
                        onClick={() => {
                          if (
                            isSelectMode
                          ) {
                            toggleMessageSelection(
                              msg.id
                            );
                          }
                        }}
                      >
                        {isSelectMode && (
                          <div
                            className={`shrink-0 w-5 h-5 sm:w-5 sm:h-5 rounded-md border-2 flex items-center justify-center mt-2 transition-colors ${
                              isSelected
                                ? "bg-[#8b5cf6] border-[#8b5cf6]"
                                : "border-white/30"
                            }`}
                          >
                            {isSelected && (
                              <Check
                                size={12}
                                className="text-white"
                              />
                            )}
                          </div>
                        )}

                        {!isMine &&
                          !isSelectMode &&
                          (isGroup ||
                            chatPartner) && (
                            <Link
                              href={`/user/${msg.sender_id}`}
                              className="shrink-0"
                            >
                              <div
                                style={
                                  senderGlow
                                    ? {
                                        filter: `drop-shadow(0 0 6px ${senderGlow})`,
                                      }
                                    : undefined
                                }
                              >
                                <Avatar
                                  src={
                                    msg.sender_avatar
                                  }
                                  name={
                                    msg.sender_name
                                  }
                                  id={
                                    msg.sender_id
                                  }
                                  size={32}
                                />
                              </div>
                            </Link>
                          )}

                        {!isMine &&
                          isSelectMode &&
                          (isGroup ||
                            chatPartner) && (
                            <div
                              className="shrink-0"
                              style={
                                senderGlow
                                  ? {
                                      filter: `drop-shadow(0 0 6px ${senderGlow})`,
                                    }
                                  : undefined
                              }
                            >
                              <Avatar
                                src={
                                  msg.sender_avatar
                                }
                                name={
                                  msg.sender_name
                                }
                                id={
                                  msg.sender_id
                                }
                                size={32}
                              />
                            </div>
                          )}

                        <div
                          className={`max-w-[85%] sm:max-w-[75%] md:max-w-[70%] flex flex-col ${
                            isMine
                              ? "items-end"
                              : "items-start"
                          }`}
                        >
                          {isGroup &&
                            !isMine && (
                              <p
                                className="text-[11px] sm:text-xs font-bold mb-1 px-1"
                                style={
                                  senderGlow
                                    ? {
                                        color:
                                          senderGlow,
                                      }
                                    : {
                                        color:
                                          "#a78bfa",
                                      }
                                }
                              >
                                {
                                  msg.sender_name
                                }
                              </p>
                            )}

                          <div
                            className={`${bubbleRadius} px-3 sm:px-3.5 md:px-4 py-2 sm:py-2 transition-all ${
                              isSelected
                                ? "ring-2 ring-[#8b5cf6] ring-offset-2 ring-offset-[#171717]"
                                : ""
                            } ${
                              isMine
                                ? isSecret
                                  ? "bg-emerald-600 text-white"
                                  : "bg-[#8b5cf6] text-white"
                                : "bg-white/10 text-white border border-white/15"
                            }`}
                          >
                            {msg.media_url &&
                              (msg.media_type ===
                                "image" ||
                                msg.media_type ===
                                  "gif") && (
                                <img
                                  src={mediaUrl(
                                    msg.media_url
                                  )}
                                  alt=""
                                  className={getMediaClasses(
                                    msg.media_type
                                  )}
                                  onClick={(e) => {
                                    if (
                                      !isSelectMode
                                    ) {
                                      e.stopPropagation();
                                      setSelectedMedia(
                                        msg
                                      );
                                    }
                                  }}
                                />
                              )}

                            {msg.media_url &&
                              msg.media_type ===
                                "video" && (
                                <VideoPlayer
                                  src={msg.media_url}
                                  className={getMediaClasses(
                                    "video"
                                  )}
                                />
                              )}

                            {msg.media_url &&
                              msg.media_type ===
                                "audio" && (
                                <div className="mb-1.5 sm:mb-2">
                                  <AudioPlayer
                                    src={mediaUrl(
                                      msg.media_url
                                    )}
                                  />
                                </div>
                              )}

                            {msg.media_url &&
                              msg.media_type ===
                                "video_note" && (
                                <VideoNotePlayer
                                  src={mediaUrl(
                                    msg.media_url
                                  )}
                                />
                              )}

                            {msg.media_url &&
                              msg.is_encrypted_media && (
                                <EncryptedMediaPlayer
                                  mediaUrl={
                                    msg.media_url
                                  }
                                  mediaType={
                                    msg.media_type
                                  }
                                  chatId={Number(
                                    chatId
                                  )}
                                />
                              )}

                            {isEditing ? (
                              <div className="flex gap-2 items-start">
                                <textarea
                                  value={
                                    editText
                                  }
                                  onChange={(e) =>
                                    setEditText(
                                      e.target.value
                                    )
                                  }
                                  onKeyDown={(
                                    e
                                  ) => {
                                    if (
                                      e.key ===
                                        "Enter" &&
                                      !e.shiftKey
                                    ) {
                                      e.preventDefault();
                                      submitEdit();
                                    }

                                    if (
                                      e.key ===
                                      "Escape"
                                    ) {
                                      cancelEdit();
                                    }
                                  }}
                                  className="flex-1 bg-white/10 border border-white/20 rounded-lg px-2.5 sm:px-3 py-1.5 text-sm sm:text-sm text-white focus:outline-none focus:border-[#8b5cf6] resize-none"
                                  rows={2}
                                  autoFocus
                                />

                                <div className="flex flex-col gap-1">
                                  <button
                                    onClick={
                                      submitEdit
                                    }
                                    className="text-green-400 text-xs font-bold"
                                  >
                                    ✓
                                  </button>

                                  <button
                                    onClick={
                                      cancelEdit
                                    }
                                    className="text-red-400 text-xs font-bold"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                {displayText && (
                                  <p className="whitespace-pre-wrap break-words text-[15px] sm:text-sm md:text-base leading-snug">
                                    {
                                      displayText
                                    }
                                  </p>
                                )}
                              </>
                            )}
                          </div>

                          {!isEditing &&
                            !isSelectMode && (
                              <div
                                className={`flex items-center gap-1.5 sm:gap-2 mt-1 px-1 ${
                                  isMine
                                    ? "flex-row-reverse"
                                    : "flex-row"
                                }`}
                              >
                                <p
                                  className={`text-[10px] sm:text-[11px] flex items-center gap-1 ${
                                    isMine
                                      ? "text-white/60"
                                      : "text-white/40"
                                  }`}
                                >
                                  {isPinned && (
                                    <Pin
                                      size={10}
                                      className="text-[#8b5cf6]"
                                    />
                                  )}

                                  {new Date(
                                    msg.created_at
                                  ).toLocaleTimeString(
                                    "ru-RU",
                                    {
                                      hour: "2-digit",
                                      minute:
                                        "2-digit",
                                    }
                                  )}

                                  {isMine &&
                                    (msg.read ? (
                                      <CheckCheck
                                        size={
                                          12
                                        }
                                        className="text-sky-300"
                                      />
                                    ) : (
                                      <Check
                                        size={
                                          12
                                        }
                                        className="text-white/50"
                                      />
                                    ))}
                                </p>

                                {!isSecret && (
                                  <div className="relative">
                                    <button
                                      onClick={() =>
                                        setActiveMessageMenu(
                                          activeMessageMenu ===
                                            msg.id
                                            ? null
                                            : msg.id
                                        )
                                      }
                                      className="p-1 text-white/40 hover:text-white active:scale-90 transition-transform"
                                    >
                                      <MoreVertical
                                        size={
                                          13
                                        }
                                      />
                                    </button>

                                    {activeMessageMenu ===
                                      msg.id && (
                                      <>
                                        <div
                                          className="fixed inset-0 z-40"
                                          onClick={() =>
                                            setActiveMessageMenu(
                                              null
                                            )
                                          }
                                        />

                                        <div
                                          className={`absolute ${
                                            isMine
                                              ? "right-0"
                                              : "left-0"
                                          } top-full mt-1 bg-[#1f1f23] border border-white/15 rounded-xl shadow-2xl overflow-hidden min-w-[150px] sm:min-w-[160px] z-50`}
                                        >
                                          <button
                                            onClick={() => {
                                              setIsSelectMode(
                                                true
                                              );

                                              toggleMessageSelection(
                                                msg.id
                                              );

                                              setActiveMessageMenu(
                                                null
                                              );
                                            }}
                                            className="w-full px-3 sm:px-3 py-2.5 sm:py-2 text-left text-sm sm:text-sm text-white hover:bg-white/10 flex items-center gap-2 transition-colors"
                                          >
                                            <CheckSquare
                                              size={
                                                14
                                              }
                                            />
                                            Выбрать
                                          </button>

                                          {isMine &&
                                            msg.text && (
                                              <button
                                                onClick={() =>
                                                  startEdit(
                                                    msg
                                                  )
                                                }
                                                className="w-full px-3 sm:px-3 py-2.5 sm:py-2 text-left text-sm sm:text-sm text-white hover:bg-white/10 flex items-center gap-2 transition-colors"
                                              >
                                                <Edit2
                                                  size={
                                                    14
                                                  }
                                                />
                                                Редактировать
                                              </button>
                                            )}

                                          {isMine && (
                                            <button
                                              onClick={() => {
                                                deleteMessage(
                                                  msg.id
                                                );

                                                setActiveMessageMenu(
                                                  null
                                                );
                                              }}
                                              className="w-full px-3 sm:px-3 py-2.5 sm:py-2 text-left text-sm sm:text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2 transition-colors"
                                            >
                                              <Trash2
                                                size={
                                                  14
                                                }
                                              />
                                              Удалить
                                            </button>
                                          )}

                                          {isGroup &&
                                            !msg.pinned && (
                                              <button
                                                onClick={async () => {
                                                  try {
                                                    await pinMessage(
                                                      Number(
                                                        chatId
                                                      ),
                                                      msg.id
                                                    );

                                                    await loadPinned();
                                                    await loadMessages();
                                                  } catch (
                                                    e: any
                                                  ) {
                                                    alert(
                                                      e?.message ||
                                                        "Не удалось закрепить сообщение"
                                                    );
                                                  }

                                                  setActiveMessageMenu(
                                                    null
                                                  );
                                                }}
                                                className="w-full px-3 sm:px-3 py-2.5 sm:py-2 text-left text-sm sm:text-sm text-white hover:bg-white/10 flex items-center gap-2 transition-colors"
                                              >
                                                <Pin
                                                  size={
                                                    14
                                                  }
                                                />
                                                Закрепить
                                              </button>
                                            )}

                                          {isGroup &&
                                            msg.pinned && (
                                              <button
                                                onClick={async () => {
                                                  try {
                                                    await unpinMessage(
                                                      Number(
                                                        chatId
                                                      ),
                                                      msg.id
                                                    );

                                                    await loadPinned();
                                                    await loadMessages();
                                                  } catch (
                                                    e: any
                                                  ) {
                                                    alert(
                                                      e?.message ||
                                                        "Не удалось открепить сообщение"
                                                    );
                                                  }

                                                  setActiveMessageMenu(
                                                    null
                                                  );
                                                }}
                                                className="w-full px-3 sm:px-3 py-2.5 sm:py-2 text-left text-sm sm:text-sm text-white hover:bg-white/10 flex items-center gap-2 transition-colors"
                                              >
                                                <PinOff
                                                  size={
                                                    14
                                                  }
                                                />
                                                Открепить
                                              </button>
                                            )}
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
                  }
                )}

              <div
                ref={messagesEndRef}
              />
            </div>

            /*
             * ====================================================
             * ВЛОЖЕНИЯ
             * ====================================================
             */
            {files.length > 0 && (
              <div className="px-3 sm:px-3 py-2.5 border-t border-white/10 bg-white/5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] sm:text-xs font-bold text-white/70">
                    Вложения (
                    {files.length}/5)
                  </span>

                  <button
                    onClick={() =>
                      setFiles([])
                    }
                    className="text-[11px] sm:text-xs text-red-400 px-2 py-1"
                  >
                    Очистить
                  </button>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1 -mx-2 sm:-mx-3 px-2 sm:px-3">
                  {files.map(
                    (f, i) => (
                      <div
                        key={i}
                        className="relative group border border-white/15 rounded-lg overflow-hidden bg-white/5 shrink-0"
                      >
                        {f.type.startsWith(
                          "image/"
                        ) ? (
                          <img
                            src={URL.createObjectURL(
                              f
                            )}
                            alt=""
                            className="w-16 h-16 sm:w-16 sm:h-16 md:w-20 md:h-20 object-cover"
                          />
                        ) : (
                          <div className="w-16 h-16 sm:w-16 sm:h-16 md:w-20 md:h-20 flex flex-col items-center justify-center gap-0.5 p-1">
                            <FileText
                              size={16}
                              className="text-white/60"
                            />

                            <span className="text-[9px] sm:text-[9px] text-white/60 truncate w-full px-1 text-center">
                              {f.name}
                            </span>

                            <span className="text-[8px] sm:text-[8px] text-white/40">
                              {formatSize(
                                f.size
                              )}
                            </span>
                          </div>
                        )}

                        <button
                          onClick={() =>
                            setFiles(
                              files.filter(
                                (_, j) =>
                                  j !== i
                              )
                            )
                          }
                          className="absolute top-1 right-1 bg-red-500/90 text-white rounded-full p-1 active:scale-90"
                        >
                          <X
                            size={10}
                          />
                        </button>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            /*
             * ====================================================
             * ЗАПИСЬ ГОЛОСОВОГО
             * ====================================================
             */
            {isRecording && (
              <div className="px-3 sm:px-3 py-3 border-t border-white/10 bg-red-500/10">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />

                    <span className="text-sm font-bold text-red-400 truncate">
                      Запись:{" "}
                      {formatRecordingTime(
                        recordingTime
                      )}
                    </span>
                  </div>

                  <button
                    onClick={
                      stopRecording
                    }
                    className="flex items-center gap-1.5 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors shrink-0 active:scale-95"
                  >
                    <Square
                      size={12}
                      fill="currentColor"
                    />

                    <span className="text-sm font-bold">
                      Стоп
                    </span>
                  </button>
                </div>
              </div>
            )}

            /*
             * ====================================================
             * INPUT
             * ====================================================
             */
            {!isSelectMode &&
              !isRecording && (
                <div className="p-3 sm:p-3 md:p-4 border-t border-white/10 bg-[#171717]/80 backdrop-blur-md">
                  <div className="flex items-end gap-2 sm:gap-2">
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*,image/gif,video/*"
                      multiple
                      className="hidden"
                      onChange={(e) =>
                        onFiles(
                          e.target.files
                        )
                      }
                    />

                    /*
                     * ==============================================
                     * STICKERS + ATTACHMENT
                     * ==============================================
                     */
                    <div className="flex gap-1 shrink-0">
                      <div className="relative">
                        <button
                          onClick={() =>
                            setShowStickers(
                              !showStickers
                            )
                          }
                          className={`p-2.5 sm:p-2 rounded-xl transition-colors min-w-[40px] sm:min-w-[36px] md:min-w-[40px] min-h-[40px] sm:min-h-[36px] md:min-h-[40px] flex items-center justify-center active:scale-95 ${
                            showStickers
                              ? "text-[#8b5cf6] bg-[#8b5cf6]/10"
                              : "text-white/60 hover:text-[#8b5cf6] hover:bg-white/5"
                          }`}
                        >
                          <Smile
                            size={19}
                            className="sm:w-[18px] sm:h-[18px]"
                          />
                        </button>

                        {showStickers && (
                          <>
                            <div
                              className="fixed inset-0 z-40"
                              onClick={() =>
                                setShowStickers(
                                  false
                                )
                              }
                            />

                            <div className="absolute bottom-full left-0 mb-2 w-64 sm:w-64 md:w-72 bg-[#1f1f23] border border-white/15 rounded-2xl shadow-2xl z-50">
                              <div className="p-3 border-b border-white/10 flex items-center justify-between">
                                <span className="text-sm font-bold text-white">
                                  Стикеры
                                </span>

                                <button
                                  onClick={() =>
                                    setShowStickers(
                                      false
                                    )
                                  }
                                  className="text-white/60 hover:text-white p-1"
                                >
                                  <X
                                    size={16}
                                  />
                                </button>
                              </div>

                              <div className="p-2 grid grid-cols-6 gap-1 max-h-64 sm:max-h-64 overflow-y-auto">
                                {STICKERS.map(
                                  (s) => (
                                    <button
                                      key={
                                        s.code
                                      }
                                      onClick={() => {
                                        insertSticker(
                                          s.emoji
                                        );

                                        setShowStickers(
                                          false
                                        );
                                      }}
                                      className="aspect-square flex items-center justify-center text-2xl hover:bg-white/10 rounded-lg active:scale-90 transition-transform"
                                    >
                                      {
                                        s.emoji
                                      }
                                    </button>
                                  )
                                )}
                              </div>
                            </div>
                          </>
                        )}
                      </div>

                      <button
                        onClick={() =>
                          fileRef.current?.click()
                        }
                        className={`p-2.5 sm:p-2 rounded-xl transition-colors relative min-w-[40px] sm:min-w-[36px] md:min-w-[40px] min-h-[40px] sm:min-h-[36px] md:min-h-[40px] flex items-center justify-center active:scale-95 ${
                          files.length > 0
                            ? "text-[#8b5cf6] bg-[#8b5cf6]/10"
                            : "text-white/60 hover:text-[#8b5cf6] hover:bg-white/5"
                        }`}
                      >
                        <Paperclip
                          size={19}
                          className="sm:w-[18px] sm:h-[18px]"
                        />

                        {files.length >
                          0 && (
                          <span className="absolute -top-1 -right-1 bg-[#8b5cf6] text-white text-[9px] sm:text-[10px] font-bold w-4 h-4 sm:w-4 sm:h-4 rounded-full flex items-center justify-center">
                            {
                              files.length
                            }
                          </span>
                        )}
                      </button>
                    </div>

                    /*
                     * ==============================================
                     * TEXTAREA
                     * ==============================================
                     */
                    <textarea
                      value={text}
                      onChange={(e) =>
                        setText(
                          e.target.value
                        )
                      }
                      onKeyDown={(e) => {
                        if (
                          e.key ===
                            "Enter" &&
                          !e.shiftKey
                        ) {
                          e.preventDefault();
                          sendMessage();
                        }
                      }}
                      placeholder={
                        isSecret
                          ? "Зашифрованное..."
                          : isGroup
                          ? "Сообщение группе..."
                          : "Сообщение..."
                      }
                      rows={1}
                      className={`flex-1 border rounded-xl px-3.5 sm:px-3 md:px-4 py-2.5 sm:py-2 bg-white/5 text-white text-[15px] sm:text-sm md:text-base placeholder-white/40 focus:outline-none resize-none max-h-28 sm:max-h-24 md:max-h-32 leading-snug ${
                        isSecret
                          ? "border-emerald-500/40 focus:border-emerald-500"
                          : "border-white/15 focus:border-[#8b5cf6]"
                      }`}
                    />

                    /*
                     * ==============================================
                     * ЕДИНАЯ КНОПКА SEND / RECORD
                     * ==============================================
                     */
                    <div className="relative shrink-0">
                      /*
                       * Меню появляется после удержания.
                       */
                      {showRecordMenu && (
                        <>
                          <div
                            className="fixed inset-0 z-40"
                            onClick={
                              closeRecordMenu
                            }
                          />

                          <div className="absolute bottom-full right-0 mb-2 w-56 sm:w-60 bg-[#1f1f23] border border-white/15 rounded-2xl shadow-2xl overflow-hidden z-50">
                            <button
                              type="button"
                              onClick={
                                handleVoiceRecord
                              }
                              className="w-full px-4 py-3.5 flex items-center gap-3 text-left text-sm font-bold text-white hover:bg-white/10 active:bg-white/15 transition-colors"
                            >
                              <span className="w-10 h-10 rounded-xl bg-red-500/15 text-red-400 flex items-center justify-center shrink-0">
                                <Mic
                                  size={19}
                                />
                              </span>

                              <span className="min-w-0">
                                <span className="block">
                                  Голосовое
                                </span>

                                <span className="block text-[10px] text-white/40 font-normal mt-0.5">
                                  Записать голосовое
                                  сообщение
                                </span>
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={
                                handleVideoRecord
                              }
                              className="w-full px-4 py-3.5 flex items-center gap-3 text-left text-sm font-bold text-white hover:bg-white/10 active:bg-white/15 transition-colors border-t border-white/5"
                            >
                              <span className="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0">
                                <Video
                                  size={19}
                                />
                              </span>

                              <span className="min-w-0">
                                <span className="block">
                                  Видеосообщение
                                </span>

                                <span className="block text-[10px] text-white/40 font-normal mt-0.5">
                                  Записать видео-кружок
                                </span>
                              </span>
                            </button>
                          </div>
                        </>
                      )}

                      <button
                        type="button"
                        disabled={
                          !!cryptoError ||
                          isRecording
                        }
                        onPointerDown={
                          handleSendPointerDown
                        }
                        onPointerUp={
                          handleSendPointerUp
                        }
                        onPointerCancel={
                          handleSendPointerCancel
                        }
                        onPointerLeave={
                          handleSendPointerCancel
                        }
                        onClick={
                          handleSendClick
                        }
                        className={`relative p-2.5 sm:p-2.5 md:p-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0 min-w-[44px] sm:min-w-[40px] md:min-w-[44px] min-h-[44px] sm:min-h-[40px] md:min-h-[44px] flex items-center justify-center active:scale-95 select-none touch-none ${
                          isSecret
                            ? "border border-emerald-500 bg-emerald-600 text-white hover:bg-emerald-700"
                            : "border border-[#8b5cf6] bg-[#8b5cf6] text-white hover:bg-[#7c3aed]"
                        }`}
                        title="Нажать — отправить, удерживать — запись"
                      >
                        {isLongPress ? (
                          <Mic
                            size={19}
                            className="sm:w-[18px] sm:h-[18px] animate-pulse"
                          />
                        ) : (
                          <Send
                            size={19}
                            className="sm:w-[18px] sm:h-[18px]"
                          />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
          </>
        )}

        {isSelectMode && (
          <div className="h-2" />
        )}
      </main>

      /*
       * ==========================================================
       * VERIFY / E2EE MODAL
       * ==========================================================
       */
      {showVerify &&
        chatPartner && (
          <>
            <div
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200]"
              onClick={() => {
                setShowVerify(false);
                setShowQR(false);
                setShowScanner(false);
              }}
            />

            <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
              <div className="w-full max-w-sm sm:max-w-md border border-emerald-500/30 rounded-2xl bg-[#1f1f23]/95 backdrop-blur-md shadow-2xl p-4 sm:p-6 pointer-events-auto max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4 sm:mb-5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck
                      className="text-emerald-400"
                      size={20}
                    />

                    <h2 className="text-lg sm:text-xl font-black text-white">
                      Проверка шифрования
                    </h2>
                  </div>

                  <button
                    onClick={() => {
                      setShowVerify(
                        false
                      );
                      setShowQR(false);
                      setShowScanner(
                        false
                      );
                    }}
                    className="text-white/60 hover:text-white p-1"
                  >
                    <X size={18} />
                  </button>
                </div>

                <p className="text-xs sm:text-sm text-white/60 mb-3 sm:mb-4">
                  Сравните эти отпечатки
                  с собеседником через
                  другой канал (голосом
                  или лично). Если они
                  совпадают — канал
                  защищён от перехвата.
                </p>

                <div className="space-y-2 sm:space-y-3">
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                    <p className="text-[11px] sm:text-xs text-white/50 mb-1">
                      Ваш отпечаток:
                    </p>

                    <p className="font-mono text-xs sm:text-sm text-emerald-300 tracking-wider break-all">
                      {myFingerprint ||
                        "—"}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                    <p className="text-[11px] sm:text-xs text-white/50 mb-1">
                      Отпечаток @
                      {
                        chatPartner?.username
                      }
                      :
                    </p>

                    <p className="font-mono text-xs sm:text-sm text-emerald-300 tracking-wider break-all">
                      {partnerFingerprint ||
                        "—"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 p-3 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-sm font-bold text-white mb-2">
                    Перенос на другое
                    устройство
                  </p>

                  <div className="space-y-2">
                    <button
                      onClick={() => {
                        setShowQR(
                          !showQR
                        );

                        setShowScanner(
                          false
                        );
                      }}
                      className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/15 text-white/80 text-sm font-bold hover:bg-white/10 transition-colors"
                    >
                      🖥️ Показать QR с
                      ключом (я на ПК)
                    </button>

                    <button
                      onClick={() => {
                        setShowScanner(
                          true
                        );

                        setShowQR(false);
                      }}
                      className="w-full px-3 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm font-bold hover:bg-emerald-500/20 transition-colors"
                    >
                      📱 Отсканировать QR
                      (я на телефоне)
                    </button>
                  </div>

                  {showQR && (
                    <div className="mt-3 p-3 rounded-xl bg-white flex flex-col items-center gap-2">
                      <QRCodeSVG
                        value={
                          exportKeyPairPayload() ||
                          ""
                        }
                        size={200}
                      />

                      <p className="text-[11px] text-black/60 text-center font-bold">
                        ⚠️ Этот QR = твой
                        приватный ключ.
                        <br />
                        Показывай его только
                        своей камере, никому
                        не отправляй!
                      </p>
                    </div>
                  )}

                  {showScanner && (
                    <div className="mt-3 rounded-xl overflow-hidden border border-emerald-500/30">
                      <div id="qr-scanner-region" />

                      <button
                        onClick={() =>
                          setShowScanner(
                            false
                          )
                        }
                        className="w-full py-2 bg-white/5 text-white/70 text-xs font-bold hover:bg-white/10"
                      >
                        Отменить
                        сканирование
                      </button>
                    </div>
                  )}

                  <details className="mt-2">
                    <summary className="text-[11px] sm:text-xs text-white/40 cursor-pointer hover:text-white/60">
                      Нет камеры?
                      Скопировать/вставить
                      вручную
                    </summary>

                    <div className="mt-2 space-y-2">
                      <button
                        onClick={async () => {
                          const payload =
                            exportKeyPairPayload();

                          if (!payload)
                            return;

                          try {
                            await navigator.clipboard.writeText(
                              payload
                            );

                            alert(
                              "Ключ скопирован! Вставь его на втором устройстве."
                            );
                          } catch {
                            prompt(
                              "Скопируй ключ вручную:",
                              payload
                            );
                          }
                        }}
                        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-white/60 text-[11px] sm:text-xs font-bold hover:bg-white/10 transition-colors"
                      >
                        📤 Скопировать
                        ключ текстом
                      </button>

                      <button
                        onClick={() => {
                          const payload =
                            prompt(
                              "Вставь ключ с другого устройства:"
                            );

                          if (!payload)
                            return;

                          if (
                            importKeyPairPayload(
                              payload
                            )
                          ) {
                            alert(
                              "Ключ импортирован! Перезагружаем страницу..."
                            );

                            window.location.reload();
                          } else {
                            alert(
                              "Неверный формат ключа"
                            );
                          }
                        }}
                        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-white/60 text-[11px] sm:text-xs font-bold hover:bg-white/10 transition-colors"
                      >
                        📥 Вставить ключ
                        текстом
                      </button>
                    </div>
                  </details>
                </div>

                <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <p className="text-[11px] sm:text-xs text-emerald-200">
                    🔒 Сообщения
                    шифруются на вашем
                    устройстве и
                    расшифровываются только
                    на устройстве
                    собеседника.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

      /*
       * ==========================================================
       * MEDIA GALLERY
       * ==========================================================
       */
      {showMediaGallery && (
        <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h2 className="text-base sm:text-xl font-bold text-white">
                Медиа из чата
              </h2>

              <button
                onClick={() =>
                  setShowMediaGallery(
                    false
                  )
                }
                className="text-white/60 hover:text-white p-2"
              >
                <X size={20} />
              </button>
            </div>

            {mediaItems.length ===
            0 ? (
              <p className="text-white/60 text-center py-8 sm:py-12 text-sm sm:text-base">
                Нет медиа
              </p>
            ) : (
              <div className="flex-1 overflow-y-auto grid grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
                {mediaItems.map(
                  (item) => (
                    <div
                      key={item.id}
                      className="aspect-square relative cursor-pointer group rounded-lg overflow-hidden border border-white/10"
                      onClick={() =>
                        setSelectedMedia(
                          item
                        )
                      }
                    >
                      {(item.media_type ===
                        "image" ||
                        item.media_type ===
                          "gif") && (
                        <img
                          src={mediaUrl(
                            item.media_url
                          )}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      )}

                      {item.media_type ===
                        "video" && (
                        <>
                          <video
                            src={mediaUrl(
                              item.media_url
                            )}
                            className="w-full h-full object-cover"
                            muted
                            playsInline
                          />

                          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                            <Film
                              size={24}
                              className="text-white"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      )}


      {selectedMedia && (
        <div
          className="fixed inset-0 z-[201] bg-black/95 flex items-center justify-center p-3 sm:p-4"
          onClick={() =>
            setSelectedMedia(null)
          }
        >
          <button
            onClick={() =>
              setSelectedMedia(null)
            }
            className="absolute top-3 sm:top-4 right-3 sm:right-4 text-white/60 hover:text-white p-2 z-10"
          >
            <X size={24} />
          </button>

          <div
            className="max-w-[95vw] sm:max-w-[90vw] max-h-[95vh] sm:max-h-[90vh]"
            onClick={(e) =>
              e.stopPropagation()
            }
          >
            {(selectedMedia.media_type ===
              "image" ||
              selectedMedia.media_type ===
                "gif") && (
              <img
                src={mediaUrl(
                  selectedMedia.media_url
                )}
                alt=""
                className="max-w-full max-h-[95vh] sm:max-h-[90vh] rounded-lg"
              />
            )}

            {selectedMedia.media_type ===
              "video" && (
              <VideoPlayer
                src={
                  selectedMedia.media_url
                }
                className="max-w-full max-h-[95vh] sm:max-h-[90vh] rounded-lg"
              />
            )}
          </div>
        </div>
      )}

      /*
       * ==========================================================
       * GROUP MEMBERS
       * ==========================================================
       */
      {showGroupMembers &&
        isGroup && (
          <GroupMembersModal
            chatId={Number(chatId)}
            myRole={
              chatInfo?.my_role ||
              null
            }
            onClose={() =>
              setShowGroupMembers(
                false
              )
            }
            onChanged={() =>
              loadChatInfo()
            }
          />
        )}

      /*
       * ==========================================================
       * GROUP SETTINGS
       * ==========================================================
       */
      {showGroupSettings && (
        <GroupSettingsModal
          chatId={Number(chatId)}
          chat={chatInfo}
          onClose={() =>
            setShowGroupSettings(
              false
            )
          }
          onUpdate={() => {
            loadChatInfo();
            loadPinned();
          }}
        />
      )}

      /*
       * ==========================================================
       * VIDEO NOTE RECORDER
       * ==========================================================
       */
      {showVideoRecorder && (
        <VideoNoteRecorder
          onRecorded={async (file) => {
            setShowVideoRecorder(
              false
            );

            const form =
              new FormData();

            form.append(
              "file",
              file
            );

            const token =
              getToken();

            if (!token) return;

            try {
              const res =
                await fetch(
                  `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages`,
                  {
                    method:
                      "POST",
                    headers: {
                      Authorization: `Bearer ${token}`,
                    },
                    body: form,
                  }
                );

              if (!res.ok) {
                alert(
                  "Не удалось отправить видеосообщение"
                );
              }
            } catch (err) {
              console.error(
                "Failed to send video note:",
                err
              );

              alert(
                "Ошибка сети"
              );
            }
          }}
          onCancel={() =>
            setShowVideoRecorder(
              false
            )
          }
          maxDuration={60}
        />
      )}
    </div>
  );
}