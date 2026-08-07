"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Avatar } from "@/components/Avatar";
import { getToken } from "@/lib/auth";

import {
  Settings,
  Users,
  BarChart3,
  Upload,
  Save,
  Search,
  Crown,
  TrendingUp,
  AlertTriangle,
  Shield,
  ShieldCheck,
  Ban,
  Bug,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  Trash2,
  Filter,
  X,
} from "lucide-react";

// Конфиги статусов и приоритетов для баг-трекера
const BUG_STATUS_CONFIG = {
  new: {
    label: "Новый",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-400/30",
    icon: AlertCircle,
  },
  in_progress: {
    label: "В обработке",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-400/30",
    icon: Clock,
  },
  resolved: {
    label: "Решено",
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-400/30",
    icon: CheckCircle,
  },
  rejected: {
    label: "Отклонено",
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-400/30",
    icon: XCircle,
  },
};

const BUG_PRIORITY_CONFIG = {
  low: { label: "Низкий", color: "text-green-400" },
  medium: { label: "Средний", color: "text-yellow-400" },
  high: { label: "Высокий", color: "text-orange-400" },
  critical: { label: "Критический", color: "text-red-400" },
};

export default function TechnicalPage() {
  const [me, setMe] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"stats" | "users" | "bugs">("stats");
  const [stats, setStats] = useState<any>(null);

  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);

  const [editUsername, setEditUsername] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; type: "ok" | "err" } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  // 🆕 Состояние для баг-трекера
  const [bugs, setBugs] = useState<any[]>([]);
  const [bugsLoading, setBugsLoading] = useState(false);
  const [bugStatusFilter, setBugStatusFilter] = useState<string | null>(null);
  const [selectedBug, setSelectedBug] = useState<any>(null);

  // Свечение ников
  function getGlowColor(user: any): string | null {
    if (user?.is_admin) return "#fff";
    if (user?.is_moderator) return "#3b82f6";
    if (user?.role?.color) return user.role.color;
    return null;
  }

  function glowStyle(user: any): React.CSSProperties | undefined {
    const c = getGlowColor(user);
    if (!c) return undefined;
    return {
      color: c,
      textShadow: `0 0 6px ${c}B3, 0 0 14px ${c}66`,
    };
  }

  async function load() {
    const token = getToken();
    if (!token) return;

    try {
      // 1. Получаем профиль
      const meRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!meRes.ok) {
        console.error("Ошибка получения профиля:", meRes.status);
        return;
      }

      const meData = await meRes.json();
      setMe(meData);

      if (!meData.permissions?.includes("tech_access")) {
        window.location.href = "/";
        return;
      }

      // 2. Загружаем статистику
      const statsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (statsRes.ok) setStats(await statsRes.json());

      // 3. Загружаем пользователей (ИСПРАВЛЕНО)
      const usersRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!usersRes.ok) {
        // Выводим текст ошибки в консоль браузера (F12 -> Console)
        const errorText = await usersRes.text();
        console.error(`❌ Ошибка API /admin/users [${usersRes.status}]:`, errorText);
        return;
      }

      const data = await usersRes.json();
      console.log("✅ Ответ /admin/users:", data); // <-- ОТКРОЙ КОНСОЛЬ И ПОСМОТРИ, ЧТО ТУТ
      
      // 🛡 Поддержка разных форматов ответа от бэкенда
      let usersArray: any[] = [];
      if (Array.isArray(data)) {
        usersArray = data;
      } else if (Array.isArray(data.items)) {
        usersArray = data.items;
      } else if (Array.isArray(data.users)) {
        usersArray = data.users;
      } else if (Array.isArray(data.results)) {
        usersArray = data.results;
      } else {
        console.warn("⚠️ Неизвестный формат ответа пользователей:", data);
      }
      
      setAllUsers(usersArray);

    } catch (err) {
      console.error("💥 Критическая ошибка в функции load():", err);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // 🆕 Грузим баги при переключении вкладки или смене фильтра
  useEffect(() => {
    if (activeTab === "bugs") {
      loadBugs();
    }
  }, [activeTab, bugStatusFilter]);

  function selectUser(user: any) {
    setSelectedUser(user);
    setEditUsername(user.username);
    setEditDisplayName(user.display_name);
    setNewPassword("");
    setSaveMsg(null);
  }

  async function saveUser() {
    if (!selectedUser) return;
    setSaving(true);
    setSaveMsg(null);

    const token = getToken();
    if (!token) return;

    const form = new FormData();
    if (editUsername !== selectedUser.username) form.append("username", editUsername);
    if (editDisplayName !== selectedUser.display_name) form.append("display_name", editDisplayName);
    if (newPassword.trim()) form.append("new_password", newPassword.trim());

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users/${selectedUser.id}/technical`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setSaveMsg({ text: data?.detail ?? "Ошибка сохранения", type: "err" });
        setSaving(false);
        return;
      }

      setSaveMsg({ text: "Сохранено!", type: "ok" });
      setTimeout(() => setSaveMsg(null), 2000);
      load();
    } catch (err) {
      setSaveMsg({ text: "Ошибка при сохранении", type: "err" });
    } finally {
      setSaving(false);
    }
  }

  async function deleteUser() {
    if (!selectedUser) return;

    if (deleteConfirm !== selectedUser.username) {
      setSaveMsg({ text: "Введите username точно для подтверждения", type: "err" });
      return;
    }

    setDeleting(true);
    setSaveMsg(null);

    const token = getToken();
    if (!token) return;

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users/${selectedUser.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setSaveMsg({ text: data?.detail ?? "Ошибка удаления", type: "err" });
        setDeleting(false);
        return;
      }

      const data = await res.json();
      alert(`Аккаунт @${data.deleted_username} удалён. Удалено постов: ${data.deleted_posts}`);

      setSelectedUser(null);
      setDeleteConfirm("");
      load();
    } catch (err) {
      setSaveMsg({ text: "Ошибка при удалении", type: "err" });
    } finally {
      setDeleting(false);
    }
  }

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedUser) return;

    const token = getToken();
    if (!token) return;

    const form = new FormData();
    form.append("file", file);

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users/${selectedUser.id}/avatar/set`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    if (res.ok) {
      setSaveMsg({ text: "Аватарка обновлена!", type: "ok" });
      setTimeout(() => setSaveMsg(null), 2000);
      load();
      const userRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users/${selectedUser.id}/full`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (userRes.ok) setSelectedUser(await userRes.json());
    } else {
      const data = await res.json().catch(() => null);
      setSaveMsg({ text: data?.detail ?? "Ошибка загрузки", type: "err" });
    }
  }

  // 🆕 Смена статуса бага
  async function updateBugStatus(bugId: number, status: string) {
    const token = getToken();
    if (!token) return;

    const form = new FormData();
    form.append("status", status);

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/bugs/${bugId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    if (res.ok) {
      loadBugs();
      setSelectedBug(null);
    } else {
      const data = await res.json().catch(() => null);
      alert(data?.detail ?? "Ошибка обновления");
    }
  }

  // 🆕 Удаление бага
  async function deleteBug(bugId: number) {
    if (!confirm("Удалить этот баг-репорт?")) return;
    const token = getToken();
    if (!token) return;

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/bugs/${bugId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      loadBugs();
      setSelectedBug(null);
    }
  }

  const filteredUsers = Array.isArray(allUsers) ? allUsers.filter((u) => {
    // Если поиск пустой, показываем всех пользователей
    if (!searchQuery.trim()) return true;
    
    const q = searchQuery.toLowerCase();
    // Безопасная проверка (на случай, если username или display_name равны null/undefined)
    const usernameMatch = u.username && u.username.toLowerCase().includes(q);
    const displayMatch = u.display_name && u.display_name.toLowerCase().includes(q);
    
    return usernameMatch || displayMatch;
  }) : [];
  
  // 🆕 Счётчики багов по статусам
  const bugCounts = {
    new: bugs.filter((b) => b.status === "new").length,
    in_progress: bugs.filter((b) => b.status === "in_progress").length,
    resolved: bugs.filter((b) => b.status === "resolved").length,
    rejected: bugs.filter((b) => b.status === "rejected").length,
  };

  if (!me) return <div className="p-8 text-white/60">Загрузка...</div>;

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />
      <div className="w-px shrink-0 bg-white/10 my-3" />
      <main className="flex-1 overflow-y-auto border-x border-white/10">
        <div className="p-6 border-b border-white/10 sticky top-0 bg-[#171717]/95 backdrop-blur-md z-10">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Settings size={24} className="text-[#8b5cf6]" />
              <h1 className="text-2xl font-black text-white">Техническая панель</h1>
            </div>
            <Link
              href="/admin"
              className="text-sm text-white/60 hover:text-white transition-colors"
            >
              ← Назад в админку
            </Link>
          </div>

          <div className="flex gap-2 mt-4 flex-wrap">
            <button
              onClick={() => setActiveTab("stats")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-medium transition-all ${
                activeTab === "stats"
                  ? "bg-[#8b5cf6] border-[#8b5cf6] text-white"
                  : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              <BarChart3 size={16} />
              Статистика
            </button>
            <button
              onClick={() => setActiveTab("users")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-medium transition-all ${
                activeTab === "users"
                  ? "bg-[#8b5cf6] border-[#8b5cf6] text-white"
                  : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              <Users size={16} />
              Пользователи
            </button>
            {/* 🆕 ВКЛАДКА БАГ-ТРЕКЕРА */}
            <button
              onClick={() => setActiveTab("bugs")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-medium transition-all relative ${
                activeTab === "bugs"
                  ? "bg-orange-500 border-orange-500 text-white"
                  : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              <Bug size={16} />
              Баг-трекер
              {bugCounts.new > 0 && (
                <span className="ml-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center">
                  {bugCounts.new}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ==================== СТАТИСТИКА ==================== */}
        {activeTab === "stats" && stats && (
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="border border-white/10 rounded-xl p-5 bg-white/5">
                <p className="text-white/50 text-sm">Пользователей</p>
                <p className="text-3xl font-black text-white mt-1">{stats.total_users}</p>
              </div>
              <div className="border border-white/10 rounded-xl p-5 bg-white/5">
                <p className="text-white/50 text-sm">Постов</p>
                <p className="text-3xl font-black text-white mt-1">{stats.total_posts}</p>
              </div>
              <div className="border border-white/10 rounded-xl p-5 bg-white/5">
                <p className="text-white/50 text-sm">Лайков</p>
                <p className="text-3xl font-black text-white mt-1">{stats.total_likes}</p>
              </div>
              <div className="border border-white/10 rounded-xl p-5 bg-white/5">
                <p className="text-white/50 text-sm">Чатов</p>
                <p className="text-3xl font-black text-white mt-1">{stats.total_chats}</p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="border border-white/10 rounded-xl p-5 bg-white/5">
                <div className="flex items-center gap-2 mb-4">
                  <Crown size={18} className="text-[#8b5cf6]" />
                  <h2 className="font-bold text-white">Топ по подписчикам</h2>
                </div>
                <div className="space-y-2">
                  {stats.top_followers.map((u: any, i: number) => (
                    <Link
                      key={u.id}
                      href={`/user/${u.id}`}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors"
                    >
                      <span className="text-white/40 font-bold w-6">{i + 1}</span>
                      <Avatar src={u.avatar_url} name={u.display_name} id={u.id} size={36} />
                      <div className="flex-1 min-w-0">
                        <p
                          className={`font-semibold text-sm truncate ${glowStyle(u) ? "" : "text-white"}`}
                          style={glowStyle(u)}
                        >
                          {u.display_name}
                        </p>
                        <p className="text-xs text-white/40">@{u.username}</p>
                      </div>
                      <span className="text-[#8b5cf6] font-bold">
                        {u.followers_count} подписчиков
                      </span>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="border border-white/10 rounded-xl p-5 bg-white/5">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp size={18} className="text-[#8b5cf6]" />
                  <h2 className="font-bold text-white">Топ по постам</h2>
                </div>
                <div className="space-y-2">
                  {stats.top_posts.map((u: any, i: number) => (
                    <Link
                      key={u.id}
                      href={`/user/${u.id}`}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors"
                    >
                      <span className="text-white/40 font-bold w-6">{i + 1}</span>
                      <Avatar src={u.avatar_url} name={u.display_name} id={u.id} size={36} />
                      <div className="flex-1 min-w-0">
                        <p
                          className={`font-semibold text-sm truncate ${glowStyle(u) ? "" : "text-white"}`}
                          style={glowStyle(u)}
                        >
                          {u.display_name}
                        </p>
                        <p className="text-xs text-white/40">@{u.username}</p>
                      </div>
                      <span className="text-[#8b5cf6] font-bold">{u.posts_count} постов</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            <div className="border border-white/10 rounded-xl p-5 bg-white/5">
              <h2 className="font-bold text-white mb-4">Последние регистрации</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left p-3 text-white/50 font-semibold">Пользователь</th>
                      <th className="text-left p-3 text-white/50 font-semibold">Username</th>
                      <th className="text-left p-3 text-white/50 font-semibold">Дата регистрации</th>
                      <th className="text-left p-3 text-white/50 font-semibold">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recent_registrations.map((u: any) => (
                      <tr
                        key={u.id}
                        className="border-b border-white/5 hover:bg-white/5 transition-colors"
                      >
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Avatar src={u.avatar_url} name={u.display_name} id={u.id} size={32} />
                            <span
                              className={`font-semibold ${glowStyle(u) ? "" : "text-white"}`}
                              style={glowStyle(u)}
                            >
                              {u.display_name}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 text-white/60">@{u.username}</td>
                        <td className="p-3 text-white/60">
                          {new Date(u.created_at).toLocaleString("ru-RU")}
                        </td>
                        <td className="p-3">
                          {u.is_banned ? (
                            <span className="px-2 py-0.5 rounded bg-[#ef4444]/20 text-[#ef4444] text-xs font-bold">
                              Забанен
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-[#10b981]/20 text-[#10b981] text-xs font-bold">
                              Активен
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==================== ПОЛЬЗОВАТЕЛИ ==================== */}
        {activeTab === "users" && (
          <div className="p-6 grid md:grid-cols-3 gap-6">
            <div className="md:col-span-1 border border-white/10 rounded-xl bg-white/5 overflow-hidden flex flex-col max-h-[70vh]">
              <div className="p-3 border-b border-white/10">
                <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2 border border-white/10">
                  <Search size={16} className="text-white/40" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Поиск по имени или @"
                    className="flex-1 bg-transparent focus:outline-none text-white placeholder-white/40 text-sm"
                  />
                </div>
              </div>
              <div className="overflow-y-auto flex-1">
                {filteredUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => selectUser(u)}
                    className={`w-full flex items-center gap-3 p-3 transition-all text-left ${
                      selectedUser?.id === u.id
                        ? "bg-[#8b5cf6]/20 border-l-2 border-[#8b5cf6]"
                        : "hover:bg-white/5 border-l-2 border-transparent"
                    }`}
                  >
                    <Avatar src={u.avatar_url} name={u.display_name} id={u.id} size={36} />
                    <div className="flex-1 min-w-0">
                      <p
                        className={`font-semibold text-sm truncate ${glowStyle(u) ? "" : "text-white"}`}
                        style={glowStyle(u)}
                      >
                        {u.display_name}
                      </p>
                      <p className="text-xs text-white/40 truncate">@{u.username}</p>
                    </div>
                    {u.is_admin && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white text-black text-[8px] font-black uppercase tracking-widest shrink-0 border border-white shadow-[0_0_8px_rgba(255,255,255,0.6)]">
                        Founder
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="md:col-span-2">
              {!selectedUser ? (
                <div className="border border-white/10 rounded-xl bg-white/5 p-12 text-center">
                  <Users size={48} className="mx-auto text-white/20 mb-4" />
                  <p className="text-white/50">Выбери пользователя из списка слева</p>
                </div>
              ) : (
                <div className="border border-white/10 rounded-xl bg-white/5 p-6">
                  <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-xl font-black text-white">Редактирование</h2>
                      {selectedUser.is_admin && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white text-black text-[8px] font-black uppercase tracking-widest shrink-0 border border-white shadow-[0_0_8px_rgba(255,255,255,0.6)]">
                          <Shield size={9} />
                          Founder
                        </span>
                      )}
                      {selectedUser.is_moderator && !selectedUser.is_admin && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#3b82f6] text-white text-[10px] font-black uppercase tracking-widest">
                          <ShieldCheck size={9} />
                          Developer
                        </span>
                      )}
                      {selectedUser.role && !selectedUser.is_admin && !selectedUser.is_moderator && (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-white text-[10px] font-black uppercase tracking-widest"
                          style={{ backgroundColor: selectedUser.role.color }}
                        >
                          {selectedUser.role.name}
                        </span>
                      )}
                      {selectedUser.is_banned && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#ef4444] text-white text-[10px] font-black uppercase tracking-widest">
                          <Ban size={9} />
                          BANNED
                        </span>
                      )}
                    </div>
                    <Link
                      href={`/user/${selectedUser.id}`}
                      className="text-sm text-[#8b5cf6] hover:underline"
                    >
                      Открыть профиль →
                    </Link>
                  </div>

                  <div className="flex items-start gap-6 mb-6">
                    <div className="text-center">
                      <Avatar
                        src={selectedUser.avatar_url}
                        name={selectedUser.display_name}
                        id={selectedUser.id}
                        size={96}
                      />
                      <label className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-white/70 text-xs font-semibold hover:bg-white/10 transition-all cursor-pointer">
                        <Upload size={12} />
                        Сменить
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={uploadAvatar}
                        />
                      </label>
                    </div>

                    <div className="flex-1 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-white/40 text-xs">ID</p>
                        <p className="text-white font-semibold">#{selectedUser.id}</p>
                      </div>
                      <div>
                        <p className="text-white/40 text-xs">Постов</p>
                        <p className="text-white font-semibold">{selectedUser.posts_count ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-white/40 text-xs">Подписчиков</p>
                        <p className="text-white font-semibold">
                          {selectedUser.followers_count ?? "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-white/40 text-xs">Регистрация</p>
                        <p className="text-white font-semibold text-xs">
                          {selectedUser.created_at
                            ? new Date(selectedUser.created_at).toLocaleDateString("ru-RU")
                            : "—"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-white/70 mb-1">
                        Username (@)
                      </label>
                      <input
                        value={editUsername}
                        onChange={(e) => setEditUsername(e.target.value)}
                        className="w-full border border-white/10 rounded-lg px-3 py-2 bg-white/5 text-white focus:outline-none focus:border-[#8b5cf6] transition-all"
                        placeholder="username латиницей"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-white/70 mb-1">
                        Отображаемое имя
                      </label>
                      <input
                        value={editDisplayName}
                        onChange={(e) => setEditDisplayName(e.target.value)}
                        className="w-full border border-white/10 rounded-lg px-3 py-2 bg-white/5 text-white focus:outline-none focus:border-[#8b5cf6] transition-all"
                        placeholder="Имя пользователя"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-white/70 mb-1">
                        Новый пароль{" "}
                        <span className="text-white/40">(оставь пустым, если не менять)</span>
                      </label>
                      <input
                        type="text"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full border border-white/10 rounded-lg px-3 py-2 bg-white/5 text-white focus:outline-none focus:border-[#8b5cf6] transition-all"
                        placeholder="Минимум 6 символов"
                      />
                    </div>

                    {saveMsg && (
                      <div
                        className={`p-3 rounded-lg border text-sm font-semibold ${
                          saveMsg.type === "ok"
                            ? "bg-[#10b981]/10 border-[#10b981]/30 text-[#10b981]"
                            : "bg-[#ef4444]/10 border-[#ef4444]/30 text-[#ef4444]"
                        }`}
                      >
                        {saveMsg.text}
                      </div>
                    )}

                    <button
                      onClick={saveUser}
                      disabled={saving}
                      className="w-full flex items-center justify-center gap-2 bg-[#8b5cf6] text-white font-bold rounded-lg py-2.5 hover:bg-[#7c3aed] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Save size={16} />
                      {saving ? "Сохранение..." : "Сохранить изменения"}
                    </button>

                    <div className="mt-8 pt-6 border-t border-red-400/20">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle size={18} className="text-red-400" />
                        <h3 className="font-bold text-red-400">Опасная зона</h3>
                      </div>

                      <p className="text-sm text-white/60 mb-4">
                        Удаление аккаунта необратимо. Будут удалены все посты, лайки, подписки,
                        сообщения и медиафайлы пользователя.
                      </p>

                      {selectedUser.is_admin && !me.is_admin && (
                        <div className="p-3 rounded-lg bg-[#f59e0b]/10 border border-[#f59e0b]/30 text-[#f59e0b] text-sm font-semibold mb-4">
                          ⚠️ Это аккаунт Founder. Только Founder может его удалить.
                        </div>
                      )}

                      {selectedUser.is_admin && me.is_admin && (
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold mb-4">
                          ⚠️ Внимание: вы удаляете аккаунт другого Developer. Это действие
                          необратимо.
                        </div>
                      )}

                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-semibold text-white/70 mb-1">
                            Введите{" "}
                            <span className="text-red-400 font-mono">
                              @{selectedUser.username}
                            </span>{" "}
                            для подтверждения
                          </label>
                          <input
                            value={deleteConfirm}
                            onChange={(e) => setDeleteConfirm(e.target.value)}
                            className="w-full border border-red-400/30 rounded-lg px-3 py-2 bg-red-500/5 text-white focus:outline-none focus:border-red-400 transition-all"
                            placeholder={selectedUser.username}
                          />
                        </div>

                        <button
                          onClick={deleteUser}
                          disabled={
                            deleting ||
                            deleteConfirm !== selectedUser.username ||
                            (selectedUser.is_admin && !me.is_admin)
                          }
                          className="w-full flex items-center justify-center gap-2 bg-[#ef4444] text-white font-bold rounded-lg py-2.5 hover:bg-[#dc2626] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <AlertTriangle size={16} />
                          {deleting ? "Удаление..." : "Удалить аккаунт навсегда"}
                        </button>
                      </div>
                    </div>

                    {selectedUser.is_admin && (
                      <p className="text-xs text-[#f59e0b] text-center">
                        ⚠️ Это аккаунт администратора — редактирование заблокировано
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 🆕 ==================== БАГ-ТРЕКЕР ==================== */}
        {activeTab === "bugs" && (
          <div className="p-6 space-y-6">
            {/* Статистика по багам */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(BUG_STATUS_CONFIG).map(([key, config]) => {
                const count = bugCounts[key as keyof typeof bugCounts];
                const StatusIcon = config.icon;
                return (
                  <button
                    key={key}
                    onClick={() =>
                      setBugStatusFilter(bugStatusFilter === key ? null : key)
                    }
                    className={`border rounded-xl p-4 transition-all text-left ${
                      bugStatusFilter === key
                        ? `${config.border} ${config.bg}`
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <StatusIcon size={18} className={config.color} />
                      <span className={`text-2xl font-black ${config.color}`}>{count}</span>
                    </div>
                    <p className="text-sm font-bold text-white/80">{config.label}</p>
                  </button>
                );
              })}
            </div>

            {/* Фильтры + заголовок */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-white/50" />
                <span className="text-sm text-white/60">
                  Фильтр:{" "}
                  <span className="text-white font-bold">
                    {bugStatusFilter
                      ? BUG_STATUS_CONFIG[bugStatusFilter as keyof typeof BUG_STATUS_CONFIG].label
                      : "Все"}
                  </span>
                </span>
                {bugStatusFilter && (
                  <button
                    onClick={() => setBugStatusFilter(null)}
                    className="p-1 rounded hover:bg-white/10 transition-all text-white/50 hover:text-white"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <button
                onClick={loadBugs}
                className="px-3 py-1.5 rounded-lg border border-white/10 text-white/70 text-xs font-bold hover:bg-white/10 transition-all"
              >
                🔄 Обновить
              </button>
            </div>

            {/* Список багов */}
            {bugsLoading && (
              <div className="p-12 text-center">
                <p className="text-white/50 animate-pulse">Загрузка обращений...</p>
              </div>
            )}

            {!bugsLoading && bugs.length === 0 && (
              <div className="p-12 text-center border border-white/10 rounded-xl bg-white/5">
                <Bug size={48} className="mx-auto text-white/20 mb-4" />
                <p className="text-white/60 font-semibold">
                  {bugStatusFilter ? "Нет обращений с таким статусом" : "Обращений пока нет"}
                </p>
                <p className="text-white/40 text-sm mt-1">
                  Пользователи могут отправлять баги через кнопку "Сообщить о проблеме" в сайдбаре
                </p>
              </div>
            )}

            {!bugsLoading && bugs.length > 0 && (
              <div className="space-y-3">
                {bugs.map((bug) => {
                  const statusConfig =
                    BUG_STATUS_CONFIG[bug.status as keyof typeof BUG_STATUS_CONFIG];
                  const priorityConfig =
                    BUG_PRIORITY_CONFIG[bug.priority as keyof typeof BUG_PRIORITY_CONFIG];
                  const StatusIcon = statusConfig.icon;

                  return (
                    <div
                      key={bug.id}
                      onClick={() => setSelectedBug(bug)}
                      className={`border rounded-xl p-4 transition-all hover:bg-white/5 cursor-pointer ${statusConfig.border}`}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`p-2 rounded-lg ${statusConfig.bg} shrink-0`}>
                          <StatusIcon size={20} className={statusConfig.color} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <h3 className="font-bold text-white truncate">{bug.title}</h3>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${priorityConfig.color} bg-white/5 border border-white/10`}
                            >
                              {priorityConfig.label}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${statusConfig.color} ${statusConfig.bg}`}
                            >
                              {statusConfig.label}
                            </span>
                          </div>
                          <p className="text-sm text-white/60 line-clamp-2">{bug.description}</p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-white/40 flex-wrap">
                            <span>
                              От:{" "}
                              <span className="text-white/70">{bug.reporter?.display_name}</span>
                            </span>
                            <span>
                              {new Date(bug.created_at).toLocaleString("ru-RU", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            {bug.resolver && (
                              <span className="text-green-400">
                                ✓ Решено: {bug.resolver.display_name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 🆕 МОДАЛЬНОЕ ОКНО ДЕТАЛЕЙ БАГА */}
        {selectedBug && (
          <>
            <div
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200]"
              onClick={() => setSelectedBug(null)}
            />
            <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
              <div className="w-full max-w-2xl border border-white/20 rounded-2xl bg-[#1f1f23]/95 backdrop-blur-md shadow-2xl p-6 pointer-events-auto max-h-[85vh] overflow-y-auto">
                <div className="flex items-start justify-between mb-4 gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <h2 className="text-xl font-black text-white">{selectedBug.title}</h2>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold ${
                          BUG_PRIORITY_CONFIG[selectedBug.priority as keyof typeof BUG_PRIORITY_CONFIG]
                            .color
                        } bg-white/5 border border-white/10`}
                      >
                        {BUG_PRIORITY_CONFIG[selectedBug.priority as keyof typeof BUG_PRIORITY_CONFIG].label}
                      </span>
                    </div>
                    <p className="text-sm text-white/50">
                      ID: #{selectedBug.id} • От:{" "}
                      {selectedBug.reporter ? (
                        <Link
                          href={`/user/${selectedBug.reporter.id}`}
                          className="text-[#8b5cf6] hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          @{selectedBug.reporter.username}
                        </Link>
                      ) : (
                        "неизвестен"
                      )}{" "}
                      • {new Date(selectedBug.created_at).toLocaleString("ru-RU")}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedBug(null)}
                    className="text-white/60 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-all shrink-0"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="mb-6">
                  <h3 className="text-sm font-bold text-white/80 mb-2">Описание:</h3>
                  <p className="text-white/90 whitespace-pre-wrap bg-white/5 p-4 rounded-lg border border-white/10">
                    {selectedBug.description}
                  </p>
                </div>

                <div className="mb-6">
                  <h3 className="text-sm font-bold text-white/80 mb-3">Изменить статус:</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {Object.entries(BUG_STATUS_CONFIG).map(([key, config]) => {
                      const StatusIcon = config.icon;
                      return (
                        <button
                          key={key}
                          onClick={() => updateBugStatus(selectedBug.id, key)}
                          disabled={selectedBug.status === key}
                          className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold transition-all ${
                            selectedBug.status === key
                              ? `${config.border} ${config.bg} ${config.color}`
                              : "border-white/20 text-white/60 hover:bg-white/10"
                          } disabled:opacity-60 disabled:cursor-not-allowed`}
                        >
                          <StatusIcon size={14} />
                          {config.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {selectedBug.resolver && (
                  <div className="mb-6 p-3 rounded-lg bg-green-500/10 border border-green-400/30">
                    <p className="text-sm text-green-400">
                      ✓ Обработано: <span className="font-bold">{selectedBug.resolver.display_name}</span>{" "}
                      • {new Date(selectedBug.resolved_at).toLocaleString("ru-RU")}
                    </p>
                  </div>
                )}

                <div className="flex gap-3 pt-2 border-t border-white/10">
                  <button
                    onClick={() => deleteBug(selectedBug.id)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-400/30 text-red-400 hover:bg-red-500/10 transition-all text-sm font-bold"
                  >
                    <Trash2 size={16} />
                    Удалить
                  </button>
                  <button
                    onClick={() => setSelectedBug(null)}
                    className="flex-1 border border-white/20 rounded-lg py-2 font-bold text-white/80 hover:bg-white/10 transition-all"
                  >
                    Закрыть
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
