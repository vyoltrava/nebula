"use client";
import { STICKERS } from "@/lib/stickers";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Heart, MessageCircle, Send, Trash2, Shield, ShieldCheck, Ban, Flag, CornerDownRight, Reply, RefreshCw, Quote, Pencil, X, Radio } from "lucide-react";
import { getToken } from "@/lib/auth";
import { triggerFeedRefresh } from "@/lib/events";
import { safeFetch } from "@/lib/ban";
import { Avatar } from "@/components/Avatar";
import { mediaUrl } from "@/lib/media";
import { ReportModal } from "./ReportModal";
import { BookmarkButton } from "@/components/BookmarkButton";
import { isLikedCached, setLikedCache } from "@/lib/postCache";
import { getCachedUser } from "@/lib/authCache";
import { timeAgo } from "@/lib/time";
import { AudioPlayer } from "@/components/AudioPlayer";
import LinkPreview from "@/components/LinkPreview";
import { EchoModal } from "@/components/EchoModal"; // Импортируем модалку

function renderText(text: string) {
  if (!text) return null;
  const parts = text.split(/(https?:\/\/[^\s<>"]+|#[\wа-яёА-ЯЁ]+|@[\wа-яёА-ЯЁ]+|:[\w]+:)/g);
  return parts.map((part, i) => {
  if (part.startsWith("http://") || part.startsWith("https://")) {
    const clean = part.replace(/[.,;:!?)]+$/, "");
    const tail = part.slice(clean.length);
    return (
      <span key={i}>
        <a
          href={clean}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="font-semibold text-sky-300 hover:text-sky-200 underline underline-offset-2 break-all"
        >
          {clean}
        </a>
        {tail}
      </span>
    );
  }
  if (part.startsWith("#")) {
      return (
        <Link
          key={i}
          href={`/tag/${part.slice(1).toLowerCase()}`}
          className="font-bold text-[#8b5cf6] hover:text-[#8b5cf6] underline underline-offset-2"
        >
          {part}
        </Link>
      );
    }
    if (part.startsWith("@")) {
      const username = part.slice(1);
      return (
        <Link
          key={i}
          href={`/${username}`}
          className="font-bold text-pink-400 hover:text-pink-300 underline underline-offset-2"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </Link>
      );
    }
    if (part.startsWith(":") && part.endsWith(":")) {
      const sticker = STICKERS.find((s) => s.code === part);
      if (sticker) {
        return (
          <span key={i} className="inline-block text-3xl align-middle mx-0.5" title={sticker.label}>
            {sticker.emoji}
          </span>
        );
      }
    }
    return <span key={i}>{part}</span>;
  });
}

function extractFirstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"]+/);
  return m ? m[0].replace(/[.,;:!?)]+$/, "") : null;
}

function SmartMedia({ src, type, className }: { src: string; type?: string | null; className?: string }) {
  const [mediaKind, setMediaKind] = useState<"image" | "audio" | "video" | "loading">(() => {
    if (type === "audio") return "audio";
    if (type === "video") return "video";
    if (type === "image") return "image";
    if (src) {
      const clean = src.split("?")[0].toLowerCase();
      if (/\.(mp3|wav|ogg|m4a|aac)$/.test(clean)) return "audio";
      if (/\.(mp4|webm|mov)$/.test(clean)) return "video";
      if (/\.(jpg|jpeg|png|gif|webp)$/.test(clean)) return "image";
    }
    return "loading";
  });

  useEffect(() => {
    if (mediaKind !== "loading") return;
    const img = new Image();
    img.onload = () => setMediaKind("image");
    img.onerror = () => {
      const audio = new Audio();
      audio.onloadedmetadata = () => setMediaKind("audio");
      audio.onerror = () => setMediaKind("video");
      audio.src = src;
    };
    img.src = src;
  }, [src, mediaKind]);

  if (mediaKind === "audio") return <AudioPlayer src={src} />;
  if (mediaKind === "loading") return <div className="mt-2 h-16 w-full rounded-xl bg-white/5 animate-pulse" />;
  if (mediaKind === "video") return <video controls src={src} className={`mt-2 max-h-96 w-auto rounded-xl ${className || ""}`} />;
  return <img src={src} alt="" className={`mt-2 max-h-96 w-auto rounded-xl ${className || ""}`} />;
}

