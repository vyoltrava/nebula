"use client";
import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { useRouter } from "next/navigation";
import {
  BarChart3, Users, FileText, Pin, Archive, CheckCircle,
  XCircle, Clock, Plus, Shield, TrendingUp, Zap, MessageSquare,
  ArrowLeft, Send
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const STATUS_BADGES: Record<string, any> = {
  pending: { labelKey: "suggestions.status.pending", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", icon: Clock },
  approved: { labelKey: "suggestions.status.approved", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: CheckCircle },
  implemented: { labelKey: "suggestions.status.implemented", color: "bg-green-500/20 text-green-400 border-green-500/30", icon: Zap },
  rejected: { labelKey: "suggestions.status.rejected", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: XCircle },
  archived: { labelKey: "suggestions.status.archived", color: "bg-gray-500/20 text-gray-400 border-gray-500/30", icon: Archive },
};

type ViewMode = "stats" | "categories" | "threads" | "thread-detail" | "team-stats";

export function TeamDashboard({ me }: { me: any }) {
  const { t } = useI18n();
  const router = useRouter();
  
  const [view, setView] = useState<ViewMode>("stats");
  const [stats, setStats] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [threads, setThreads] = useState<any[]>([]);
  const [threadDetail, setThreadDetail] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [teamStats, setTeamStats] = useState<any>(null);
  
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");

  const isAdmin = me?.is_admin;

  useEffect(() => {
    loadData();
  }, [view, selectedCategory, threadDetail]);

  async function loadData() {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    
    try {
      if (view === "stats") {
        const res = await fetch(`${API_URL}/api/admin/team-dashboard/stats`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) setStats(await res.json());
      } else if (view === "categories") {
        const res = await fetch(`${API_URL}/api/suggestions/categories`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) setCategories(await res.json());
      } else if (view === "threads" && selectedCategory) {
        const res = await fetch(`${API_URL}/api/suggestions/threads/${selectedCategory.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setThreads(data.threads);
        }
      } else if (view === "thread-detail" && threadDetail) {
        const res = await fetch(`${API_URL}/api/suggestions/thread/${threadDetail.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setThreadDetail(data.thread);
          setComments(data.comments);
        }
      } else if (view === "team-stats") {
        const res = await fetch(`${API_URL}/api/admin/team-statistics`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) setTeamStats(await res.json());
      }
    } catch (e) {
      console.error("Failed to load data", e);
    } finally {
      setLoading(false);
    }
  }

  async function createThread() {
    if (!newTitle.trim() || !newContent.trim()) return;
    const token = getToken();
    const form = new FormData();
    form.append("category_id", selectedCategory.id.toString());
    form.append("title", newTitle);
    form.append("content", newContent);
    
    const res = await fetch(`${API_URL}/api/suggestions/threads`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    
    if (res.ok) {
      setShowCreateModal(false);
      setNewTitle("");
      setNewContent("");
      loadData();
    }
  }

  async function addComment() {
    if (!newComment.trim() || !threadDetail) return;
    const token = getToken();
    const form = new FormData();
    form.append("content", newComment);
    
    const res = await fetch(`${API_URL}/api/suggestions/thread/${threadDetail.id}/comments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    
    if (res.ok) {
      setNewComment("");
      loadData();
    }
  }

  async function updateThreadStatus(threadId: number, status: string) {
    const token = getToken();
    const form = new FormData();
    form.append("status", status);
    await fetch(`${API_URL}/api/suggestions/thread/${threadId}/status`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    loadData();
  }

  async function togglePin(threadId: number, isPinned: boolean) {
    const token = getToken();
    const form = new FormData();
    form.append("is_pinned", String(isPinned));
    await fetch(`${API_URL}/api/suggestions/thread/${threadId}/pin`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    loadData();
  }

  if (loading) return <div className="p-8 text-center text-white/50 animate-pulse">{t("common.loading")}</div>;

  // ========== STATS VIEW ==========
  if (view === "stats" && stats) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-black text-white">{t("teams.tabStats")}</h2>
          <div className="flex gap-2">
            <button onClick={() => setView("team-stats")} className="px-4 py-2 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30 text-sm font-bold">
              {t("teams.teamStats")}
            </button>
            <button onClick={() => setView("categories")} className="px-4 py-2 rounded-lg bg-[#8b5cf6] text-white text-sm font-bold">
              {t("teams.tabSuggestions")}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users} label={t("teams.stats.totalUsers")} value={stats.total_users} color="text-blue-400" />
          <StatCard icon={TrendingUp} label={t("teams.stats.registrations7d")} value={stats.registrations_7d} color="text-green-400" />
          <StatCard icon={FileText} label={t("teams.stats.totalPosts")} value={stats.total_posts} color="text-yellow-400" />
          <StatCard 
            icon={BarChart3} 
            label={t("teams.stats.teamActions30d")} 
            value={(Object.values(stats.staff_actions || {}) as number[]).reduce((a, b) => a + b, 0)} 
            color="text-purple-400" 
          />
        </div>

        <div className="bg-[#1f1f23] border border-white/10 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-white mb-4">{t("teams.stats.suggestionsStatus")}</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {Object.entries(stats.suggestions || {}).map(([key, val]: any) => {
              const badge = STATUS_BADGES[key];
              const Icon = badge?.icon || Clock;
              return (
                <div key={key} className={`p-4 rounded-xl border ${badge.color} flex flex-col items-center gap-2`}>
                  <Icon size={20} />
                  <span className="text-2xl font-black">{val}</span>
                  <span className="text-xs font-bold opacity-80">{t(badge.labelKey)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ========== TEAM STATS VIEW ==========
  if (view === "team-stats" && teamStats) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto p-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setView("stats")} className="p-2 rounded-lg border border-white/10 text-white/50 hover:text-white">
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-2xl font-black text-white">{t("teams.teamStats")}</h2>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {teamStats.members?.map((member: any) => (
            <div key={member.user.id} className="bg-[#1f1f23] border border-white/10 rounded-xl p-5">
              <div className="flex items-start gap-4">
                <Avatar src={member.user.avatar_url} name={member.user.display_name} id={member.user.id} size={48} />
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-white">{member.user.display_name}</h3>
                  <p className="text-sm text-white/50">@{member.user.username}</p>
                  {member.role && (
                    <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-bold" style={{ background: member.role.color + "20", color: member.role.color }}>
                      {member.role.name}
                    </span>
                  )}
                  <div className="mt-3 text-sm text-white/60">
                    <p>{t("teams.actionsCount")}: {member.actions_count}</p>
                    {member.last_seen && (
                      <p>{t("teams.lastSeen")}: {new Date(member.last_seen).toLocaleString("uk-UA")}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ========== CATEGORIES VIEW ==========
  if (view === "categories") {
    return (
      <div className="space-y-6 max-w-6xl mx-auto p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setView("stats")} className="p-2 rounded-lg border border-white/10 text-white/50 hover:text-white">
              <ArrowLeft size={20} />
            </button>
            <h2 className="text-2xl font-black text-white">{t("teams.tabSuggestions")}</h2>
          </div>
          {isAdmin && (
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white text-sm font-bold">
              <Plus size={16} /> {t("teams.createCategory")}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4">
          {categories.map((cat) => (
            <div
              key={cat.id}
              onClick={() => {
                setSelectedCategory(cat);
                setView("threads");
              }}
              className="border border-white/10 rounded-xl p-6 bg-white/5 hover:bg-white/10 cursor-pointer transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: cat.color + "20" }}>
                  <MessageSquare size={24} style={{ color: cat.color }} />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-white">{cat.name}</h3>
                  {cat.description && <p className="text-white/50 text-sm mt-1">{cat.description}</p>}
                  <p className="text-xs text-white/40 mt-2">{cat.threads_count} {t("teams.threads")}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ========== THREADS VIEW ==========
  if (view === "threads" && selectedCategory) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setView("categories")} className="p-2 rounded-lg border border-white/10 text-white/50 hover:text-white">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h2 className="text-2xl font-black text-white">{selectedCategory.name}</h2>
              <p className="text-white/50 text-sm">{selectedCategory.threads_count} {t("teams.threads")}</p>
            </div>
          </div>
          {!selectedCategory.is_archived && (
            <button 
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#8b5cf6] text-white text-sm font-bold"
            >
              <Plus size={16} /> {t("suggestions.createTopic")}
            </button>
          )}
        </div>

        <div className="space-y-3">
          {threads.map((thread) => {
            const badge = STATUS_BADGES[thread.status] || STATUS_BADGES.pending;
            const Icon = badge.icon;
            return (
              <div
                key={thread.id}
                onClick={() => {
                  setThreadDetail(thread);
                  setView("thread-detail");
                }}
                className="border border-white/10 rounded-xl p-5 bg-white/5 hover:bg-white/10 cursor-pointer transition-all"
              >
                <div className="flex items-start gap-4">
                  {thread.is_pinned && <Pin size={18} className="text-yellow-400 shrink-0 mt-1" />}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <h3 className="font-bold text-white text-lg">{thread.title}</h3>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badge.color}`}>
                        <Icon size={10} className="inline mr-1" />
                        {t(badge.labelKey)}
                      </span>
                    </div>
                    <p className="text-white/60 text-sm line-clamp-2 mb-3">{thread.content}</p>
                    <div className="flex items-center gap-4 text-xs text-white/40">
                      <div className="flex items-center gap-2">
                        <Avatar src={thread.author?.avatar_url} name={thread.author?.display_name} id={thread.author?.id} size={20} />
                        <span>{thread.author?.display_name}</span>
                      </div>
                      <span>•</span>
                      <span>{new Date(thread.created_at).toLocaleDateString("uk-UA")}</span>
                      <span>•</span>
                      <span>{thread.comments_count} {t("teams.comments")}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {showCreateModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-[#1f1f23] border border-white/15 rounded-2xl p-6">
              <h3 className="text-xl font-black text-white mb-4">{t("teams.newThread")}</h3>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={t("teams.threadTitle")}
                className="w-full mb-4 px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white focus:border-[#8b5cf6] outline-none"
              />
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder={t("teams.threadContent")}
                rows={6}
                className="w-full mb-4 px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white focus:border-[#8b5cf6] outline-none resize-none"
              />
              <div className="flex gap-3">
                <button onClick={createThread} className="flex-1 py-3 rounded-lg bg-[#8b5cf6] text-white font-bold">
                  {t("suggestions.publish")}
                </button>
                <button onClick={() => setShowCreateModal(false)} className="flex-1 py-3 rounded-lg border border-white/15 text-white/80 font-bold">
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ========== THREAD DETAIL VIEW ==========
  if (view === "thread-detail" && threadDetail) {
    const badge = STATUS_BADGES[threadDetail.status] || STATUS_BADGES.pending;
    const Icon = badge.icon;
    
    return (
      <div className="space-y-6 max-w-4xl mx-auto p-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setView("threads")} className="p-2 rounded-lg border border-white/10 text-white/50 hover:text-white">
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-2xl font-black text-white">{threadDetail.title}</h2>
        </div>

        <div className="border border-white/10 rounded-2xl p-6 bg-white/5">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <Avatar src={threadDetail.author?.avatar_url} name={threadDetail.author?.display_name} id={threadDetail.author?.id} size={40} />
              <div>
                <p className="text-white font-bold">{threadDetail.author?.display_name}</p>
                <p className="text-xs text-white/40">{new Date(threadDetail.created_at).toLocaleString("uk-UA")}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${badge.color}`}>
                <Icon size={12} className="inline mr-1" />
                {t(badge.labelKey)}
              </span>
              {isAdmin && (
                <div className="flex flex-col gap-1">
                  {threadDetail.status === "pending" && (
                    <>
                      <button onClick={() => updateThreadStatus(threadDetail.id, "approved")} className="px-2 py-1 rounded bg-blue-500/20 text-blue-400 text-xs">
                        {t("teams.suggestions.approve")}
                      </button>
                      <button onClick={() => updateThreadStatus(threadDetail.id, "rejected")} className="px-2 py-1 rounded bg-red-500/20 text-red-400 text-xs">
                        {t("teams.suggestions.reject")}
                      </button>
                    </>
                  )}
                  {threadDetail.status === "approved" && (
                    <button onClick={() => updateThreadStatus(threadDetail.id, "implemented")} className="px-2 py-1 rounded bg-green-500/20 text-green-400 text-xs">
                      {t("teams.suggestions.implement")}
                    </button>
                  )}
                  <button onClick={() => togglePin(threadDetail.id, !threadDetail.is_pinned)} className={`px-2 py-1 rounded text-xs ${threadDetail.is_pinned ? "bg-yellow-500/20 text-yellow-400" : "bg-white/5 text-white/50"}`}>
                    {threadDetail.is_pinned ? t("teams.suggestions.unpin") : t("teams.suggestions.pin")}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="prose prose-invert max-w-none mb-6">
            <p className="text-white/80 whitespace-pre-wrap">{threadDetail.content}</p>
          </div>

          <div className="flex items-center gap-4 text-xs text-white/40 pt-4 border-t border-white/10">
            <span>{threadDetail.views_count} {t("teams.views")}</span>
            <span>•</span>
            <span>{comments.length} {t("teams.comments")}</span>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-bold text-white mb-4">{t("teams.comments")} ({comments.length})</h3>
          <div className="space-y-3">
            {comments.map((comment: any) => (
              <div key={comment.id} className="border border-white/10 rounded-xl p-4 bg-white/5">
                <div className="flex items-start gap-3">
                  <Avatar src={comment.author?.avatar_url} name={comment.author?.display_name} id={comment.author?.id} size={32} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-white font-bold text-sm">{comment.author?.display_name}</span>
                      <span className="text-xs text-white/40">{new Date(comment.created_at).toLocaleString("uk-UA")}</span>
                    </div>
                    <p className="text-white/70 text-sm whitespace-pre-wrap">{comment.content}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 border border-white/10 rounded-xl p-4 bg-white/5">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={t("teams.writeComment")}
              rows={3}
              className="w-full mb-3 px-3 py-2 rounded-lg bg-[#171717] border border-white/10 text-white focus:border-[#8b5cf6] outline-none resize-none"
            />
            <div className="flex justify-end">
              <button onClick={addComment} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#8b5cf6] text-white font-bold">
                <Send size={16} /> {t("common.send")}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function StatCard({ icon: Icon, label, value, color }: any) {
  return (
    <div className="bg-[#1f1f23] border border-white/10 rounded-2xl p-5 flex items-center gap-4">
      <div className={`p-3 rounded-xl bg-white/5 ${color}`}>
        <Icon size={24} />
      </div>
      <div>
        <p className="text-xs font-bold text-white/50 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-black text-white">{value}</p>
      </div>
    </div>
  );
}