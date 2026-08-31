"use client";
import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { Avatar } from "@/components/Avatar";
import { MessageSquare, Plus, Pin, ArrowLeft, Lock, Eye, Pencil, X } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function CategoryPage() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useParams();
  const categoryId = parseInt(params.id as string);

  const [category, setCategory] = useState<any>(null);
  const [threads, setThreads] = useState<any[]>([]);
  const [prefixes, setPrefixes] = useState<any[]>([]);
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [prefixId, setPrefixId] = useState(0);

  const canManage = !!me && (me.is_admin || (me.permissions || []).includes("manage_suggestions"));

  useEffect(() => { loadData(); loadThreads(); }, [categoryId]);

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
      if (catsRes.ok) {
        const cats = await catsRes.json();
        setCategory(cats.find((c: any) => c.id === categoryId));
      }
      if (prefRes.ok) setPrefixes(await prefRes.json());
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }

  async function loadThreads(nextCursor?: number | null) {
    const token = getToken();
    const url = nextCursor
      ? `${API_URL}/api/suggestions/threads/${categoryId}?cursor=${nextCursor}`
      : `${API_URL}/api/suggestions/threads/${categoryId}`;
    try {
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      if (res.ok) {
        const data = await res.json();
        if (nextCursor) setThreads(prev => [...prev, ...data.threads]);
        else setThreads(data.threads);
        setHasMore(data.has_more);
        if (data.next_cursor) setCursor(data.next_cursor);
      }
    } catch (e) { console.error(e); }
  }

  async function createThread() {
    if (!title.trim() || !content.trim()) return alert(t("suggestions.fillFields"));
    const token = getToken();
    const form = new FormData();
    form.append("category_id", categoryId.toString());
    form.append("title", title);
    form.append("content", content);
    if (canManage && prefixId) form.append("prefix_id", String(prefixId));
    const res = await fetch(`${API_URL}/api/suggestions/threads`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
    });
    if (res.ok) {
      const d = await res.json();
      setShowCreate(false); setTitle(""); setContent("");
      router.push(`/suggestions/thread/${d.id}`);
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-600 dark:text-white/50">{t("common.loading")}</div>;
  if (!category) return <div className="min-h-screen bg-paper dark:bg-[#171717] flex items-center justify-center"><p className="text-gray-600 dark:text-white/50">{t("suggestions.categoryNotFound")}</p></div>;

  return (
    <div className="min-h-screen bg-paper dark:bg-[#171717]">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <Link href="/suggestions" className="inline-flex items-center gap-2 text-gray-600 dark:text-white/50 hover:text-gray-900 dark:hover:text-white mb-6">
          <ArrowLeft size={16} /> {t("suggestions.title")}
        </Link>

        <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-black text-gray-900 dark:text-white">{category.name}</h1>
              {category.is_archived && (
                <span className="px-2 py-1 rounded text-[10px] font-bold bg-gray-500/20 text-gray-400 flex items-center gap-1">
                  <Lock size={10} /> {t("suggestions.closedCategory")}
                </span>
              )}
            </div>
            {category.description && <p className="text-gray-600 dark:text-white/50 mt-1">{category.description}</p>}
            <p className="text-gray-500 dark:text-white/40 text-sm mt-2">{category.threads_count} {t("suggestions.threads")} · {category.comments_count} {t("suggestions.messages")}</p>
          </div>
          {!category.is_archived && (
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#8b5cf6] text-white font-bold hover:bg-[#7c3aed] transition-all">
              <Plus size={18} /> {t("suggestions.createThread")}
            </button>
          )}
        </div>

        {category.is_archived && (
          <div className="mb-4 px-4 py-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 text-sm">
            {t("suggestions.categoryClosed")}
          </div>
        )}

        <div className="border border-line dark:border-white/10 rounded-2xl bg-gray-100 dark:bg-white/5 overflow-hidden">
          {threads.length === 0 ? (
            <div className="text-center py-16">
              <MessageSquare size={48} className="mx-auto text-gray-500 dark:text-white/20 mb-4" />
              <p className="text-gray-600 dark:text-white/50">{t("suggestions.noThreads")}</p>
              <p className="text-gray-500 dark:text-white/30 text-sm mt-1">{t("suggestions.beFirst")}</p>
            </div>
          ) : (
            <>
              {threads.map((th, i) => (
                <div key={th.id}
                  className={`flex items-center gap-4 p-5 hover:bg-gray-100 dark:hover:bg-white/5 transition-all cursor-pointer ${i > 0 ? "border-t border-line dark:border-white/10" : ""}`}
                  onClick={() => router.push(`/suggestions/thread/${th.id}`)}>
                  <Avatar src={th.author?.avatar_url} name={th.author?.display_name} id={th.author?.id} size={40} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {th.is_pinned && <Pin size={14} className="text-yellow-600 dark:text-yellow-400 shrink-0" />}
                      {th.is_closed && <Lock size={14} className="text-red-600 dark:text-red-400 shrink-0" />}
                      {th.prefix && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold shrink-0" style={{ color: th.prefix.color, background: th.prefix.bg_color }}>
                          {th.prefix.name}
                        </span>
                      )}
                      <h3 className="font-bold text-gray-900 dark:text-white truncate hover:text-[#8b5cf6] transition-colors">{th.title}</h3>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-white/40">
                      <span>{th.author?.display_name}</span>
                      <span>·</span>
                      <span>{fmtDate(th.created_at)}</span>
                      {th.last_comment && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1 truncate">
                            <Avatar src={th.last_comment.author?.avatar_url} name={th.last_comment.author?.display_name} id={th.last_comment.author?.id} size={14} />
                            {fmtDate(th.last_comment.created_at)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="hidden sm:flex text-center text-xs text-gray-600 dark:text-white/50 gap-5 shrink-0">
                    <div><p className="font-black text-gray-900 dark:text-white text-base">{th.comments_count}</p>{t("suggestions.messages")}</div>
                    <div><p className="font-black text-gray-900 dark:text-white text-base">{th.views_count}</p>{t("suggestions.views")}</div>
                  </div>
                </div>
              ))}
              {hasMore && (
                <button onClick={() => loadThreads(cursor)}
                  className="w-full py-3 border-t border-line dark:border-white/10 text-gray-600 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white transition-all">
                  {t("suggestions.loadMoreThreads")}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-black text-gray-900 dark:text-white">{t("suggestions.newThread")}</h3>
              <button onClick={() => setShowCreate(false)} className="text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white"><X size={20} /></button>
            </div>
            {canManage && prefixes.length > 0 && (
              <select value={prefixId} onChange={(e) => setPrefixId(parseInt(e.target.value))}
                className="w-full mb-3 px-3 py-2 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 text-gray-900 dark:text-white outline-none">
                <option value={0}>{t("suggestions.noPrefix")}</option>
                {prefixes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("suggestions.threadTitlePh")}
              className="w-full mb-4 px-4 py-3 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 text-gray-900 dark:text-white text-lg focus:border-[#8b5cf6] outline-none" />
            <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder={t("suggestions.threadContentPh")} rows={8}
              className="w-full mb-4 px-4 py-3 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 text-gray-900 dark:text-white focus:border-[#8b5cf6] outline-none resize-none" />
            <div className="flex gap-3">
              <button onClick={createThread} className="flex-1 py-3 rounded-lg bg-[#8b5cf6] text-white font-bold hover:bg-[#7c3aed]">{t("suggestions.publish")}</button>
              <button onClick={() => setShowCreate(false)} className="flex-1 py-3 rounded-lg border border-line dark:border-white/15 text-gray-800 dark:text-white/80 font-bold hover:bg-gray-100 dark:hover:bg-white/5">{t("common.cancel")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}