function getGlowColor(is_admin?: boolean, is_moderator?: boolean, role?: { name: string; color: string } | null): string | null {
  if (is_admin) return "#ffffff";
  if (is_moderator) return "#3b82f6";
  if (role) return role.color;
  return null;
}

function glowStyle(is_admin?: boolean, is_moderator?: boolean, role?: { name: string; color: string } | null): React.CSSProperties | undefined {
  const color = getGlowColor(is_admin, is_moderator, role);
  if (!color) return undefined;
  return {
    color,
    textShadow: `0 0 6px ${color}B3, 0 0 14px ${color}66`,
  };
}

function AuthorBadges({ is_admin, is_moderator, is_banned, role }: {
  is_admin?: boolean;
  is_moderator?: boolean;
  is_banned?: boolean;
  role?: { name: string; color: string } | null;
}) {
  return (
    <>
      {is_banned && (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[8px] font-black uppercase border border-red-500/30 shrink-0">
          <Ban size={8} /> BANNED
        </span>
      )}
    </>
  );
}

export function Post({
  id,
  author_id,
  author,
  handle,
  username,
  author_avatar,
  author_is_admin,
  author_is_moderator,
  author_is_banned,
  author_role,
  text,
  media_url,
  media_type,
  likes_count,
  liked_by_me,
  bookmarked,
  replies_count,
  created_at,
  views_count,
  showFullReplies = true,
  repost_of,
  is_repost,
  is_quote,
  isMainPost = false,
  externalReplies, 
}: {
  id: number;
  author_id: number;
  author: string;
  handle: string;
  username?: string;
  author_avatar?: string | null;
  author_is_admin?: boolean;
  author_is_moderator?: boolean;
  author_is_banned?: boolean;
  author_role?: { name: string; color: string } | null;
  text: string;
  media_url?: string | null;
  media_type?: string | null;
  likes_count: number;
  liked_by_me: boolean;
  bookmarked?: boolean;
  replies_count: number;
  created_at: string;
  views_count?: number;
  showFullReplies?: boolean;
  repost_of?: any;
  is_repost?: boolean;
  is_quote?: boolean;
  isMainPost?: boolean;
  externalReplies?: any[];
}) {
    const [currentUser] = useState(() => {
      const cached = getCachedUser();
      return cached 
        ? { id: cached.id, is_admin: cached.is_admin, is_moderator: cached.is_moderator } 
        : null;
    });

    const [myPermissions] = useState<string[]>(() => {
      const cached = getCachedUser();
      return cached?.permissions || [];
    });

    const [liked, setLiked] = useState<boolean>(() => {
      const cached = isLikedCached(id);
      if (cached !== undefined && cached !== null) return cached;
      return liked_by_me;
    });
    const [count, setCount] = useState(likes_count);
    useEffect(() => {
      setCount(likes_count);
    }, [likes_count]);
    const [rCount, setRCount] = useState(replies_count);
    const [replying, setReplying] = useState(false);
    const [replyText, setReplyText] = useState("");
    const [showReplies, setShowReplies] = useState(isMainPost);
    const [replies, setReplies] = useState<any[] | null>(externalReplies || null);
    const [following, setFollowing] = useState(false);
    const [showReport, setShowReport] = useState(false);
    const [editing, setEditing] = useState(false);
    const [editText, setEditText] = useState(text);
    const [displayText, setDisplayText] = useState(text);
    const [isEdited, setIsEdited] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);
    const [showEcho, setShowEcho] = useState(false); // Состояние для Эхо
    const router = useRouter();

  useEffect(() => {
    setDisplayText(text);
    setEditText(text);
  }, [text]);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/posts/${id}/view`, {
      method: "POST",
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    });
  }, [id]);

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d.post_id === id) setCount(d.likes_count);
    };
    window.addEventListener("like-sync", handler);
    return () => window.removeEventListener("like-sync", handler);
  }, [id]);

    const cleanUsername = username || handle?.replace("@", "");

    useEffect(() => {
      const token = getToken();
      if (!token) return;
      
      safeFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/${author_id}/is-following`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setFollowing(data.following);
        });
    }, [author_id]);

    useEffect(() => {
      const handler = (e: Event) => {
        const d = (e as CustomEvent).detail;
        if (d.post_id === id) {
          setLiked(d.liked);
          setLikedCache(id, d.liked);
        }
      };
      window.addEventListener("like-state-sync", handler);
      return () => window.removeEventListener("like-state-sync", handler);
    }, [id]);

    async function toggleLike() {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }

    const next = !liked;
    setLiked(next);
    setCount((c) => (next ? c + 1 : c - 1));
    setLikedCache(id, next);

    const res = await safeFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/posts/${id}/like`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const data = await res.json();
      if (data.liked !== next) {
        setLiked(data.liked);
        setCount((c) => (data.liked ? c + 1 : c - 1));
        setLikedCache(id, data.liked);
      }
    } else {
      setLiked(!next);
      setCount((c) => (next ? c - 1 : c + 1));
      setLikedCache(id, !next);
    }
  }

  const handlePostClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.closest("a") ||
      target.closest("button") ||
      target.closest("input") ||
      target.closest("textarea") ||
      target.closest("video") ||
      target.closest("audio") ||
      target.closest("img") ||
      target.closest("svg")
    ) {
      return;
    }
    router.push(`/post/${id}`);
  };

  async function toggleFollow(e: React.MouseEvent) {
    e.stopPropagation();
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    const res = await safeFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/${author_id}/follow`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setFollowing(data.following);
    }
  }

  async function loadReplies() {
    if (!showReplies) {
      const res = await safeFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/posts/${id}/replies`);
      if (res.ok) setReplies(await res.json());
    }
    setShowReplies(!showReplies);
  }

  function startReply(mentionUsername?: string, mentionDisplayName?: string) {
    setReplying(true);
    if (mentionUsername) {
      setReplyText(`@${mentionUsername} `);
    } else {
      setReplyText("");
    }
    setTimeout(() => {
      const input = document.querySelector(`[data-reply-input="${id}"]`) as HTMLInputElement;
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }, 50);
  }

  async function submitReply(replyToId: number = id) {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    if (!replyText.trim()) return;

    const form = new FormData();
    form.append("text", replyText);
    form.append("reply_to", String(replyToId));

    const res = await safeFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/posts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    if (res.ok) {
      setReplyText("");
      setReplying(false);
      setRCount((c) => c + 1);
      
      const r = await safeFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/posts/${id}/replies`);
      if (r.ok) setReplies(await r.json());
      setShowReplies(true);
      triggerFeedRefresh();
    }
  }

  async function saveEdit() {
    if (!editText.trim() || editText === displayText) {
      setEditing(false);
      return;
    }
    setSavingEdit(true);
    const token = getToken();
    if (!token) { setSavingEdit(false); router.push("/login"); return; }

    const form = new FormData();
    form.append("text", editText.trim());

    const res = await safeFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/posts/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    setSavingEdit(false);
    if (res.ok) {
      const data = await res.json();
      setDisplayText(data.text);
      setIsEdited(true);
      setEditing(false);
      triggerFeedRefresh();
    } else {
      try {
        const err = await res.json();
        alert(err.detail || "Не удалось сохранить");
      } catch {
        alert("Не удалось сохранить");
      }
    }
  }

  async function deletePost() {
    if (!confirm("Удалить пост?")) return;
    const token = getToken();
    if (!token) return;

    const url = myPermissions.includes("delete_posts")
      ? `${process.env.NEXT_PUBLIC_API_URL}/api/admin/posts/${id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/api/posts/${id}`;

    const res = await safeFetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res && res.ok) {
      window.dispatchEvent(new CustomEvent("post-deleted", { detail: { id } }));
    } else {
      alert("Не удалось удалить пост");
    }
  }

  // 🆕 ЕДИНАЯ ФУНКЦИЯ ДЛЯ РЕПОСТА И ЦИТАТЫ
  async function handleRepostOrQuote(postId: number) {
    const token = getToken();
    if (!token) { router.push("/login"); return; }
    
    const text = prompt("Добавить комментарий? (Оставьте пустым для обычного репоста)");
    if (text === null) return; // Пользователь нажал "Отмена"

    const form = new FormData();
    form.append("repost_of", String(postId));
    if (text.trim()) {
      form.append("text", text.trim());
    }

    const res = await safeFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/posts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    if (res.ok) {
      triggerFeedRefresh();
    } else {
      try {
        const err = await res.json();
        alert(err.detail || "Ошибка");
      } catch {
        alert("Ошибка");
      }
    }
  }

  async function handleCancelRepost(postId: number) {
    const token = getToken();
    if (!token) return;
    if (!confirm("Отменить репост?")) return;

    const res = await safeFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/posts/${postId}/repost`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      window.dispatchEvent(new CustomEvent("post-deleted", { detail: { id: postId } }));
      triggerFeedRefresh();
    } else {
      alert("Не удалось отменить репост");
    }
  }

  useEffect(() => {
    const cached = isLikedCached(id);
    if (cached !== undefined && cached !== null) {
      setLiked(cached);
    } else {
      setLiked(liked_by_me);
    }
  }, [liked_by_me, id]);

  const canDelete = currentUser?.id === author_id || myPermissions.includes("delete_posts");
  const canEdit = currentUser?.id === author_id || myPermissions.includes("edit_posts");

  return (
    <article 
      className="p-4 border-b border-white/10 hover:bg-white/5 transition-colors cursor-pointer"
      onClick={handlePostClick}
      >
      {is_repost && (
        <div className="flex items-center gap-2 text-xs text-white/50 ml-12 mb-1">
          <RefreshCw size={14} />
          <span>{author} репостнул(а)</span>
        </div>
      )}

      <div className="flex gap-3">
        <Link href={`/${cleanUsername}`} className="shrink-0">
          <Avatar src={author_avatar} name={author} id={author_id} />
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap text-sm min-w-0">
              <Link
                href={`/${cleanUsername}`}
                className={`font-bold transition-all ${
                  glowStyle(author_is_admin, author_is_moderator, author_role) ? "hover:opacity-80" : "text-white hover:text-[#8b5cf6]"
                }`}
                style={glowStyle(author_is_admin, author_is_moderator, author_role)}
              >
                {author}
              </Link>
              <AuthorBadges
                is_admin={author_is_admin}
                is_moderator={author_is_moderator}
                is_banned={author_is_banned}
                role={author_role}
              />
              <span className="font-normal text-white/50 flex items-center gap-1.5">
                {handle} {created_at ? `· ${timeAgo(created_at)}` : ""}
                {isEdited && <span className="text-white/40 text-[10px] italic">(ред.)</span>}
                
                {/* Карандаш (Редактировать) */}
                {canEdit && !is_repost && !editing && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditText(displayText);
                      setEditing(true);
                    }}
                    className="text-white/30 hover:text-blue-400 transition-colors"
                    title={currentUser?.id === author_id ? "Редактировать" : "Модераторское редактирование"}
                  >
                    <Pencil size={12} />
                  </button>
                )}
                
                {/* 🆕 Иконка Эхо (Рядом с карандашом) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowEcho(true);
                  }}
                  className="text-white/30 hover:text-purple-400 transition-colors"
                  title="Эхо поста (репосты и цитаты)"
                >
                  <Radio size={12} />
                </button>
              </span>
            </div>
            {currentUser?.id !== author_id && !is_repost && (
              <button
                onClick={toggleFollow}
                className={`text-xs font-bold px-3 py-1 rounded-full border transition-all shrink-0 ${
                  following
                    ? "border-[#8b5cf6] bg-[#8b5cf6] text-white"
                    : "border-white/20 text-white/70 hover:bg-white/10 hover:border-white/40 hover:text-white"
                }`}
              >
                {following ? "Читаю" : "Читать"}
              </button>
            )}
          </div>
          
          {is_quote && (
              <>
                <p className="mt-1 text-white/90 whitespace-pre-wrap break-words">{renderText(displayText)}</p>
                {extractFirstUrl(displayText) && <LinkPreview url={extractFirstUrl(displayText)!} />}
              </>
            )}
          
          {repost_of && !repost_of.deleted ? (
            <div className="mt-2 border border-white/10 rounded-xl p-3 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <Link href={`/${repost_of.handle?.replace("@", "")}`} onClick={(e) => e.stopPropagation()}>
                  <Avatar src={repost_of.author_avatar} name={repost_of.author} id={repost_of.author_id} size={24} />
                </Link>
                <Link href={`/${repost_of.handle?.replace("@", "")}`} className="font-semibold text-sm text-white hover:underline" onClick={(e) => e.stopPropagation()}>
                  {repost_of.author}
                </Link>
                <span className="text-sm text-white/40">{repost_of.handle}</span>
              </div>
              <p className="text-white/90 text-sm whitespace-pre-wrap break-words">{renderText(repost_of.text)}</p>
              {repost_of.media_url && (
                <SmartMedia 
                  src={mediaUrl(repost_of.media_url)} 
                  type={repost_of.media_type} 
                  className="max-h-60 rounded-lg border border-white/10" 
                />
              )}
            </div>
          ) : repost_of?.deleted ? (
            <div className="mt-2 border border-white/10 rounded-xl p-4 bg-white/[0.02] text-center text-white/40 text-sm italic">
              Оригинальный пост был удалён
            </div>
          ) : (
            <>
                {!is_quote && (
                  <>
                    <p className="mt-1 text-white/90 whitespace-pre-wrap break-words">{renderText(displayText)}</p>
                    {extractFirstUrl(displayText) && <LinkPreview url={extractFirstUrl(displayText)!} />}
                  </>
                )}
              {media_url && (
                <SmartMedia src={mediaUrl(media_url)} type={media_type} />
              )}
            </>
          )}

          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <button
              onClick={toggleLike}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full border transition-all ${
                liked
                  ? "border-pink-400/50 bg-[#8B5CF6] text-white"
                  : "border-white/20 text-white/70 hover:bg-white/10 hover:border-white/40 hover:text-white"
              }`}
            >
              <Heart size={16} fill={liked ? "currentColor" : "none"} />
              <span className="text-sm font-semibold">{count}</span>
            </button>
            <BookmarkButton postId={id} initial={bookmarked} />

            <button
              onClick={() => startReply(cleanUsername, author)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-white/20 text-white/70 hover:bg-white/10 hover:border-white/40 hover:text-white transition-all"
            >
              <Reply size={16} />
            </button>

            {/* 🆕 ЕДИНАЯ КНОПКА РЕПОСТА И ЦИТАТЫ */}
            {currentUser && currentUser.id !== author_id && !is_repost && !is_quote && (
              <button
                onClick={() => handleRepostOrQuote(id)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-white/20 text-white/70 hover:bg-emerald-500/10 hover:border-emerald-400/30 hover:text-emerald-400 transition-all"
                title="Репост / Цитата"
              >
                <RefreshCw size={16} />
              </button>
            )}

            {is_repost && currentUser?.id === author_id && (
              <button
                onClick={() => handleCancelRepost(id)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-red-400/30 text-red-400 hover:bg-red-500/10 hover:border-red-400/50 transition-all"
              >
                <RefreshCw size={16} />
                <span className="text-sm font-semibold">Отменить</span>
              </button>
            )}

            {currentUser?.id !== author_id && !is_repost && (
              <button
                onClick={() => setShowReport(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-white/20 text-white/60 hover:bg-white/10 hover:border-orange-400/30 hover:text-orange-400 transition-all"
                title="Пожаловаться на пост"
              >
                <Flag size={16} />
              </button>
            )}

            {canDelete && (
              <button
                onClick={deletePost}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-red-400/30 text-red-400 hover:bg-red-500/10 hover:border-red-400/50 transition-all"
              >
                <Trash2 size={16} />
                <span className="text-sm font-semibold">Удалить</span>
              </button>
            )}
            
            {views_count !== undefined && (
              <span className="text-sm text-white/40 flex items-center gap-1">
                👁 {views_count}
              </span>
            )}

            {rCount > 0 && !isMainPost && ( 
              <button
                onClick={loadReplies}
                className="text-sm font-semibold text-[#8b5cf6] hover:text-[#a78bfa] underline underline-offset-4 transition-colors"
              >
                {showReplies ? "Скрыть ответы" : `Ответы (${rCount})`}
              </button>
            )}
          </div>

          {replying && (
            <div className="mt-3 flex gap-2">
              <input
                data-reply-input={id}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submitReply(id);
                  }
                }}
                placeholder={`Ответ для ${author}...`}
                className="flex-1 border border-white/15 rounded-lg px-3 py-2 bg-white/5 text-white placeholder-white/40 focus:outline-none focus:border-[#8b5cf6] transition-all"
              />
              <button
                onClick={() => submitReply(id)}
                disabled={!replyText.trim()}
                className="border border-[#8b5cf6] bg-[#8b5cf6] text-white rounded-lg px-3 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <Send size={16} />
              </button>
              <button
                onClick={() => {
                  setReplying(false);
                  setReplyText("");
                }}
                className="border border-white/20 text-white/60 rounded-lg px-3 hover:bg-white/10 transition-all"
              >
                ✕
              </button>
            </div>
          )}

          {showReplies && replies && (
            <div className="mt-3 space-y-3">
              {replies
                .filter((r) => r.reply_to_id === id)
                .map((r) => (
                  <ReplyItem
                    key={r.id}
                    reply={r}
                    allReplies={replies}
                    postId={id}
                    onReply={startReply}
                    currentUser={currentUser}
                    myPermissions={myPermissions}
                    setReplies={setReplies}
                    onDelete={async () => {
                      const token = getToken();
                      if (!token) return;
                      const url = myPermissions.includes("delete_posts")
                        ? `${process.env.NEXT_PUBLIC_API_URL}/api/admin/posts/${r.id}`
                        : `${process.env.NEXT_PUBLIC_API_URL}/api/posts/${r.id}`;
                      await safeFetch(url, {
                        method: "DELETE",
                        headers: { Authorization: `Bearer ${token}` },
                      });
                      const res = await safeFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/posts/${id}/replies`);
                      if (res.ok) setReplies(await res.json());
                      setRCount((c) => Math.max(0, c - 1));
                      triggerFeedRefresh();
                    }}
                  />
                ))}
              {replies.filter((r) => r.reply_to_id === id).length === 0 && (
                <p className="text-sm text-white/50">Пока нет ответов</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 🔊 ЭХО-МОДАЛКА (Открывается по клику на иконку Radio) */}
      {showEcho && <EchoModal postId={id} onClose={() => setShowEcho(false)} />}

      {showReport && (
        <ReportModal
          targetType="post"
          targetId={id}
          onClose={() => setShowReport(false)}
        />
      )}

      {editing && (
        <>
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200]"
            onClick={(e) => { e.stopPropagation(); setEditing(false); }}
          />
          <div
            className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="w-full max-w-lg bg-[#1f1f23] border border-white/15 rounded-2xl shadow-2xl p-5 pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  <Pencil size={18} className="text-blue-400" />
                  {currentUser?.id === author_id ? "Редактировать пост" : "Модераторское редактирование"}
                </h2>
                <button
                  onClick={(e) => { e.stopPropagation(); setEditing(false); }}
                  className="text-white/60 hover:text-white p-1"
                >
                  <X size={18} />
                </button>
              </div>

              {currentUser?.id !== author_id && (
                <div className="mb-3 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-xs">
                  ⚠️ Вы редактируете чужой пост как модератор. Автор получит уведомление.
                </div>
              )}

              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    saveEdit();
                  }
                }}
                rows={5}
                placeholder="Текст поста..."
                className="w-full px-3 py-2 rounded-lg border border-white/15 bg-white/5 text-white placeholder-white/40 focus:outline-none focus:border-blue-400 resize-none"
                autoFocus
              />

              <div className="flex items-center justify-between mt-3 text-xs text-white/40">
                <span>Ctrl+Enter — сохранить</span>
                <span>{editText.length} символов</span>
              </div>

              <div className="flex gap-2 mt-4">
                <button
                  onClick={(e) => { e.stopPropagation(); saveEdit(); }}
                  disabled={!editText.trim() || editText === displayText || savingEdit}
                  className="flex-1 py-2.5 rounded-lg bg-blue-500 text-white font-bold hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {savingEdit ? "Сохранение..." : "Сохранить"}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setEditing(false); }}
                  className="px-5 py-2.5 rounded-lg border border-white/20 text-white/80 font-bold hover:bg-white/10 transition-all"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </article>
  );
}

// 🆕 Компонент отдельного ответа (рекурсивный)
function ReplyItem({
  reply,
  allReplies,
  postId,
  onReply,
  currentUser,
  myPermissions,
  onDelete,
  setReplies,
  depth = 0,
}: {
  reply: any;
  allReplies: any[];
  postId: number;
  onReply: (username: string, displayName: string) => void;
  currentUser: { id: number } | null;
  myPermissions: string[];
  onDelete: () => void;
  setReplies: React.Dispatch<React.SetStateAction<any[] | null>>;
  depth?: number;
}) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [showChildren, setShowChildren] = useState(true);

  const children = allReplies.filter((r) => r.reply_to_id === reply.id);

  async function submitNestedReply() {
    const token = getToken();
    if (!token || !replyText.trim()) return;

    const form = new FormData();
    form.append("text", replyText);
    form.append("reply_to", String(reply.id));

    const res = await safeFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/posts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    if (res.ok) {
      setReplyText("");
      setShowReplyForm(false);
      const r = await safeFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/posts/${postId}/replies`);
      if (r.ok) {
        const newReplies = await r.json();
        setReplies(newReplies);
      }
      triggerFeedRefresh();
    }
  }

  const canDelete = currentUser?.id === reply.author_id || myPermissions.includes("delete_posts");
  const maxDepth = 3;

  return (
    <div
      className={`text-sm ${depth > 0 ? "ml-6 pl-4 border-l-2 border-purple-400/20" : ""}`}
    >
      <div className="flex gap-2">
        <Link href={`/user/${reply.username}`} className="shrink-0">
          <Avatar src={reply.author_avatar} name={reply.author} id={reply.author_id} size={28} />
        </Link>

        <div className="flex-1 min-w-0">
          {reply.parent && (
            <div className="flex items-center gap-1.5 text-xs text-white/40 mb-1">
              <CornerDownRight size={12} />
              <span>в ответ на</span>
              <Link
                href={`/${reply.parent.author_username}`}
                className="text-pink-400 hover:text-pink-300 font-semibold"
              >
                {reply.parent.author_name}
              </Link>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/user/${reply.username}`}
              className={`font-bold text-sm ${
                glowStyle(reply.author_is_admin, reply.author_is_moderator, reply.author_role)
                  ? "hover:opacity-80"
                  : "text-white hover:text-[#8b5cf6]"
              }`}
              style={glowStyle(reply.author_is_admin, reply.author_is_moderator, reply.author_role)}
            >
              {reply.author}
            </Link>
            <AuthorBadges
              is_admin={reply.author_is_admin}
              is_moderator={reply.author_is_moderator}
              is_banned={reply.author_is_banned}
              role={reply.author_role}
            />
            <span className="font-normal text-white/40 text-xs">{reply.handle}</span>
          </div>
          
          <p className="text-white/85 whitespace-pre-wrap break-words mt-0.5">{renderText(reply.text)}</p>
          
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <button
                onClick={() => {
                  setShowReplyForm(true);
                  setReplyText(`@${reply.username} `);
                }}
                className="text-xs text-white/50 hover:text-white flex items-center gap-1 transition-colors"
              >
              <Reply size={12} />
              Ответить
            </button>
            
            {canDelete && (
              <button
                onClick={onDelete}
                className="text-xs text-red-400/60 hover:text-red-400 flex items-center gap-1 transition-colors"
              >
                <Trash2 size={12} />
                Удалить
              </button>
            )}

            {children.length > 0 && (
              <button
                onClick={() => setShowChildren(!showChildren)}
                className="text-xs text-[#8b5cf6] hover:text-[#a78bfa] transition-colors"
              >
                {showChildren ? `Скрыть (${children.length})` : `Показать ответы (${children.length})`}
              </button>
            )}
          </div>

          {showReplyForm && (
            <div className="mt-2 flex gap-2">
              <input
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submitNestedReply();
                  }
                }}
                placeholder={`Ответ для ${reply.author}...`}
                className="flex-1 border border-white/15 rounded-lg px-2.5 py-1.5 bg-white/5 text-white text-sm placeholder-white/40 focus:outline-none focus:border-[#8b5cf6] transition-all"
                autoFocus
              />
              <button
                onClick={submitNestedReply}
                disabled={!replyText.trim()}
                className="border border-[#8b5cf6] bg-[#8b5cf6] text-white rounded-lg px-2.5 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <Send size={14} />
              </button>
              <button
                onClick={() => {
                  setShowReplyForm(false);
                  setReplyText("");
                }}
                className="border border-white/20 text-white/60 rounded-lg px-2.5 hover:bg-white/10 transition-all text-sm"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </div>

      {showChildren && children.length > 0 && depth < maxDepth && (
        <div className="mt-2 space-y-2">
          {children.map((child) => (
            <ReplyItem
              key={child.id}
              reply={child}
              allReplies={allReplies}
              postId={postId}
              onReply={onReply}
              currentUser={currentUser}
              myPermissions={myPermissions}
              setReplies={setReplies}
              onDelete={async () => {
                const token = getToken();
                if (!token) return;
                const url = myPermissions.includes("delete_posts")
                  ? `${process.env.NEXT_PUBLIC_API_URL}/api/admin/posts/${child.id}`
                  : `${process.env.NEXT_PUBLIC_API_URL}/api/posts/${child.id}`;
                await safeFetch(url, {
                  method: "DELETE",
                  headers: { Authorization: `Bearer ${token}` },
                });
                const r = await safeFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/posts/${postId}/replies`);
                if (r.ok) {
                  setReplies(await r.json());
                }
                triggerFeedRefresh();
              }}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}