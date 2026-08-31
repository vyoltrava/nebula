"use client";
import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { Avatar } from "@/components/Avatar";
import {
  ArrowLeft, Clock, CheckCircle, XCircle, Archive, Zap, Send, Pin, Lock, Unlock,
  Pencil, Trash2, Eye, MessageSquare, X,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const STATUS_CONFIG: Record<string, any> = {
  pending: { color: "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30", icon: Clock },
  approved: { color: "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30", icon: CheckCircle },
  implemented: { color: "bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30", icon: Zap },
  rejected: { color: "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30", icon: XCircle },
  archived: { color: "bg-gray-500/20 text-gray-400 border-gray-500/30", icon: Archive },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ThreadPage() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useParams();
  const threadId = parseInt(params.id as string);

  const [thread, setThread] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [prefixes, setPrefixes] = useState<any[]>([]);
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [sending, setSending] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [editModal, setEditModal] = useState(false);

  const canManage = !!me && (me.is_admin || (me.permissions || []).includes("manage_suggestions"));

  useEffect(() => { loadData(); loadThread(); }, [threadId]);

  async function loadData() {
    const token = getToken();
    const h = token ? { Authorization: `Bearer ${token}` } : undefined;
    try {
      const [meRes, catsRes, prefRes] = await Promise.all([
        fetch(`${API_URL}/api/me`, { headers: h }),
        fetch(`${API_URL}/api/suggestions/categories`, { headers: h }),
        fetch(`${API_URL}/api/suggestions/prefixes`, { headers: h }),
      ]);
      if (meRes.ok) setMe(await meRes.json());
      if (catsRes.ok) setCategories(await catsRes.json());
      if (prefRes.ok) setPrefixes(await prefRes.json());
    } catch (e) { console.error(e); }
  }

  async function loadThread(nextCursor?: number | null) {
    const token = getToken();
    const url = nextCursor ? `${API_URL}/api/suggestions/thread/${threadId}?cursor=${nextCursor}` : `${API_URL}/api/suggestions/thread/${threadId}`;
    try {
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      if (res.ok) {
        const data = await res.json();
        if (nextCursor) setComments(prev => [...prev, ...data.comments]);
        else { setThread(data.thread); setComments(data.comments); }
        setHasMore(data.has_more);
        if (data.next_cursor) setCursor(data.next_cursor);
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }

  async function api(method: string, path: string, form?: FormData) {
    const token = getToken();
    const res = await fetch(`${API_URL}${path}`, {
      method, headers: { Authorization: `Bearer ${token}` }, body: form,
    });
    if (res.ok) loadThread();
    return res.ok;
  }

  function patchForm(fields: Record<string, string>) {
    const f = new FormData();
    Object.entries(fields).forEach(([k, v]) => f.append(k, v));
    return f;
  }

  async function sendComment() {
    if (!newComment.trim()) return;
    setSending(true);
    try {
      const ok = await api("POST", `/api/suggestions/thread/${threadId}/comments`, patchForm({ content: newComment }));
      if (ok) setNewComment("");
    } finally { setSending(false); }
  }

  async function deleteComment(id: number) {
    if (!confirm(t("suggestions.deleteCommentConfirm"))) return;
    const token = getToken();
    const res = await fetch(`${API_URL}/api/suggestions/comments/${id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) loadThread();
  }

  async function deleteThread() {
    if (!confirm(t("suggestions.deleteThreadConfirm"))) return;
    const token = getToken();
    const res = await fetch(`${API_URL}/api/admin/suggestions/${threadId}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) router.push(`/suggestions/category/${thread.category_id}`);
  }

  if (loading) return <div className="min-h-screen bg-paper dark:bg-[#171717] flex items-center justify-center"><p className="text-gray-600 dark:text-white/50 animate-pulse">{t("common.loading")}</p></div>;
  if (!thread) return <div className="min-h-screen bg-paper dark:bg-[#171717] flex items-center justify-center"><p className="text-gray-600 dark:text-white/50">{t("suggestions.notFound")}</p></div>;

  const st = STATUS_CONFIG[thread.status] || STATUS_CONFIG.pending;
  const StatusIcon = st.icon;
  const canWrite = !thread.is_closed || canManage;

  return (
    <div className="min-h-screen bg-paper dark:bg-[#171717]">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Link href={`/suggestions/category/${thread.category_id}`} className="inline-flex items-center gap-2 text-gray-600 dark:text-white/50 hover:text-gray-900 dark:hover:text-white mb-6">
          <ArrowLeft size={16} /> {t("suggestions.backToCategory")}
        </Link>

        {/* Шапка темы */}
        <div className="border border-line dark:border-white/10 rounded-2xl p-6 bg-gray-100 dark:bg-white/5 mb-6">
          <div className="flex items-center gap-2 flex-wrap mb-3">
            {thread.is_pinned && <Pin size={18} className="text-yellow-600 dark:text-yellow-400" />}
            {thread.is_closed && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-600 dark:text-red-400 flex items-center gap-1">
                <Lock size={10} /> {t("suggestions.closed")}
              </span>
            )}
            {thread.prefix && (
              <span className="px-2.5 py-1 rounded text-xs font-bold" style={{ color: thread.prefix.color, background: thread.prefix.bg_color }}>
                {thread.prefix.name}
              </span>
            )}
            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase border flex items-center gap-1.5 ${st.color}`}>
              <StatusIcon size={12} /> {t(`suggestions.status.${thread.status}` as any)}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white mb-4">{thread.title}</h1>

          <div className="flex items-center gap-3 mb-6 pb-6 border-b border-line dark:border-white/10">
            <Avatar src={thread.author?.avatar_url} name={thread.author?.display_name} id={thread.author?.id} size={40} />
            <div className="flex-1">
              <p className="text-gray-900 dark:text-white font-bold">{thread.author?.display_name}</p>
              <p className="text-xs text-gray-500 dark:text-white/40">{t("suggestions.author")} · {fmtDate(thread.created_at)}</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-white/40">
              <span className="flex items-center gap-1"><Eye size={14} /> {thread.views_count}</span>
              <span className="flex items-center gap-1"><MessageSquare size={14} /> {comments.length}</span>
            </div>
          </div>

          <p className="text-gray-800 dark:text-white/80 text-base leading-relaxed whitespace-pre-wrap">{thread.content}</p>
        </div>

        {/* 🛠️ Панель управления (только с правом manage_suggestions) */}
        {canManage && (
          <div className="border border-[#8b5cf6]/30 rounded-2xl p-4 bg-[#8b5cf6]/5 mb-6">
            <p className="text-xs font-black uppercase text-[#8b5cf6] mb-3">{t("suggestions.manage")}</p>
            <div className="flex flex-wrap gap-2 mb-3">
              <button onClick={() => setEditModal(true)}
                className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 text-gray-800 dark:text-white/70 text-xs font-bold hover:text-gray-900 dark:hover:text-white flex items-center gap-1.5">
                <Pencil size={13} /> {t("suggestions.editThread")}
              </button>
              <button onClick={() => api("PATCH", `/api/suggestions/thread/${threadId}/pin`, patchForm({ is_pinned: String(!thread.is_pinned) }))}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5 ${thread.is_pinned ? "bg-yellow-500/20 border-yellow-500/30 text-yellow-600 dark:text-yellow-400" : "bg-gray-100 dark:bg-white/5 border-line dark:border-white/10 text-gray-800 dark:text-white/70 hover:text-gray-900 dark:hover:text-white"}`}>
                <Pin size={13} /> {thread.is_pinned ? t("suggestions.unpin") : t("suggestions.pin")}
              </button>
              <button onClick={() => api("PATCH", `/api/suggestions/thread/${threadId}/close`, patchForm({ closed: String(!thread.is_closed) }))}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5 ${thread.is_closed ? "bg-green-500/20 border-green-500/30 text-green-600 dark:text-green-400" : "bg-red-500/20 border-red-500/30 text-red-600 dark:text-red-400"}`}>
                {thread.is_closed ? <Unlock size={13} /> : <Lock size={13} />}
                {thread.is_closed ? t("suggestions.openThread") : t("suggestions.closeThread")}
              </button>
              <button onClick={deleteThread}
                className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-bold flex items-center gap-1.5">
                <Trash2 size={13} /> {t("suggestions.deleteThread")}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select value={thread.status}
                onChange={(e) => api("PATCH", `/api/suggestions/thread/${threadId}/status`, patchForm({ status: e.target.value }))}
                className="px-2 py-2 rounded-lg bg-paper dark:bg-[#171717] border border-line dark:border-white/10 text-gray-900 dark:text-white text-xs outline-none">
                <option value="pending">{t("suggestions.status.pending")}</option>
                <option value="approved">{t("suggestions.status.approved")}</option>
                <option value="implemented">{t("suggestions.status.implemented")}</option>
                <option value="rejected">{t("suggestions.status.rejected")}</option>
                <option value="archived">{t("suggestions.status.archived")}</option>
              </select>
              <select value={thread.prefix?.id || 0}
                onChange={(e) => api("PATCH", `/api/suggestions/thread/${threadId}/prefix`, patchForm({ prefix_id: e.target.value }))}
                className="px-2 py-2 rounded-lg bg-paper dark:bg-[#171717] border border-line dark:border-white/10 text-gray-900 dark:text-white text-xs outline-none">
                <option value={0}>{t("suggestions.noPrefix")}</option>
                {prefixes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={thread.category_id}
                onChange={(e) => api("PATCH", `/api/admin/suggestions/${threadId}/move`, patchForm({ category_id: e.target.value }))}
                className="px-2 py-2 rounded-lg bg-paper dark:bg-[#171717] border border-line dark:border-white/10 text-gray-900 dark:text-white text-xs outline-none">
                {categories.map((c) => <option key={c.id} value={c.id}>{t("suggestions.moveThread")}: {c.name}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Комментарии */}
        <div className="mb-6">
          <h2 className="text-xl font-black text-gray-900 dark:text-white mb-4">{t("suggestions.commentsTitle")} ({comments.length})</h2>
          <div className="space-y-4">
            {comments.map((c) => (
              <div key={c.id} className="border border-line dark:border-white/10 rounded-xl p-5 bg-gray-100 dark:bg-white/5">
                <div className="flex items-start gap-3">
                  <Avatar src={c.author?.avatar_url} name={c.author?.display_name} id={c.author?.id} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-gray-900 dark:text-white font-bold">{c.author?.display_name}</span>
                      <span className="text-xs text-gray-500 dark:text-white/40">{fmtDate(c.created_at)}</span>
                      {(canManage || me?.id === c.author?.id) && (
                        <button onClick={() => deleteComment(c.id)} className="ml-auto p-1.5 rounded text-red-400/60 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    <p className="text-gray-800 dark:text-white/70 text-sm leading-relaxed whitespace-pre-wrap">{c.content}</p>
                  </div>
                </div>
              </div>
            ))}
            {hasMore && (
              <button onClick={() => loadThread(cursor)} className="w-full py-3 rounded-xl border border-line dark:border-white/10 bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white">
                {t("common.loadMore")}
              </button>
            )}
            {comments.length === 0 && (
              <div className="text-center py-12 border border-line dark:border-white/10 rounded-xl bg-gray-100 dark:bg-white/5">
                <p className="text-gray-600 dark:text-white/50">{t("suggestions.noComments")}</p>
                <p className="text-gray-500 dark:text-white/30 text-sm mt-1">{t("suggestions.beFirstComment")}</p>
              </div>
            )}
          </div>
        </div>

        {/* Форма комментария / заглушка закрытой темы */}
        {canWrite ? (
          <div className="border border-line dark:border-white/10 rounded-2xl p-5 bg-gray-100 dark:bg-white/5">
            <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)}
              placeholder={t("suggestions.commentPh")} rows={4}
              className="w-full mb-4 px-4 py-3 rounded-lg bg-paper dark:bg-[#171717] border border-line dark:border-white/10 text-gray-900 dark:text-white focus:border-[#8b5cf6] outline-none resize-none" />
            <div className="flex justify-end">
              <button onClick={sendComment} disabled={sending || !newComment.trim()}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#8b5cf6] text-white font-bold hover:bg-[#7c3aed] disabled:opacity-40 transition-all">
                <Send size={16} /> {sending ? t("suggestions.sending") : t("suggestions.send")}
              </button>
            </div>
          </div>
        ) : (
          <div className="px-4 py-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
            <Lock size={16} /> {t("suggestions.themeClosed")}
          </div>
        )}
      </div>

      {editModal && (
        <EditModal thread={thread} onClose={() => setEditModal(false)} onSaved={() => { setEditModal(false); loadThread(); }} />
      )}
    </div>
  );
}

function EditModal({ thread, onClose, onSaved }: any) {
  const { t } = useI18n();
  const [title, setTitle] = useState(thread.title);
  const [content, setContent] = useState(thread.content);

  async function save() {
    if (!title.trim() || !content.trim()) return alert(t("suggestions.fillFields"));
    const token = getToken();
    const f = new FormData();
    f.append("title", title); f.append("content", content);
    const res = await fetch(`${API_URL}/api/suggestions/thread/${thread.id}`, {
      method: "PATCH", headers: { Authorization: `Bearer ${token}` }, body: f,
    });
    if (res.ok) onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-black text-gray-900 dark:text-white">{t("suggestions.editThread")}</h3>
          <button onClick={onClose} className="text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white"><X size={20} /></button>
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)}
          className="w-full mb-4 px-4 py-3 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 text-gray-900 dark:text-white text-lg focus:border-[#8b5cf6] outline-none" />
        <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={8}
          className="w-full mb-4 px-4 py-3 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 text-gray-900 dark:text-white focus:border-[#8b5cf6] outline-none resize-none" />
        <div className="flex gap-3">
          <button onClick={save} className="flex-1 py-3 rounded-lg bg-[#8b5cf6] text-white font-bold hover:bg-[#7c3aed]">{t("suggestions.saveChanges")}</button>
          <button onClick={onClose} className="flex-1 py-3 rounded-lg border border-line dark:border-white/15 text-gray-800 dark:text-white/80 font-bold hover:bg-gray-100 dark:hover:bg-white/5">{t("common.cancel")}</button>
        </div>
      </div>
    </div>
  );
}