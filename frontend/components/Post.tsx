"use client";
import { STICKERS } from "@/lib/stickers";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Heart, MessageCircle, Send, Trash2, Shield, ShieldCheck, Ban, Flag, CornerDownRight, Reply } from "lucide-react";
import { getToken } from "@/lib/auth";
import { triggerFeedRefresh } from "@/lib/events";
import { safeFetch } from "@/lib/ban";
import { Avatar } from "@/components/Avatar";
import { mediaUrl } from "@/lib/media";
import { ReportModal } from "./ReportModal";
import { API_URL } from "@/lib/api";

function renderText(text: string) {
  const parts = text.split(/(#[\wа-яёА-ЯЁ]+|@[\wа-яёА-ЯЁ]+|:[\w]+:)/g);
  return parts.map((part, i) => {
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
          href={`/user/${username}`}
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

      {role && !is_admin && !is_moderator && (
        <span
          className="inline-flex items-center px-1.5 py-0.5 rounded text-white text-[8px] font-black uppercase tracking-widest shrink-0 border"
          style={{ backgroundColor: role.color, borderColor: `${role.color}80` }}
        >
          {role.name}
        </span>
      )}
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
  likes_count,
  liked_by_me,
  replies_count,
  showFullReplies = true,
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
  likes_count: number;
  liked_by_me: boolean;
  replies_count: number;
  showFullReplies?: boolean;
}) {
  const [currentUser, setCurrentUser] = useState<{ id: number; is_admin: boolean; is_moderator: boolean } | null>(null);
  const [myPermissions, setMyPermissions] = useState<string[]>([]);
  const [liked, setLiked] = useState(liked_by_me);
  const [count, setCount] = useState(likes_count);
  const [rCount, setRCount] = useState(replies_count);
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [showReplies, setShowReplies] = useState(false);
  const [replies, setReplies] = useState<any[] | null>(null);
  const [following, setFollowing] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const router = useRouter();

  const cleanUsername = username || handle?.replace("@", "");

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    safeFetch('http://${API_URL}/api/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setCurrentUser({ id: data.id, is_admin: data.is_admin, is_moderator: data.is_moderator });
          setMyPermissions(data.permissions || []);
        }
      });

    safeFetch(`http://${API_URL}/api/users/${author_id}/is-following`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setFollowing(data.following);
      });

    safeFetch(`http://${API_URL}/api/posts/${id}/is-liked`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setLiked(data.liked);
      });
  }, [author_id, id]);

  async function toggleLike() {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    const res = await safeFetch(`http://${API_URL}/api/posts/${id}/like`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setLiked(data.liked);
      setCount((c) => (data.liked ? c + 1 : c - 1));
      triggerFeedRefresh();
    }
  }

  async function toggleFollow(e: React.MouseEvent) {
    e.stopPropagation();
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    const res = await safeFetch(`http://${API_URL}/api/users/${author_id}/follow`, {
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
      const res = await safeFetch(`http://${API_URL}/api/posts/${id}/replies`);
      if (res.ok) setReplies(await res.json());
    }
    setShowReplies(!showReplies);
  }

  // 🆕 Начать ответ с упоминанием пользователя
  function startReply(mentionUsername?: string, mentionDisplayName?: string) {
    setReplying(true);
    if (mentionUsername) {
      setReplyText(`@${mentionUsername} `);
    } else {
      setReplyText("");
    }
    // Фокус на инпут через таймаут (чтобы DOM обновился)
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

    const res = await safeFetch('http://${API_URL}/api/posts', {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    if (res.ok) {
      setReplyText("");
      setReplying(false);
      setRCount((c) => c + 1);
      
      // Перезагружаем ответы
      const r = await safeFetch(`http://${API_URL}/api/posts/${id}/replies`);
      if (r.ok) setReplies(await r.json());
      setShowReplies(true);
      triggerFeedRefresh();
    }
  }

  async function deletePost() {
    if (!confirm("Удалить пост?")) return;
    const token = getToken();
    if (!token) return;

    const url = myPermissions.includes("delete_posts")
      ? `http://${API_URL}/api/admin/posts/${id}`
      : `http://${API_URL}/api/posts/${id}`;

    const res = await safeFetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res && res.ok) {
      triggerFeedRefresh();
    } else {
      alert("Не удалось удалить пост");
    }
  }

  const canDelete = currentUser?.id === author_id || myPermissions.includes("delete_posts");

  return (
    <article className="p-4 border-b border-white/10 hover:bg-white/5 transition-colors">
      <div className="flex gap-3">
        <Link href={`/user/${author_id}`} className="shrink-0">
          <Avatar src={author_avatar} name={author} id={author_id} />
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap text-sm min-w-0">
            <Link
              href={`/user/${author_id}`}
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
              <span className="font-normal text-white/50">{handle}</span>
            </div>
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
          </div>
          
          <p className="mt-1 text-white/90 whitespace-pre-wrap break-words">{renderText(text)}</p>
          
          {media_url && (
            <img
              src={mediaUrl(media_url)}
              alt=""
              className="mt-2 max-h-96 w-auto rounded-xl border border-white/20"
            />
          )}

          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <button
              onClick={toggleLike}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full border transition-all ${
                liked
                  ? "border-pink-400/50 bg-gradient-to-r from-pink-500 to-purple-500 text-white"
                  : "border-white/20 text-white/70 hover:bg-white/10 hover:border-white/40 hover:text-white"
              }`}
            >
              <Heart size={16} fill={liked ? "currentColor" : "none"} />
              <span className="text-sm font-semibold">{count}</span>
            </button>

            {/* 🆕 Кнопка "Ответить" открывает форму с упоминанием автора */}
            <button
              onClick={() => startReply(cleanUsername, author)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-white/20 text-white/70 hover:bg-white/10 hover:border-white/40 hover:text-white transition-all"
            >
              <Reply size={16} />
              <span className="text-sm font-semibold">Ответить</span>
            </button>

            {currentUser?.id !== author_id && (
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

            {rCount > 0 && (
              <button
                onClick={loadReplies}
                className="text-sm font-semibold text-[#8b5cf6] hover:text-[#a78bfa] underline underline-offset-4 transition-colors"
              >
                {showReplies ? "Скрыть ответы" : `Ответы (${rCount})`}
              </button>
            )}
          </div>

          {/* 🆕 Форма ответа с упоминанием */}
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

          {/* 🆕 Список ответов с вложенностью */}
          {showReplies && replies && (
            <div className="mt-3 space-y-3">
              {/* Группируем ответы: прямые и вложенные */}
              {replies
                .filter((r) => r.reply_to_id === id) // Только прямые ответы на этот пост
                .map((r) => (
                  <ReplyItem
                    key={r.id}
                    reply={r}
                    allReplies={replies}
                    postId={id}
                    onReply={startReply}
                    currentUser={currentUser}
                    myPermissions={myPermissions}
                    onDelete={async () => {
                      const token = getToken();
                      if (!token) return;
                      const url = myPermissions.includes("delete_posts")
                        ? `http://${API_URL}/api/admin/posts/${r.id}`
                        : `http://${API_URL}/api/posts/${r.id}`;
                      await safeFetch(url, {
                        method: "DELETE",
                        headers: { Authorization: `Bearer ${token}` },
                      });
                      const res = await safeFetch(`http://${API_URL}/api/posts/${id}/replies`);
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
  depth = 0,
}: {
  reply: any;
  allReplies: any[];
  postId: number;
  onReply: (username: string, displayName: string) => void;
  currentUser: { id: number } | null;
  myPermissions: string[];
  onDelete: () => void;
  depth?: number;
}) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [showChildren, setShowChildren] = useState(true);

  // Находим детей этого ответа
  const children = allReplies.filter((r) => r.reply_to_id === reply.id);

  async function submitNestedReply() {
    const token = getToken();
    if (!token || !replyText.trim()) return;

    const form = new FormData();
    form.append("text", replyText);
    form.append("reply_to", String(reply.id)); // 🆕 Ответ на комментарий, а не на пост

    const res = await safeFetch('http://${API_URL}/api/posts', {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    if (res.ok) {
      setReplyText("");
      setShowReplyForm(false);
      // Перезагружаем все ответы
      const r = await safeFetch(`http://${API_URL}/api/posts/${postId}/replies`);
      if (r.ok) {
        const newReplies = await r.json();
        // Триггерим обновление родителя через callback
        window.dispatchEvent(new CustomEvent("replies-updated", { detail: newReplies }));
      }
      triggerFeedRefresh();
    }
  }

  const canDelete = currentUser?.id === reply.author_id || myPermissions.includes("delete_posts");
  const maxDepth = 3; // Максимальная глубина вложенности

  return (
    <div
      className={`text-sm ${depth > 0 ? "ml-6 pl-4 border-l-2 border-purple-400/20" : ""}`}
    >
      <div className="flex gap-2">
        <Link href={`/user/${reply.username}`} className="shrink-0">
          <Avatar src={reply.author_avatar} name={reply.author} id={reply.author_id} size={28} />
        </Link>

        <div className="flex-1 min-w-0">
          {/* 🆕 Показываем, на кого это ответ */}
          {reply.parent && (
            <div className="flex items-center gap-1.5 text-xs text-white/40 mb-1">
              <CornerDownRight size={12} />
              <span>в ответ на</span>
              <Link
                href={`/user/${reply.parent.author_username}`}
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

          {/* 🆕 Форма ответа на комментарий */}
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

      {/* 🆕 Вложенные ответы */}
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
              onDelete={async () => {
                const token = getToken();
                if (!token) return;
                const url = myPermissions.includes("delete_posts")
                  ? `http://${API_URL}/api/admin/posts/${child.id}`
                  : `http://${API_URL}/api/posts/${child.id}`;
                await safeFetch(url, {
                  method: "DELETE",
                  headers: { Authorization: `Bearer ${token}` },
                });
                const r = await safeFetch(`http://${API_URL}/api/posts/${postId}/replies`);
                if (r.ok) {
                  window.dispatchEvent(new CustomEvent("replies-updated", { detail: await r.json() }));
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