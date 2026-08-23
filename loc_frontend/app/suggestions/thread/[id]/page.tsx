"use client";
import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import {
  ArrowLeft, Clock, CheckCircle, XCircle, Archive, Zap, Send, Pin
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const STATUS_CONFIG: Record<string, any> = {
  pending: { label: "На рассмотрении", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", icon: Clock },
  approved: { label: "Одобрено", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: CheckCircle },
  implemented: { label: "Реализовано", color: "bg-green-500/20 text-green-400 border-green-500/30", icon: Zap },
  rejected: { label: "Отклонено", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: XCircle },
  archived: { label: "Архив", color: "bg-gray-500/20 text-gray-400 border-gray-500/30", icon: Archive },
};

export default function ThreadPage() {
  const { t } = useI18n();
  const params = useParams();
  const threadId = parseInt(params.id as string);
  
  const [thread, setThread] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [sending, setSending] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    loadData();
    loadThread();
  }, [threadId]);

  async function loadData() {
    const token = getToken();
    // 🛠️ ИСПРАВЛЕНО: undefined вместо {}
    const authHeader = token ? { Authorization: `Bearer ${token}` } : undefined;
    
    try {
      const meRes = await fetch(`${API_URL}/api/me`, { headers: authHeader });
      if (meRes.ok) setMe(await meRes.json());
    } catch (e) {
      console.error(e);
    }
  }

  async function loadThread(nextCursor?: number | null) {
    const token = getToken();
    const url = nextCursor 
      ? `${API_URL}/api/suggestions/thread/${threadId}?cursor=${nextCursor}`
      : `${API_URL}/api/suggestions/thread/${threadId}`;
    
    try {
      // 🛠️ ИСПРАВЛЕНО: undefined вместо {}
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (res.ok) {
        const data = await res.json();
        if (nextCursor) {
          setComments(prev => [...prev, ...data.comments]);
        } else {
          setThread(data.thread);
          setComments(data.comments);
        }
        setHasMore(data.has_more);
        if (data.next_cursor) {
          setCursor(data.next_cursor);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function sendComment() {
    if (!newComment.trim()) return;
    const token = getToken();
    const form = new FormData();
    form.append("content", newComment);
    
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/api/suggestions/thread/${threadId}/comments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.ok) {
        setNewComment("");
        loadThread();
      }
    } finally {
      setSending(false);
    }
  }

  async function updateStatus(newStatus: string) {
    if (!confirm(`Изменить статус на "${STATUS_CONFIG[newStatus].label}"?`)) return;
    
    const token = getToken();
    const form = new FormData();
    form.append("status", newStatus);
    
    try {
      const res = await fetch(`${API_URL}/api/suggestions/thread/${threadId}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.ok) loadThread();
    } catch (e) {
      console.error(e);
    }
  }

  async function togglePin() {
    const token = getToken();
    const form = new FormData();
    form.append("is_pinned", String(!thread.is_pinned));
    
    try {
      const res = await fetch(`${API_URL}/api/suggestions/thread/${threadId}/pin`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.ok) loadThread();
    } catch (e) {
      console.error(e);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#171717] flex items-center justify-center">
        <p className="text-white/50 animate-pulse">Загрузка...</p>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="min-h-screen bg-[#171717] flex items-center justify-center">
        <p className="text-white/50">Тема не найдена</p>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[thread.status] || STATUS_CONFIG.pending;
  const StatusIcon = statusConfig.icon;
  const isAdmin = me?.is_admin;

  return (
    <div className="min-h-screen bg-[#171717]">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Link href={`/suggestions/category/${thread.category_id}`} className="inline-flex items-center gap-2 text-white/50 hover:text-white mb-6">
          <ArrowLeft size={16} /> Назад к разделу
        </Link>

        <div className="border border-white/10 rounded-2xl p-6 bg-white/5 mb-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                {thread.is_pinned && <Pin size={20} className="text-yellow-400" />}
                <h1 className="text-2xl sm:text-3xl font-black text-white">{thread.title}</h1>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase border flex items-center gap-2 ${statusConfig.color}`}>
                  <StatusIcon size={14} />
                  {statusConfig.label}
                </span>
                <span className="text-xs text-white/40">
                  {new Date(thread.created_at).toLocaleDateString("ru-RU", {
                    day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit"
                  })}
                </span>
              </div>
            </div>
            
            {isAdmin && (
              <div className="flex flex-col gap-2 shrink-0">
                {thread.status === "pending" && (
                  <>
                    <button onClick={() => updateStatus("approved")} className="px-3 py-1.5 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-400 text-xs font-bold hover:bg-blue-500/30 transition-all">Одобрить</button>
                    <button onClick={() => updateStatus("rejected")} className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-bold hover:bg-red-500/30 transition-all">Отклонить</button>
                  </>
                )}
                {thread.status === "approved" && (
                  <button onClick={() => updateStatus("implemented")} className="px-3 py-1.5 rounded-lg bg-green-500/20 border border-green-500/30 text-green-400 text-xs font-bold hover:bg-green-500/30 transition-all">Реализовано</button>
                )}
                <button onClick={togglePin} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${thread.is_pinned ? "bg-yellow-500/20 border-yellow-500/30 text-yellow-400" : "bg-white/5 border-white/10 text-white/50 hover:text-white"}`}>
                  {thread.is_pinned ? "Открепить" : "Закрепить"}
                </button>
                <button onClick={() => updateStatus("archived")} className="px-3 py-1.5 rounded-lg bg-gray-500/20 border border-gray-500/30 text-gray-400 text-xs font-bold hover:bg-gray-500/30 transition-all">В архив</button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 mb-6 pb-6 border-b border-white/10">
            <Avatar src={thread.author?.avatar_url} name={thread.author?.display_name} id={thread.author?.id} size={40} />
            <div>
              <p className="text-white font-bold">{thread.author?.display_name}</p>
              <p className="text-xs text-white/40">Автор темы</p>
            </div>
          </div>

          <div className="prose prose-invert max-w-none">
            <p className="text-white/80 text-base leading-relaxed whitespace-pre-wrap">{thread.content}</p>
          </div>

          <div className="flex items-center gap-4 mt-6 pt-6 border-t border-white/10 text-xs text-white/40">
            <span>{thread.views_count} просмотров</span>
            <span>•</span>
            <span>{comments.length} комментариев</span>
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-xl font-black text-white mb-4">Комментарии ({comments.length})</h2>
          
          <div className="space-y-4">
            {comments.map((comment) => (
              <div key={comment.id} className="border border-white/10 rounded-xl p-5 bg-white/5">
                <div className="flex items-start gap-3">
                  <Avatar src={comment.author?.avatar_url} name={comment.author?.display_name} id={comment.author?.id} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-white font-bold">{comment.author?.display_name}</span>
                      <span className="text-xs text-white/40">
                        {new Date(comment.created_at).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-white/70 text-sm leading-relaxed whitespace-pre-wrap">{comment.content}</p>
                  </div>
                </div>
              </div>
            ))}
            
            {hasMore && (
              <button onClick={() => loadThread(cursor)} className="w-full py-3 rounded-xl border border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white transition-all">
                Загрузить ещё комментарии...
              </button>
            )}
            
            {comments.length === 0 && (
              <div className="text-center py-12 border border-white/10 rounded-xl bg-white/5">
                <p className="text-white/50">Пока нет комментариев</p>
                <p className="text-white/30 text-sm mt-1">Будьте первым!</p>
              </div>
            )}
          </div>
        </div>

        <div className="border border-white/10 rounded-2xl p-5 bg-white/5">
          <h3 className="text-lg font-bold text-white mb-4">Оставить комментарий</h3>
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Напишите ваш комментарий..."
            rows={4}
            className="w-full mb-4 px-4 py-3 rounded-lg bg-[#171717] border border-white/10 text-white focus:border-[#8b5cf6] outline-none resize-none"
          />
          <div className="flex justify-end">
            <button
              onClick={sendComment}
              disabled={sending || !newComment.trim()}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#8b5cf6] text-white font-bold hover:bg-[#7c3aed] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <Send size={16} />
              {sending ? "Отправка..." : "Отправить"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}