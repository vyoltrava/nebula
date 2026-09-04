"use client";
// 📢 Страница канала — шапка, лента карточек постов, шторка комментариев.
// Изолированная система каналов (API /api/channels/*, WS channel_*).
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { getToken } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import { socket } from "@/lib/websocket";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { useUnreadCounts } from "@/lib/UnreadCountsContext";
import {
  ArrowLeft, Megaphone, Users, BellOff, Bell, Settings, Eye, MessageCircle,
  Pin, Trash2, Pencil, Send, Loader2, Globe, Lock, X, Reply, UserPlus, Ban, Forward,
} from "lucide-react";
import { ChannelManageModal } from "@/components/ChannelManageModal";
import { ForwardPostModal } from "@/components/ForwardPostModal";

const API = process.env.NEXT_PUBLIC_API_URL;

export default function ChannelPage() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useParams();
  const channelId = Number(params?.id);
  const { refresh } = useUnreadCounts();

  const [channel, setChannel] = useState<any | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Композер (админы)
  const [postText, setPostText] = useState("");
  const [postMedia, setPostMedia] = useState<any[]>([]);
  const [isSilent, setIsSilent] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [posting, setPosting] = useState(false);

  // Меню поста / редактирование
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
  const [busyAction, setBusyAction] = useState(false);
  const [forwardingPost, setForwardingPost] = useState<number | null>(null);

  // Реф для отслеживания открытой шторки в WS-обработчике
  const openPostIdRef = useRef<number | null>(null);
  useEffect(() => { openPostIdRef.current = openPostId; }, [openPostId]);

  const isAdmin = channel?.my_role === "owner" || channel?.my_role === "admin";
  const isSubscribed = !!channel?.my_role;

  const headers = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { Authorization: `Bearer ${getToken()}` };
    return h;
  }, []);

  const loadChannel = useCallback(async () => {
    if (!channelId) return;
    const res = await fetch(`${API}/api/channels/${channelId}`, { headers: headers() });
    if (res.ok) setChannel(await res.json());
    else if (res.status === 403) setError(t("channels.private") || "Приватный канал");
    else setError(t("common.error") || "Ошибка");
  }, [channelId, headers, t]);

  const loadPosts = useCallback(async () => {
    if (!channelId) return;
    const res = await fetch(`${API}/api/channels/${channelId}/posts`, { headers: headers() });
    if (res.ok) {
      setPosts(await res.json());
      refresh();
    }
  }, [channelId, headers, refresh]);

  useEffect(() => {
    (async () => {
      await Promise.all([loadChannel(), loadPosts()]);
      setLoading(false);
    })();
    const unsubs = [
      socket.on("channel_new_post", (d: any) => { if (d?.channel_id === channelId) loadPosts(); }),
      socket.on("channel_new_post_silent", (d: any) => { if (d?.channel_id === channelId) loadPosts(); }),
      socket.on("channel_post_edited", (d: any) => { if (d?.channel_id === channelId) loadPosts(); }),
      socket.on("channel_post_deleted", (d: any) => { if (d?.channel_id === channelId) loadPosts(); }),
      socket.on("channel_post_pinned", (d: any) => { if (d?.channel_id === channelId) loadPosts(); }),
      socket.on("channel_updated", () => loadChannel()),
      socket.on("channel_subscriber_joined", () => loadChannel()),
      socket.on("channel_subscriber_left", () => loadChannel()),
    ];
    return () => unsubs.forEach((u) => u());
  }, [channelId, loadChannel, loadPosts]);

  // WS: обновление шторки при новом комментарии
  useEffect(() => {
    const unsub = socket.on("channel_new_comment", (d: any) => {
      if (d?.post_id != null && d.post_id === openPostIdRef.current && openPostIdRef.current != null) {
        (async () => {
          const pid = openPostIdRef.current!;
          const res = await fetch(`${API}/api/channels/posts/${pid}/comments`, { headers: headers() });
          if (res.ok) setComments((await res.json()).comments || []);
          loadPosts();
        })();
      }
    });
    return unsub;
  }, [headers, loadPosts]);

  // ---------- Действия ----------
  async function createPost() {
    if (!postText.trim() && postMedia.length === 0) return;
    setPosting(true);
    try {
      const res = await fetch(`${API}/api/channels/${channelId}/posts`, {
        method: "POST",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({
          text: postText.trim() || null,
          media: postMedia,
          is_silent: isSilent,
          scheduled_at: scheduledAt || null,
        }),
      });
      if (res.ok) {
        setPostText(""); setPostMedia([]); setIsSilent(false); setScheduledAt("");
        await loadPosts();
      } else {
        const d = await res.json().catch(() => null);
        alert(d?.detail || "Ошибка публикации");
      }
    } finally { setPosting(false); }
  }

  async function togglePin(postId: number) {
    await fetch(`${API}/api/channels/${channelId}/posts/${postId}/pin`, {
      method: "POST", headers: headers(),
    });
    loadPosts();
  }

  async function deletePost(postId: number) {
    if (!confirm(t("channels.delete") + "?")) return;
    await fetch(`${API}/api/channels/${channelId}/posts/${postId}`, {
      method: "DELETE", headers: headers(),
    });
    loadPosts();
  }

  async function saveEdit(postId: number) {
    const res = await fetch(`${API}/api/channels/${channelId}/posts/${postId}`, {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ text: editText }),
    });
    if (res.ok) { setEditingPost(null); loadPosts(); }
  }

  async function toggleMute() {
    await fetch(`${API}/api/channels/${channelId}/mute?forever=${!channel?.is_muted}`, {
      method: "PATCH", headers: headers(),
    });
    loadChannel();
  }

  async function subscribe() {
    setBusyAction(true);
    const res = await fetch(`${API}/api/channels/${channelId}/subscribe`, {
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
    await fetch(`${API}/api/channels/${channelId}/subscribe`, {
      method: "DELETE", headers: headers(),
    });
    await Promise.all([loadChannel(), loadPosts()]);
  }

  async function deleteChannel() {
    if (!confirm(t("channels.deleteChannelConfirm") || "Удалить канал?")) return;
    await fetch(`${API}/api/channels/${channelId}`, { method: "DELETE", headers: headers() });
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
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-paper dark:bg-[#171717]">
        <Ban size={48} className="text-gray-400 dark:text-white/20" />
        <p className="text-gray-600 dark:text-white/60">{error || t("common.error")}</p>
        <button onClick={() => router.push("/messages")} className="px-4 py-2 rounded-xl bg-[#8b5cf6] text-white text-sm font-bold">
          {t("common.back") || "Назад"}
        </button>
      </div>
    );
  }

  const signature = channel.settings?.show_author_signature !== false;
  const pinnedPosts = posts.filter((p) => p.is_pinned);
  const feedPosts = posts.filter((p) => !p.is_pinned);

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
                {(c.user_id === channel.owner.id || isAdmin) && (
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

  function PostCard({ post: p, pinned }: { post: any; pinned: boolean }) {
    const media = Array.isArray(p.media) ? p.media : [];
    return (
      <article className={`border rounded-2xl bg-white dark:bg-white/5 overflow-hidden ${pinned ? "border-[#8b5cf6]/40" : "border-line dark:border-white/10"}`}>
        {pinned && (
          <div className="px-4 pt-2.5 flex items-center gap-1.5 text-[11px] font-bold text-[#8b5cf6]">
            <Pin size={11} /> {t("channels.pin") || "Закреплено"}
          </div>
        )}
        <div className="p-4">
          {editingPost === p.id ? (
            <div>
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={3}
                className="w-full p-2 rounded-xl border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-[#8b5cf6] resize-none"
              />
              <div className="flex gap-2 mt-2">
                <button onClick={() => saveEdit(p.id)} className="px-3 py-1.5 rounded-lg bg-[#8b5cf6] text-white text-xs font-bold">{t("common.save") || "Сохранить"}</button>
                <button onClick={() => setEditingPost(null)} className="px-3 py-1.5 rounded-lg border border-line dark:border-white/15 text-gray-600 dark:text-white/60 text-xs">{t("common.cancel") || "Отмена"}</button>
              </div>
            </div>
          ) : (
            p.text && <p className="text-sm md:text-[15px] text-gray-900 dark:text-white/90 whitespace-pre-wrap break-words">{p.text}</p>
          )}
          {media.length > 0 && (
            <div className={`mt-3 grid gap-2 ${media.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
              {media.map((m: any, i: number) => m.type === "video" ? (
                <video key={i} src={mediaUrl(m.url)} controls className="w-full rounded-xl" />
              ) : (
                <img key={i} src={mediaUrl(m.url)} alt="" className="w-full rounded-xl object-cover max-h-96" />
              ))}
            </div>
          )}
          <div className="flex items-center gap-3 mt-3 pt-2.5 border-t border-line dark:border-white/10">
            {signature && p.author && (
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <Avatar src={p.author.avatar_url} name={p.author.display_name} id={p.author_id} size={22} />
                <span className="text-[11px] text-gray-500 dark:text-white/40 truncate">{p.author.display_name}</span>
              </div>
            )}
            {!signature && <div className="flex-1" />}
            <span className="text-[11px] text-gray-400 dark:text-white/30 flex items-center gap-1 shrink-0" title={t("channels.views") || "просмотры"}>
              <Eye size={12} /> {p.views_count}
            </span>
            <button
              onClick={() => openComments(p.id)}
              className="text-[11px] text-gray-500 dark:text-white/40 hover:text-[#8b5cf6] flex items-center gap-1 shrink-0"
            >
              <MessageCircle size={12} /> {p.comments_count}
            </button>
            <button
              onClick={() => setForwardingPost(p.id)}
              className="text-[11px] text-gray-500 dark:text-white/40 hover:text-[#8b5cf6] flex items-center gap-1 shrink-0"
              title={t("messages.forward") || "Переслать"}
            >
              <Forward size={12} />
            </button>
            <span className="text-[11px] text-gray-400 dark:text-white/30 shrink-0 hidden md:flex items-center">
              {new Date(p.created_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              {p.edited_at && " ✎"}
              {p.scheduled_at && !p.is_published && " ⏰"}
            </span>
            {isAdmin && (
              <div className="flex gap-0.5 shrink-0">
                <button onClick={() => togglePin(p.id)} title={p.is_pinned ? (t("channels.unpin") || "Открепить") : (t("channels.pin") || "Закрепить")} className="p-1.5 rounded-lg text-gray-400 hover:text-[#8b5cf6] hover:bg-gray-100 dark:hover:bg-white/10">
                  <Pin size={13} />
                </button>
                <button onClick={() => { setEditingPost(p.id); setEditText(p.text || ""); }} title={t("channels.edit") || "Редактировать"} className="p-1.5 rounded-lg text-gray-400 hover:text-[#8b5cf6] hover:bg-gray-100 dark:hover:bg-white/10">
                  <Pencil size={13} />
                </button>
                <button onClick={() => deletePost(p.id)} title={t("channels.delete") || "Удалить"} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-500/10">
                  <Trash2 size={13} />
                </button>
              </div>
            )}
          </div>
        </div>
      </article>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-paper dark:bg-[#171717] overflow-hidden">
      {/* ── ШАПКА ── */}
      <header className="shrink-0 border-b border-line dark:border-white/10 bg-paper dark:bg-[#171717]/95 backdrop-blur-md z-10">
        <div className="flex items-center gap-3 p-3 md:px-6">
          <button onClick={() => router.push("/messages")} className="p-2 rounded-lg text-gray-600 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/10">
            <ArrowLeft size={20} />
          </button>
          {channel.avatar_url ? (
            <Avatar src={channel.avatar_url} name={channel.title} id={channel.id} size={44} />
          ) : (
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] flex items-center justify-center shrink-0">
              <Megaphone size={22} className="text-white" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="font-bold text-gray-900 dark:text-white truncate">{channel.title}</p>
              {channel.is_public
                ? <Globe size={12} className="text-gray-400 shrink-0" />
                : <Lock size={12} className="text-gray-400 shrink-0" />}
            </div>
            <p className="text-[11px] text-gray-500 dark:text-white/40 flex items-center gap-1 truncate">
              @{channel.custom_slug} · <Users size={10} /> {channel.subscribers_count}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isSubscribed ? (
              <>
                <button
                  onClick={toggleMute}
                  title={channel.is_muted ? (t("channels.unmute") || "Включить") : (t("channels.mute") || "Мьют")}
                  className="p-2.5 rounded-xl text-gray-600 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/10"
                >
                  {channel.is_muted ? <BellOff size={18} className="text-amber-500" /> : <Bell size={18} />}
                </button>
                {isAdmin && (
                  <button
                    onClick={() => setShowManage(true)}
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#8b5cf6]/10 border border-[#8b5cf6]/30 text-[#8b5cf6] text-sm font-bold hover:bg-[#8b5cf6]/20"
                  >
                    <Settings size={16} /> <span className="hidden md:inline">{t("channels.manage") || "Управление"}</span>
                  </button>
                )}
                {channel.my_role !== "owner" && (
                  <button
                    onClick={unsubscribe}
                    title={t("channels.unsubscribe") || "Отписаться"}
                    className="p-2.5 rounded-xl text-gray-600 dark:text-white/60 hover:bg-red-500/10 hover:text-red-500"
                  >
                    <UserPlus size={18} className="rotate-45" />
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={subscribe}
                disabled={busyAction}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:opacity-50 text-white text-sm font-bold"
              >
                {busyAction ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
                {channel.is_public ? (t("channels.subscribe") || "Подписаться") : (t("channels.requests") || "Заявка")}
              </button>
            )}
          </div>
        </div>
      </header>
      {/* ── ЛЕНТА ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-3 md:px-4 py-4 space-y-3 pb-24">
          {/* Композер для админов */}
          {isAdmin && (
            <div className="border border-[#8b5cf6]/30 rounded-2xl bg-white dark:bg-white/5 p-3">
              <textarea
                value={postText}
                onChange={(e) => setPostText(e.target.value)}
                rows={2}
                maxLength={8000}
                placeholder={t("channels.writePost") || "Написать пост..."}
                className="w-full bg-transparent text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-white/30 focus:outline-none resize-none"
              />
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <label className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-white/40 cursor-pointer">
                  <input type="checkbox" checked={isSilent} onChange={(e) => setIsSilent(e.target.checked)} className="accent-[#8b5cf6]" />
                  🔕 {t("channels.silent") || "Тихий пост"}
                </label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="text-[11px] px-2 py-1 rounded-lg border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-white/70"
                  title={t("channels.schedule") || "Отложенный постинг"}
                />
                <button
                  onClick={createPost}
                  disabled={posting || (!postText.trim() && postMedia.length === 0)}
                  className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:opacity-40 text-white text-sm font-bold"
                >
                  {posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  {t("channels.publish") || "Опубликовать"}
                </button>
              </div>
            </div>
          )}

          {/* Закреплённые */}
          {pinnedPosts.map((p) => <PostCard key={p.id} post={p} pinned />)}
          {pinnedPosts.length > 0 && <div className="h-px bg-line dark:bg-white/10" />}

          {/* Лента */}
          {feedPosts.length === 0 && pinnedPosts.length === 0 && (
            <div className="py-16 text-center">
              <Megaphone size={48} className="text-gray-400 dark:text-white/20 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-white/40 text-sm">{t("channels.posts") || "Постов"} пока нет</p>
            </div>
          )}
          {feedPosts.map((p) => <PostCard key={p.id} post={p} pinned={false} />)}
        </div>
      </main>
      {/*FEED_PART_END*/}
      {/*COMMENTS_DRAWER*/}
      {/* ── ШТОРКА КОММЕНТАРИЕВ ── */}
      {openPostId !== null && (
        <>
          <div className="fixed inset-0 z-[2000] bg-black/60 backdrop-blur-sm" onClick={() => setOpenPostId(null)} />
          <div className="fixed bottom-0 inset-x-0 z-[2001] md:inset-auto md:right-4 md:bottom-4 md:w-[420px] md:h-[80vh] bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/10 rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-2 duration-200">
            {/* Шапка шторки */}
            <div className="p-3 border-b border-line dark:border-white/10 flex items-center gap-2">
              <MessageCircle size={16} className="text-[#8b5cf6]" />
              <span className="font-bold text-sm text-gray-900 dark:text-white flex-1">
                {t("channels.comments") || "Комментарии"}
              </span>
              <button onClick={() => setOpenPostId(null)} className="p-1.5 rounded-lg text-gray-500 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/10">
                <X size={16} />
              </button>
            </div>

            {/* Список комментариев (дерево/ветки) */}
            <div className="flex-1 overflow-y-auto p-3">
              {commentsLoading && <p className="text-center text-gray-500 dark:text-white/40 text-sm py-8">...</p>}
              {!commentsLoading && comments.length === 0 && (
                <p className="text-center text-gray-500 dark:text-white/40 text-sm py-8">{t("channels.comments")} пока нет</p>
              )}
              {!commentsLoading && comments.map((c: any) => <CommentNode key={c.id} c={c} depth={0} />)}
            </div>

            {/* Поле ввода (внизу шторки) */}
            <div className="p-3 border-t border-line dark:border-white/10">
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
          </div>
        </>
      )}
      {/*COMMENTS_DRAWER_END*/}
      {/*MANAGE_MODAL*/}
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
    </div>
  );
}