"use client";
import { useTheme } from "next-themes";
import { resolveNickColor } from "@/lib/nickGlow";
import { STICKERS } from "@/lib/stickers";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Heart, HeartCrack, MessageCircle, Send, Trash2, Shield, ShieldCheck, Ban, Flag, CornerDownRight, Reply, RefreshCw, Quote, Pencil, Radio, Eye, SmilePlus, X, Lock } from "lucide-react";
import { getToken } from "@/lib/auth";
import { triggerFeedRefresh } from "@/lib/events";
import { safeFetch } from "@/lib/ban";
import { Avatar } from "@/components/Avatar";
import { mediaUrl } from "@/lib/media";
import { ReportModal } from "./ReportModal";
import { BookmarkButton } from "@/components/BookmarkButton";
import { isLikedCached, setLikedCache } from "@/lib/postCache";
import { getCachedFollow, setCachedFollow } from "@/lib/followCache";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { getCachedUser } from "@/lib/authCache";
import { timeAgo } from "@/lib/time";
import { AudioPlayer } from "@/components/AudioPlayer";
import LinkPreview from "@/components/LinkPreview";
import { EchoModal } from "@/components/EchoModal";
import { useQuickPostReaction } from "@/lib/useQuickReaction";
import dynamic from "next/dynamic";

// 🚀 react-markdown тяжёлый — ленивая загрузка
const MarkdownRenderer = dynamic(() => import("@/components/MarkdownRenderer").then(m => m.MarkdownRenderer), {
  ssr: false,
  loading: () => <div className="editor-loading animate-pulse text-sm opacity-50">📝 …</div>,
});


function extractFirstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"]+/);
  return m ? m[0].replace(/[.,;:!?)]+$/, "") : null;
}

// 📱 Компактное время для мобильной шапки поста:
// если пост выложен сегодня — только HH:MM (без «сегодня в …»), иначе обычный timeAgo
function shortPostTime(date: string | Date | undefined): string {
  if (!date) return "";
  let d: Date;
  if (typeof date === "string" && !date.endsWith("Z") && !date.includes("+")) d = new Date(date + "Z");
  else d = new Date(date);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }
  return timeAgo(date);
}

