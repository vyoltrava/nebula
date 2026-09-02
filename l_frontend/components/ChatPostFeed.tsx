"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Avatar } from "@/components/Avatar";
import { GroupMembersModal } from "@/components/GroupMembersModal";
import { GroupSettingsModal } from "@/components/GroupSettingsModal";
import { MessageBubble } from "@/components/MessageBubble";
import { CommentNode } from "@/components/ChatCommentNode";
import { RichEditor } from "@/components/RichEditor";
import { ReactionPicker } from "@/components/ReactionPicker";
import { useWebSocket } from "@/src/hooks/useWebSocket";
import { getToken } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { Send, Users, Settings, X, Paperclip, Plus, Link as LinkIcon, MessageSquare, Type, Pin, Reply, Trash2, Copy } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL;
const PAGE = 20;

function extractFirstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"]+/);
  return m ? m[0].replace(/[.,;:!?)]+$/, "") : null;
}

function getMediaClasses(type: string) {
  const base = "rounded-lg sm:rounded-xl mb-1.5 sm:mb-2 w-full";
  const sizes: Record<string, string> = {
    image: "max-h-[340px] object-cover",
    gif: "max-h-[340px]",
    video: "max-h-[380px]",
    audio: "",
    video_note: "",
  };
  return `${base} ${sizes[type] || "max-h-[340px]"}`;
}

