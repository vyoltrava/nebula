"use client";
import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { useRouter, Link } from "next/navigation";
import {
  Users, Shield, FileText, Search, Plus, Palette, MoveRight,
  ArrowLeft, X, Settings, BarChart3, Clock, CheckCircle, AlertCircle
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

type TabMode = "users" | "team" | "suggestions";
type SortField = "username" | "level" | "created_at" | "last_seen" | "posts_count" | "actions_count";
type SortOrder = "asc" | "desc";

interface UserStats {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string | null;
  role: any;
  level: number;
  created_at: string;
  last_seen: string | null;
  posts_count: number;
  actions_count: number;
  is_admin: boolean;
  is_moderator: boolean;
}

interface ThreadPrefix {
  id: number;
  name: string;
  color: string;
  bg_color: string;
}

interface TeamMember {
  user: any;
  role: any;
  actions_count: number;
  last_seen: string | null;
}

interface TeamGroup {
  id: number;
  name: string;
  color: string;
  description?: string;
  members: TeamMember[];
}

export default function StatPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabMode>("users");
  const [users, setUsers] = useState<UserStats[]>([]);
  const [teamGroups, setTeamGroups] = useState<TeamGroup[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [prefixes, setPrefixes] = useState<ThreadPrefix[]>([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [memberStats, setMemberStats] = useState<any>(null);

  const [showTeamOnly, setShowTeamOnly] = useState(false);
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const [showPrefixModal, setShowPrefixModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [selectedThread, setSelectedThread] = useState<any>(null);
  const [newPrefix, setNewPrefix] = useState({ name: "", color: "#ffffff", bg_color: "#ef4444" });
  const [newCategory, setNewCategory] = useState({ name: "", description: "", color: "#8b5cf6" });

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (me) loadData();
  }, [activeTab, me]);

  async function checkAuth() {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMe(data);
        const hasAccess = data.is_admin || data.is_moderator || data.permissions?.includes("manage_team_stats");
        if (!hasAccess) {
          router.push("/");
        }
      }
    } catch (e) {
      router.push("/login");
    }
  }

  async function loadData() {
    const token = getToken();
    if (!token) return;
    setLoading(true);

    try {
      if (activeTab === "users") {
        const res = await fetch(`${API_URL}/api/admin/users`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) setUsers(await res.json());
      } else if (activeTab === "team") {
        const res = await fetch(`${API_URL}/api/admin/team-statistics`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setTeamGroups(data.groups || []);
        }
      } else if (activeTab === "suggestions") {
        const [suggRes, catRes, prefixRes] = await Promise.all([
          fetch(`${API_URL}/api/suggestions`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_URL}/api/suggestions/categories`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_URL}/api/admin/suggestion-prefixes`, { headers: { Authorization: `Bearer ${token}` } })
        ]);
        if (suggRes.ok) setSuggestions(await suggRes.json());
        if (catRes.ok) setCategories(await catRes.json());
        if (prefixRes.ok) setPrefixes(await prefixRes.json());
      }
    } catch (e) {
      console.error("Failed to load data", e);
    } finally {
      setLoading(false);
    }
  }

  async function loadMemberStats(memberId: number) {
    const token = getToken();
    try {
      const res = await fetch(`${API_URL}/api/admin/team-statistics?user_id=${memberId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMemberStats(data);
      }
    } catch (e) {
      console.error("Failed to load member stats", e);
    }
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  }

  function getSortedUsers() {
    let filtered = [...users];
    if (showTeamOnly) {
      filtered = filtered.filter(u => u.level >= 3 || u.is_admin || u.is_moderator);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(u =>
        u.username.toLowerCase().includes(q) || u.display_name.toLowerCase().includes(q)
      );
    }
    filtered.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];
      if (sortField === "created_at" || sortField === "last_seen") {
        aVal = aVal ? new Date(aVal).getTime() : 0;
        bVal = bVal ? new Date(bVal).getTime() : 0;
      }
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
    return filtered;
  }

  async function createPrefix() {
    const token = getToken();
    const form = new FormData();
    form.append("name", newPrefix.name);
    form.append("color", newPrefix.color);
    form.append("bg_color", newPrefix.bg_color);
    const res = await fetch(`${API_URL}/api/admin/suggestion-prefixes`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form
    });
    if (res.ok) {
      setShowPrefixModal(false);
      setNewPrefix({ name: "", color: "#ffffff", bg_color: "#ef4444" });
      loadData();
    }
  }

  async function createCategory() {
    const token = getToken();
    const form = new FormData();
    form.append("name", newCategory.name);
    form.append("description", newCategory.description);
    form.append("color", newCategory.color);
    const res = await fetch(`${API_URL}/api/suggestions/categories`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form
    });
    if (res.ok) {
      setShowCategoryModal(false);
      setNewCategory({ name: "", description: "", color: "#8b5cf6" });
      loadData();
    }
  }

  async function moveThread(threadId: number, categoryId: number) {
    const token = getToken();
    const form = new FormData();
    form.append("category_id", categoryId.toString());
    await fetch(`${API_URL}/api/admin/suggestions/${threadId}/move`, {
      method: "PATCH", headers: { Authorization: `Bearer ${token}` }, body: form
    });
    setSelectedThread(null);
    loadData();
  }

  function openMemberDetails(member: any) {
    setSelectedMember(member);
    loadMemberStats(member.user.id);
  }

  if (loading) return (
    <div className="min-h-screen bg-[#171717] flex items-center justify-center">
      <p className="text-white/50 animate-pulse">Загрузка...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#171717]">
      <div className="max-w-7xl mx-auto px-4 py-10">
        {/* Шапка с кнопкой Назад */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 rounded-lg bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-all">
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-3xl font-black text-white">Панель команды</h1>
              <p className="text-white/50 text-sm mt-1">Статистика и управление проектом</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setActiveTab("users")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === "users" ? "bg-purple-500 text-white" : "bg-white/5 text-white/60 hover:bg-white/10"}`}>
              <Users size={16} /> Пользователи
            </button>
            <button onClick={() => setActiveTab("team")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === "team" ? "bg-purple-500 text-white" : "bg-white/5 text-white/60 hover:bg-white/10"}`}>
              <Shield size={16} /> Команда
            </button>
            <button onClick={() => setActiveTab("suggestions")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === "suggestions" ? "bg-purple-500 text-white" : "bg-white/5 text-white/60 hover:bg-white/10"}`}>
              <FileText size={16} /> Предложения
            </button>
          </div>
        </div>

        {/* ========== ВКЛАДКА 1: ПОЛЬЗОВАТЕЛИ ========== */}
        {activeTab === "users" && (
          <div className="space-y-4">
            <div className="flex gap-3 items-center p-4 bg-white/5 rounded-xl border border-white/10">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                <input type="text" placeholder="Поиск пользователей..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 rounded-lg bg-[#171717] border border-white/10 text-white focus:border-purple-500 outline-none" />
              </div>
              <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
                <input type="checkbox" checked={showTeamOnly} onChange={(e) => setShowTeamOnly(e.target.checked)} className="rounded border-white/30 bg-white/5" />
                Только команда (3+ lvl)
              </label>
            </div>
            <div className="bg-[#1f1f23] border border-white/10 rounded-xl overflow-hidden">
              <div className="grid grid-cols-12 gap-4 p-4 border-b border-white/10 bg-white/5 text-xs font-bold text-white/60 uppercase">
                <div className="col-span-4 cursor-pointer hover:text-white" onClick={() => handleSort("username")}>Пользователь {sortField === "username" && (sortOrder === "asc" ? "↑" : "↓")}</div>
                <div className="col-span-2 cursor-pointer hover:text-white" onClick={() => handleSort("level")}>Уровень {sortField === "level" && (sortOrder === "asc" ? "↑" : "↓")}</div>
                <div className="col-span-2 cursor-pointer hover:text-white" onClick={() => handleSort("posts_count")}>Посты {sortField === "posts_count" && (sortOrder === "asc" ? "↑" : "↓")}</div>
                <div className="col-span-2 cursor-pointer hover:text-white" onClick={() => handleSort("actions_count")}>Действия {sortField === "actions_count" && (sortOrder === "asc" ? "↑" : "↓")}</div>
                <div className="col-span-2 cursor-pointer hover:text-white" onClick={() => handleSort("last_seen")}>Вход {sortField === "last_seen" && (sortOrder === "asc" ? "↑" : "↓")}</div>
              </div>
              <div className="divide-y divide-white/5">
                {getSortedUsers().map((user) => (
                  <div key={user.id} className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-white/5 transition-colors">
                    <div className="col-span-4 flex items-center gap-3">
                      <Avatar src={user.avatar_url} name={user.display_name} id={user.id} size={32} />
                      <div>
                        <p className="text-white font-bold text-sm">{user.display_name}</p>
                        <p className="text-white/40 text-xs">@{user.username}</p>
                      </div>
                    </div>
                    <div className="col-span-2"><span className="px-2 py-1 rounded bg-purple-500/20 text-purple-400 text-xs font-bold">Lvl {user.level}</span></div>
                    <div className="col-span-2 text-white/70 text-sm">{user.posts_count}</div>
                    <div className="col-span-2 text-white/70 text-sm">{user.actions_count}</div>
                    <div className="col-span-2 text-white/40 text-xs">{user.last_seen ? new Date(user.last_seen).toLocaleString("ru-RU") : "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========== ВКЛАДКА 2: КОМАНДА (КАК НА ПРИМЕРЕ) ========== */}
        {activeTab === "team" && (
          <div className="space-y-6">
            {/* Заголовок отдела */}
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black text-white">АРХИТЕКТУРА КОМАНДЫ</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Поиск по сотрудникам..."
                  className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-purple-500 outline-none"
                />
              </div>
            </div>

            {/* Группы по отделам */}
            {teamGroups.length === 0 ? (
              <div className="text-center py-16 border border-white/10 rounded-2xl bg-white/5">
                <Shield size={48} className="mx-auto text-white/20 mb-4" />
                <p className="text-white/50 text-lg">Команда проекта пуста</p>
              </div>
            ) : (
              teamGroups.map((group) => (
                <div key={group.id} className="space-y-4">
                  {/* Заголовок отдела */}
                  <div className="flex items-center gap-3 pb-2 border-b border-white/10">
                    <div className="w-1 h-6 rounded-full" style={{ backgroundColor: group.color }} />
                    <h3 className="text-lg font-bold text-white uppercase tracking-wide">{group.name}</h3>
                    <span className="text-xs text-white/40 bg-white/5 px-2 py-0.5 rounded-full">
                      {group.members.length} чел.
                    </span>
                  </div>
                  
                  {/* Сетка карточек участников */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {group.members.map((member: any) => (
                      <div 
                        key={member.user.id} 
                        onClick={() => openMemberDetails(member)}
                        className="bg-[#1f1f23] border border-white/10 rounded-xl p-4 hover:border-purple-500/50 transition-all cursor-pointer group"
                      >
                        <div className="flex items-start gap-3 mb-3">
                          <Avatar src={member.user.avatar_url} name={member.user.display_name} id={member.user.id} size={48} />
                          <div className="flex-1 min-w-0">
                            <h4 className="text-white font-bold truncate">{member.user.display_name}</h4>
                            <p className="text-white/40 text-xs truncate">@{member.user.username}</p>
                          </div>
                        </div>
                        
                        {/* Роль */}
                        {member.role && (
                          <div className="mb-3">
                            <span 
                              className="inline-block px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border"
                              style={{ 
                                background: `${member.role.color}15`, 
                                color: member.role.color,
                                borderColor: `${member.role.color}40`
                              }}
                            >
                              {member.role.name}
                            </span>
                          </div>
                        )}

                        {/* Статус и метрики */}
                        <div className="space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-white/50">Статус:</span>
                            <span className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                              <span className="text-green-400">Онлайн</span>
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-white/50">Действий:</span>
                            <span className="text-white font-bold">{member.actions_count || 0}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-white/50">Был(а):</span>
                            <span className="text-white/60">
                              {member.user.last_seen ? new Date(member.user.last_seen).toLocaleTimeString("ru-RU", {hour: '2-digit', minute:'2-digit'}) : "Давно"}
                            </span>
                          </div>
                        </div>

                        {/* Кнопка деталей */}
                        <div className="mt-3 pt-3 border-t border-white/10">
                          <button className="w-full flex items-center justify-center gap-2 py-1.5 rounded-lg bg-white/5 text-white/60 text-xs font-bold group-hover:bg-purple-500/20 group-hover:text-purple-300 transition-all">
                            <BarChart3 size={14} /> Детальная статистика
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ========== ВКЛАДКА 3: ПРЕДЛОЖЕНИЯ ========== */}
        {activeTab === "suggestions" && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <button onClick={() => setShowCategoryModal(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white text-sm font-bold hover:bg-purple-400">
                <Plus size={16} /> Новая категория
              </button>
              <button onClick={() => setShowPrefixModal(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-bold hover:bg-blue-400">
                <Palette size={16} /> Префикс темы
              </button>
            </div>
            <div className="space-y-3">
              {suggestions.length === 0 ? (
                <div className="text-center py-16 border border-white/10 rounded-2xl bg-white/5">
                  <FileText size={48} className="mx-auto text-white/20 mb-4" />
                  <p className="text-white/50 text-lg">Пока нет предложений</p>
                </div>
              ) : (
                suggestions.map((thread) => {
                  const prefix = prefixes.find(p => p.name.toLowerCase() === thread.status.toLowerCase());
                  return (
                    <div key={thread.id} className="bg-[#1f1f23] border border-white/10 rounded-xl p-5">
                      <div className="flex items-start gap-4">
                        {prefix && (
                          <div className="px-3 py-1.5 rounded-lg text-xs font-bold shrink-0" style={{ background: prefix.bg_color, color: prefix.color }}>
                            {prefix.name}
                          </div>
                        )}
                        <div className="flex-1">
                          <h3 className="text-white font-bold text-lg mb-2">{thread.title}</h3>
                          <p className="text-white/60 text-sm mb-3">{thread.content}</p>
                          <div className="flex items-center gap-4 text-xs text-white/40">
                            <span>{thread.category?.name}</span>
                            <span>•</span>
                            <span>{new Date(thread.created_at).toLocaleDateString("ru-RU")}</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setSelectedThread(thread)} className="p-2 rounded-lg bg-white/5 text-white/60 hover:text-white hover:bg-white/10" title="Перенести">
                            <MoveRight size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Модалка детальной статистики сотрудника */}
      {selectedMember && memberStats && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[400] flex items-center justify-center p-4">
          <div className="w-full max-w-5xl bg-[#1f1f23] border border-white/15 rounded-2xl max-h-[90vh] overflow-y-auto">
            {/* Шапка модалки */}
            <div className="sticky top-0 bg-[#1f1f23] border-b border-white/10 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar src={selectedMember.user.avatar_url} name={selectedMember.user.display_name} id={selectedMember.user.id} size={40} />
                <div>
                  <h3 className="text-lg font-black text-white">{selectedMember.user.display_name}</h3>
                  <p className="text-sm text-white/50">{selectedMember.role?.name || "Без роли"}</p>
                </div>
              </div>
              <button onClick={() => {setSelectedMember(null); setMemberStats(null);}} className="p-2 rounded-lg bg-white/5 text-white/60 hover:text-white hover:bg-white/10">
                <X size={20} />
              </button>
            </div>

            {/* Контент модалки */}
            <div className="p-6 space-y-6">
              {/* KPI метрики */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <p className="text-white/40 text-xs mb-1">Всего действий</p>
                  <p className="text-2xl font-black text-white">{memberStats.total_actions || 0}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <p className="text-white/40 text-xs mb-1">Уровень</p>
                  <p className="text-2xl font-black text-purple-400">Lvl {selectedMember.role?.level || 1}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <p className="text-white/40 text-xs mb-1">Последний вход</p>
                  <p className="text-lg font-bold text-white">
                    {selectedMember.user.last_seen ? new Date(selectedMember.user.last_seen).toLocaleDateString("ru-RU") : "—"}
                  </p>
                </div>
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <p className="text-white/40 text-xs mb-1">Статус</p>
                  <p className="text-lg font-bold text-green-400 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500" /> Активен
                  </p>
                </div>
              </div>

              {/* История действий */}
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                  <Clock size={18} /> История действий
                </h4>
                {memberStats.actions && memberStats.actions.length > 0 ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {memberStats.actions.map((action: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-[#171717] border border-white/5">
                        <div>
                          <p className="text-white text-sm font-bold">{action.action_type}</p>
                          <p className="text-white/40 text-xs">
                            {action.target_type && action.target_id ? `${action.target_type} #${action.target_id}` : ""}
                          </p>
                        </div>
                        <p className="text-white/40 text-xs">
                          {new Date(action.created_at).toLocaleString("ru-RU")}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-white/40 text-sm text-center py-8">Нет записей</p>
                )}
              </div>

              {/* История смены ролей */}
              {memberStats.role_history && memberStats.role_history.length > 0 && (
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                    <Settings size={18} /> История ролей
                  </h4>
                  <div className="space-y-2">
                    {memberStats.role_history.map((role: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-[#171717] border border-white/5">
                        <div className="flex items-center gap-3">
                          {role.old_role && (
                            <span className="text-white/40 text-sm">{role.old_role}</span>
                          )}
                          <ArrowRight size={16} className="text-white/40" />
                          {role.new_role && (
                            <span className="text-purple-400 text-sm font-bold">{role.new_role}</span>
                          )}
                        </div>
                        <p className="text-white/40 text-xs">
                          {new Date(role.changed_at).toLocaleDateString("ru-RU")}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Остальные модалки (префиксы, категории, перенос тем) */}
      {showPrefixModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#1f1f23] border border-white/15 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-black text-white">Новый префикс</h3>
              <button onClick={() => setShowPrefixModal(false)}><X size={20} className="text-white/50 hover:text-white" /></button>
            </div>
            <input value={newPrefix.name} onChange={(e) => setNewPrefix({ ...newPrefix, name: e.target.value })} placeholder="Название префикса" className="w-full mb-3 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:border-purple-500 outline-none" />
            <div className="mb-3"><label className="block text-xs text-white/60 mb-2">Цвет текста</label><input type="color" value={newPrefix.color} onChange={(e) => setNewPrefix({ ...newPrefix, color: e.target.value })} className="w-full h-10 rounded-lg cursor-pointer" /></div>
            <div className="mb-4"><label className="block text-xs text-white/60 mb-2">Цвет фона</label><input type="color" value={newPrefix.bg_color} onChange={(e) => setNewPrefix({ ...newPrefix, bg_color: e.target.value })} className="w-full h-10 rounded-lg cursor-pointer" /></div>
            <div className="flex gap-2">
              <button onClick={createPrefix} className="flex-1 py-2.5 rounded-lg bg-purple-500 text-white font-bold">Создать</button>
              <button onClick={() => setShowPrefixModal(false)} className="flex-1 py-2.5 rounded-lg border border-white/15 text-white/80 font-bold">Отмена</button>
            </div>
          </div>
        </div>
      )}

      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#1f1f23] border border-white/15 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-black text-white">Новая категория</h3>
              <button onClick={() => setShowCategoryModal(false)}><X size={20} className="text-white/50 hover:text-white" /></button>
            </div>
            <input value={newCategory.name} onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })} placeholder="Название категории" className="w-full mb-3 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:border-purple-500 outline-none" />
            <textarea value={newCategory.description} onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })} placeholder="Описание" rows={3} className="w-full mb-3 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:border-purple-500 outline-none resize-none" />
            <div className="mb-4"><label className="block text-xs text-white/60 mb-2">Цвет</label><input type="color" value={newCategory.color} onChange={(e) => setNewCategory({ ...newCategory, color: e.target.value })} className="w-full h-10 rounded-lg cursor-pointer" /></div>
            <div className="flex gap-2">
              <button onClick={createCategory} className="flex-1 py-2.5 rounded-lg bg-purple-500 text-white font-bold">Создать</button>
              <button onClick={() => setShowCategoryModal(false)} className="flex-1 py-2.5 rounded-lg border border-white/15 text-white/80 font-bold">Отмена</button>
            </div>
          </div>
        </div>
      )}

      {selectedThread && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#1f1f23] border border-white/15 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-black text-white">Перенос темы</h3>
              <button onClick={() => setSelectedThread(null)}><X size={20} className="text-white/50 hover:text-white" /></button>
            </div>
            <p className="text-white/60 text-sm mb-4">{selectedThread.title}</p>
            <div className="space-y-2">
              {categories.map((cat) => (
                <button key={cat.id} onClick={() => moveThread(selectedThread.id, cat.id)} className="w-full p-3 rounded-lg bg-white/5 text-white hover:bg-white/10 text-left">
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ArrowRight({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M5 12h14M12 5l7 7-7 7"/>
    </svg>
  );
}