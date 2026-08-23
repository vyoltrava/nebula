"use client";
import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import {
  BarChart3, Users, FileText, Pin, Archive, CheckCircle,
  XCircle, Clock, Plus, Shield, TrendingUp, Zap
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// Используем labelKey для динамического перевода через t()
const STATUS_BADGES: Record<string, any> = {
  pending: { labelKey: "suggestions.status.pending", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", icon: Clock },
  approved: { labelKey: "suggestions.status.approved", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: CheckCircle },
  implemented: { labelKey: "suggestions.status.implemented", color: "bg-green-500/20 text-green-400 border-green-500/30", icon: Zap },
  rejected: { labelKey: "suggestions.status.rejected", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: XCircle },
  archived: { labelKey: "suggestions.status.archived", color: "bg-gray-500/20 text-gray-400 border-gray-500/30", icon: Archive },
};

export function TeamDashboard({ me }: { me: any }) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<"stats" | "suggestions" | "archive">("stats");
  const [stats, setStats] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [creating, setCreating] = useState(false);

  const isStaff = me?.is_admin || me?.is_moderator || me?.permissions?.includes("manage_announcements");

  async function loadData() {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    
    try {
      const [statsRes, suggRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/team-dashboard/stats`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/suggestions?status=${activeTab === "archive" ? "archived" : ""}`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      
      if (statsRes.ok) setStats(await statsRes.json());
      if (suggRes.ok) setSuggestions(await suggRes.json());
    } catch (e) {
      console.error("Failed to load dashboard", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { 
    loadData(); 
  }, [activeTab]);

  async function createSuggestion() {
    // 🛠️ ИСПРАВЛЕНО: используем существующий ключ или прямой текст, так как fillAllFields нет в словаре
    if (!newTitle.trim() || !newContent.trim()) {
      return alert(t("common.error") || "Заповніть усі поля");
    }
    
    const token = getToken();
    const form = new FormData();
    form.append("title", newTitle);
    form.append("content", newContent);
    
    setCreating(true);
    try {
      const res = await fetch(`${API_URL}/api/suggestions`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form
      });
      if (res.ok) {
        setShowCreateModal(false);
        setNewTitle(""); setNewContent("");
        loadData();
      } else {
        const err = await res.json().catch(() => null);
        alert(err?.detail || (t("common.error") || "Помилка створення"));
      }
    } finally {
      setCreating(false);
    }
  }

  async function updateSuggestionStatus(id: number, status: string) {
    const token = getToken();
    const form = new FormData();
    form.append("status", status);
    await fetch(`${API_URL}/api/suggestions/${id}/status`, {
      method: "PATCH", headers: { Authorization: `Bearer ${token}` }, body: form
    });
    loadData();
  }

  async function togglePin(id: number, is_pinned: boolean) {
    const token = getToken();
    const form = new FormData();
    form.append("is_pinned", String(is_pinned));
    await fetch(`${API_URL}/api/suggestions/${id}/pin`, {
      method: "PATCH", headers: { Authorization: `Bearer ${token}` }, body: form
    });
    loadData();
  }

  if (loading) return <div className="p-8 text-center text-white/50 animate-pulse">{t("common.loading")}</div>;

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <h2 className="text-xl font-black text-white flex items-center gap-2">
          <Shield className="text-purple-400" size={24} /> {t("teams.title")}
        </h2>
        <div className="flex gap-2 flex-wrap">
          <button 
            onClick={() => setActiveTab("stats")} 
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${activeTab === "stats" ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" : "text-white/50 hover:text-white hover:bg-white/5"}`}
          >
            {t("teams.tabStats")}
          </button>
          <button 
            onClick={() => setActiveTab("suggestions")} 
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${activeTab === "suggestions" ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" : "text-white/50 hover:text-white hover:bg-white/5"}`}
          >
            {t("teams.tabSuggestions")}
          </button>
          {isStaff && (
            <button 
              onClick={() => setActiveTab("archive")} 
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${activeTab === "archive" ? "bg-gray-500/20 text-gray-400 border border-gray-500/30" : "text-white/50 hover:text-white hover:bg-white/5"}`}
            >
              {t("teams.tabArchive")}
            </button>
          )}
        </div>
      </div>

      {activeTab === "stats" && stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users} label={t("teams.stats.totalUsers")} value={stats.total_users} color="text-blue-400" />
          <StatCard icon={TrendingUp} label={t("teams.stats.registrations7d")} value={stats.registrations_7d} color="text-green-400" />
          <StatCard icon={FileText} label={t("teams.stats.totalPosts")} value={stats.total_posts} color="text-yellow-400" />
          
          {/* 🛠️ ИСПРАВЛЕНО: явное приведение типа к number[] для .reduce, чтобы TS не ругался */}
          <StatCard 
            icon={BarChart3} 
            label={t("teams.stats.teamActions30d")} 
            value={(Object.values(stats.staff_actions || {}) as number[]).reduce((a, b) => a + b, 0)} 
            color="text-purple-400" 
          />
          
          <div className="md:col-span-2 lg:col-span-4 bg-[#1f1f23] border border-white/10 rounded-2xl p-5 mt-2">
            <h3 className="text-sm font-bold text-white/60 mb-4 uppercase tracking-wider">{t("teams.stats.suggestionsStatus")}</h3>
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
      )}

      {(activeTab === "suggestions" || activeTab === "archive") && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-white/50 text-sm">
              {activeTab === "archive" ? t("teams.suggestions.archiveDesc") : t("teams.suggestions.activeDesc")}
            </p>
            <button 
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white text-sm font-bold hover:bg-purple-400 transition-colors"
            >
              <Plus size={16} /> {t("suggestions.createTopic")}
            </button>
          </div>

          <div className="space-y-3">
            {suggestions.length === 0 ? (
              <div className="text-center py-12 border border-white/10 rounded-2xl bg-white/5 text-white/30">
                {t("teams.suggestions.empty")}
              </div>
            ) : (
              suggestions.map((s) => {
                const badge = STATUS_BADGES[s.status] || STATUS_BADGES.pending;
                const Icon = badge.icon;
                return (
                  <div key={s.id} className="bg-[#1f1f23] border border-white/10 rounded-xl p-5 hover:border-white/20 transition-colors">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          {s.is_pinned && <Pin size={14} className="text-yellow-400" />}
                          <h3 className="font-bold text-white text-lg truncate">{s.title}</h3>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border flex items-center gap-1 ${badge.color}`}>
                            <Icon size={10} /> {t(badge.labelKey)}
                          </span>
                        </div>
                        <p className="text-sm text-white/60 line-clamp-2 mb-3">{s.content}</p>
                        <div className="flex items-center gap-2 text-xs text-white/40">
                          <Avatar src={s.author?.avatar_url} name={s.author?.display_name} id={s.author?.id} size={16} />
                          <span>{s.author?.display_name || "Unknown"}</span>
                          <span>•</span>
                          <span>{new Date(s.created_at).toLocaleDateString("uk-UA")}</span>
                        </div>
                      </div>
                      
                      {isStaff && activeTab !== "archive" && (
                        <div className="flex flex-row md:flex-col gap-2 shrink-0 border-t md:border-t-0 md:border-l border-white/10 pt-3 md:pt-0 md:pl-3">
                          <button 
                            onClick={() => togglePin(s.id, !s.is_pinned)} 
                            className={`p-2 rounded-lg border text-xs font-bold transition-colors flex items-center justify-center gap-1 ${s.is_pinned ? "bg-yellow-500/20 border-yellow-500/30 text-yellow-400" : "bg-white/5 border-white/10 text-white/50 hover:text-white"}`}
                          >
                            <Pin size={12} /> {s.is_pinned ? t("teams.suggestions.unpin") : t("teams.suggestions.pin")}
                          </button>
                          
                          {s.status === "pending" && (
                            <>
                              <button onClick={() => updateSuggestionStatus(s.id, "approved")} className="p-2 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-400 text-xs font-bold hover:bg-blue-500/30 transition-colors">{t("teams.suggestions.approve")}</button>
                              <button onClick={() => updateSuggestionStatus(s.id, "rejected")} className="p-2 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-bold hover:bg-red-500/30 transition-colors">{t("teams.suggestions.reject")}</button>
                            </>
                          )}
                          
                          {s.status === "approved" && (
                            <button onClick={() => updateSuggestionStatus(s.id, "implemented")} className="p-2 rounded-lg bg-green-500/20 border border-green-500/30 text-green-400 text-xs font-bold hover:bg-green-500/30 transition-colors">{t("teams.suggestions.implement")}</button>
                          )}
                          
                          <button onClick={() => updateSuggestionStatus(s.id, "archived")} className="p-2 rounded-lg bg-gray-500/20 border border-gray-500/30 text-gray-400 text-xs font-bold hover:bg-gray-500/30 transition-colors">{t("teams.suggestions.archive")}</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {showCreateModal && (
        <>
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[300]" onClick={() => setShowCreateModal(false)} />
          <div className="fixed inset-0 z-[301] flex items-center justify-center p-4 pointer-events-none">
            <div className="w-full max-w-lg bg-[#1f1f23] border border-white/15 rounded-2xl shadow-2xl p-6 pointer-events-auto">
              <h3 className="text-xl font-black text-white mb-4">{t("teams.suggestions.modalTitle")}</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-white/60 mb-1.5">{t("teams.suggestions.modalLabelTitle")}</label>
                  <input 
                    value={newTitle} 
                    onChange={(e) => setNewTitle(e.target.value)} 
                    placeholder={t("teams.suggestions.modalPlaceholderTitle")} 
                    className="w-full px-3 py-2 rounded-lg border border-white/15 bg-white/5 text-white placeholder-white/40 focus:outline-none focus:border-purple-400" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-white/60 mb-1.5">{t("teams.suggestions.modalLabelDesc")}</label>
                  <textarea 
                    value={newContent} 
                    onChange={(e) => setNewContent(e.target.value)} 
                    rows={5} 
                    placeholder={t("teams.suggestions.modalPlaceholderDesc")} 
                    className="w-full px-3 py-2 rounded-lg border border-white/15 bg-white/5 text-white placeholder-white/40 focus:outline-none focus:border-purple-400 resize-none" 
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button onClick={() => setShowCreateModal(false)} className="flex-1 py-2.5 rounded-lg border border-white/15 text-white/80 font-bold hover:bg-white/5">{t("common.cancel")}</button>
                <button 
                  onClick={createSuggestion} 
                  disabled={creating || !newTitle.trim() || !newContent.trim()} 
                  className="flex-1 py-2.5 rounded-lg bg-purple-500 text-white font-bold hover:bg-purple-400 disabled:opacity-50"
                >
                  {creating ? t("suggestions.sending") : t("suggestions.publish")}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
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