// 🚀 Кэш паков реакций на посты (один запрос на всё приложение)
let _prPacksCache: any[] | null = null;
let _prPacksPromise: Promise<any[]> | null = null;
function fetchPostReactionPacks(): Promise<any[]> {
  if (_prPacksCache) return Promise.resolve(_prPacksCache);
  if (!_prPacksPromise) {
    const token = getToken();
    _prPacksPromise = fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/post-reactions`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        _prPacksCache = Array.isArray(d) ? d : [];
        return _prPacksCache;
      })
      .catch(() => {
        _prPacksPromise = null;
        return [];
      });
  }
  return _prPacksPromise;
}
function invalidatePostReactionPacks() {
  _prPacksCache = null;
  _prPacksPromise = null;
}
// Стикеры могут приходить относительным путём — приводим к полному URL
function reactionImgSrc(content: string): string {
  if (!content) return content;
  if (content.startsWith("http") || content.startsWith("data:") || content.startsWith("blob:")) return content;
  return mediaUrl(content);
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
  if (mediaKind === "loading") return <div className="mt-2 h-16 w-full rounded-xl bg-gray-100 dark:bg-white/5 animate-pulse" />;
  if (mediaKind === "video") return <video controls src={src} className={`mt-2 max-h-96 w-auto rounded-xl ${className || ""}`} />;
  return <img src={src} alt="" className={`mt-2 max-h-96 w-auto rounded-xl ${className || ""}`} />;
}

function getGlowColor(is_admin?: boolean, is_moderator?: boolean, role?: { name: string; color: string; level?: number } | null): string | null {
  if (role?.color && (role?.level ?? 0) >= 8) return role.color; // 🆕 роль 8-11 перекрывает флаги
  if (is_admin) return "#ffffff";
  if (is_moderator) return "#3b82f6";
  if (role) return role.color;
  return null;
}

function glowStyle(is_admin?: boolean, is_moderator?: boolean, role?: { name: string; color: string } | null, theme?: string): React.CSSProperties | undefined {
  const color = resolveNickColor(getGlowColor(is_admin, is_moderator, role), theme);
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
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-500/20 text-red-600 dark:text-red-400 text-[8px] font-black uppercase border border-red-500/30 shrink-0">
          <Ban size={8} /> BANNED
        </span>
      )}
    </>
  );
}

// 🆕 Инлайн-редактор поста — «лист тетради» на пожелтевшей бумаге.
// Рендерится прямо внутри карточки поста на месте текста (никаких модалок).
function InlinePostEditor({
  value,
  onChange,
  onSave,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Автофокус + курсор в конец текста
  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, []);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          onSave();
        }
      }}
      onClick={(e) => e.stopPropagation()}
      rows={6}
      placeholder={placeholder}
      className="post-inline-editor mt-1 block w-full resize-y"
    />
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
  dislikes_count,
  disliked_by_me,
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
  liked_by_me?: boolean;
  dislikes_count?: number;
  disliked_by_me?: boolean;
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
    const { resolvedTheme } = useTheme();
    const currentUserRaw = getCachedUser();
    const currentUser = currentUserRaw
      ? { 
          id: currentUserRaw.id, 
          is_admin: currentUserRaw.is_admin, 
          is_moderator: currentUserRaw.is_moderator 
        }
      : null;

    const myPermissions = currentUserRaw?.permissions || [];

    const [liked, setLiked] = useState<boolean>(() => {
      if (liked_by_me === true) return true;
      return isLikedCached(id) || false;
    });

    useEffect(() => {
      // При смене аккаунта / изменении liked_by_me синхронизируем локальный стейт
      if (liked_by_me === true) {
        setLiked(true);
        setLikedCache(id, true);
      } else if (liked_by_me === false) {
        setLiked(false);
        setLikedCache(id, false);
      }
    }, [id, liked_by_me]);

    const [disliked, setDisliked] = useState<boolean>(disliked_by_me === true);
    useEffect(() => {
      setDisliked(disliked_by_me === true);
    }, [id, disliked_by_me]);

    const [dislikeCount, setDislikeCount] = useState(dislikes_count ?? 0);
    useEffect(() => {
      setDislikeCount(dislikes_count ?? 0);
    }, [dislikes_count]);


    const [count, setCount] = useState(likes_count ?? 0);
    useEffect(() => {
      setCount(likes_count ?? 0);
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
    // 🆕 Реакции на посты (одна реакция на юзера)
    const [postReactions, setPostReactions] = useState<any[]>([]);
    const [reactionModal, setReactionModal] = useState<"pick" | "stats" | null>(null);
    const [reactionPacks, setReactionPacks] = useState<any[]>([]);
    const [reactionPackTab, setReactionPackTab] = useState(0);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const suppressClickRef = useRef(false);
    const { reaction: quickPostReaction } = useQuickPostReaction();
    const router = useRouter();
    const { t } = useI18n();

  useEffect(() => {
    setDisplayText(text);
    setEditText(text);
  }, [text]);

// 🔥 Оптимизация: view отправляем только на странице поста или при реальной видимости
useEffect(() => {
  if (isMainPost) {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/posts/${id}/view`, {
      method: "POST",
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    });
    return;
  }
  
  // Для ленты — IntersectionObserver (view только когда пост реально виден)
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/posts/${id}/view`, {
            method: "POST",
            headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
          });
          observer.disconnect();
        }
      });
    },
    { threshold: 0.5 }
  );

  const el = document.querySelector(`[data-post-id="${id}"]`);
  if (el) observer.observe(el);

  return () => observer.disconnect();
}, [id, isMainPost]);

useEffect(() => {
  const handler = (e: Event) => {
    const d = (e as CustomEvent).detail;
    if (d.post_id === id) {
      // 🛡️ Защита от отрицательных значений и undefined
      setCount(Math.max(0, d.likes_count ?? 0));
      if (d.dislikes_count !== undefined) setDislikeCount(Math.max(0, d.dislikes_count));
      if (d.liked !== undefined) setLiked(!!d.liked);
      if (d.disliked !== undefined) setDisliked(!!d.disliked);
    }
  };
  window.addEventListener("like-sync", handler);
  return () => window.removeEventListener("like-sync", handler);
}, [id]);

    const cleanUsername = username || handle?.replace("@", "");

    useEffect(() => {
      // 🔥 Проверяем кеш сначала
      const cached = getCachedFollow(author_id);
      if (cached !== null) {
        setFollowing(cached);
        return;
      }

      const token = getToken();
      if (!token) return;
      
      safeFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/${author_id}/is-following`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) {
            setFollowing(data.following);
            setCachedFollow(author_id, data.following);
          }
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

    useEffect(() => {
      const handler = (e: Event) => {
        const d = (e as CustomEvent).detail;
        if (d.post_id === id) {
          setDislikeCount(Math.max(0, d.dislikes_count ?? 0));
          if (d.likes_count !== undefined) setCount(Math.max(0, d.likes_count));
          if (d.liked !== undefined) setLiked(!!d.liked);
          if (d.disliked !== undefined) setDisliked(!!d.disliked);
        }
      };
      window.addEventListener("dislike-sync", handler);
      return () => window.removeEventListener("dislike-sync", handler);
    }, [id]);

    useEffect(() => {
      const handler = (e: Event) => {
        const d = (e as CustomEvent).detail;
        if (d.post_id === id) {
          setDisliked(d.disliked);
        }
      };
      window.addEventListener("dislike-state-sync", handler);
      return () => window.removeEventListener("dislike-state-sync", handler);
    }, [id]);

  // ===== 🆕 РЕАКЦИИ НА ПОСТЫ =====
  async function loadPostReactions() {
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/posts/${id}/reactions`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setPostReactions(Array.isArray(data.reactions) ? data.reactions : []);
      }
    } catch {}
  }

  useEffect(() => { loadPostReactions(); }, [id]);

  // 🚀 Живая синхронизация реакций через WebSocket (reaction-sync ← post_reaction)
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d.post_id === id && Array.isArray(d.reactions)) {
        setPostReactions(d.reactions);
      }
    };
    window.addEventListener("reaction-sync", handler);
    return () => window.removeEventListener("reaction-sync", handler);
  }, [id]);

  // 🚀 Паки реакций кешируются на уровне модуля — один запрос на всё приложение, модалка открывается мгновенно
  useEffect(() => {
    fetchPostReactionPacks().then((packs) => setReactionPacks(packs));
  }, []);

  const myReaction = postReactions.find((r) => r.mine) || null;
  const totalReactions = postReactions.reduce((acc, r) => acc + (r.count || 0), 0);

  async function togglePostReaction(r: { type: string; content: string; sticker_id?: number | null }) {
    const token = getToken();
    if (!token) { router.push("/login"); return; }
    const form = new FormData();
    if (r.type === "sticker" && r.sticker_id) form.append("sticker_id", String(r.sticker_id));
    else if (r.type === "emoji") form.append("emoji", r.content);
    try {
      const res = await safeFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/posts/${id}/reactions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.ok) {
        const data = await res.json();
        setPostReactions(Array.isArray(data.reactions) ? data.reactions : []);
      } else if (res.status === 403) {
        // Реакция могла быть отключена админом — обновляем доступные паки
        invalidatePostReactionPacks();
        fetchPostReactionPacks().then((packs) => setReactionPacks(packs));
      }
    } catch {}
  }

  // Одиночный клик → модалка выбора реакции. Двойной клик/тап → быстрая реакция.
  function handleReactionClick() {
    if (!getToken()) { router.push("/login"); return; }
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    if (clickTimerRef.current) {
      // второй клик — быстрая реакция
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      if (quickPostReaction) {
        togglePostReaction({ type: quickPostReaction.type, content: quickPostReaction.content, sticker_id: quickPostReaction.stickerId ?? null });
      } else {
        setReactionModal("pick");
      }
      return;
    }
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      setReactionModal("pick");
    }, 260);
  }

  // Правый клик / удержание → модалка со всеми выставленными реакциями и их числом
  function openReactionStats() {
    suppressClickRef.current = true;
    setReactionModal("stats");
  }

  function startReactionLongPress() {
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      openReactionStats();
    }, 450);
  }
  function cancelReactionLongPress() {
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
  }

// Было:
// setCount((c) => (next ? c + 1 : c - 1));

async function toggleLike() {
  const token = getToken();
  if (!token) {
    router.push("/login");
    return;
  }

  const next = !liked;
  setLiked(next);
  setCount((c) => Math.max(0, next ? (c ?? 0) + 1 : (c ?? 0) - 1));
  setLikedCache(id, next); // ← РАСКОММЕНТИРОВАТЬ, пишем сразу
  // Взаимное исключение: при лайке снимаем дизлайк
  if (next && disliked) {
    setDisliked(false);
    setDislikeCount((c) => Math.max(0, (c ?? 0) - 1));
  }

  const res = await safeFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/posts/${id}/like`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.ok) {
    const data = await res.json();
    setLiked(data.liked);
    if (data.likes_count !== undefined) setCount(data.likes_count);
    if (data.dislikes_count !== undefined) setDislikeCount(Math.max(0, data.dislikes_count));
    if (data.disliked !== undefined) setDisliked(!!data.disliked);
    setLikedCache(id, data.liked);
    
    // 🔄 Глобальная синхронизация для других компонентов (профиль, лента)
    window.dispatchEvent(new CustomEvent("like-sync", { detail: { post_id: id, ...data } }));
    window.dispatchEvent(new CustomEvent("like-state-sync", { detail: { post_id: id, liked: data.liked } }));
    if (data.disliked !== undefined) {
      window.dispatchEvent(new CustomEvent("dislike-state-sync", { detail: { post_id: id, disliked: data.disliked } }));
    }
  } else {
    setLiked(!next);
    setCount((c) => Math.max(0, next ? (c ?? 0) - 1 : (c ?? 0) + 1));
    setLikedCache(id, !next); // откат кэша
    if (next && disliked) {
      setDisliked(true);
      setDislikeCount((c) => (c ?? 0) + 1);
    }
  }
}

