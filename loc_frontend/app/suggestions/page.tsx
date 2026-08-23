"use client";
import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { ArrowLeft, Plus, Pin, MessageSquare, X, Send, CheckCircle, XCircle, Clock, Zap, Archive } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const BADGES: Record<string, any> = {
  pending: { labelKey: "suggestions.status.pending", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", icon: Clock },
  approved: { labelKey: "suggestions.status.approved", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: CheckCircle },
  implemented: { labelKey: "suggestions.status.implemented", color: "bg-green-500/20 text-green-400 border-green-500/30", icon: Zap },
  rejected: { labelKey: "suggestions.status.rejected", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: XCircle },
  archived: { labelKey: "suggestions.status.archived", color: "bg-gray-500/20 text-gray-400 border-gray-500/30", icon: Archive },
};

export default function SuggestionsPage() {
  const { t } = useI18n();
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newComment, setNewComment] = useState("");

  async function loadData() {
    const token = getToken();
    const res = await fetch(`${API_URL}/api/suggestions`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) setSuggestions(await res.json());
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  async function openSuggestion(id: number) {
    const token = getToken();
    const res = await fetch(`${API_URL}/api/suggestions/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      const data = await res.json();
      setSelected(data.suggestion);
      setComments(data.comments);
    }
  }

  async function createSuggestion() {
    const token = getToken();
    const form = new FormData();
    form.append("title", newTitle);
    form.append("content", newContent);
    const res = await fetch(`${API_URL}/api/suggestions`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form
    });
    if (res.ok) {
      setShowCreate(false); setNewTitle(""); setNewContent("");
      loadData();
    }
  }

  async function sendComment() {
    if (!newComment.trim() || !selected) return;
    const token = getToken();
    const form = new FormData();
    form.append("content", newComment);
    const res = await fetch(`${API_URL}/api/suggestions/${selected.id}/comments`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form
    });
    if (res.ok) {
      setNewComment("");
      openSuggestion(selected.id);
    }
  }

  if (loading) return <div className="p-8 text-center text-white/50">{t("common.loading")}</div>;

  return (
    <div className="min-h-screen bg-[#171717]">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Link href="/updates" className="inline-flex items-center gap-2 mb-8 px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-white/70 hover:text-white hover:bg-[#8b5cf6]/10 transition-all">
          <ArrowLeft size={18} /> {t("suggestions.backToUpdates")}
        </Link>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-white">{t("suggestions.title")}</h1>
            <p className="text-white/50 text-sm mt-1">{t("suggestions.subtitle")}</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#8b5cf6] text-white font-bold hover:bg-[#7c3aed] transition-all">
            <Plus size={18} /> {t("suggestions.createTopic")}
          </button>
        </div>

        <div className="space-y-4">
          {suggestions.map((s) => {
            const badge = BADGES[s.status] || BADGES.pending;
            const Icon = badge.icon;
            return (
              <div key={s.id} onClick={() => openSuggestion(s.id)} className="border border-white/10 rounded-2xl p-5 bg-white/5 hover:bg-white/[0.07] cursor-pointer transition-all group">
                <div className="flex items-start gap-4">
                  {s.is_pinned && <Pin size={20} className="text-yellow-400 shrink-0 mt-1" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase border ${badge.color}`}>
                        <Icon size={10} /> {t(badge.labelKey)}
                      </span>
                      <span className="text-xs text-white/40">{new Date(s.created_at).toLocaleDateString("ru-RU")}</span>
                    </div>
                    <h3 className="font-bold text-white text-lg group-hover:text-[#8b5cf6] transition-colors">{s.title}</h3>
                    <p className="text-white/60 text-sm line-clamp-2 mt-1">{s.content}</p>
                    <div className="flex items-center gap-2 mt-3">
                      <Avatar src={s.author?.avatar_url} name={s.author?.display_name} id={s.author?.id} size={20} />
                      <span className="text-xs text-white/40">{s.author?.display_name}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {suggestions.length === 0 && <p className="text-center text-white/40 py-12">{t("suggestions.empty")}</p>}
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#1f1f23] border border-white/15 rounded-2xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-black text-white">{t("suggestions.newTitle")}</h3>
              <button onClick={() => setShowCreate(false)}><X size={20} className="text-white/50 hover:text-white" /></button>
            </div>
            <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder={t("suggestions.titlePlaceholder")} className="w-full mb-3 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:border-[#8b5cf6] outline-none" />
            <textarea value={newContent} onChange={e => setNewContent(e.target.value)} rows={5} placeholder={t("suggestions.contentPlaceholder")} className="w-full mb-4 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:border-[#8b5cf6] outline-none resize-none" />
            <button onClick={createSuggestion} className="w-full py-2.5 rounded-lg bg-[#8b5cf6] text-white font-bold hover:bg-[#7c3aed]">{t("suggestions.publish")}</button>
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[#1f1f23] border border-white/15 rounded-2xl flex flex-col max-h-[85vh]">
            <div className="p-6 border-b border-white/10 shrink-0">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  {selected.is_pinned && <Pin size={16} className="text-yellow-400" />}
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${BADGES[selected.status].color}`}>
                    {t(BADGES[selected.status].labelKey)}
                  </span>
                </div>
                <button onClick={() => setSelected(null)}><X size={20} className="text-white/50 hover:text-white" /></button>
              </div>
              <h2 className="text-2xl font-black text-white mb-2">{selected.title}</h2>
              <p className="text-white/70 text-sm whitespace-pre-wrap mb-4">{selected.content}</p>
              <div className="flex items-center gap-2">
                <Avatar src={selected.author?.avatar_url} name={selected.author?.display_name} id={selected.author?.id} size={24} />
                <span className="text-xs text-white/40">{selected.author?.display_name} • {new Date(selected.created_at).toLocaleDateString("ru-RU")}</span>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {comments.map((c: any) => (
                <div key={c.id} className="flex gap-3">
                  <Avatar src={c.author?.avatar_url} name={c.author?.display_name} id={c.author?.id} size={32} />
                  <div className="bg-white/5 rounded-xl p-3 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-white">{c.author?.display_name}</span>
                      <span className="text-[10px] text-white/30">{new Date(c.created_at).toLocaleString("ru-RU")}</span>
                    </div>
                    <p className="text-white/70 text-sm whitespace-pre-wrap">{c.content}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-white/10 shrink-0 flex gap-2">
              <input value={newComment} onChange={e => setNewComment(e.target.value)} onKeyDown={e => e.key === "Enter" && sendComment()} placeholder={t("suggestions.commentPlaceholder")} className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:border-[#8b5cf6] outline-none" />
              <button onClick={sendComment} className="p-2 rounded-lg bg-[#8b5cf6] text-white hover:bg-[#7c3aed]"><Send size={18} /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}