export function ChatPostFeed({ chatId, initialChatInfo }: { chatId: string; initialChatInfo: any }) {
  const { t } = useI18n();
  const router = useRouter();
  const token = getToken();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [chatInfo, setChatInfo] = useState<any>(initialChatInfo || null);
  const [posts, setPosts] = useState<any[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploadedMedia, setUploadedMedia] = useState<{ url: string; type: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [showInputActions, setShowInputActions] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState<number | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [cOffset, setCOffset] = useState(0);
  const [cHasMore, setCHasMore] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentParent, setCommentParent] = useState<number | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  // 📢 Меню поста (3 точки), реакции, ответ, редактирование
  const [messageMenuOpen, setMessageMenuOpen] = useState<number | null>(null);
  const [reactionPickerOpen, setReactionPickerOpen] = useState<number | null>(null);
  const [replyTo, setReplyTo] = useState<any>(null);
  const [editingPostId, setEditingPostId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  // Закрытие меню по клику вне
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-post-menu]") && !target.closest("[data-post-menu-button]")) {
        setMessageMenuOpen(null);
        setReactionPickerOpen(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fileRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const authFetch = (url: string, opts: any = {}) =>
    fetch(url, { ...opts, headers: { ...(opts.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });

  const loadChatInfo = async () => { try { const r = await authFetch(`${API}/api/chats/${chatId}`); if (r.ok) setChatInfo(await r.json()); } catch {} };
  const loadPosts = async (reset = false) => {
    const off = reset ? 0 : offset;
    const res = await authFetch(`${API}/api/chats/${chatId}/posts?offset=${off}&limit=${PAGE}`);
    if (res.ok) {
      const data: any[] = await res.json();
      // Backend отдаёт desc (новые первыми) → разворачиваем: старые сверху, новые снизу
      const asc = [...data].reverse();
      setPosts((p) => reset ? asc : [...asc, ...p]);
      setOffset(off + data.length);
      setHasMore(data.length === PAGE);
    }
    if (reset) setLoading(false);
  };
  // 📎 Загрузка файла → Cloudinary → media_url поста
  const onFiles = async (list: FileList | null) => {
    const f = list?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", f);
      const res = await authFetch(`${API}/api/media/upload`, { method: "POST", body: fd });
      if (res.ok) {
        const d = await res.json();
        setUploadedMedia({ url: d.url, type: d.media_type || "image" });
      } else alert("Не удалось загрузить файл");
    } catch { alert("Ошибка загрузки"); }
    setUploading(false);
  };
  const sendPost = async () => {
    if (sending) return;
    if (!text.trim() && !uploadedMedia && !linkUrl) return;
    setSending(true);
    const body = {
      text: text.trim() || null,
      media_url: uploadedMedia?.url || null,
      media_type: uploadedMedia?.type || null,
      link_url: linkUrl || null,
    };
    const res = await authFetch(`${API}/api/chats/${chatId}/posts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) {
      setText(""); setUploadedMedia(null); setLinkUrl(null); setFiles([]);
    }
    setSending(false);
  };
  const openComments = async (postId: number) => {
    setCommentsOpen(postId); setComments([]); setCOffset(0); setCommentText(""); setCommentParent(null);
    const res = await authFetch(`${API}/api/chats/posts/${postId}/comments?offset=0&limit=${PAGE}`);
    if (res.ok) { const d = await res.json(); setComments(d.comments); setCHasMore(d.has_more); setCOffset(d.limit); }
  };
  const loadMoreComments = async () => {
    const res = await authFetch(`${API}/api/chats/posts/${commentsOpen}/comments?offset=${cOffset}&limit=${PAGE}`);
    if (res.ok) { const d = await res.json(); setComments((p) => [...p, ...d.comments]); setCOffset(cOffset + d.comments.length); setCHasMore(d.has_more); }
  };
  const sendComment = async () => {
    if (!commentText.trim()) return;
    const res = await authFetch(`${API}/api/chats/posts/${commentsOpen}/comments`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: commentText.trim(), parent_id: commentParent || undefined }) });
    if (res.ok) { const d = await res.json(); const node = { ...d, author: currentUser, children: [], mine: true };
      setComments((prev) => { const last = prev[prev.length - 1]; if (commentParent && last && last.children) { last.children.push(node); return [...prev]; } return [...prev, node]; });
      setPosts((prev) => prev.map((p) => p.id === commentsOpen ? { ...p, comment_count: (p.comment_count || 0) + 1 } : p));
      setCommentText(""); setCommentParent(null); }
  };
  const deletePost = async (id: number) => { if (confirm("Удалить пост?")) await authFetch(`${API}/api/chats/posts/${id}`, { method: "DELETE" }); };
  const deleteComment = async (id: number) => { await authFetch(`${API}/api/chats/comments/${id}`, { method: "DELETE" }); };

  // 📢 Реакция на пост канала (toggle: бэкенд сам добавляет/удаляет)
  const toggleReaction = async (postId: number, emoji: string) => {
    const res = await authFetch(`${API}/api/chats/posts/${postId}/reactions`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji })
    });
    if (res.ok) {
      const d = await res.json();
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, reactions: d.reactions } : p));
      setReactionPickerOpen(null);
    }
  };
  const handleReply = (post: any) => {
    setReplyTo({ id: post.id, sender_name: post.author_name || chatInfo?.name || "Канал", text: post.text?.slice(0, 100) });
    setMessageMenuOpen(null);
  };
  const handlePin = async (postId: number) => {
    await authFetch(`${API}/api/chats/posts/${postId}/pin`, { method: "POST" });
    setMessageMenuOpen(null);
  };
  const handleDeletePost = async (postId: number) => {
    if (!confirm("Удалить пост?")) return;
    await authFetch(`${API}/api/chats/posts/${postId}`, { method: "DELETE" });
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    setMessageMenuOpen(null);
  };
  const handleCopyPostLink = (postId: number) => {
    try { navigator.clipboard?.writeText(`${location.origin}/messages/${chatId}?post=${postId}`); } catch {}
    setMessageMenuOpen(null);
  };

  const copyLink = (link: string) => { try { navigator.clipboard?.writeText(`${location.origin}${link}`); } catch {} alert("Ссылка скопирована"); };
  const makeInvite = async () => {
    const res = await authFetch(`${API}/api/chats/${chatId}/invite`, { method: "POST" });
    if (res.ok) { const d = await res.json(); setInviteLink(d.invite_link); copyLink(d.invite_link); } else { alert("Нет прав на создание приглашения"); }
  };
  const isModerator = chatInfo?.my_role === "owner" || chatInfo?.my_role === "admin";
  const isChannelAdminsOnly = chatInfo?.who_can_post === "admins";

  // WS realtime
  useWebSocket("new_chat_post", (data: any) => {
    if (String(data.chat_id) !== String(chatId)) return;
    // 📢 новые посты появляются СНИЗУ (как в чате)
    setPosts((prev) => prev.some((p) => p.id === data.id) ? prev : [...prev, { ...data, author: currentUser?.id === data.author_id ? currentUser : data.author, comment_count: 0, mine: data.author_id === currentUser?.id }]);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  });
  useWebSocket("chat_post_edited", (data: any) => setPosts((prev) => prev.map((p) => p.id === data.id ? { ...p, text: data.text, edited: true, edited_at: data.edited_at } : p)));
  useWebSocket("chat_post_deleted", (data: any) => setPosts((prev) => prev.filter((p) => p.id !== data.id)));
  useWebSocket("new_chat_comment", (data: any) => {
    if (String(data.chat_id) !== String(chatId) || !commentsOpen || commentsOpen !== data.post_id) return;
    const node = { ...data, author: currentUser?.id === data.author_id ? currentUser : data.author, children: [], mine: data.author_id === currentUser?.id };
    setComments((prev) => { const last = prev[prev.length - 1]; if (last && last.children) { last.children.push(node); return [...prev]; } return [...prev, node]; });
  });
  useWebSocket("chat_comment_deleted", (data: any) => {
    if (!commentsOpen || data.post_id !== commentsOpen) return;
    const rm = (arr: any[]): any[] => arr.filter((c) => { if (c.id === data.id) return false; c.children = rm(c.children || []); return true; });
    setComments((prev) => rm(prev));
  });
  // 📢 WS реакции на постах канала (realtime обновление)
  useWebSocket("post_reactions_updated", (data: any) => {
    if (String(data.chat_id) !== String(chatId)) return;
    setPosts((prev) => prev.map((p) => p.id === data.post_id ? { ...p, reactions: data.reactions } : p));
  });
  // 📢 WS закрепление постов канала
  useWebSocket("chat_post_pinned", (data: any) => {
    if (String(data.chat_id) !== String(chatId)) return;
    setPosts((prev) => prev.map((p) => p.id === data.post_id ? { ...p, pinned: data.pinned, pinned_by: data.pinned_by, pinned_at: data.pinned_at } : p));
  });
  useWebSocket("chat_settings_updated", (data: any) => {
    if (String(data.chat_id) !== String(chatId)) return;
    setChatInfo((prev: any) => ({ ...prev, name: data.name ?? prev?.name, avatar_url: data.avatar_url ?? prev?.avatar_url, who_can_post: data.who_can_post ?? prev?.who_can_post, who_can_comment: data.who_can_comment ?? prev?.who_can_comment }));
  });
  useWebSocket("group_member_added", (data: any) => { if (String(data.chat_id) === String(chatId)) loadChatInfo(); });
  useWebSocket("group_member_removed", (data: any) => { if (String(data.chat_id) === String(chatId)) loadChatInfo(); });

  useEffect(() => {
    authFetch(`${API}/api/me`).then((r) => (r.ok ? r.json() : null)).then((d) => d && setCurrentUser(d)).catch(() => {});
    loadPosts(true);
  }, []);
  useEffect(() => { loadChatInfo(); }, []);
  useEffect(() => { if (!loading) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [loading]);
  // 📢 Закрытие меню поста при клике вне (но не на кнопке меню и не на дропдауне/пикере)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-post-menu]") && !target.closest("[data-post-menu-btn]")) {
        setMessageMenuOpen(null);
        setReactionPickerOpen(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const canDeletePost = (p: any) => isModerator || p.author_id === currentUser?.id;

  return (
    <>
    <div className="h-screen flex overflow-hidden bg-paper dark:bg-[#111]">
      <Sidebar />
      <div className="w-px shrink-0 bg-gray-200 dark:bg-white/10 my-3 hidden md:block" />
      <main className="flex-1 flex flex-col border-l border-line dark:border-white/10 overflow-hidden">
        {/* Header */}
        <div className="border-b border-line dark:border-white/10 bg-paper dark:bg-[#171717]/95 backdrop-blur-md px-3 py-2.5 flex items-center gap-3 sticky top-0 z-20">
          <button onClick={() => { if (window.history.length > 1) router.back(); else router.push("/messages"); }} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-white/10">
            <X size={18} />
          </button>
          {chatInfo?.avatar_url ? (
            <Avatar src={chatInfo.avatar_url} name={chatInfo.name || "Группа"} size={36} />
          ) : (
            <div className="w-9 h-9 rounded-xl bg-gray-200 dark:bg-white/5 flex items-center justify-center shrink-0">
              <Users size={20} className="text-gray-500 dark:text-white/40" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="font-bold text-gray-800 dark:text-white truncate">{chatInfo?.name || t("messages.group")}</div>
            <div className="text-[10px] text-gray-500 dark:text-white/40">{chatInfo?.members_count} {t("messages.members2")} · {chatInfo?.who_can_post === "admins" ? t("messages.adminsOnlyPost") : t("messages.allMembersPost")}</div>
          </div>
          {isModerator && (
            <button onClick={() => setShowSettings(true)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-white/10" title={t("messages.groupSettings")}>
              <Settings size={18} />
            </button>
          )}
        </div>

        {inviteLink && (
          <div className="px-3 py-2 border-b border-line dark:border-white/10 bg-gray-100/50 dark:bg-white/5 flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-gray-600 dark:text-gray-300">{inviteLink}</span>
            <button onClick={() => { setInviteLink(null); }} className="text-gray-500 hover:text-gray-300">×</button>
          </div>
        )}
        {/* Posts list — пузыри, как в обычных чатах */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-3 md:p-4 space-y-1 overscroll-contain touch-pan-y" style={{ WebkitOverflowScrolling: "touch" }}>
          {loading && <div className="p-4 text-center text-sm text-gray-500">{t("common.loading")}</div>}
          {currentUser && posts.map((p) => {
            const isMine = p.author_id === currentUser?.id;
            const isModerator = chatInfo?.my_role === "owner" || chatInfo?.my_role === "admin";
            const canDelete = isMine || isModerator;
            const showAuthorSign = chatInfo?.show_author !== false;
            // 📢 Преобразуем реакции в формат MessageBubble: {emoji, me, count}
            const reactionsMap = new Map<string, { emoji: string; me: boolean; count: number }>();
            (p.reactions || []).forEach((r: any) => {
              const key = r.emoji;
              const existing = reactionsMap.get(key);
              if (existing) {
                existing.count++;
                if (r.user_id === currentUser?.id) existing.me = true;
              } else {
                reactionsMap.set(key, { emoji: r.emoji, me: r.user_id === currentUser?.id, count: 1 });
              }
            });
            const formattedReactions = Array.from(reactionsMap.values());

            const msg = {
              id: p.id,
              text: p.text,
              media_url: p.media_url,
              media_type: p.media_type,
              sender_id: p.author_id,
              sender_name: chatInfo?.name || "Канал",
              sender_avatar: chatInfo?.avatar_url,
              created_at: p.created_at,
              reactions: formattedReactions,
              reply_preview: null,
              read: true,
            };
            // 📢 Подпись автора (мелким серым) — показывается только если отличается от имени канала
            const authorSign = showAuthorSign && p.author?.display_name ? p.author.display_name : null;
            return (
              <div key={p.id} className="relative" data-post-menu={messageMenuOpen === p.id ? "open" : undefined}>
                <MessageBubble
                  msg={msg}
                  isMine={isMine}
                  isGroup={true}
                  isSecret={false}
                  isSelectMode={false}
                  isSelected={false}
                  isEditing={editingPostId === p.id}
                  editText={editText}
                  displayText={p.text || ""}
                  senderGlow={null}
                  isPinned={p.is_pinned}
                  authorName={authorSign}
                  chatId={chatId}
                  getMediaClasses={getMediaClasses}
                  extractFirstUrl={extractFirstUrl}
                  onEditChange={setEditText}
                  onSubmitEdit={() => {}}
                  onCancelEdit={() => { setEditingPostId(null); setEditText(""); }}
                  onSelect={() => {}}
                  onReply={() => handleReply(p)}
                  onContextMenu={(e) => e.preventDefault()}
                  onPointerDown={() => {}}
                  onPointerUp={() => {}}
                  onPointerLeave={() => {}}
                  onDoubleClick={() => handleReply(p)}
                  onReactionClick={() => setReactionPickerOpen(reactionPickerOpen === p.id ? null : p.id)}
                  onMenuClick={(e) => { e.stopPropagation(); setMessageMenuOpen(messageMenuOpen === p.id ? null : p.id); }}
                  data-post-menu-button
                  data-post-id={p.id}
                  onToggleReaction={(msgId, stickerId, emoji) => emoji && toggleReaction(msgId, emoji)}
                  activeMessageMenu={messageMenuOpen === p.id}
                  menuOpenUp={false}
                  onSwipeRight={() => handleReply(p)}
                />
                {/* 📢 Меню 3 точки (как в обычном чате) */}
                {messageMenuOpen === p.id && (
                  <div className={`absolute z-50 ${isMine ? "right-12" : "left-12"} mt-1`} data-post-menu="dropdown">
                    <div className="bg-white dark:bg-[#1e1e1e] border border-line dark:border-white/15 rounded-xl shadow-xl py-1 min-w-[180px]">
                      <button onClick={() => handleReply(p)} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-white/10 text-gray-700 dark:text-white/80">
                        <Reply size={14} /> Ответить
                      </button>
                      {isModerator && (
                        <button onClick={() => handlePin(p.id)} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-white/10 text-gray-700 dark:text-white/80">
                          <Pin size={14} /> {p.is_pinned ? "Открепить" : "Закрепить"}
                        </button>
                      )}
                      <button onClick={() => handleCopyPostLink(p.id)} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-white/10 text-gray-700 dark:text-white/80">
                        <Copy size={14} /> Копировать ссылку
                      </button>
                      {canDelete && (
                        <button onClick={() => handleDeletePost(p.id)} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-red-50 dark:hover:bg-red-500/10 text-red-600 dark:text-red-400">
                          <Trash2 size={14} /> Удалить
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {/* 📢 Пикер реакций */}
                {reactionPickerOpen === p.id && (
                  <div className={`absolute z-50 ${isMine ? "right-12" : "left-12"} mt-1`} data-post-menu="picker">
                    <ReactionPicker
                      onSelect={(emoji) => toggleReaction(p.id, emoji)}
                      onClose={() => setReactionPickerOpen(null)}
                    />
                  </div>
                )}
                {p.comment_count > 0 && (
                  <div className={`flex ${isMine ? "justify-end" : "justify-start"} px-1 -mt-0.5`}>
                    <button
                      onClick={() => openComments(p.id)}
                      className="flex items-center gap-1 px-2 py-1 rounded-full text-[13px] border bg-gray-100 dark:bg-white/5 border-line dark:border-white/15 hover:bg-gray-100 dark:hover:bg-white/10 transition-all active:scale-90"
                    >
                      <MessageSquare size={12} className="text-gray-500 dark:text-white/60" />
                      <span className="text-[11px] font-bold text-gray-600 dark:text-white/60">{p.comment_count}</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {!loading && posts.length === 0 && <div className="p-6 text-center text-sm text-gray-500">{t("common.noPosts")}</div>}
          {hasMore && posts.length > 0 && (
            <button onClick={() => loadPosts(false)} className="w-full py-3 text-center text-xs text-gray-500 hover:text-gray-300">
              {t("common.loadMore")}
            </button>
          )}
          <div ref={messagesEndRef} />
        </div>
        {/* Composer — идентичен одиночным чатам; скрыт у обычных участников, если постить могут только админы */}
        {(!isChannelAdminsOnly || isModerator) ? (
        <div className="relative z-30 p-3 sm:p-3 md:p-4 border-t border-line dark:border-white/10 bg-paper dark:bg-[#171717]/80 backdrop-blur-md">
          <div className="flex flex-col gap-0">
            {/* Плашка ссылки */}
            {linkUrl !== null && (
              <div className="flex items-center gap-2.5 px-3 py-2 mb-1.5 bg-[#8b5cf6]/10 border border-[#8b5cf6]/30 rounded-xl">
                <LinkIcon size={14} className="text-[#8b5cf6] shrink-0" />
                <input
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://..."
                  className="flex-1 min-w-0 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none"
                />
                <button onClick={() => setLinkUrl(null)} className="p-1 text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors shrink-0">
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Полоса вложений */}
            {uploadedMedia && (
              <div className="px-3 sm:px-3 py-2.5 mb-1.5 border border-line dark:border-white/15 rounded-xl bg-gray-100 dark:bg-white/5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] sm:text-xs font-bold text-gray-800 dark:text-white/70">
                    {uploading ? "Загрузка…" : "Вложение"}
                  </span>
                  <button onClick={() => setUploadedMedia(null)} className="text-[11px] sm:text-xs text-red-600 dark:text-red-400 px-2 py-1">
                    {t("messages.clear")}
                  </button>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-2 sm:-mx-3 px-2 sm:px-3">
                  <div className="relative group border border-line dark:border-white/15 rounded-lg overflow-hidden bg-gray-100 dark:bg-white/5 shrink-0">
                    {uploadedMedia.type === "video" ? (
                      <video src={mediaUrl(uploadedMedia.url)} muted className="w-16 h-16 sm:w-16 sm:h-16 md:w-20 md:h-20 object-cover" />
                    ) : uploadedMedia.type === "audio" ? (
                      <div className="w-16 h-16 sm:w-16 sm:h-16 md:w-20 md:h-20 flex items-center justify-center">🎵</div>
                    ) : (
                      <img src={mediaUrl(uploadedMedia.url)} alt="" className="w-16 h-16 sm:w-16 sm:h-16 md:w-20 md:h-20 object-cover" />
                    )}
                    <button
                      onClick={() => setUploadedMedia(null)}
                      className="absolute top-1 right-1 bg-red-500/90 text-white rounded-full p-1 active:scale-90"
                    >
                      <X size={10} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-end gap-2 sm:gap-2 w-full">
              <input ref={fileRef} type="file" accept="image/*,image/gif,video/*,audio/*" className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />

              {/* Кнопка "+" с выпадающим меню — как в одиночных чатах */}
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
                        onClick={() => { setLinkUrl(linkUrl ?? ""); setShowInputActions(false); }}
                        className="w-full px-4 py-3 text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-3 transition-colors border-t border-line dark:border-white/5"
                      >
                        <LinkIcon size={18} className="text-gray-600 dark:text-white/60" /> <span>Прикрепить ссылку</span>
                      </button>
                      <button
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          editorRef.current?.openMenuAt?.(rect.left + rect.width / 2, rect.top - 8);
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

              {/* Поле ввода — WYSIWYG, единый стиль с одиночными чатами */}
              <div className="relative flex-1 flex items-end">
                <div className="chat-input-shell flex-1 rounded-xl border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 overflow-hidden focus-within:border-[#8b5cf6] transition-all">
                  <RichEditor
                    ref={editorRef}
                    value={text}
                    onChange={(v: string) => setText(v)}
                    placeholder={t("messages.writePost")}
                    className="w-full bg-transparent text-gray-900 dark:text-white text-[15px] sm:text-sm md:text-base placeholder-gray-400 dark:placeholder-white/40 px-3 py-2.5 min-h-[48px] max-h-32 overflow-y-auto disabled:opacity-50 disabled:cursor-not-allowed leading-snug"
                    onKeyDown={(e: any) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendPost();
                      }
                    }}
                  />
                </div>
              </div>

              {/* Кнопка отправки */}
              <div className="relative shrink-0 flex items-end pb-1">
                <button
                  onClick={sendPost}
                  disabled={sending}
                  className="p-2.5 sm:p-2.5 md:p-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-all min-w-[44px] sm:min-w-[40px] md:min-w-[44px] min-h-[44px] sm:min-h-[40px] md:min-h-[44px] flex items-center justify-center active:scale-95 select-none touch-none border border-[#8b5cf6] bg-[#8b5cf6] text-white hover:bg-[#7c3aed]"
                >
                  <Send size={19} className="sm:w-[18px] sm:h-[18px]" />
                </button>
              </div>
            </div>
          </div>
        </div>
        ) : (
          <div className="border-t border-line dark:border-white/10 bg-paper dark:bg-[#171717]/95 p-3 text-center text-xs text-gray-500 dark:text-white/40">
            {t("messages.adminsOnlyPost")}
          </div>
        )}
      </main>
    </div>

    {/* Comments modal / drawer */}
    {commentsOpen && (
      <div className="fixed inset-0 z-[100] bg-black/40 flex items-end sm:items-center" onClick={() => setCommentsOpen(null)}>
        <div className="bg-paper dark:bg-[#171717] w-full sm:max-w-[480px] sm:rounded-t-2xl sm:mb-10 h-full sm:h-[520px] flex flex-col" onClick={(e) => e.stopPropagation()}>
          <div className="p-3 border-b border-line dark:border-white/10 flex items-center justify-between">
            <span className="font-medium text-sm">{t("messages.commentsTitle")}</span>
            <button onClick={() => setCommentsOpen(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-white/10"><X size={16} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {comments.map((c) => <CommentNode key={c.id} c={c} currentUser={currentUser} onDelete={deleteComment} onReply={(id) => setCommentParent(id)} />)}
            {cHasMore && <button onClick={loadMoreComments} className="text-xs text-gray-500">{t("common.loadMore")}</button>}
          </div>
          <div className="p-2 border-t border-line dark:border-white/10 flex items-end gap-2">
            {commentParent && (
              <div className="text-[10px] text-gray-500">Ответ на комментарий #{commentParent} · <button onClick={() => setCommentParent(null)}>×</button></div>
            )}
            <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)}
              placeholder={t("messages.commentPlaceholder")} rows={1}
              className="flex-1 text-sm bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 rounded-lg p-2 resize-none"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendComment(); } }} />
            <button onClick={sendComment} disabled={!commentText.trim()} className="p-1.5 rounded bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:opacity-40 text-white">
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    )}

        {showMembers && chatInfo && (
      <GroupMembersModal chatId={Number(chatId)} myRole={chatInfo.my_role} onClose={() => setShowMembers(false)} onChanged={loadChatInfo} />
    )}
    {showSettings && chatInfo && (
      <GroupSettingsModal chatId={Number(chatId)} chat={chatInfo} onClose={() => setShowSettings(false)} onUpdate={loadChatInfo} />
    )}
    </>
  );
}