async function toggleDislike() {
  const token = getToken();
  if (!token) {
    router.push("/login");
    return;
  }

  const next = !disliked;
  setDisliked(next);
  setDislikeCount((c) => Math.max(0, next ? (c ?? 0) + 1 : (c ?? 0) - 1));
  // Взаимное исключение: при дизлайке снимаем лайк
  if (next && liked) {
    setLiked(false);
    setCount((c) => Math.max(0, (c ?? 0) - 1));
    setLikedCache(id, false);
  }

  const res = await safeFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/posts/${id}/dislike`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.ok) {
    const data = await res.json();
    setDisliked(data.disliked);
    if (data.dislikes_count !== undefined) setDislikeCount(Math.max(0, data.dislikes_count));
    if (data.likes_count !== undefined) setCount(Math.max(0, data.likes_count));
    if (data.liked !== undefined) {
      setLiked(!!data.liked);
      setLikedCache(id, !!data.liked);
    }
    
    
    // 🔄 Глобальная синхронизация для других компонентов (профиль, лента)
    window.dispatchEvent(new CustomEvent("dislike-sync", { detail: { post_id: id, ...data } }));
    window.dispatchEvent(new CustomEvent("dislike-state-sync", { detail: { post_id: id, disliked: data.disliked } }));
    if (data.liked !== undefined) {
      window.dispatchEvent(new CustomEvent("like-state-sync", { detail: { post_id: id, liked: data.liked } }));
    }
  } else {
    setDisliked(!next);
    setDislikeCount((c) => Math.max(0, next ? (c ?? 0) - 1 : (c ?? 0) + 1));
    if (next && liked) {
      setLiked(true);
      setCount((c) => (c ?? 0) + 1);
      setLikedCache(id, true);
    }
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
    
    const next = !following;
    setFollowing(next);
    setCachedFollow(author_id, next);

    const res = await safeFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/${author_id}/follow`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    
    if (res.ok) {
      const data = await res.json();
      setFollowing(data.following);
      setCachedFollow(author_id, data.following);
    } else {
      // Откат
      setFollowing(!next);
      setCachedFollow(author_id, !next);
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
        alert(err.detail || t("post.saveFailed"));
      } catch {
        alert(t("post.saveFailed"));
      }
    }
  }

  async function deletePost() {
    if (!confirm(t("post.deleteConfirm"))) return;
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
      alert(t("post.deleteFailed"));
    }
  }

  // 🆕 ЕДИНАЯ ФУНКЦИЯ ДЛЯ РЕПОСТА И ЦИТАТЫ
  async function handleRepostOrQuote(postId: number) {
    const token = getToken();
    if (!token) { router.push("/login"); return; }
    
    const text = prompt(t("post.quotePrompt"));
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
        alert(err.detail || t("common.error"));
      } catch {
        alert(t("common.error"));
      }
    }
  }

  async function handleCancelRepost(postId: number) {
    const token = getToken();
    if (!token) return;
    if (!confirm(t("post.undoRepostConfirm"))) return;

    const res = await safeFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/posts/${postId}/repost`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      window.dispatchEvent(new CustomEvent("post-deleted", { detail: { id: postId } }));
      triggerFeedRefresh();
    } else {
      alert(t("post.undoRepostFailed"));
    }
  }


const canDelete = currentUser && String(currentUser.id) === String(author_id) || myPermissions.includes("delete_posts");
const canEdit = currentUser && String(currentUser.id) === String(author_id) || myPermissions.includes("edit_posts");

  return (
    <article 
      className={`p-4 transition-colors cursor-pointer ${
        editing
          ? "post-editing rounded-xl border-2 border-[#8b5cf6] shadow-[0_0_0_1px_rgba(139,92,246,0.2)] bg-ivory dark:bg-[#1f1f23]"
          : "border-b border-line dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/5"
      }`}
      onClick={handlePostClick}
      >
      {is_repost && (
        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-white/50 ml-12 mb-1">
          <RefreshCw size={14} />
          <span>{author} {t("post.repostedBy")}</span>
        </div>
      )}

      <div className="flex gap-3">
        <Link href={`/${cleanUsername}`} className="shrink-0">
          <Avatar src={author_avatar} name={author} id={author_id} />
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            {/* Ник + бейджи + кнопки действий (эхо / жалоба / редактировать) — в одном ряду */}
            <div className="flex items-center gap-1.5 flex-wrap text-sm min-w-0">
              <Link
                href={`/${cleanUsername}`}
                className={`font-bold transition-all ${
                  glowStyle(author_is_admin, author_is_moderator, author_role, resolvedTheme) ? "hover:opacity-80" : "text-gray-900 dark:text-white hover:text-[#8b5cf6]"
                }`}
                style={glowStyle(author_is_admin, author_is_moderator, author_role, resolvedTheme)}
              >
                {author}
              </Link>
              <AuthorBadges
                is_admin={author_is_admin}
                is_moderator={author_is_moderator}
                is_banned={author_is_banned}
                role={author_role}
              />

              {/* Иконка Эхо */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowEcho(true);
                }}
                className="text-gray-400 dark:text-white/30 hover:text-purple-600 dark:hover:text-purple-400 transition-colors p-1 -m-1 rounded-full hover:bg-purple-400/10 active:scale-95"
                title={t("post.echo")}
              >
                <Radio size={15} />
              </button>

              {/* Жалоба на пост */}
              {currentUser?.id !== author_id && !is_repost && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowReport(true);
                  }}
                  className="text-gray-400 dark:text-white/30 hover:text-orange-600 dark:hover:text-orange-400 transition-colors p-1 -m-1 rounded-full hover:bg-orange-400/10 active:scale-95"
                  title={t("post.report")}
                >
                  <Flag size={15} />
                </button>
              )}

              {/* Карандаш (Редактировать) */}
              {canEdit && !is_repost && !editing && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditText(displayText);
                    setEditing(true);
                  }}
                  className="text-gray-500 dark:text-white/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors p-1 -m-1 rounded-full hover:bg-blue-400/10 active:scale-95"
                  title={currentUser?.id === author_id ? t("post.edit") : t("post.modEdit")}
                >
                  <Pencil size={15} />
                </button>
              )}
            </div>
            {currentUser?.id !== author_id && !is_repost && (
              <button
                onClick={toggleFollow}
                className={`text-[11px] sm:text-xs font-bold px-2 sm:px-3 py-0.5 sm:py-1 rounded-full border transition-all shrink-0 ${
                  following
                    ? "border-[#8b5cf6] bg-[#8b5cf6] text-white"
                    : "border-line dark:border-white/20 text-gray-800 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/10 hover:border-gray-300 dark:hover:border-white/40 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                {following ? t("post.following") : t("post.follow")}
              </button>
            )}
          </div>

          {/* Хэндл + дата — отдельной строкой под никами.
              📱 На телефоне для сегодняшних постов показываем только время (без «сегодня в …»). */}
          <div className="text-xs font-normal text-gray-600 dark:text-white/50 flex items-center gap-1.5 flex-wrap mt-0.5 leading-tight">
            {handle}
            {created_at && (
              <>
                <span>·</span>
                <span className="hidden sm:inline">{timeAgo(created_at)}</span>
                <span className="sm:hidden">{shortPostTime(created_at)}</span>
              </>
            )}
            {isEdited && <span className="text-gray-500 dark:text-white/40 text-[10px] italic">{t("post.edited")}</span>}
          </div>
          
          {/* 🛡️ Предупреждение при модераторском редактировании чужого поста */}
          {editing && currentUser?.id !== author_id && (
            <div className="mt-2 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-600 dark:text-yellow-300 text-xs">
              {t("post.modEditWarn")}
            </div>
          )}

          {is_quote && (
            editing ? (
              <InlinePostEditor
                value={editText}
                onChange={setEditText}
                onSave={saveEdit}
                placeholder={t("post.postText")}
              />
            ) : (
              <>
                <div className="mt-1"><MarkdownRenderer text={displayText} /></div>
                {extractFirstUrl(displayText) && <LinkPreview url={extractFirstUrl(displayText)!} />}
              </>
            )
          )}
          
          {repost_of && !repost_of.deleted ? (
            <div className="mt-2 border border-line dark:border-white/10 rounded-xl p-3 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <Link href={`/${repost_of.handle?.replace("@", "")}`} onClick={(e) => e.stopPropagation()}>
                  <Avatar src={repost_of.author_avatar} name={repost_of.author} id={repost_of.author_id} size={24} />
                </Link>
                <Link href={`/${repost_of.handle?.replace("@", "")}`} className="font-semibold text-sm text-gray-900 dark:text-white hover:underline" onClick={(e) => e.stopPropagation()}>
                  {repost_of.author}
                </Link>
                <span className="text-sm text-gray-500 dark:text-white/40">{repost_of.handle}</span>
              </div>
              <div className="text-sm"><MarkdownRenderer text={repost_of.text} /></div>
              {repost_of.media_url && (
                <SmartMedia 
                  src={mediaUrl(repost_of.media_url)} 
                  type={repost_of.media_type} 
                  className="max-h-60 rounded-lg border border-line dark:border-white/10" 
                />
              )}
            </div>
          ) : repost_of?.deleted ? (
            <div className="mt-2 border border-line dark:border-white/10 rounded-xl p-4 bg-white/[0.02] text-center text-gray-500 dark:text-white/40 text-sm italic">
              {t("post.originalDeleted")}
            </div>
          ) : (
            <>
                {!is_quote && (
                  editing ? (
                    <InlinePostEditor
                      value={editText}
                      onChange={setEditText}
                      onSave={saveEdit}
                      placeholder={t("post.postText")}
                    />
                  ) : (
                    <>
                      <div className="mt-1"><MarkdownRenderer text={displayText} /></div>
                      {extractFirstUrl(displayText) && <LinkPreview url={extractFirstUrl(displayText)!} />}
                    </>
                  )
                )}
              {media_url && (
                <SmartMedia src={mediaUrl(media_url)} type={media_type} />
              )}
            </>
          )}

          {/* ✍️ Режим редактирования: вместо действий — «Сохранить» (сургуч) и «Отмена» (металл) */}
          {editing ? (
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <button
                onClick={(e) => { e.stopPropagation(); saveEdit(); }}
                disabled={!editText.trim() || editText === displayText || savingEdit}
                className="post-edit-save px-6 py-2.5 text-sm font-bold disabled:cursor-not-allowed"
                title={t("post.ctrlEnter")}
              >
                {savingEdit ? t("post.saving") : t("common.save")}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setEditing(false); }}
                className="post-edit-cancel px-5 py-2.5 text-sm font-bold"
              >
                {t("common.cancel")}
              </button>
              <span className="text-xs text-gray-500 dark:text-white/40">
                {t("post.ctrlEnter")} · {t("post.chars", { n: editText.length })}
              </span>
            </div>
          ) : (
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            {/* 🆕 КНОПКА РЕАКЦИИ — капсула в стиле остальных кнопок поста
                Клик — выбрать реакцию; двойной клик/тап — быстрая реакция;
                правый клик / удержание — все выставленные реакции с числами */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={(e) => { e.stopPropagation(); handleReactionClick(); }}
                onDoubleClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); openReactionStats(); }}
                onTouchStart={(e) => { e.stopPropagation(); startReactionLongPress(); }}
                onTouchEnd={cancelReactionLongPress}
                onTouchMove={cancelReactionLongPress}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-line dark:border-white/20 transition-all active:scale-90 ${
                  myReaction
                    ? "bg-[#8B5CF6] border-[#8B5CF6] text-white"
                    : "text-gray-800 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/10 hover:border-gray-300 dark:hover:border-white/40"
                }`}
                title="Клик — выбрать реакцию · Двойной тап — быстрая · Удержание/правый клик — все реакции"
              >
                {myReaction ? (
                  myReaction.type === "sticker" ? (
                    <img src={reactionImgSrc(myReaction.content)} alt="" className="w-[16px] h-[16px] object-contain shrink-0" />
                  ) : (
                    <span className="text-[14px] leading-none shrink-0">{myReaction.content}</span>
                  )
                ) : (
                  <SmilePlus size={15} className="shrink-0" />
                )}
                {totalReactions > 0 && (
                  <span className="text-xs font-semibold leading-none tabular-nums tracking-tight whitespace-nowrap">
                    {totalReactions >= 1_000_000
                      ? `${(totalReactions / 1_000_000).toFixed(totalReactions >= 10_000_000 ? 0 : 1).replace(".0", "")}M`
                      : totalReactions >= 10_000
                      ? `${Math.round(totalReactions / 1000)}K`
                      : totalReactions >= 1_000
                      ? `${(totalReactions / 1000).toFixed(1).replace(".0", "")}K`
                      : totalReactions}
                  </span>
                )}
              </button>
            </div>
            <BookmarkButton postId={id} initial={bookmarked} />

            <button
              onClick={() => startReply(cleanUsername, author)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-line dark:border-white/20 text-gray-800 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/10 hover:border-gray-300 dark:hover:border-white/40 hover:text-gray-500 dark:hover:text-[#e0e0e0]! transition-all"
            >
              <Reply size={13} />
            </button>

            {/* 🆕 ЕДИНАЯ КНОПКА РЕПОСТА И ЦИТАТЫ */}
            {currentUser && currentUser.id !== author_id && !is_repost && !is_quote && (
              <button
                onClick={() => handleRepostOrQuote(id)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-line dark:border-white/20 text-gray-600 dark:text-white/70 hover:bg-gray-100 hover:border-gray-300 hover:text-gray-500 dark:hover:bg-white/10 dark:hover:border-white/40 dark:hover:text-[#e0e0e0]! transition-all"
                title={t("post.repostQuote")}
              >
                <RefreshCw size={13} />
              </button>
            )}

            {is_repost && currentUser?.id === author_id && (
              <button
                onClick={() => handleCancelRepost(id)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-red-400/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 hover:border-red-400/50 transition-all"
              >
                <RefreshCw size={13} />
                <span className="text-[11px] font-semibold">{t("post.undo")}</span>
              </button>
            )}

            {canDelete && (
              <button
                onClick={deletePost}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-red-400/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 hover:border-red-400/50 transition-all"
                title={t("post.delete")}
              >
                <Trash2 size={13} />
              </button>
            )}
            
            {views_count !== undefined && (
              <span className="text-[11px] text-gray-500 dark:text-white/40 flex items-center gap-1">
                <Eye size={12} /> {views_count}
              </span>
            )}

            {rCount > 0 && !isMainPost && ( 
              <button
                onClick={loadReplies}
                className="text-[11px] font-semibold text-[#8b5cf6] hover:text-[#a78bfa] underline underline-offset-4 transition-colors"
              >
                {showReplies ? t("post.hideReplies") : t("post.replies", { n: rCount })}
              </button>
            )}
          </div>
          )}

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
                placeholder={t("post.replyPlaceholder", { author })}
                className="flex-1 border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-[#8b5cf6] transition-all"
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
                className="border border-line dark:border-white/20 text-gray-600 dark:text-white/60 rounded-lg px-3 hover:bg-gray-100 dark:hover:bg-white/10 transition-all"
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
                <p className="text-sm text-gray-600 dark:text-white/50">{t("post.noReplies")}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 🔊 ЭХО-МОДАЛКА (Открывается по клику на иконку Radio) */}
      {showEcho && <EchoModal postId={id} onClose={() => setShowEcho(false)} />}

      {/* 🆕 МОДАЛКА ВЫБОРА РЕАКЦИИ (клик по кнопке) — паки уже закешированы, открывается мгновенно */}
      {reactionModal === "pick" && (
        <>
          <div className="fixed inset-0 z-[260] bg-black/60 backdrop-blur-sm" onClick={() => setReactionModal(null)} />
          <div className="fixed inset-0 z-[261] flex items-center justify-center p-4 pointer-events-none">
            <div className="w-full max-w-sm max-h-[80vh] bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-2xl shadow-2xl flex flex-col pointer-events-auto animate-in zoom-in-95 duration-200">
              <div className="shrink-0 p-3 pb-2 border-b border-line dark:border-white/10">
                <div className="flex items-center justify-between mb-2 px-1">
                  <p className="text-xs font-bold text-gray-600 dark:text-white/60">Выбрать реакцию</p>
                  <button onClick={() => setReactionModal(null)} className="text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                    <X size={14} />
                  </button>
                </div>
                {/* Вкладки паков */}
                <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-1">
                  {reactionPacks.map((pack, i) => (
                    <button
                      key={pack.id ?? i}
                      onClick={() => setReactionPackTab(i)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 transition-all ${
                        reactionPackTab === i ? "bg-[#8b5cf6] text-white" : "bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/50"
                      }`}
                    >
                      {pack.locked && <Lock size={10} className="text-yellow-600 dark:text-yellow-400" />}
                      {pack.name}
                    </button>
                  ))}
                  {reactionPacks.length === 0 && (
                    <span className="text-[11px] text-gray-500 dark:text-white/40 px-1 py-1.5">Реакции недоступны</span>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 min-h-0">
                {reactionPacks[reactionPackTab] ? (
                  reactionPacks[reactionPackTab].locked ? (
                    <div className="flex flex-col items-center gap-2 py-8 text-center">
                      <div className="w-12 h-12 rounded-full bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center">
                        <Lock size={18} className="text-yellow-600 dark:text-yellow-400" />
                      </div>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">Пак недоступен</p>
                      <p className="text-[11px] text-gray-500 dark:text-white/40">Реакции из этого пака откроются с ростом уровня.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-5 gap-2">
                      {(reactionPacks[reactionPackTab].stickers || []).map((st: any) => {
                        const type = st.type === "image" ? "sticker" : "emoji";
                        const countEntry = postReactions.find((r) =>
                          type === "sticker" ? r.sticker_id === Number(st.id) : r.type === "emoji" && r.content === st.content
                        );
                        const isMine = !!countEntry?.mine;
                        return (
                          <button
                            key={st.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePostReaction({ type, content: st.content, sticker_id: type === "sticker" ? Number(st.id) : null });
                              setReactionModal(null);
                            }}
                            className={`relative aspect-square flex items-center justify-center rounded-xl transition-all active:scale-90 ${
                              isMine ? "ring-2 ring-[#8b5cf6] bg-[#8b5cf6]/20" : "hover:bg-gray-100 dark:hover:bg-white/10"
                            }`}
                          >
                            {type === "emoji" ? (
                              <span className="text-2xl">{st.content}</span>
                            ) : (
                              <img src={reactionImgSrc(st.content)} alt="" className="w-10 h-10 object-contain" />
                            )}
                            {(countEntry?.count ?? 0) > 0 && (
                              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[9px] font-bold flex items-center justify-center">
                                {countEntry.count}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )
                ) : (
                  <div className="py-8 text-center text-sm text-gray-600 dark:text-white/50">
                    {reactionPacks.length === 0 ? "Админ ещё не настроил реакции для постов" : "Выберите пак"}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* 🆕 МОДАЛКА: ВСЕ ВЫСТАВЛЕННЫЕ РЕАКЦИИ С ЧИСЛАМИ (правый клик / удержание / счётчик) */}
      {reactionModal === "stats" && (
        <>
          <div className="fixed inset-0 z-[260] bg-black/60 backdrop-blur-sm" onClick={() => setReactionModal(null)} />
          <div className="fixed inset-0 z-[261] flex items-center justify-center p-4 pointer-events-none">
            <div className="w-full max-w-xs max-h-[70vh] bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-2xl shadow-2xl flex flex-col pointer-events-auto animate-in zoom-in-95 duration-200">
              <div className="shrink-0 p-3 pb-2 border-b border-line dark:border-white/10 flex items-center justify-between px-1">
                <p className="text-xs font-bold text-gray-600 dark:text-white/60">Реакции · {totalReactions}</p>
                <button onClick={() => setReactionModal(null)} className="text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                  <X size={14} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 min-h-0">
                {postReactions.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-white/40 text-center py-6">Пока никто не поставил реакцию</p>
                ) : (
                  postReactions.map((r) => (
                    <button
                      key={(r.sticker_id ?? "") + r.content}
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePostReaction({ type: r.type, content: r.content, sticker_id: r.sticker_id });
                      }}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl transition-colors ${
                        r.mine ? "bg-[#8b5cf6]/15 ring-1 ring-[#8b5cf6]/40" : "hover:bg-gray-100 dark:hover:bg-white/10"
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {r.type === "sticker" ? (
                          <img src={reactionImgSrc(r.content)} alt="" className="w-6 h-6 object-contain" />
                        ) : (
                          <span className="text-xl leading-none">{r.content}</span>
                        )}
                        {r.mine && <span className="text-[10px] font-bold text-[#8b5cf6]">ваша</span>}
                      </span>
                      <span className="text-sm font-bold text-gray-900 dark:text-white">{r.count}</span>
                    </button>
                  ))
                )}
              </div>
              <p className="shrink-0 px-4 py-2 text-[10px] text-gray-500 dark:text-white/40 text-center border-t border-line dark:border-white/10">
                Нажмите на реакцию, чтобы поставить её
              </p>
            </div>
          </div>
        </>
      )}

      {showReport && (
        <ReportModal
          targetType="post"
          targetId={id}
          onClose={() => setShowReport(false)}
        />
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
  const { t } = useI18n();
  const { resolvedTheme } = useTheme();
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
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-white/40 mb-1">
              <CornerDownRight size={12} />
              <span>{t("post.inReplyTo")}</span>
              <Link
                href={`/${reply.parent.author_username}`}
                className="text-pink-600 dark:text-pink-400 hover:text-pink-600 dark:hover:text-pink-300 font-semibold"
              >
                {reply.parent.author_name}
              </Link>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/user/${reply.username}`}
              className={`font-bold text-sm ${
                glowStyle(reply.author_is_admin, reply.author_is_moderator, reply.author_role, resolvedTheme)
                  ? "hover:opacity-80"
                  : "text-gray-900 dark:text-white hover:text-[#8b5cf6]"
              }`}
              style={glowStyle(reply.author_is_admin, reply.author_is_moderator, reply.author_role, resolvedTheme)}
            >
              {reply.author}
            </Link>
            <AuthorBadges
              is_admin={reply.author_is_admin}
              is_moderator={reply.author_is_moderator}
              is_banned={reply.author_is_banned}
              role={reply.author_role}
            />
            <span className="font-normal text-gray-500 dark:text-white/40 text-xs">{reply.handle}</span>
          </div>
          
          <div className="text-gray-800 dark:text-white/85 mt-0.5"><MarkdownRenderer text={reply.text} isMessage={true} /></div>
          
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <button
                onClick={() => {
                  setShowReplyForm(true);
                  setReplyText(`@${reply.username} `);
                }}
                className="text-xs text-gray-600 dark:text-white/50 hover:text-gray-900 dark:hover:text-white flex items-center gap-1 transition-colors"
              >
              <Reply size={12} />
              {t("post.reply")}
            </button>
            
            {canDelete && (
              <button
                onClick={onDelete}
                className="text-xs text-red-400/60 hover:text-red-600 dark:hover:text-red-400 flex items-center gap-1 transition-colors"
              >
                <Trash2 size={12} />
                {t("post.delete")}
              </button>
            )}

            {children.length > 0 && (
              <button
                onClick={() => setShowChildren(!showChildren)}
                className="text-xs text-[#8b5cf6] hover:text-[#a78bfa] transition-colors"
              >
                {showChildren ? t("post.hideCount", { n: children.length }) : t("post.showReplies", { n: children.length })}
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
                placeholder={t("post.replyPlaceholder", { author: reply.author })}
                className="flex-1 border border-line dark:border-white/15 rounded-lg px-2.5 py-1.5 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-[#8b5cf6] transition-all"
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
                className="border border-line dark:border-white/20 text-gray-600 dark:text-white/60 rounded-lg px-2.5 hover:bg-gray-100 dark:hover:bg-white/10 transition-all text-sm"
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