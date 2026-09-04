"use client";
// 📢 Страница канала — визуально ТОЧЬ-В-ТОЧЬ как чат:
// Sidebar, шапка чата, лента пузырей (посты как «чужие» сообщения),
// нижний композер с «+» как в чате. Система каналов изолирована
// (API /api/channels/*, WS channel_*), URL — /channels/@username.
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Sidebar } from "@/components/Sidebar";
import { Avatar } from "@/components/Avatar";
import { getToken } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import { socket } from "@/lib/websocket";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { useUnreadCounts } from "@/lib/UnreadCountsContext";
import { ChannelManageModal } from "@/components/ChannelManageModal";
import { ForwardPostModal } from "@/components/ForwardPostModal";
import { RichEditor, RichEditorHandle } from "@/components/RichEditor";
import { RichContextMenu, RichMenuItem } from "@/components/RichContextMenu";
import { useQuickReaction } from "@/lib/useQuickReaction";
// 🚀 react-markdown тяжёлый — ленивая загрузка (как в MessageBubble)
const MarkdownRenderer = dynamic(() => import("@/components/MarkdownRenderer").then((m) => m.MarkdownRenderer));
import {
  ArrowLeft, Megaphone, Users, BellOff, Bell, Settings, Eye, MessageCircle,
  Pin, Trash2, Pencil, Send, Loader2, Globe, Lock, X, Reply, UserPlus, Ban,
  Forward, Plus, Paperclip, Clock, Image as ImageIcon, SmilePlus, Type, Copy, Bookmark, Crown, Shield,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL;

export default function ChannelPage() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useParams();
  // Поддержка и числового id, и @username (slug)
  const rawParam = String(params?.id ?? "");
  const isSlugParam = !/^\d+$/.test(rawParam);
  const slugParam = isSlugParam ? rawParam.replace(/^@/, "") : null;
  const { refresh } = useUnreadCounts();

  const [channel, setChannel] = useState<any | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedLoading, setFeedLoading] = useState(true);
  const [error, setError] = useState("");

  // Композер (как в чате)
  const [postText, setPostText] = useState("");
  const [postMedia, setPostMedia] = useState<any[]>([]);
  const [isSilent, setIsSilent] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [posting, setPosting] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(0);
  const [showInputActions, setShowInputActions] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Редактирование поста
  const [editingPost, setEditingPost] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  // Комментарии (шторка)
  const [openPostId, setOpenPostId] = useState<number | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [replyTo, setReplyTo] = useState<any | null>(null);
  const [sendingComment, setSendingComment] = useState(false);

  const [showManage, setShowManage] = useState(false);
  const [forwardingPost, setForwardingPost] = useState<number | null>(null);
  const [busyAction, setBusyAction] = useState(false);

  // 👍 Реакции — та же система, что в чатах (эмодзи + стикер-паки)
  const [reactionPickerFor, setReactionPickerFor] = useState<number | null>(null);
  const [activePackTab, setActivePackTab] = useState<number>(0);
  const [stickerPacks, setStickerPacks] = useState<any[]>([]);

  // 🆕 Быстрая реакция (двойной тап) + вылетающая анимация — как в обычном чате
  const { reaction: quickReaction } = useQuickReaction();
  const [popReaction, setPopReaction] = useState<{
    content: string; type: "emoji" | "sticker"; stickerId?: number;
    x: number; y: number; id: number; visible: boolean;
  } | null>(null);

  // 🖊 WYSIWYG-композер и контекстные меню (как в чатах)
  const editorRef = useRef<RichEditorHandle>(null);
  const editEditorRef = useRef<RichEditorHandle>(null);
  // меню поста (long-press / правый клик / клик по зоне)
  const [postMenu, setPostMenu] = useState<{ postId: number; x: number; y: number } | null>(null);
  // 👥 Просмотр списка подписчиков (доступно всем)
  const [showSubscribers, setShowSubscribers] = useState(false);
  const [subscribersList, setSubscribersList] = useState<any[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [subsSearch, setSubsSearch] = useState("");
  // 📱 Свайп-эффект «оттягивания» пузыря (dragX) — ответ для админа, комменты для подписчика
  const [dragX, setDragX] = useState(0);
  const [dragPostId, setDragPostId] = useState<number | null>(null);
  const dragStartX = useRef<number | null>(null);
  const dragLocked = useRef(false);
  const [replyToPostId, setReplyToPostId] = useState<number | null>(null);
  const [replyToPostPreview, setReplyToPostPreview] = useState<any | null>(null);

  const postLpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const postLpPos = useRef({ x: 0, y: 0 });
  const clearPostLp = () => { if (postLpTimer.current) { clearTimeout(postLpTimer.current); postLpTimer.current = null; } };

  // 🆕 Двойной тап/клик → быстрая реакция (ручной детектор — надёжно на ПК и мобиле)
  const lastTapRef = useRef<{ id: number; time: number } | null>(null);

  const openPostIdRef = useRef<number | null>(null);
  useEffect(() => { openPostIdRef.current = openPostId; }, [openPostId]);

  const isAdmin = channel?.my_role === "owner" || channel?.my_role === "admin";
  const isSubscribed = !!channel?.my_role;

  const headers = useCallback((): Record<string, string> => {
    return { Authorization: `Bearer ${getToken()}` };
  }, []);

  const loadChannel = useCallback(async () => {
    const url = isSlugParam
      ? `${API}/api/channels/by-slug/${encodeURIComponent(slugParam || "")}`
      : `${API}/api/channels/${rawParam}`;
    const res = await fetch(url, { headers: headers() });
    if (res.ok) setChannel(await res.json());
    else if (res.status === 403) setError(t("channels.private") || "Приватный канал");
    else setError(t("common.error") || "Ошибка");
  }, [isSlugParam, slugParam, rawParam, headers, t]);

  const loadPosts = useCallback(async () => {
    if (!channel?.id) return;
    setFeedLoading(true);
    try {
      const res = await fetch(`${API}/api/channels/${channel.id}/posts`, { headers: headers() });
      if (res.ok) {
        setPosts(await res.json());
        refresh();
      }
    } finally { setFeedLoading(false); }
  }, [channel?.id, headers, refresh]);

  useEffect(() => {
    (async () => {
      await loadChannel();
      setLoading(false);
    })();
  }, [loadChannel]);

  useEffect(() => {
    if (!channel?.id) return;
    loadPosts();
    const unsubs = [
      socket.on("channel_new_post", (d: any) => { if (d?.channel_id === channel.id) loadPosts(); }),
      socket.on("channel_new_post_silent", (d: any) => { if (d?.channel_id === channel.id) loadPosts(); }),
      socket.on("channel_post_edited", (d: any) => { if (d?.channel_id === channel.id) loadPosts(); }),
      socket.on("channel_post_deleted", (d: any) => { if (d?.channel_id === channel.id) loadPosts(); }),
      socket.on("channel_post_pinned", (d: any) => { if (d?.channel_id === channel.id) loadPosts(); }),
      socket.on("channel_updated", () => loadChannel()),
      socket.on("channel_subscriber_joined", () => loadChannel()),
      socket.on("channel_subscriber_left", () => loadChannel()),
    ];
    return () => unsubs.forEach((u) => u());
  }, [channel?.id, loadChannel, loadPosts]);

  // WS: обновление открытой шторки при новом комментарии
  useEffect(() => {
    const unsub = socket.on("channel_new_comment", (d: any) => {
      if (d?.post_id != null && openPostIdRef.current != null && d.post_id === openPostIdRef.current) {
        (async () => {
          const pid = openPostIdRef.current!;
          const res = await fetch(`${API}/api/channels/posts/${pid}/comments`, { headers: headers() });
          if (res.ok) setComments((await res.json()).comments || []);
        })();
      }
    });
    return unsub;
  }, [headers]);

  // ---------- Действия ----------
  async function createPost() {
    if (!postText.trim() && postMedia.length === 0) return;
    const token = getToken();
    if (!token) return;
    setPosting(true);
    const tempText = postText.trim();
    const tempMedia = postMedia;
    // 🚀 Optimistic: сразу добавляем временный пост в ленту (как в чате)
    const tempId = -Date.now();
    const tempPost: any = {
      id: tempId, channel_id: channel.id, post_type: "text",
      text: tempText, media: tempMedia, poll: null, reactions: [],
      my_reaction: null, is_saved: false, is_silent: isSilent, is_pinned: false,
      views_count: 0, comments_count: 0, scheduled_at: scheduledAt || null,
      is_published: !!scheduledAt ? false : true, is_temp: true,
      reply_to_post_id: replyToPostId,
      reply_preview: replyToPostPreview,
      created_at: new Date().toISOString(), edited_at: null,
      author: { ...(channel.owner || {}), id: channel.owner?.id },
    };
    if (scheduledAt) {
      // ⏰ Отложенный пост — отправляем на сервер, без оптимистичного показа
      try {
        const res = await fetch(`${API}/api/channels/${channel.id}/posts`, {
          method: "POST", headers: { ...headers(), "Content-Type": "application/json" },
          body: JSON.stringify({ text: tempText || null, media: tempMedia, is_silent: isSilent,
                                 scheduled_at: new Date(scheduledAt).toISOString(),
                                 reply_to_post_id: replyToPostId }),
        });
        if (res.ok) { setPostText(""); setPostMedia([]); setIsSilent(false); setScheduledAt(""); setReplyToPostId(null); setReplyToPostPreview(null); await loadPosts(); }
        else { const d = await res.json().catch(() => null); alert(d?.detail || "Ошибка публикации"); }
      } finally { setPosting(false); }
      return;
    }
    setPosts((prev) => [...prev, tempPost]);
    setPostText("");
    setPostMedia([]);
    setIsSilent(false);
    setScheduledAt("");
    setReplyToPostId(null);
    setReplyToPostPreview(null);
    try {
      const body: any = { text: tempText || null, media: tempMedia, is_silent: isSilent, reply_to_post_id: replyToPostId };
      if (scheduledAt) body.scheduled_at = new Date(scheduledAt).toISOString();
      const res = await fetch(`${API}/api/channels/${channel.id}/posts`, {
        method: "POST", headers: { ...headers(), "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (res.ok) {
        const d = await res.json();
        // заменяем временный пост на настоящий
        setPosts((prev) => prev.map((p) => (p.id === tempId ? d.post : p)));
      } else {
        const d = await res.json().catch(() => null);
        alert(d?.detail || "Ошибка публикации");
        setPosts((prev) => prev.filter((p) => p.id !== tempId));
      }
    } finally { setPosting(false); }
  }

  async function onFiles(files: FileList | null) {
    if (!files || !files.length || !channel?.id) return;
    setUploadingFiles((n) => n + files.length);
    try {
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", f);
        const res = await fetch(`${API}/api/media/upload`, {
          method: "POST", headers: headers(), body: fd,
        });
        if (res.ok) {
          const d = await res.json();
          setPostMedia((prev) => [...prev, { type: d.media_type, url: d.url }]);
        } else {
          const d = await res.json().catch(() => null);
          alert(d?.detail || "Ошибка загрузки файла");
        }
      }
    } finally {
      setUploadingFiles((n) => Math.max(0, n - files.length));
    }
  }

  async function togglePin(postId: number) {
    await fetch(`${API}/api/channels/${channel.id}/posts/${postId}/pin`, {
      method: "POST", headers: headers(),
    });
    loadPosts();
  }

  async function deletePost(postId: number) {
    if (!confirm(t("channels.delete") + "?")) return;
    await fetch(`${API}/api/channels/${channel.id}/posts/${postId}`, {
      method: "DELETE", headers: headers(),
    });
    loadPosts();
  }

  async function saveEdit(postId: number) {
    const res = await fetch(`${API}/api/channels/${channel.id}/posts/${postId}`, {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ text: editText }),
    });
    if (res.ok) { setEditingPost(null); loadPosts(); }
  }

  async function toggleMute() {
    await fetch(`${API}/api/channels/${channel.id}/mute?forever=${!channel?.is_muted}`, {
      method: "PATCH", headers: headers(),
    });
    loadChannel();
  }

  async function subscribe() {
    setBusyAction(true);
    const res = await fetch(`${API}/api/channels/${channel.id}/subscribe`, {
      method: "POST", headers: headers(),
    });
    setBusyAction(false);
    if (res.ok) {
      const d = await res.json();
      if (d.status === "pending") alert(t("channels.requestSent") || "Заявка отправлена");
      await Promise.all([loadChannel(), loadPosts()]);
    } else {
      const d = await res.json().catch(() => null);
      alert(d?.detail || "Ошибка");
    }
  }

  async function unsubscribe() {
    if (!confirm(t("channels.unsubscribe") + "?")) return;
    await fetch(`${API}/api/channels/${channel.id}/subscribe`, {
      method: "DELETE", headers: headers(),
    });
    await Promise.all([loadChannel(), loadPosts()]);
  }

  async function deleteChannel() {
    if (!confirm(t("channels.deleteChannelConfirm") || "Удалить канал?")) return;
    await fetch(`${API}/api/channels/${channel.id}`, { method: "DELETE", headers: headers() });
    router.push("/messages");
  }

  // ---------- Комментарии ----------
  const openComments = useCallback(async (postId: number) => {
    setOpenPostId(postId);
    setReplyTo(null);
    setCommentsLoading(true);
    const res = await fetch(`${API}/api/channels/posts/${postId}/comments`, { headers: headers() });
    if (res.ok) {
      const d = await res.json();
      setComments(d.comments || []);
    }
    setCommentsLoading(false);
  }, [headers]);

  async function sendComment() {
    if (!commentText.trim() || !openPostId) return;
    setSendingComment(true);
    try {
      const res = await fetch(`${API}/api/channels/posts/${openPostId}/comments`, {
        method: "POST",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({
          text: commentText.trim(),
          parent_comment_id: replyTo?.id || null,
        }),
      });
      if (res.ok) {
        setCommentText("");
        setReplyTo(null);
        await openComments(openPostId);
        loadPosts();
      } else {
        const d = await res.json().catch(() => null);
        alert(d?.detail || "Ошибка");
      }
    } finally { setSendingComment(false); }
  }

  async function deleteComment(commentId: number) {
    if (!confirm(t("channels.delete") + "?")) return;
    await fetch(`${API}/api/channels/posts/${openPostId}/comments/${commentId}`, {
      method: "DELETE", headers: headers(),
    });
    if (openPostId) await openComments(openPostId);
    loadPosts();
  }

  // ---------- 👥 Список подписчиков (доступно всем) ----------
  async function loadSubscribersList() {
    setSubsLoading(true);
    try {
      const res = await fetch(`${API}/api/channels/${channel.id}/subscribers`, { headers: headers() });
      if (res.ok) setSubscribersList(await res.json());
    } finally { setSubsLoading(false); }
  }

  // ---------- 👍 Реакции (та же система, что в чатах) ----------
  const loadStickerPacks = useCallback(async () => {
    if (stickerPacks.length) return;
    try {
      const res = await fetch(`${API}/api/sticker-packs`, { headers: headers() });
      if (res.ok) setStickerPacks(await res.json());
    } catch (e) { console.error(e); }
  }, [headers, stickerPacks.length]);

  // 🆕 Прелоад паков при загрузке канала — окно реакций открывается МГНОВЕННО
  useEffect(() => {
    if (channel?.id) loadStickerPacks();
  }, [channel?.id, loadStickerPacks]);

  async function toggleReaction(postId: number, stickerId?: number | string, emoji?: string) {
    if (!stickerId && !emoji) return;
    const form = new FormData();
    if (stickerId !== undefined && stickerId !== null) {
      const numId = Number(stickerId);
      if (isNaN(numId)) return;
      form.append("sticker_id", String(numId));
    }
    if (emoji) form.append("emoji", String(emoji));
    const res = await fetch(`${API}/api/channels/${channel.id}/posts/${postId}/react`, {
      method: "POST", headers: headers(), body: form,
    });
    if (res.ok) {
      const data = await res.json();
      setPosts((prev) => prev.map((m) => (m.id === postId ? { ...m, reactions: data.reactions } : m)));
      setReactionPickerFor(null);
    } else {
      const err = await res.json().catch(() => null);
      alert(err?.detail || t("messages.reactionFailed") || "Ошибка реакции");
    }
  }

  // WS: обновление реакций поста в реальном времени
  useEffect(() => {
    const unsub = socket.on("channel_post_reaction", (d: any) => {
      if (d?.channel_id !== channel?.id || d?.post_id == null) return;
      setPosts((prev) => prev.map((m) => (m.id === d.post_id ? { ...m, reactions: d.reactions } : m)));
    });
    return unsub;
  }, [channel?.id]);

  // Загрузка стикер-паков при открытии пикера реакций
  useEffect(() => {
    if (reactionPickerFor !== null) loadStickerPacks();
  }, [reactionPickerFor, loadStickerPacks]);

  // ---------- 📋 Меню поста (копирование / сохранение) ----------
  async function toggleSavePost(postId: number) {
    const res = await fetch(`${API}/api/channels/${channel.id}/posts/${postId}/save`, {
      method: "POST", headers: headers(),
    });
    if (res.ok) {
      const d = await res.json();
      setPosts((prev) => prev.map((m) => (m.id === postId ? { ...m, is_saved: d.is_saved } : m)));
    }
  }

  function copyPostText(p: any) {
    const text = p.text || "";
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text);
    else {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta);
    }
  }

  function buildPostMenuItems(p: any): RichMenuItem[] {
    return [
      { id: "reply", label: t("channels.reply") || "Ответить в комментариях", icon: Reply, onClick: () => openComments(p.id) },
      { id: "react", label: t("messages.reaction") || "Реакция", icon: SmilePlus, onClick: () => setReactionPickerFor(p.id) },
      { id: "copy", label: "Копировать", icon: Copy, onClick: () => copyPostText(p) },
      { id: "save", label: p.is_saved ? "Убрать из сохранённых" : "Сохранить", icon: Bookmark, onClick: () => toggleSavePost(p.id) },
      { id: "forward", label: t("messages.forward") || "Переслать", icon: Forward, onClick: () => setForwardingPost(p.id) },
      ...(isAdmin ? [
        { id: "pin", label: p.is_pinned ? (t("channels.unpin") || "Открепить") : (t("channels.pin") || "Закрепить"), icon: Pin, separatorBefore: true, onClick: () => togglePin(p.id) },
        { id: "edit", label: t("channels.edit") || "Редактировать", icon: Pencil, onClick: () => { setEditingPost(p.id); setEditText(p.text || ""); } },
        { id: "delete", label: t("channels.delete") || "Удалить", icon: Trash2, danger: true, onClick: () => deletePost(p.id) },
      ] : []),
    ];
  }

  // ---------- Рендер ----------
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-paper dark:bg-[#171717]">
        <Loader2 size={32} className="animate-spin text-[#8b5cf6]" />
      </div>
    );
  }

  if (error || !channel) {
    return (
      <div className="h-screen flex">
        <Sidebar />
        <main className="flex-1 flex flex-col items-center justify-center gap-4 border-x border-line dark:border-white/10">
          <Ban size={48} className="text-gray-400 dark:text-white/20" />
          <p className="text-gray-600 dark:text-white/60">{error || t("common.error")}</p>
          <button onClick={() => router.push("/messages")} className="px-4 py-2 rounded-xl bg-[#8b5cf6] text-white text-sm font-bold">
            {t("common.back") || "Назад"}
          </button>
        </main>
      </div>
    );
  }

  const signature = channel.settings?.show_author_signature !== false;
  const pinnedPosts = posts.filter((p) => p.is_pinned);
  const feedPosts = posts.filter((p) => !p.is_pinned);
  const bubbleRadius = "rounded-tl-2xl rounded-tr-2xl rounded-br-2xl rounded-bl-[4px]";

  function CommentNode({ c, depth }: { c: any; depth: number }) {
    return (
      <div className={depth > 0 ? "ml-6 border-l-2 border-line dark:border-white/10 pl-3" : ""}>
        <div className="py-2">
          <div className="flex items-start gap-2">
            <Avatar src={c.user?.avatar_url} name={c.user?.display_name} id={c.user_id} size={28} />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-gray-600 dark:text-white/50 flex items-center gap-2">
                <span className="font-bold text-gray-800 dark:text-white/80 truncate">{c.user?.display_name}</span>
                <span className="shrink-0">{new Date(c.created_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                {c.edited_at && <span className="italic opacity-60 shrink-0">(изм.)</span>}
              </p>
              <p className="text-sm text-gray-800 dark:text-white/90 break-words mt-0.5">{c.text}</p>
              <div className="flex gap-3 mt-1">
                <button
                  onClick={() => setReplyTo(c)}
                  className="text-[11px] text-gray-500 dark:text-white/40 hover:text-[#8b5cf6] flex items-center gap-1"
                >
                  <Reply size={11} /> {t("channels.reply") || "Ответить"}
                </button>
                {(c.user_id === channel.owner?.id || isAdmin) && (
                  <button
                    onClick={() => deleteComment(c.id)}
                    className="text-[11px] text-gray-500 dark:text-white/40 hover:text-red-500 flex items-center gap-1"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        {(c.replies || []).map((r: any) => <CommentNode key={r.id} c={r} depth={depth + 1} />)}
      </div>
    );
  }

  // 🫧 Пост как «чужой» пузырь: всегда слева, имя канала всегда,
  // подпись автора мелким серым (если включена)
  function PostBubble({ post: p, pinned }: { post: any; pinned: boolean }) {
    const media = Array.isArray(p.media) ? p.media : [];
    // 📱 Мобильные жесты: long-press (350мс, порог 12px) → меню; свайп влево → комментарии
    const openPostMenuAt = (x: number, y: number) => {
      try { navigator.vibrate?.(15); } catch {}
      setPostMenu({ postId: p.id, x, y });
    };
    return (
      <div
        className="relative flex justify-start"
        id={`post-${p.id}`}
        style={{ touchAction: "pan-y" } as React.CSSProperties}
        onContextMenu={(e) => {
          if ((e.target as HTMLElement)?.closest("button, a, input, textarea, .rich-editor")) return;
          e.preventDefault();
          setPostMenu({ postId: p.id, x: e.clientX, y: e.clientY });
        }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement)?.closest("button, a, input, textarea, .rich-editor")) return;
          if (e.pointerType === "touch") {
            // long-press
            postLpPos.current = { x: e.clientX, y: e.clientY };
            clearPostLp();
            postLpTimer.current = setTimeout(() => { if (dragStartX.current == null) openPostMenuAt(postLpPos.current.x, postLpPos.current.y); }, 400);
          }
          // начало потенциального свайпа (touch и mouse)
          dragStartX.current = e.clientX;
          dragLocked.current = false;
          setDragPostId(p.id);
        }}
        onPointerMove={(e) => {
          if (dragStartX.current == null || dragPostId !== p.id) return;
          const dx = e.clientX - dragStartX.current;
          const dy = (e.pointerType === "touch") ? (e.clientY - postLpPos.current.y) : 0;
          // вертикальный скролл — свайп не начинается
          if (e.pointerType === "touch" && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8 && !dragLocked.current) {
            clearPostLp();
            dragLocked.current = true;
            setDragPostId(null);
            return;
          }
          if (dragLocked.current) return;
          // микроскролл до ~6px — терпим (не ломаем тап/длинное нажатие)
          if (Math.abs(dx) < 6) return;
          if (e.pointerType === "touch") clearPostLp(); // свайп отменяет long-press
          // rubber-band: вправо не тянем, слева ограничиваем 90px
          let next = dx;
          if (next > 0) next = 0;
          if (next < -90) next = -90 - (next + 90) * 0.3;
          dragLocked.current = true;
          setDragX(next);
        }}
        onPointerUp={(e) => {
          if (dragPostId === p.id && dragStartX.current != null && dragX < -50) {
            // commit: админ → ответ на пост, подписчик → комментарии
            try { navigator.vibrate?.(12); } catch {}
            if (isAdmin) { setReplyToPostId(p.id); setReplyToPostPreview({ post_id: p.id, text: p.text || "", has_media: (p.media||[]).length > 0 }); setTimeout(() => editorRef.current?.focus(), 0); }
            else openComments(p.id);
          }
          setDragX(0); setDragPostId(null); dragStartX.current = null; dragLocked.current = false;
          clearPostLp();

          // 🆕 Двойной тап/клик по посту (в т.ч. по пустому месту) → быстрая реакция.
          //    Ручной детектор вместо нативного dblclick — одинаково надёжно на ПК и мобиле.
          if (!(e.target as HTMLElement)?.closest("button, a, input, textarea, .rich-editor") && editingPost !== p.id) {
            const now = Date.now();
            const last = lastTapRef.current;
            if (last && last.id === p.id && now - last.time < 350) {
              lastTapRef.current = null;
              const reactionToSend = quickReaction || { type: "emoji" as const, content: "❤️" };
              if (reactionToSend.type === "sticker") {
                toggleReaction(p.id, reactionToSend.stickerId, undefined);
              } else {
                toggleReaction(p.id, undefined, reactionToSend.content);
              }
              setPopReaction({
                content: reactionToSend.content,
                type: reactionToSend.type,
                stickerId: reactionToSend.stickerId,
                x: e.clientX,
                y: e.clientY,
                id: p.id,
                visible: true,
              });
              setTimeout(() => {
                setPopReaction((prev) => (prev ? { ...prev, visible: false } : null));
              }, 700);
            } else {
              lastTapRef.current = { id: p.id, time: now };
            }
          }
        }}
        onPointerLeave={clearPostLp}
        onPointerCancel={() => { setDragX(0); setDragPostId(null); dragStartX.current = null; dragLocked.current = false; clearPostLp(); }}
      >
        <div
          className="max-w-[85%] sm:max-w-[75%] md:max-w-[70%] min-w-0 flex flex-col items-start"
          style={{
            transform: dragPostId === p.id ? `translateX(${dragX}px)` : "translateX(0px)",
            transition: dragPostId === p.id ? "none" : "transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
            willChange: "transform",
          }}
        >
          {/* Индикатор действия при оттягивании */}
          <div
            className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs transition-opacity pointer-events-none"
            style={{
              opacity: dragPostId === p.id && dragX < -12 ? Math.min(1, -dragX / 80) : 0,
              color: isAdmin ? "#8b5cf6" : "#0ea5e9",
              right: 8,
            }}
          >
            <Reply size={16} /> {isAdmin ? "Ответить" : "Комментарии"}
          </div>
          {p.reply_preview && !p.is_temp && (
            <div className="mb-1 ml-1 flex items-center gap-1.5 border-l-2 border-[#8b5cf6] pl-2 py-0.5 max-w-full">
              <Reply size={9} className="text-[#8b5cf6] shrink-0" />
              <span className="text-[10px] px-1 py-0.5 rounded bg-gray-200/70 dark:bg-white/10 text-gray-600 dark:text-white/60 truncate">
                Ответ на @{channel.custom_slug}: {p.reply_preview.text || (p.reply_preview.has_media ? "Медиа" : "Пост")}
              </span>
            </div>
          )}
          {p.is_temp && (
            <div className="mb-0.5 px-1 flex items-center gap-1 text-[9px] text-gray-400 dark:text-white/30">
              <Loader2 size={9} className="animate-spin" /> отправка…
            </div>
          )}
          <div className="mb-1 px-1">
            <p className="text-[11px] sm:text-xs font-bold text-[#a78bfa]">{channel.title}</p>
            {signature && p.author && (
              <p className="text-[10px] text-gray-500 dark:text-white/40 leading-tight">
                {p.author.display_name}
              </p>
            )}
          </div>
          <div className={`${bubbleRadius} px-3 sm:px-3.5 md:px-4 py-2 bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white border border-line dark:border-white/15`}>
            {pinned && (
              <div className="flex items-center gap-1 text-[10px] font-bold text-[#8b5cf6] mb-1">
                <Pin size={10} /> {t("channels.pin") || "Закреплено"}
              </div>
            )}
            {editingPost === p.id ? (
              <div>
                <RichEditor
                  ref={editEditorRef}
                  value={editText}
                  onChange={(v) => setEditText(v)}
                  className="w-full min-h-[72px] p-2 rounded-xl border border-line dark:border-white/15 bg-white dark:bg-white/5 text-gray-900 dark:text-white text-sm"
                />
                <div className="flex gap-2 mt-2">
                  <button onClick={() => saveEdit(p.id)} className="px-3 py-1.5 rounded-lg bg-[#8b5cf6] text-white text-xs font-bold">{t("common.save") || "Сохранить"}</button>
                  <button onClick={() => setEditingPost(null)} className="px-3 py-1.5 rounded-lg border border-line dark:border-white/15 text-gray-600 dark:text-white/60 text-xs">{t("common.cancel") || "Отмена"}</button>
                </div>
              </div>
            ) : (
              p.text && <div className="text-sm md:text-[15px]"><MarkdownRenderer text={p.text} /></div>
            )}
            {media.length > 0 && (
              <div className={`mt-2 grid gap-2 ${media.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                {media.map((m: any, i: number) => m.type === "video" ? (
                  <video key={i} src={mediaUrl(m.url)} controls className="w-full rounded-xl" />
                ) : (
                  <img key={i} src={mediaUrl(m.url)} alt="" className="w-full rounded-xl object-cover max-h-96" />
                ))}
              </div>
            )}
            {/* 👍 РЕАКЦИИ — как в чатах */}
            {p.reactions?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5 justify-start">
                {p.reactions.map((r: any) => (
                  <button
                    key={r.type === "sticker" ? `s_${r.sticker_id}` : `e_${r.emoji}`}
                    onClick={() => isSubscribed && toggleReaction(p.id, r.sticker_id, r.emoji)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-full text-[13px] border transition-all active:scale-90 ${
                      r.me
                        ? "bg-[#8b5cf6]/25 border-[#8b5cf6] shadow-[0_0_8px_rgba(139,92,246,0.3)]"
                        : "bg-gray-100 dark:bg-white/5 border-line dark:border-white/15 hover:bg-gray-100 dark:hover:bg-white/10"
                    }`}
                  >
                    {r.type === "sticker" ? (
                      <img src={mediaUrl(r.content)} alt="" className="w-5 h-5 object-contain" />
                    ) : (
                      <span>{r.emoji}</span>
                    )}
                    <span className="text-[11px] font-bold text-gray-700 dark:text-white/80">{r.count}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
              {isSubscribed && (
                <button
                  onClick={() => setReactionPickerFor(reactionPickerFor === p.id ? null : p.id)}
                  className="text-[10px] sm:text-[11px] text-gray-500 dark:text-white/40 hover:text-[#8b5cf6] flex items-center gap-1"
                  title="Реакция"
                >
                  <SmilePlus size={11} />
                </button>
              )}
              <span className="text-[10px] sm:text-[11px] flex items-center gap-1 text-gray-500 dark:text-white/40" title={t("channels.views") || "просмотры"}>
                <Eye size={11} /> {p.views_count}
              </span>
              <button onClick={() => openComments(p.id)} className="text-[10px] sm:text-[11px] text-gray-500 dark:text-white/40 hover:text-[#8b5cf6] flex items-center gap-1">
                <MessageCircle size={11} /> {p.comments_count}
              </button>
              <button
                onClick={() => setForwardingPost(p.id)}
                className="text-[10px] sm:text-[11px] text-gray-500 dark:text-white/40 hover:text-[#8b5cf6] flex items-center gap-1"
                title={t("messages.forward") || "Переслать"}
              >
                <Forward size={11} />
              </button>
              <span className="text-[10px] sm:text-[11px] text-gray-500 dark:text-white/40 flex items-center gap-1">
                {p.is_pinned && <Pin size={9} className="text-[#8b5cf6]" />}
                {p.scheduled_at && !p.is_published && <Clock size={9} />}
                {new Date(p.created_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                {p.edited_at && " ✎"}
              </span>
            </div>
          </div>
        </div>
        {postMenu && postMenu.postId === p.id && (
          <RichContextMenu
            x={postMenu.x}
            y={postMenu.y}
            items={buildPostMenuItems(p)}
            onClose={() => setPostMenu(null)}
            zIndex={9998}
          />
        )}
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />
      <div className="w-px shrink-0 bg-gray-100 dark:bg-white/10 my-3 hidden md:block" />
      <main className="flex-1 flex flex-col border-x border-line dark:border-white/10 overflow-hidden">
        {/* ── ШАПКА (как в чате) ── */}
        <header className="shrink-0 flex items-center gap-3 px-3 sm:px-4 py-2.5 border-b border-line dark:border-white/10 bg-paper dark:bg-[#171717]/95 backdrop-blur-md z-10">
          <button onClick={() => router.push("/messages")} className="text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white transition-colors p-2 -ml-1 active:scale-95">
            <ArrowLeft size={20} />
          </button>
          {channel.avatar_url ? (
            <Avatar src={channel.avatar_url} name={channel.title} id={channel.id} size={40} />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] flex items-center justify-center shrink-0">
              <Megaphone size={20} className="text-white" />
            </div>
          )}
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => isAdmin && setShowManage(true)}>
            <div className="flex items-center gap-1.5">
              <p className="font-bold text-gray-900 dark:text-white truncate">{channel.title}</p>
              {channel.is_public
                ? <Globe size={12} className="text-gray-400 shrink-0" />
                : <Lock size={12} className="text-gray-400 shrink-0" />}
            </div>
            <p className="text-[11px] text-gray-500 dark:text-white/40 flex items-center gap-1 truncate cursor-pointer hover:text-[#8b5cf6]" onClick={() => { setShowSubscribers(true); loadSubscribersList(); }}>
              @{channel.custom_slug} · <Users size={10} /> {channel.subscribers_count}
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {isSubscribed ? (
              <>
                <button
                  onClick={toggleMute}
                  title={channel.is_muted ? (t("channels.unmute") || "Включить") : (t("channels.mute") || "Мьют")}
                  className="p-2.5 sm:p-2 text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white transition-colors active:scale-95"
                >
                  {channel.is_muted ? <BellOff size={19} className="text-amber-500" /> : <Bell size={19} />}
                </button>
                {isAdmin && (
                  <button
                    onClick={() => setShowManage(true)}
                    title={t("channels.manage") || "Управление"}
                    className="p-2.5 sm:p-2 text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white transition-colors active:scale-95"
                  >
                    <Settings size={19} />
                  </button>
                )}
                {channel.my_role !== "owner" && (
                  <button
                    onClick={unsubscribe}
                    title={t("channels.unsubscribe") || "Отписаться"}
                    className="p-2.5 sm:p-2 text-gray-600 dark:text-white/60 hover:text-red-500 transition-colors active:scale-95"
                  >
                    <UserPlus size={19} className="rotate-45" />
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={subscribe}
                disabled={busyAction}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:opacity-50 text-white text-sm font-bold active:scale-95 transition-all"
              >
                {busyAction ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
                {channel.is_public ? (t("channels.subscribe") || "Подписаться") : (t("channels.requests") || "Заявка")}
              </button>
            )}
          </div>
        </header>

        {showSubscribers ? (
        /* ── 👥 ПОДПИСЧИКИ — отдельный экран (доступен всем) ── */
        <>
          <div className="shrink-0 flex items-center gap-3 px-3 sm:px-4 py-2.5 border-b border-line dark:border-white/10 bg-paper dark:bg-[#171717]/95 backdrop-blur-md">
            <button onClick={() => setShowSubscribers(false)} className="text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white transition-colors p-2 -ml-1 active:scale-95">
              <ArrowLeft size={20} />
            </button>
            <Users size={18} className="text-[#8b5cf6]" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-gray-900 dark:text-white">{"Подписчики"} · {channel.subscribers_count}</p>
              <p className="text-[11px] text-gray-500 dark:text-white/40 truncate">@{channel.custom_slug}</p>
            </div>
          </div>
          <div className="shrink-0 px-3 sm:px-4 py-2 border-b border-line dark:border-white/10">
            <input
              value={subsSearch}
              onChange={(e) => setSubsSearch(e.target.value)}
              placeholder="Поиск по имени или @username…"
              className="w-full px-3 py-2 rounded-xl border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-[#8b5cf6]"
            />
          </div>
          <div className="flex-1 overflow-y-auto p-3 sm:p-4">
            {subsLoading && <p className="text-center text-gray-500 dark:text-white/40 text-sm py-8"><Loader2 size={18} className="animate-spin inline" /></p>}
            {!subsLoading && subscribersList.length === 0 && (
              <p className="text-center text-gray-500 dark:text-white/40 text-sm py-16">Подписчиков пока нет</p>
            )}
            {!subsLoading && subscribersList
              .filter((m: any) => {
                const q = subsSearch.trim().toLowerCase();
                if (!q) return true;
                return (m.user?.display_name || "").toLowerCase().includes(q) || (m.user?.username || "").toLowerCase().includes(q);
              })
              .map((m: any) => (
                <div key={m.user.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
                  <Avatar src={m.user.avatar_url} name={m.user.display_name} id={m.user.id} size={40} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-bold text-sm text-gray-900 dark:text-white truncate">{m.user.display_name}</p>
                      {m.role === "owner" ? <Crown size={12} className="text-yellow-500 shrink-0" /> : m.role === "admin" ? <Shield size={12} className="text-[#8b5cf6] shrink-0" /> : null}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-white/40 truncate">@{m.user.username}</p>
                  </div>
                  <span className="text-[10px] uppercase font-bold text-gray-400 dark:text-white/30 shrink-0">
                    {m.role === "owner" ? "Владелец" : m.role === "admin" ? "Админ" : ""}
                  </span>
                </div>
              ))}
          </div>
        </>
        ) : openPostId === null ? (<>
        {/* ── ЛЕНТА ПУЗЫРЕЙ (на всю ширину, как в чате) ── */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          <div className="space-y-3 pb-4">
            {feedLoading && posts.length === 0 ? (
              <>
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="flex justify-start">
                    <div className="max-w-[85%] sm:max-w-[75%] w-full">
                      <div className="mb-1 px-1 h-3 w-28 rounded bg-gray-200 dark:bg-white/10 animate-pulse" />
                      <div className="rounded-2xl px-4 py-3 bg-gray-100 dark:bg-white/10">
                        <div className="h-3 w-3/4 rounded bg-gray-200 dark:bg-white/10 animate-pulse mb-2" />
                        <div className="h-3 w-full rounded bg-gray-200 dark:bg-white/10 animate-pulse mb-2" />
                        <div className="h-3 w-2/3 rounded bg-gray-200 dark:bg-white/10 animate-pulse" />
                      </div>
                    </div>
                  </div>
                ))}
              </>
            ) : pinnedPosts.length > 0 || feedPosts.length > 0 ? (
              <>
                {pinnedPosts.map((p) => <PostBubble key={p.id} post={p} pinned />)}
                {pinnedPosts.length > 0 && <div className="h-px bg-line dark:bg-white/10" />}
                {feedPosts.map((p) => <PostBubble key={p.id} post={p} pinned={false} />)}
              </>
            ) : (
              <div className="py-16 text-center">
                <Megaphone size={48} className="text-gray-400 dark:text-white/20 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-white/40 text-sm">{t("channels.posts") || "Постов"} пока нет</p>
              </div>
            )}
          </div>
        </div>
        {/* ── КОМПОЗЕР (как в чате: «+», поле, Send) ── */}
        {isAdmin ? (
          <div className="shrink-0 border-t border-line dark:border-white/10 bg-paper dark:bg-[#171717]/95 backdrop-blur-md p-2 sm:p-3">
            {(postMedia.length > 0 || uploadingFiles > 0) && (
              <div className="flex gap-2 mb-2 flex-wrap px-1">
                {postMedia.map((m: any, i: number) => (
                  <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden border border-line dark:border-white/10">
                    {m.type === "video"
                      ? <video src={mediaUrl(m.url)} className="w-full h-full object-cover" />
                      : <img src={mediaUrl(m.url)} alt="" className="w-full h-full object-cover" />}
                    <button onClick={() => setPostMedia((prev) => prev.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center">
                      <X size={11} />
                    </button>
                  </div>
                ))}
                {uploadingFiles > 0 && (
                  <div className="w-16 h-16 rounded-xl border border-line dark:border-white/10 flex items-center justify-center">
                    <Loader2 size={18} className="animate-spin text-[#8b5cf6]" />
                  </div>
                )}
              </div>
            )}
            {scheduledAt && (
              <div className="flex items-center gap-2 px-3 py-2 mb-1.5 bg-[#8b5cf6]/10 border border-[#8b5cf6]/30 rounded-xl">
                <Clock size={14} className="text-[#8b5cf6] shrink-0" />
                <p className="text-[11px] text-[#8b5cf6] flex-1">Отложенный постинг: {new Date(scheduledAt).toLocaleString("ru-RU")}</p>
                <button onClick={() => setScheduledAt("")} className="p-1 text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white rounded-full">
                  <X size={13} />
                </button>
              </div>
            )}
            {isSilent && (
              <div className="flex items-center gap-2 px-3 py-2 mb-1.5 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                <BellOff size={14} className="text-amber-500 shrink-0" />
                <p className="text-[11px] text-amber-600 dark:text-amber-400 flex-1">Тихий пост (без звука)</p>
                <button onClick={() => setIsSilent(false)} className="p-1 text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white rounded-full">
                  <X size={13} />
                </button>
              </div>
            )}
            {replyToPostId && (
              <div className="flex items-center gap-2 px-3 py-2 mb-1.5 bg-[#8b5cf6]/10 border border-[#8b5cf6]/40 rounded-xl">
                <Reply size={14} className="text-[#8b5cf6] shrink-0" />
                <div className="flex-1 min-w-0 border-l-2 border-[#8b5cf6] pl-2">
                  <p className="text-[10px] font-bold text-[#8b5cf6]">Ответ на @{channel.custom_slug}</p>
                  <p className="text-[11px] text-gray-600 dark:text-white/50 truncate">
                    {replyToPostPreview?.text || (replyToPostPreview?.has_media ? "📎 Медиа" : "Пост")}
                  </p>
                </div>
                <button onClick={() => { setReplyToPostId(null); setReplyToPostPreview(null); }} className="p-1 text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white rounded-full shrink-0">
                  <X size={13} />
                </button>
              </div>
            )}
            <div className="flex items-end gap-1.5 sm:gap-2">
              <input ref={fileRef} type="file" accept="image/*,image/gif,video/*" multiple className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
              <div className="relative shrink-0 flex items-end pb-1">
                <button
                  onClick={() => setShowInputActions(!showInputActions)}
                  className={`p-2.5 sm:p-2 rounded-full transition-all active:scale-95 ${showInputActions ? "text-[#8b5cf6] bg-[#8b5cf6]/10" : "text-gray-500 dark:text-white/60 hover:text-[#8b5cf6] hover:bg-gray-200 dark:hover:bg-white/5"}`}
                  title="Действия"
                >
                  <Plus size={22} className="sm:w-5 sm:h-5" />
                </button>
                {showInputActions && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowInputActions(false)} />
                    <div className="absolute bottom-full left-0 mb-2 bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-xl shadow-2xl overflow-hidden min-w-[240px] z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                      <button onClick={() => { fileRef.current?.click(); setShowInputActions(false); }} className="w-full px-4 py-3 text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-3 transition-colors">
                        <Paperclip size={18} className="text-gray-600 dark:text-white/60" /> <span>Прикрепить файл</span>
                      </button>
                      <button onClick={() => { setIsSilent(!isSilent); setShowInputActions(false); }} className="w-full px-4 py-3 text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-3 transition-colors border-t border-line dark:border-white/5">
                        <BellOff size={18} className="text-gray-600 dark:text-white/60" />
                        <span>{isSilent ? "🔕 Тихий пост: вкл" : "🔔 Тихий пост: выкл"}</span>
                      </button>
                      <button onClick={() => { if (!scheduledAt) setScheduledAt(new Date(Date.now() + 3600000).toISOString().slice(0, 16)); else setScheduledAt(""); setShowInputActions(false); }} className="w-full px-4 py-3 text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-3 transition-colors border-t border-line dark:border-white/5">
                        <Clock size={18} className="text-gray-600 dark:text-white/60" />
                        <span>{scheduledAt ? "Убрать отложенный постинг" : "Отложенный постинг"}</span>
                      </button>
                      <button
                        onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); editorRef.current?.openMenuAt(rect.left + rect.width / 2, rect.top - 8); setShowInputActions(false); }}
                        className="w-full px-4 py-3 text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-3 transition-colors border-t border-line dark:border-white/5"
                      >
                        <Type size={18} className="text-gray-600 dark:text-white/60" /> <span>Форматирование</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
              {/* Поле ввода — WYSIWYG, как в чате (RichEditor) */}
              <div className="chat-input-shell flex-1 rounded-xl border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 overflow-hidden focus-within:border-[#8b5cf6] transition-all">
                <RichEditor
                  ref={editorRef}
                  value={postText}
                  onChange={(v) => { setPostText(v); }}
                  placeholder={t("channels.writePost") || "Написать пост..."}
                  className="w-full bg-transparent text-gray-900 dark:text-white text-[15px] sm:text-sm md:text-base placeholder-gray-400 dark:placeholder-white/40 px-3 py-2.5 min-h-[48px] max-h-32 overflow-y-auto leading-snug"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); createPost(); }
                  }}
                />
              </div>
              {/* Кнопка отправки */}
              <div className="shrink-0 flex items-end pb-0.5">
                <button
                  onClick={createPost}
                  disabled={posting || (!postText.trim() && postMedia.length === 0)}
                  className="p-2.5 md:p-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-all min-w-[44px] min-h-[44px] flex items-center justify-center active:scale-95 border border-[#8b5cf6] bg-[#8b5cf6] text-white hover:bg-[#7c3aed]"
                >
                  {posting ? <Loader2 size={19} className="animate-spin" /> : <Send size={19} />}
                </button>
              </div>
            </div>
          </div>
        ) : isSubscribed ? (
          <div className="shrink-0 border-t border-line dark:border-white/10 bg-paper dark:bg-[#171717]/95 px-4 py-3">
            <p className="text-center text-xs text-gray-500 dark:text-white/40 flex items-center justify-center gap-1.5">
              <Megaphone size={13} /> Публикация доступна только администраторам канала
            </p>
          </div>
        ) : null}
        {/*COMPOSER_END*/}
        </>) : (
        /* ── 💬 КОММЕНТАРИИ — отдельный экран (не модалка) ── */
        <>
          <div className="shrink-0 flex items-center gap-3 px-3 sm:px-4 py-2.5 border-b border-line dark:border-white/10 bg-paper dark:bg-[#171717]/95 backdrop-blur-md">
            <button onClick={() => { setOpenPostId(null); setReplyTo(null); }} className="text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white transition-colors p-2 -ml-1 active:scale-95">
              <ArrowLeft size={20} />
            </button>
            <MessageCircle size={18} className="text-[#8b5cf6]" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-gray-900 dark:text-white">{t("channels.comments") || "Комментарии"}</p>
              <p className="text-[11px] text-gray-500 dark:text-white/40 truncate">
                {(() => { const p = posts.find((x) => x.id === openPostId); return p?.text ? p.text.slice(0, 60) : (p ? `Пост · 👁 ${p.views_count}` : ""); })()}
              </p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 sm:p-4">
            {commentsLoading && <p className="text-center text-gray-500 dark:text-white/40 text-sm py-8"><Loader2 size={18} className="animate-spin inline" /></p>}
            {!commentsLoading && comments.length === 0 && (
              <p className="text-center text-gray-500 dark:text-white/40 text-sm py-16">{t("channels.comments")} пока нет</p>
            )}
            {!commentsLoading && comments.map((c: any) => <CommentNode key={c.id} c={c} depth={0} />)}
          </div>
          <div className="shrink-0 border-t border-line dark:border-white/10 bg-paper dark:bg-[#171717]/95 p-3">
            {replyTo && (
              <div className="flex items-center gap-2 mb-2 text-[11px] text-gray-600 dark:text-white/60 bg-gray-100 dark:bg-white/5 rounded-lg px-2.5 py-1.5">
                <Reply size={11} className="text-[#8b5cf6]" />
                <span className="flex-1 truncate">→ {replyTo.user?.display_name}: {replyTo.text}</span>
                <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-red-500"><X size={12} /></button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                rows={1}
                maxLength={2000}
                placeholder={t("channels.addComment") || "Ваш комментарий..."}
                className="flex-1 px-3 py-2 rounded-xl border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:border-[#8b5cf6] resize-none"
              />
              <button
                onClick={sendComment}
                disabled={sendingComment || !commentText.trim()}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:opacity-40 text-white shrink-0"
              >
                {sendingComment ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        </>
        )}
        {/*COMMENTS_SCREEN_END*/}
        {/* ── МОДАЛКА УПРАВЛЕНИЯ ── */}
        {showManage && (
          <ChannelManageModal
            channel={channel}
            onClose={() => setShowManage(false)}
            onChanged={() => { loadChannel(); loadPosts(); }}
          />
        )}
        {/*MANAGE_MODAL_END*/}
        {/* ── МОДАЛКА ПЕРЕСЫЛКИ ПОСТА ── */}
        {forwardingPost !== null && (
          <ForwardPostModal
            channelId={channel.id}
            postId={forwardingPost}
            onClose={() => setForwardingPost(null)}
            onForwarded={() => loadPosts()}
          />
        )}
        {/*FORWARD_END*/}
        {/* ── 👍 ПИКЕР РЕАКЦИЙ — ТОЧНАЯ КОПИЯ из чатов ── */}
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
                    {stickerPacks.map((pack: any, i: number) => (
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
                              // ✅ ЯВНОЕ РАЗДЕЛЕНИЕ (как в чатах)
                              const pid = reactionPickerFor!;
                              setReactionPickerFor(null); // 🆕 окно закрывается МГНОВЕННО, не ждём сеть
                              if (s.type === "emoji") toggleReaction(pid, undefined, s.content);
                              else toggleReaction(pid, Number(s.id), undefined);
                            }}
                            className="aspect-square flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 active:scale-90 transition-all"
                          >
                            {s.type === "emoji" ? (
                              <span className="text-2xl">{s.content}</span>
                            ) : (
                              <img src={mediaUrl(s.content)} alt="" className="w-10 h-10 object-contain" />
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
        {/*REACTION_PICKER_END*/}

        {/* 🆕 Анимация вылетающей реакции при двойном тапе — как в обычном чате */}
        {popReaction && (
          <div
            className={`fixed pointer-events-none z-[300] drop-shadow-lg transition-all duration-700 ease-out ${
              popReaction.visible
                ? "opacity-100 scale-100 translate-y-0"
                : "opacity-0 scale-150 -translate-y-12"
            }`}
            style={{
              left: "50%",
              top: "20%",
              transform: "translate(-50%, -50%)",
            }}
          >
            {popReaction.type === "emoji" ? (
              <span className="text-5xl">{popReaction.content}</span>
            ) : (
              <img src={mediaUrl(popReaction.content)} alt="" className="w-12 h-12 object-contain" />
            )}
          </div>
        )}
      </main>
    </div>
  );
}