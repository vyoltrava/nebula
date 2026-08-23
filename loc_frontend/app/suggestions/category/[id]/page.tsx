"use client";
import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import {
  MessageSquare, Plus, Pin, ArrowLeft, Clock, CheckCircle, XCircle, Archive, Zap
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const STATUS_CONFIG: Record<string, any> = {
  pending: { label: "На рассмотрении", color: "bg-yellow-500/20 text-yellow-400", icon: Clock },
  approved: { label: "Одобрено", color: "bg-blue-500/20 text-blue-400", icon: CheckCircle },
  implemented: { label: "Реализовано", color: "bg-green-500/20 text-green-400", icon: Zap },
  rejected: { label: "Отклонено", color: "bg-red-500/20 text-red-400", icon: XCircle },
  archived: { label: "Архив", color: "bg-gray-500/20 text-gray-400", icon: Archive },
};

export default function CategoryPage() {
  const { t } = useI18n();
  const params = useParams();
  const categoryId = parseInt(params.id as string);
  
  const [category, setCategory] = useState<any>(null);
  const [threads, setThreads] = useState<any[]>([]);
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  
  const [newThreadTitle, setNewThreadTitle] = useState("");
  const [newThreadContent, setNewThreadContent] = useState("");

  useEffect(() => {
    loadData();
    loadThreads();
  }, [categoryId]);

  async function loadData() {
    const token = getToken();
    // 🛠️ ИСПРАВЛЕНО: undefined вместо {}
    const authHeader = token ? { Authorization: `Bearer ${token}` } : undefined;
    
    try {
      const [meRes, catsRes] = await Promise.all([
        fetch(`${API_URL}/api/me`, { headers: authHeader }),
        fetch(`${API_URL}/api/suggestions/categories`, { headers: authHeader }),
      ]);
      
      if (meRes.ok) setMe(await meRes.json());
      if (catsRes.ok) {
        const cats = await catsRes.json();
        setCategory(cats.find((c: any) => c.id === categoryId));
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function loadThreads(nextCursor?: number | null) {
    const token = getToken();
    const url = nextCursor 
      ? `${API_URL}/api/suggestions/threads/${categoryId}?cursor=${nextCursor}`
      : `${API_URL}/api/suggestions/threads/${categoryId}`;
    
    try {
      // 🛠️ ИСПРАВЛЕНО: undefined вместо {}
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (res.ok) {
        const data = await res.json();
        if (nextCursor) {
          setThreads(prev => [...prev, ...data.threads]);
        } else {
          setThreads(data.threads);
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

  async function createThread() {
    if (!newThreadTitle.trim() || !newThreadContent.trim()) {
      return alert("Заполните все поля");
    }
    const token = getToken();
    const form = new FormData();
    form.append("category_id", categoryId.toString());
    form.append("title", newThreadTitle);
    form.append("content", newThreadContent);
    
    const res = await fetch(`${API_URL}/api/suggestions/threads`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    
    if (res.ok) {
      setShowCreateModal(false);
      setNewThreadTitle("");
      setNewThreadContent("");
      loadThreads();
    }
  }

  if (!category) {
    return (
      <div className="min-h-screen bg-[#171717] flex items-center justify-center">
        <p className="text-white/50">Раздел не найден</p>
      </div>
    );
  }

  const isAdmin = me?.is_admin;

  return (
    <div className="min-h-screen bg-[#171717]">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="mb-8">
          <Link href="/suggestions" className="inline-flex items-center gap-2 text-white/50 hover:text-white mb-4">
            <ArrowLeft size={16} /> Назад к разделам
          </Link>
          
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-black text-white mb-2">{category.name}</h1>
              {category.description && (
                <p className="text-white/50 text-lg">{category.description}</p>
              )}
              <p className="text-white/40 text-sm mt-2">{category.threads_count} тем</p>
            </div>
            
            {!category.is_archived && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#8b5cf6] text-white font-bold hover:bg-[#7c3aed] transition-all"
              >
                <Plus size={18} /> Создать тему
              </button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {threads.length === 0 && !loading ? (
            <div className="text-center py-16 border border-white/10 rounded-2xl bg-white/5">
              <MessageSquare size={48} className="mx-auto text-white/20 mb-4" />
              <p className="text-white/50 text-lg">Пока нет тем в этом разделе</p>
              <p className="text-white/30 text-sm mt-1">Будьте первым — создайте тему!</p>
            </div>
          ) : (
            <>
              {threads.map((thread) => {
                const statusConfig = STATUS_CONFIG[thread.status] || STATUS_CONFIG.pending;
                const StatusIcon = statusConfig.icon;
                
                return (
                  <Link
                    key={thread.id}
                    href={`/suggestions/thread/${thread.id}`}
                    className="block border border-white/10 rounded-xl p-5 bg-white/5 hover:bg-white/10 transition-all group"
                  >
                    <div className="flex items-start gap-4">
                      {thread.is_pinned && (
                        <Pin size={20} className="text-yellow-400 shrink-0 mt-1" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <h3 className="font-bold text-white text-xl group-hover:text-[#8b5cf6] transition-colors">
                            {thread.title}
                          </h3>
                          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase border flex items-center gap-1.5 ${statusConfig.color}`}>
                            <StatusIcon size={12} />
                            {statusConfig.label}
                          </span>
                        </div>
                        <p className="text-white/60 text-sm line-clamp-2 mb-3">
                          {thread.content}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-white/40">
                          <div className="flex items-center gap-2">
                            <Avatar src={thread.author?.avatar_url} name={thread.author?.display_name} id={thread.author?.id} size={20} />
                            <span>{thread.author?.display_name}</span>
                          </div>
                          <span>•</span>
                          <span>{new Date(thread.created_at).toLocaleDateString("ru-RU")}</span>
                          <span>•</span>
                          <span>{thread.views_count} просмотров</span>
                          <span>•</span>
                          <span>{thread.comments_count} комментариев</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
              
              {hasMore && (
                <button
                  onClick={() => loadThreads(cursor)}
                  className="w-full py-3 rounded-xl border border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white transition-all"
                >
                  Загрузить ещё темы...
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[#1f1f23] border border-white/15 rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-black text-white mb-4">Новая тема</h3>
            <input
              value={newThreadTitle}
              onChange={(e) => setNewThreadTitle(e.target.value)}
              placeholder="Заголовок темы"
              className="w-full mb-4 px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white text-lg focus:border-[#8b5cf6] outline-none"
            />
            <textarea
              value={newThreadContent}
              onChange={(e) => setNewThreadContent(e.target.value)}
              placeholder="Подробно опишите ваше предложение..."
              rows={8}
              className="w-full mb-4 px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white focus:border-[#8b5cf6] outline-none resize-none"
            />
            <div className="flex gap-3">
              <button onClick={createThread} className="flex-1 py-3 rounded-lg bg-[#8b5cf6] text-white font-bold hover:bg-[#7c3aed] transition-all">
                Опубликовать
              </button>
              <button onClick={() => setShowCreateModal(false)} className="flex-1 py-3 rounded-lg border border-white/15 text-white/80 font-bold hover:bg-white/5 transition-all">
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}