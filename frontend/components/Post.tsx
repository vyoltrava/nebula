"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Heart, MessageCircle, Send, Trash2 } from "lucide-react";
import { getToken } from "@/lib/auth";
import { triggerFeedRefresh } from "@/lib/events";


function renderText(text: string) {
  const parts = text.split(/(#[\wа-яёА-ЯЁ]+|@[\wа-яёА-ЯЁ]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith("#")) {
      return (
        <Link
          key={i}
          href={`/tag/${part.slice(1).toLowerCase()}`}
          className="font-bold text-purple-400 hover:text-purple-300 underline underline-offset-2"
        >
          {part}
        </Link>
      );
    }
    if (part.startsWith("@")) {
      return (
        <span key={i} className="font-bold text-pink-400 underline underline-offset-2">
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}




export function Post({
  id,
  author_id,
  author,
  handle,
  author_avatar,
  author_is_admin,
  text,
  media_url,
  likes_count,
  liked_by_me,
  replies_count,
}: {
  id: number;
  author_id: number;
  author: string;
  handle: string;
  author_avatar?: string | null;
  text: string;
  media_url?: string | null;
  likes_count: number;
  liked_by_me: boolean;
  replies_count: number;
  author_is_admin?: boolean;
}) {
  const [currentUser, setCurrentUser] = useState<{ id: number; is_admin: boolean } | null>(null);
  const [liked, setLiked] = useState(liked_by_me);
  const [count, setCount] = useState(likes_count);
  const [rCount, setRCount] = useState(replies_count);
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [showReplies, setShowReplies] = useState(false);
  const [replies, setReplies] = useState<any[] | null>(null);
  const [following, setFollowing] = useState(false);
  const router = useRouter();
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

useEffect(() => {
  const token = getToken();
  if (!token) return;

  // Загружаем текущего пользователя
  fetch("http://localhost:8000/api/me", {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (data) setCurrentUser({ id: data.id, is_admin: data.is_admin });
    });

  // Проверяем подписку
  fetch(`http://localhost:8000/api/users/${author_id}/is-following`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data) setFollowing(data.following);
    });

  // Проверяем лайк
  fetch(`http://localhost:8000/api/posts/${id}/is-liked`, {
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
    const res = await fetch(`http://localhost:8000/api/posts/${id}/like`, {
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
    const res = await fetch(`http://localhost:8000/api/users/${author_id}/follow`, {
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
      const res = await fetch(`http://localhost:8000/api/posts/${id}/replies`);
      setReplies(await res.json());
    }
    setShowReplies(!showReplies);
  }

  async function submitReply() {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    const form = new FormData();
    form.append("text", replyText);
    form.append("reply_to", String(id));
    const res = await fetch("http://localhost:8000/api/posts", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (res.ok) {
      setReplyText("");
      setReplying(false);
      setRCount((c) => c + 1);
      const r = await fetch(`http://localhost:8000/api/posts/${id}/replies`);
      setReplies(await r.json());
      setShowReplies(true);
      triggerFeedRefresh();
    }
  }

  async function deletePost() {
  if (!confirm("Удалить пост?")) return;
  
  const token = getToken();
  if (!token) return;
  
  const res = await fetch(`http://localhost:8000/api/posts/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  
  if (res.ok) {
    triggerFeedRefresh();
  }
}

  return (
    <article className="p-4 border-b border-white/10 hover:bg-white/5 transition-colors">
      <div className="flex gap-3">
        {author_avatar ? (
          <img
            src={`http://localhost:8000${author_avatar}`}
            alt=""
            className="w-10 h-10 rounded-full border border-white/20 object-cover shrink-0"
          />
        ) : (
          <div className="w-10 h-10 rounded-full border border-white/20 bg-white/5 shrink-0" />
        )}
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <p className="font-bold text-sm text-white">
              <Link href={`/user/${author_id}`} className="hover:text-purple-400 transition-colors">
                {author}
              </Link>{" "}
              <span className="font-normal text-white/50">{handle}</span>
            </p>
            <button
              onClick={toggleFollow}
              className={`text-xs font-bold px-3 py-1 rounded-full border transition-all ${
                following
                  ? "border-purple-400/50 bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                  : "border-white/20 text-white/70 hover:bg-white/10 hover:border-white/40 hover:text-white"
              }`}
            >
              {following ? "Читаю" : "Читать"}
            </button>
          </div>
          <p className="mt-1 text-white/90 whitespace-pre-wrap">{renderText(text)}</p>
          {media_url && (
            <img
              src={`http://localhost:8000${media_url}`}
              alt=""
              className="mt-2 max-h-96 w-auto rounded-xl border border-white/20"
            />
          )}

          <div className="flex items-center gap-3 mt-3">
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

            <button
              onClick={() => setReplying(!replying)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-white/20 text-white/70 hover:bg-white/10 hover:border-white/40 hover:text-white transition-all"
            >
              <MessageCircle size={16} />
              <span className="text-sm font-semibold">Ответить</span>
            </button>

            {(currentUser?.id === author_id || currentUser?.is_admin) && (
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
                className="text-sm font-semibold text-purple-400 hover:text-purple-300 underline underline-offset-4 transition-colors"
              >
                {showReplies ? "Скрыть ответы" : `Ответы (${rCount})`}
              </button>
            )}
          </div>

          {replying && (
            <div className="mt-3 flex gap-2">
              <input
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={`Ответ для ${author}...`}
                className="flex-1 border border-white/15 rounded-lg px-3 py-2 bg-white/5 text-white placeholder-white/40 focus:outline-none focus:border-purple-400/50 transition-all"
              />
              <button
                onClick={submitReply}
                disabled={!replyText.trim()}
                className="border border-purple-400/50 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg px-3 disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-purple-500/30 transition-all"
              >
                <Send size={16} />
              </button>
            </div>
          )}

          {showReplies && replies && (
            <div className="mt-3 space-y-3 border-l-2 border-purple-400/30 pl-4">
              {replies.map((r) => (
                <div key={r.id} className="text-sm flex gap-2">
                  {r.author_avatar ? (
                    <img
                      src={`http://localhost:8000${r.author_avatar}`}
                      alt=""
                      className="w-6 h-6 rounded-full border border-white/20 object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full border border-white/20 bg-white/5 shrink-0" />
                  )}
                  <div>
                    <p className="font-bold text-sm text-white flex items-center gap-2 flex-wrap">
                      <Link href={`/user/${author_id}`} className="hover:text-purple-400 transition-colors">
                        {author}
                      </Link>
                      {author_is_admin && (
                        <span className="font-logo text-sm px-2 py-0.5 rounded-md bg-gradient-to-r from-purple-500 to-pink-500 text-white tracking-widest shadow-lg shadow-purple-500/30">
                          DEV.KID
                        </span>
                      )}
                      <span className="font-normal text-white/50">{handle}</span>
                    </p>
                    <p className="text-white/80">{r.text}</p>
                  </div>
                </div>
              ))}
              {replies.length === 0 && <p className="text-sm text-white/50">Пока нет ответов</p>}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}