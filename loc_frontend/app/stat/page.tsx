"use client";
import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { useRouter } from "next/navigation";
import {
  Users, Shield, FileText, Search, Plus, Palette, MoveRight,
  ChevronDown, ChevronUp, X, Edit2
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

type TabMode = "users" | "team" | "suggestions";
// 🛠️ ИСПРАВЛЕНО: добавлено "actions_count"
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

export default function TeamPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabMode>("users");
  const [users, setUsers] = useState<UserStats[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [prefixes, setPrefixes] = useState<ThreadPrefix[]>([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<any>(null);

  // Фильтры и сортировка (вкладка 1)
  const [searchQuery, setSearchQuery] = useState("");
  const [showTeamOnly, setShowTeamOnly] = useState(false);
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Модалки (вкладка 3)
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
        if (res.ok) {
          const data = await res.json();
          setUsers(data);
        }
      } else if (activeTab === "team") {
        const res = await fetch(`${API_URL}/api/admin/team-statistics`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setTeamMembers(data.members || []);
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
        u.username.toLowerCase().includes(q) ||
        u.display_name.toLowerCase().includes(q)
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
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form
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
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form
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
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: form
    });

    setSelectedThread(null);
    loadData();
  }

  if (loading) return (
    <div className="min-h-screen bg-[#171717] flex items-center justify-center">
      <p className="text-white/50 animate-pulse">Загрузка...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#171717]">
      <div className="max-w-7xl mx-auto px-4 py-10">
        {/* Шапка */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-white">Панель команды</h1>
            <p className="text-white/50 text-sm mt-1">Статистика и управление проектом</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab("users")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === "users" ? "bg-purple-500 text-white" : "bg-white/5 text-white/60 hover:bg-white/10"
              }`}
            >
              <Users size={16} /> Пользователи
            </button>
            <button
              onClick={() => setActiveTab("team")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === "team" ? "bg-purple-500 text-white" : "bg-white/5 text-white/60 hover:bg-white/10"
              }`}
            >
              <Shield size={16} /> Команда
            </button>
            <button
              onClick={() => setActiveTab("suggestions")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === "suggestions" ? "bg-purple-500 text-white" : "bg-white/5 text-white/60 hover:bg-white/10"
              }`}
            >
              <FileText size={16} /> Предложения
            </button>
          </div>
        </div>

        {/* ========== ВКЛАДКА 1: СТАТИСТИКА ПОЛЬЗОВАТЕЛЕЙ ========== */}
        {activeTab === "users" && (
          <div className="space-y-4">
            {/* Фильтры */}
            <div className="flex gap-3 items-center p-4 bg-white/5 rounded-xl border border-white/10">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                <input
                  type="text"
                  placeholder="Поиск пользователей..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg bg-[#171717] border border-white/10 text-white focus:border-purple-500 outline-none"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showTeamOnly}
                  onChange={(e) => setShowTeamOnly(e.target.checked)}
                  className="rounded border-white/30 bg-white/5"
                />
                Только команда (3+ lvl)
              </label>
            </div>

            {/* Таблица */}
            <div className="bg-[#1f1f23] border border-white/10 rounded-xl overflow-hidden">
              <div className="grid grid-cols-12 gap-4 p-4 border-b border-white/10 bg-white/5 text-xs font-bold text-white/60 uppercase">
                <div className="col-span-4 cursor-pointer hover:text-white" onClick={() => handleSort("username")}>
                  Пользователь {sortField === "username" && (sortOrder === "asc" ? "↑" : "↓")}
                </div>
                <div className="col-span-2 cursor-pointer hover:text-white" onClick={() => handleSort("level")}>
                  Уровень {sortField === "level" && (sortOrder === "asc" ? "↑" : "↓")}
                </div>
                <div className="col-span-2 cursor-pointer hover:text-white" onClick={() => handleSort("posts_count")}>
                  Посты {sortField === "posts_count" && (sortOrder === "asc" ? "↑" : "↓")}
                </div>
                <div className="col-span-2 cursor-pointer hover:text-white" onClick={() => handleSort("actions_count")}>
                  Действия {sortField === "actions_count" && (sortOrder === "asc" ? "↑" : "↓")}
                </div>
                <div className="col-span-2 cursor-pointer hover:text-white" onClick={() => handleSort("last_seen")}>
                  Последний вход {sortField === "last_seen" && (sortOrder === "asc" ? "↑" : "↓")}
                </div>
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
                    <div className="col-span-2">
                      <span className="px-2 py-1 rounded bg-purple-500/20 text-purple-400 text-xs font-bold">
                        Lvl {user.level}
                      </span>
                    </div>
                    <div className="col-span-2 text-white/70 text-sm">{user.posts_count}</div>
                    <div className="col-span-2 text-white/70 text-sm">{user.actions_count}</div>
                    <div className="col-span-2 text-white/40 text-xs">
                      {user.last_seen ? new Date(user.last_seen).toLocaleString("ru-RU") : "—"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========== ВКЛАДКА 2: КОМАНДА ПРОЕКТА ========== */}
        {activeTab === "team" && (
          <div className="space-y-6">
            {teamMembers.length === 0 ? (
              <div className="text-center py-16 border border-white/10 rounded-2xl bg-white/5">
                <Shield size={48} className="mx-auto text-white/20 mb-4" />
                <p className="text-white/50 text-lg">Команда проекта пуста</p>
              </div>
            ) : (
              teamMembers.map((member) => (
                <div key={member.user.id} className="bg-[#1f1f23] border border-white/10 rounded-xl overflow-hidden">
                  <div className="p-4 border-b border-white/10 bg-gradient-to-r from-purple-500/10 to-transparent">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar src={member.user.avatar_url} name={member.user.display_name} id={member.user.id} size={40} />
                        <div>
                          <h3 className="text-white font-bold text-lg">{member.user.display_name}</h3>
                          <p className="text-white/50 text-sm">@{member.user.username}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {member.role && (
                          <span
                            className="px-3 py-1.5 rounded-lg text-xs font-bold"
                            style={{ background: `${member.role.color}20`, color: member.role.color }}
                          >
                            {member.role.name}
                          </span>
                        )}
                        <span className="text-white/40 text-sm">
                          {member.actions_count} действий
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="p-3 rounded-lg bg-white/5">
                        <p className="text-white/40 text-xs mb-1">Дата регистрации</p>
                        <p className="text-white font-bold">
                          {new Date(member.user.created_at).toLocaleDateString("ru-RU")}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-white/5">
                        <p className="text-white/40 text-xs mb-1">Последний вход</p>
                        <p className="text-white font-bold">
                          {member.last_seen ? new Date(member.last_seen).toLocaleString("ru-RU") : "—"}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-white/5">
                        <p className="text-white/40 text-xs mb-1">Всего действий</p>
                        <p className="text-white font-bold">{member.actions_count}</p>
                      </div>
                    </div>

                    <div className="border-t border-white/10 pt-4">
                      <h4 className="text-white font-bold text-sm mb-3">История активности</h4>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        <p className="text-white/40 text-sm italic">История загружается...</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ========== ВКЛАДКА 3: ПРЕДЛОЖЕНИЯ ========== */}
        {activeTab === "suggestions" && (
          <div className="space-y-4">
            {/* Панель управления */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowCategoryModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white text-sm font-bold hover:bg-purple-400"
              >
                <Plus size={16} /> Новая категория
              </button>
              <button
                onClick={() => setShowPrefixModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-bold hover:bg-blue-400"
              >
                <Palette size={16} /> Префикс темы
              </button>
            </div>

            {/* Список тем с префиксами */}
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
                          <div
                            className="px-3 py-1.5 rounded-lg text-xs font-bold shrink-0"
                            style={{ background: prefix.bg_color, color: prefix.color }}
                          >
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
                          <button
                            onClick={() => setSelectedThread(thread)}
                            className="p-2 rounded-lg bg-white/5 text-white/60 hover:text-white hover:bg-white/10"
                            title="Перенести"
                          >
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

      {/* Модалка создания префикса */}
      {showPrefixModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#1f1f23] border border-white/15 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-black text-white">Новый префикс</h3>
              <button onClick={() => setShowPrefixModal(false)}>
                <X size={20} className="text-white/50 hover:text-white" />
              </button>
            </div>
            <input
              value={newPrefix.name}
              onChange={(e) => setNewPrefix({ ...newPrefix, name: e.target.value })}
              placeholder="Название префикса"
              className="w-full mb-3 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:border-purple-500 outline-none"
            />
            <div className="mb-3">
              <label className="block text-xs text-white/60 mb-2">Цвет текста</label>
              <input
                type="color"
                value={newPrefix.color}
                onChange={(e) => setNewPrefix({ ...newPrefix, color: e.target.value })}
                className="w-full h-10 rounded-lg cursor-pointer"
              />
            </div>
            <div className="mb-4">
              <label className="block text-xs text-white/60 mb-2">Цвет фона</label>
              <input
                type="color"
                value={newPrefix.bg_color}
                onChange={(e) => setNewPrefix({ ...newPrefix, bg_color: e.target.value })}
                className="w-full h-10 rounded-lg cursor-pointer"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={createPrefix} className="flex-1 py-2.5 rounded-lg bg-purple-500 text-white font-bold">
                Создать
              </button>
              <button onClick={() => setShowPrefixModal(false)} className="flex-1 py-2.5 rounded-lg border border-white/15 text-white/80 font-bold">
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модалка создания категории */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#1f1f23] border border-white/15 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-black text-white">Новая категория</h3>
              <button onClick={() => setShowCategoryModal(false)}>
                <X size={20} className="text-white/50 hover:text-white" />
              </button>
            </div>
            <input
              value={newCategory.name}
              onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
              placeholder="Название категории"
              className="w-full mb-3 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:border-purple-500 outline-none"
            />
            <textarea
              value={newCategory.description}
              onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })}
              placeholder="Описание"
              rows={3}
              className="w-full mb-3 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:border-purple-500 outline-none resize-none"
            />
            <div className="mb-4">
              <label className="block text-xs text-white/60 mb-2">Цвет</label>
              <input
                type="color"
                value={newCategory.color}
                onChange={(e) => setNewCategory({ ...newCategory, color: e.target.value })}
                className="w-full h-10 rounded-lg cursor-pointer"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={createCategory} className="flex-1 py-2.5 rounded-lg bg-purple-500 text-white font-bold">
                Создать
              </button>
              <button onClick={() => setShowCategoryModal(false)} className="flex-1 py-2.5 rounded-lg border border-white/15 text-white/80 font-bold">
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модалка переноса темы */}
      {selectedThread && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#1f1f23] border border-white/15 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-black text-white">Перенос темы</h3>
              <button onClick={() => setSelectedThread(null)}>
                <X size={20} className="text-white/50 hover:text-white" />
              </button>
            </div>
            <p className="text-white/60 text-sm mb-4">{selectedThread.title}</p>
            <div className="space-y-2">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => moveThread(selectedThread.id, cat.id)}
                  className="w-full p-3 rounded-lg bg-white/5 text-white hover:bg-white/10 text-left"
                >
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