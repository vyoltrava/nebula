"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Avatar } from "@/components/Avatar";
import { getToken } from "@/lib/auth";

import {
  Settings, Users, BarChart3, Upload, Save, Search, Crown, TrendingUp,
  AlertTriangle, Shield, ShieldCheck, Ban, Bug, CheckCircle, Clock,
  XCircle, AlertCircle, Trash2, Filter, X, Activity, Lock, Globe,
  History, RefreshCw, FileText, Wifi,
} from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";

const BUG_STATUS_CONFIG = {
  new: { label: "Новый", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10", border: "border-blue-400/30", icon: AlertCircle },
  in_progress: { label: "В обработке", color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-400/30", icon: Clock },
  resolved: { label: "Решено", color: "text-green-600 dark:text-green-400", bg: "bg-green-500/10", border: "border-green-400/30", icon: CheckCircle },
  rejected: { label: "Отклонено", color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10", border: "border-red-400/30", icon: XCircle },
};

const BUG_PRIORITY_CONFIG = {
  low: { label: "Низкий", color: "text-green-600 dark:text-green-400" },
  medium: { label: "Средний", color: "text-yellow-600 dark:text-yellow-400" },
  high: { label: "Высокий", color: "text-orange-600 dark:text-orange-400" },
  critical: { label: "Критический", color: "text-red-600 dark:text-red-400" },
};

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  login: { label: "Вход", color: "text-blue-600 dark:text-blue-400" },
  register: { label: "Регистрация", color: "text-green-600 dark:text-green-400" },
  ban_user: { label: "Бан", color: "text-red-600 dark:text-red-400" },
  unban_user: { label: "Разбан", color: "text-green-600 dark:text-green-400" },
  delete_user: { label: "Удаление аккаунта", color: "text-red-600 dark:text-red-400" },
  delete_post: { label: "Удаление поста", color: "text-orange-600 dark:text-orange-400" },
  block_ip: { label: "Блок IP", color: "text-red-600 dark:text-red-400" },
  unblock_ip: { label: "Разблок IP", color: "text-green-600 dark:text-green-400" },
};

export default function TechnicalPage() {
  const [me, setMe] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"stats" | "users" | "bugs" | "ip" | "logs">("stats");
  const [stats, setStats] = useState<any>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [ipHistory, setIpHistory] = useState<any[]>([]);

  const [editUsername, setEditUsername] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetting2FA, setResetting2FA] = useState(false);
  const [showReset2FAConfirm, setShowReset2FAConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; type: "ok" | "err" } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [ipBlocks, setIpBlocks] = useState<any[]>([]);
  const [newBlockIp, setNewBlockIp] = useState("");
  const [newBlockReason, setNewBlockReason] = useState("");
  const [newBlockHours, setNewBlockHours] = useState<number | "">("");
  const [blockIpTarget, setBlockIpTarget] = useState<string | null>(null);

  const [logs, setLogs] = useState<any[]>([]);
  const [logsFilter, setLogsFilter] = useState<string | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);

  const [bugs, setBugs] = useState<any[]>([]);
  const [bugsLoading, setBugsLoading] = useState(false);
  const [bugStatusFilter, setBugStatusFilter] = useState<string | null>(null);
  const [selectedBug, setSelectedBug] = useState<any>(null);

function getGlowColor(user: any): string | null {
if (user?.username === "trelod") return "#e4e4e7"; // Zinc-200
  if (user?.is_admin) return "#fff";
  if (user?.is_moderator) return "#3b82f6";
  if (user?.role?.color) return user.role.color;
  return null;
}

  function glowStyle(user: any): React.CSSProperties | undefined {
    const c = getGlowColor(user);
    if (!c) return undefined;
    return { color: c, textShadow: `0 0 6px ${c}B3, 0 0 14px ${c}66` };
  }

  async function load() {
    const token = getToken();
    if (!token) return;
    try {
      const meRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!meRes.ok) return;
      const meData = await meRes.json();
      setMe(meData);
      if (!meData.permissions?.includes("tech_access")) {
        window.location.href = "/";
        return;
      }

      const statsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (statsRes.ok) setStats(await statsRes.json());

      const usersRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (usersRes.ok) {
        const data = await usersRes.json();
        setAllUsers(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("load error:", err);
    }
  }

  async function loadBugs() {
    const token = getToken();
    if (!token) return;
    setBugsLoading(true);
    try {
      const url = bugStatusFilter
        ? `${process.env.NEXT_PUBLIC_API_URL}/api/bugs?status=${bugStatusFilter}`
        : `${process.env.NEXT_PUBLIC_API_URL}/api/bugs`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setBugs(await res.json());
      else setBugs([]);
    } catch {
      setBugs([]);
    } finally {
      setBugsLoading(false);
    }
  }

  async function loadIpBlocks() {
    const token = getToken();
    if (!token) return;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/ip-blocks`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setIpBlocks(await res.json());
  }

  async function loadLogs() {
    const token = getToken();
    if (!token) return;
    setLogsLoading(true);
    try {
      const url = logsFilter
        ? `${process.env.NEXT_PUBLIC_API_URL}/api/admin/logs?limit=100&action=${logsFilter}`
        : `${process.env.NEXT_PUBLIC_API_URL}/api/admin/logs?limit=100`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setLogs(Array.isArray(data) ? data : []);
      } else {
        console.error("Logs load failed:", res.status);
        setLogs([]);
      }
    } catch (err) {
      console.error("Logs network error:", err);
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }

  async function loadIpHistory(userId: number) {
    const token = getToken();
    if (!token) return;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users/${userId}/ip-history`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setIpHistory(await res.json());
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { if (activeTab === "bugs") loadBugs(); }, [activeTab, bugStatusFilter]);
  useEffect(() => { if (activeTab === "ip") loadIpBlocks(); }, [activeTab]);
  useEffect(() => { if (activeTab === "logs") loadLogs(); }, [activeTab, logsFilter]);
  useEffect(() => { if (selectedUser) loadIpHistory(selectedUser.id); }, [selectedUser]);

  function selectUser(user: any) {
    setSelectedUser(user);
    setEditUsername(user.username);
    setEditDisplayName(user.display_name);
    setNewPassword("");
    setSaveMsg(null);
    setDeleteConfirm("");
    setShowReset2FAConfirm(false);
    console.log("2FA status for user:", user.username, "enabled:", user.two_fa_enabled);
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
      } else {
        setSaveMsg({ text: "Сохранено!", type: "ok" });
        setTimeout(() => setSaveMsg(null), 2000);
        load();
      }
    } catch {
      setSaveMsg({ text: "Ошибка сети", type: "err" });
    } finally {
      setSaving(false);
    }
  }

  async function resetUser2FA() {
    if (!selectedUser) return;
    setResetting2FA(true);
    setSaveMsg(null);
    const token = getToken();
    if (!token) return;

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/admin/users/${selectedUser.id}/reset-2fa`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setSaveMsg({ text: data?.detail ?? "Ошибка сброса 2FA", type: "err" });
      } else {
        setSaveMsg({
          text: `2FA для @${selectedUser.username} успешно сброшена!`,
          type: "ok",
        });
        setTimeout(() => setSaveMsg(null), 3000);
        setShowReset2FAConfirm(false);
        load();
      }
    } catch {
      setSaveMsg({ text: "Ошибка сети", type: "err" });
    } finally {
      setResetting2FA(false);
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
      } else {
        const data = await res.json();
        alert(`Аккаунт @${data.deleted_username} удалён. Постов: ${data.deleted_posts}`);
        setSelectedUser(null);
        setDeleteConfirm("");
        load();
      }
    } catch {
      setSaveMsg({ text: "Ошибка сети", type: "err" });
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
    } else {
      const data = await res.json().catch(() => null);
      setSaveMsg({ text: data?.detail ?? "Ошибка загрузки", type: "err" });
    }
  }

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
    if (res.ok) { loadBugs(); setSelectedBug(null); }
    else {
      const data = await res.json().catch(() => null);
      alert(data?.detail ?? "Ошибка");
    }
  }

  async function deleteBug(bugId: number) {
    if (!confirm("Удалить баг-репорт?")) return;
    const token = getToken();
    if (!token) return;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/bugs/${bugId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) { loadBugs(); setSelectedBug(null); }
  }

  async function createIpBlock(ip: string, reason: string, hours: number | "") {
    const token = getToken();
    if (!token) return;
    const form = new FormData();
    form.append("ip_address", ip);
    form.append("reason", reason);
    if (typeof hours === "number" && hours > 0) {
      form.append("hours", String(hours));
    }
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/ip-blocks`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (res.ok) {
      setNewBlockIp(""); setNewBlockReason(""); setNewBlockHours("");
      setBlockIpTarget(null);
      loadIpBlocks();
    } else {
      const data = await res.json().catch(() => null);
      alert(data?.detail ?? "Ошибка блокировки");
    }
  }

  async function deleteIpBlock(blockId: number) {
    if (!confirm("Разблокировать IP?")) return;
    const token = getToken();
    if (!token) return;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/ip-blocks/${blockId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) loadIpBlocks();
  }

  async function clearLogs() {
    if (!confirm("Удалить ВСЕ логи? Это действие только для Founder.")) return;
    const token = getToken();
    if (!token) return;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/logs`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const d = await res.json();
      alert(`Удалено записей: ${d.deleted}`);
      loadLogs();
    } else {
      const d = await res.json().catch(() => null);
      alert(d?.detail ?? "Нет прав");
    }
  }

  const filteredUsers = allUsers.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (u.username?.toLowerCase().includes(q)) || (u.display_name?.toLowerCase().includes(q));
  });

  const bugCounts = {
    new: bugs.filter((b) => b.status === "new").length,
    in_progress: bugs.filter((b) => b.status === "in_progress").length,
    resolved: bugs.filter((b) => b.status === "resolved").length,
    rejected: bugs.filter((b) => b.status === "rejected").length,
  };

  if (!me) return <div className="p-8 text-gray-600 dark:text-white/60">Загрузка...</div>;

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />
      <div className="w-px shrink-0 bg-gray-100 dark:bg-white/10 my-3" />
      <main className="flex-1 overflow-y-auto border-x border-gray-200 dark:border-white/10">
        <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-white/10 sticky top-0 bg-gray-50 dark:bg-[#171717]/95 backdrop-blur-md z-10">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Settings size={24} className="text-[#8b5cf6]" />
              <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">Техническая панель</h1>
            </div>
            <Link href="/admin" className="text-sm text-gray-600 dark:text-white/60 hover:text-gray-900 dark:text-white transition-colors">← Назад в админку</Link>
          </div>

          <div className="flex gap-2 mt-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {([
              ["stats", BarChart3, "Статистика", "#8b5cf6"],
              ["users", Users, "Пользователи", "#8b5cf6"],
              ["ip", Globe, "IP блоки", "#ef4444"],
              ["logs", Activity, "Логи", "#3b82f6"],
              ["bugs", Bug, "Баг-трекер", "#f59e0b"],
            ] as const).map(([key, Icon, label, color]) => {
              const count = key === "bugs" ? bugCounts.new : 0;
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key as any)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-medium transition-all relative whitespace-nowrap shrink-0 ${
                    activeTab === key
                      ? `bg-[${color}] border-[${color}] text-gray-900 dark:text-white`
                      : "border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-white/5 text-gray-800 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/10"
                  }`}
                  style={activeTab === key ? { backgroundColor: color, borderColor: color } : undefined}
                >
                  <Icon size={16} /> {label}
                  {count > 0 && (
                    <span className="ml-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {activeTab === "stats" && stats && (
          <div className="p-4 sm:p-6 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                ["Пользователей", stats.total_users, Users],
                ["Постов", stats.total_posts, FileText],
                ["Лайков", stats.total_likes, TrendingUp],
                ["Чатов", stats.total_chats, Wifi],
              ].map(([label, val, Icon]: any) => (
                <div key={label} className="border border-gray-200 dark:border-white/10 rounded-xl p-5 bg-gray-100 dark:bg-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <Icon size={18} className="text-[#8b5cf6]" />
                  </div>
                  <p className="text-gray-600 dark:text-white/50 text-sm">{label}</p>
                  <p className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white mt-1">{val}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-gray-200 dark:border-white/10 rounded-xl p-5 bg-gray-100 dark:bg-white/5">
                <div className="flex items-center gap-2 mb-4">
                  <Crown size={18} className="text-[#8b5cf6]" />
                  <h2 className="font-bold text-gray-900 dark:text-white">Топ по подписчикам</h2>
                </div>
                <div className="space-y-2">
                  {stats.top_followers.map((u: any, i: number) => (
                    <Link key={u.id} href={`/user/${u.id}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
                      <span className="text-gray-500 dark:text-white/40 font-bold w-6">{i + 1}</span>
                      <Avatar src={u.avatar_url} name={u.display_name} id={u.id} size={36} />
                      <div className="flex-1 min-w-0">
                        <p className={`font-semibold text-sm truncate ${glowStyle(u) ? "" : "text-white"}`} style={glowStyle(u)}>{u.display_name}</p>
                        <p className="text-xs text-gray-500 dark:text-white/40">@{u.username}</p>
                      </div>
                      <span className="text-[#8b5cf6] font-bold text-sm">{u.followers_count}</span>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="border border-gray-200 dark:border-white/10 rounded-xl p-5 bg-gray-100 dark:bg-white/5">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp size={18} className="text-[#8b5cf6]" />
                  <h2 className="font-bold text-gray-900 dark:text-white">Топ по постам</h2>
                </div>
                <div className="space-y-2">
                  {stats.top_posts.map((u: any, i: number) => (
                    <Link key={u.id} href={`/user/${u.id}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
                      <span className="text-gray-500 dark:text-white/40 font-bold w-6">{i + 1}</span>
                      <Avatar src={u.avatar_url} name={u.display_name} id={u.id} size={36} />
                      <div className="flex-1 min-w-0">
                        <p className={`font-semibold text-sm truncate ${glowStyle(u) ? "" : "text-white"}`} style={glowStyle(u)}>{u.display_name}</p>
                        <p className="text-xs text-gray-500 dark:text-white/40">@{u.username}</p>
                      </div>
                      <span className="text-[#8b5cf6] font-bold text-sm">{u.posts_count}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            <div className="border border-gray-200 dark:border-white/10 rounded-xl p-5 bg-gray-100 dark:bg-white/5">
              <h2 className="font-bold text-gray-900 dark:text-white mb-4">Последние регистрации</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-white/10">
                      <th className="text-left p-3 text-gray-600 dark:text-white/50">Пользователь</th>
                      <th className="text-left p-3 text-gray-600 dark:text-white/50">Username</th>
                      <th className="text-left p-3 text-gray-600 dark:text-white/50">Дата</th>
                      <th className="text-left p-3 text-gray-600 dark:text-white/50">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recent_registrations.map((u: any) => (
                      <tr key={u.id} className="border-b border-gray-200 dark:border-white/5 hover:bg-gray-100 dark:hover:bg-white/5">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Avatar src={u.avatar_url} name={u.display_name} id={u.id} size={32} />
                            <span className={`font-semibold ${glowStyle(u) ? "" : "text-white"}`} style={glowStyle(u)}>{u.display_name}</span>
                          </div>
                        </td>
                        <td className="p-3 text-gray-600 dark:text-white/60">@{u.username}</td>
                        <td className="p-3 text-gray-600 dark:text-white/60">{new Date(u.created_at).toLocaleString("ru-RU")}</td>
                        <td className="p-3">
                          {u.is_banned ? (
                            <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-600 dark:text-red-400 text-xs font-bold">Забанен</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-green-500/20 text-green-600 dark:text-green-400 text-xs font-bold">Активен</span>
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

        {activeTab === "users" && (
          <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 border border-gray-200 dark:border-white/10 rounded-xl bg-gray-100 dark:bg-white/5 overflow-hidden flex flex-col max-h-[75vh]">
              <div className="p-3 border-b border-gray-200 dark:border-white/10">
                <div className="flex items-center gap-2 bg-gray-100 dark:bg-white/5 rounded-lg px-3 py-2 border border-gray-200 dark:border-white/10">
                  <Search size={16} className="text-gray-500 dark:text-white/40" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Поиск по имени или @"
                    className="flex-1 bg-transparent focus:outline-none text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 text-sm"
                  />
                </div>
              </div>
              <div className="overflow-y-auto flex-1">
                {filteredUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => selectUser(u)}
                    className={`w-full flex items-center gap-3 p-3 transition-all text-left ${
                      selectedUser?.id === u.id ? "bg-[#8b5cf6]/20 border-l-2 border-[#8b5cf6]" : "hover:bg-gray-100 dark:hover:bg-white/5 border-l-2 border-transparent"
                    }`}
                  >
                    <Avatar src={u.avatar_url} name={u.display_name} id={u.id} size={36} />
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold text-sm truncate ${glowStyle(u) ? "" : "text-white"}`} style={glowStyle(u)}>{u.display_name}</p>
                      <p className="text-xs text-gray-500 dark:text-white/40 truncate">@{u.username}</p>
                      {u.last_ip && <p className="text-[10px] text-gray-500 dark:text-white/30 truncate">IP: {u.last_ip}</p>}
                    </div>
                    {u.is_banned && <Ban size={14} className="text-red-600 dark:text-red-400 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="lg:col-span-2">
              {!selectedUser ? (
                <div className="border border-gray-200 dark:border-white/10 rounded-xl bg-gray-100 dark:bg-white/5 p-12 text-center">
                  <Users size={48} className="mx-auto text-gray-500 dark:text-white/20 mb-4" />
                  <p className="text-gray-600 dark:text-white/50">Выбери пользователя</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="border border-gray-200 dark:border-white/10 rounded-xl bg-gray-100 dark:bg-white/5 p-4 sm:p-6">
                    <div className="flex flex-col sm:flex-row items-start gap-6 mb-6">
                      <div className="text-center">
                        <Avatar src={selectedUser.avatar_url} name={selectedUser.display_name} id={selectedUser.id} size={96} />
                        <label className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-white/5 text-gray-800 dark:text-white/70 text-xs font-semibold hover:bg-gray-100 dark:hover:bg-white/10 cursor-pointer">
                          <Upload size={12} /> Сменить
                          <input type="file" accept="image/*" className="hidden" onChange={uploadAvatar} />
                        </label>
                      </div>

                      <div className="flex-1 w-full">
                        <div className="flex items-center gap-2 flex-wrap mb-3">
                          <h2 className={`text-lg sm:text-xl font-black ${glowStyle(selectedUser) ? "" : "text-white"}`} style={glowStyle(selectedUser)}>{selectedUser.display_name}</h2>
                          {selectedUser.is_admin && <span className="px-1.5 py-0.5 rounded bg-white text-black text-[8px] font-black uppercase">Founder</span>}
                          {selectedUser.is_moderator && !selectedUser.is_admin && <span className="px-2 py-0.5 rounded bg-blue-500 text-white text-[10px] font-black uppercase">Developer</span>}
                          {selectedUser.role && !selectedUser.is_admin && !selectedUser.is_moderator && <span className="px-2 py-0.5 rounded text-white text-[10px] font-black uppercase" style={{ backgroundColor: selectedUser.role.color }}>{selectedUser.role.name}</span>}
                          {selectedUser.is_banned && <span className="px-2 py-0.5 rounded bg-red-500 text-white text-[10px] font-black uppercase">BANNED</span>}
                        </div>
                        <p className="text-gray-600 dark:text-white/50 text-sm mb-3">@{selectedUser.username} · ID #{selectedUser.id}</p>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                          <div className="border border-gray-200 dark:border-white/10 rounded-lg p-3 bg-gray-100 dark:bg-white/5">
                            <p className="text-gray-500 dark:text-white/40 text-xs">Постов</p>
                            <p className="text-gray-900 dark:text-white font-bold text-lg">{selectedUser.posts_count ?? "—"}</p>
                          </div>
                          <div className="border border-gray-200 dark:border-white/10 rounded-lg p-3 bg-gray-100 dark:bg-white/5">
                            <p className="text-gray-500 dark:text-white/40 text-xs">Подписчиков</p>
                            <p className="text-gray-900 dark:text-white font-bold text-lg">{selectedUser.followers_count ?? "—"}</p>
                          </div>
                          <div className="border border-gray-200 dark:border-white/10 rounded-lg p-3 bg-gray-100 dark:bg-white/5">
                            <p className="text-gray-500 dark:text-white/40 text-xs">Регистрация</p>
                            <p className="text-gray-900 dark:text-white font-bold text-xs">{selectedUser.created_at ? new Date(selectedUser.created_at).toLocaleDateString("ru-RU") : "—"}</p>
                          </div>
                          <div className="border border-gray-200 dark:border-white/10 rounded-lg p-3 bg-gray-100 dark:bg-white/5">
                            <p className="text-gray-500 dark:text-white/40 text-xs">Последний IP</p>
                            <p className="text-gray-900 dark:text-white font-bold text-xs font-mono truncate">{selectedUser.last_ip || "—"}</p>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2 mt-4">
                          <Link href={`/user/${selectedUser.id}`} className="px-4 py-2 rounded-lg border border-[#8b5cf6] text-[#8b5cf6] hover:bg-[#8b5cf6]/10 text-sm font-bold text-center">
                            Открыть профиль →
                          </Link>
                          {selectedUser.last_ip && (
                            <Button
                              variant="danger"
                              icon={Lock}
                              onClick={() => {
                                setBlockIpTarget(selectedUser.last_ip);
                                setActiveTab("ip");
                              }}
                            >
                              Заблокировать IP
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 pt-4 border-t border-gray-200 dark:border-white/10">
                      <div>
                        <label className="block text-sm font-semibold text-gray-800 dark:text-white/70 mb-1">Username (@)</label>
                        <input value={editUsername} onChange={(e) => setEditUsername(e.target.value)} className="w-full border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:border-[#8b5cf6]" />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-800 dark:text-white/70 mb-1">Отображаемое имя</label>
                        <input value={editDisplayName} onChange={(e) => setEditDisplayName(e.target.value)} className="w-full border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:border-[#8b5cf6]" />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-800 dark:text-white/70 mb-1">
                          Новый пароль <span className="text-gray-500 dark:text-white/40">(пусто = не менять)</span>
                        </label>
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:border-[#8b5cf6]"
                        />
                      </div>

                      <div className="border border-amber-500/30 rounded-lg bg-amber-500/5 p-3">
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2">
                            <ShieldCheck
                              size={16}
                              className={selectedUser.two_fa_enabled ? "text-emerald-600 dark:text-emerald-400" : "text-gray-500 dark:text-white/40"}
                            />
                            <span className="text-sm font-bold text-gray-900 dark:text-white">2FA</span>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                              selectedUser.two_fa_enabled
                                ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                                : "bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-white/40 border border-gray-200 dark:border-white/10"
                            }`}
                          >
                            {selectedUser.two_fa_enabled ? "Включена" : "Выключена"}
                          </span>
                        </div>

                        {selectedUser.two_fa_enabled ? (
                          !showReset2FAConfirm ? (
                            <Button
                              variant="danger"
                              size="sm"
                              className="w-full"
                              icon={RefreshCw}
                              onClick={() => setShowReset2FAConfirm(true)}
                              disabled={resetting2FA}
                            >
                              Сбросить 2FA
                            </Button>
                          ) : (
                            <div className="space-y-2">
                              <p className="text-xs text-amber-300/90 leading-snug">
                                ⚠️ Пользователю придётся заново настроить 2FA. Он сможет войти по паролю.
                                {selectedUser.id === me?.id && (
                                  <span className="block mt-1 font-bold text-amber-200">
                                    Вы сбрасываете 2FA сами себе.
                                  </span>
                                )}
                              </p>
                              <div className="flex gap-2">
                                <Button
                                  variant="danger"
                                  size="sm"
                                  loading={resetting2FA}
                                  onClick={resetUser2FA}
                                  disabled={resetting2FA}
                                  className="flex-1"
                                >
                                  {resetting2FA ? "Сброс..." : "Подтвердить"}
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => setShowReset2FAConfirm(false)}
                                  disabled={resetting2FA}
                                  className="flex-1"
                                >
                                  Отмена
                                </Button>
                              </div>
                            </div>
                          )
                        ) : (
                          <p className="text-xs text-gray-500 dark:text-white/40">
                            2FA не настроена. Пользователь входит только по паролю.
                          </p>
                        )}
                      </div>

                      {saveMsg && (
                        <div
                          className={`p-3 rounded-lg border text-sm font-semibold ${
                            saveMsg.type === "ok"
                              ? "bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400"
                              : "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400"
                          }`}
                        >
                          {saveMsg.text}
                        </div>
                      )}

                      <Button
                        icon={Save}
                        loading={saving}
                        onClick={saveUser}
                        disabled={saving}
                        className="w-full"
                      >
                        {saving ? "Сохранение..." : "Сохранить"}
                      </Button>
                    </div>
                  </div>

                  <div className="border border-gray-200 dark:border-white/10 rounded-xl bg-gray-100 dark:bg-white/5 p-4 sm:p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <History size={18} className="text-[#8b5cf6]" />
                      <h3 className="font-bold text-gray-900 dark:text-white">История IP-адресов</h3>
                    </div>
                    {ipHistory.length === 0 ? (
                      <p className="text-gray-600 dark:text-white/50 text-sm">История пуста</p>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {ipHistory.map((log) => (
                          <div key={log.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-100 dark:bg-white/5 text-sm">
                            <div className="flex items-center gap-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${log.action === "login" ? "bg-blue-500/20 text-blue-600 dark:text-blue-400" : "bg-green-500/20 text-green-600 dark:text-green-400"}`}>{log.action}</span>
                              <span className="font-mono text-gray-900 dark:text-white">{log.ip_address}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500 dark:text-white/40 text-xs">{new Date(log.created_at).toLocaleString("ru-RU")}</span>
                              <IconButton
                                variant="danger"
                                size="iconSm"
                                icon={Lock}
                                onClick={() => { setBlockIpTarget(log.ip_address); setActiveTab("ip"); }}
                                title="Заблокировать этот IP"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {me.permissions?.includes("delete_users") && (
                    <div className="border border-red-400/30 rounded-xl bg-red-500/5 p-4 sm:p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle size={18} className="text-red-600 dark:text-red-400" />
                        <h3 className="font-bold text-red-600 dark:text-red-400">Опасная зона</h3>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-white/60 mb-3">Удаление необратимо.</p>
                      <input
                        value={deleteConfirm}
                        onChange={(e) => setDeleteConfirm(e.target.value.replace(/^@/, ""))}
                        placeholder={`Введите ${selectedUser.username}`}
                        className="w-full border border-red-400/30 rounded-lg px-3 py-2 bg-red-500/5 text-white focus:outline-none focus:border-red-600 dark:focus:border-red-400 mb-3"
                      />
                      <Button
                        variant="danger"
                        icon={Trash2}
                        loading={deleting}
                        onClick={deleteUser}
                        disabled={deleting || deleteConfirm !== selectedUser.username}
                        className="w-full"
                      >
                        {deleting ? "Удаление..." : "Удалить аккаунт"}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "ip" && (
          <div className="p-4 sm:p-6 space-y-6">
            <div className="border border-red-400/30 rounded-xl bg-red-500/5 p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <Lock size={18} className="text-red-600 dark:text-red-400" />
                <h3 className="font-bold text-gray-900 dark:text-white">Заблокировать IP</h3>
                {blockIpTarget && (
                  <span className="ml-2 text-xs text-red-600 dark:text-red-400 font-mono">← из истории: {blockIpTarget}</span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <input
                  value={blockIpTarget || newBlockIp}
                  onChange={(e) => { setNewBlockIp(e.target.value); setBlockIpTarget(null); }}
                  placeholder="IP адрес (напр. 192.168.1.1)"
                  className="border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white font-mono focus:outline-none focus:border-red-600 dark:focus:border-red-400"
                />
                <input
                  value={newBlockReason}
                  onChange={(e) => setNewBlockReason(e.target.value)}
                  placeholder="Причина (опционально)"
                  className="border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:border-red-600 dark:focus:border-red-400"
                />
                <input
                  type="number"
                  value={newBlockHours}
                  onChange={(e) => setNewBlockHours(e.target.value ? Number(e.target.value) : "")}
                  placeholder="Часов (пусто = навсегда)"
                  className="border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:border-red-600 dark:focus:border-red-400"
                />
                <Button
                  variant="danger"
                  onClick={() => createIpBlock(blockIpTarget || newBlockIp, newBlockReason, newBlockHours)}
                  disabled={!(blockIpTarget || newBlockIp)}
                >
                  Заблокировать
                </Button>
              </div>
            </div>

            <div className="border border-gray-200 dark:border-white/10 rounded-xl bg-gray-100 dark:bg-white/5 overflow-hidden">
              <div className="p-4 border-b border-gray-200 dark:border-white/10 flex items-center justify-between">
                <h3 className="font-bold text-gray-900 dark:text-white">Заблокированные IP ({ipBlocks.length})</h3>
                <IconButton icon={RefreshCw} size="iconSm" onClick={loadIpBlocks} />
              </div>
              {ipBlocks.length === 0 ? (
                <p className="p-8 text-center text-gray-600 dark:text-white/50">Нет заблокированных IP</p>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-white/5">
                  {ipBlocks.map((b) => (
                    <div key={b.id} className="p-4 flex items-center gap-4 hover:bg-gray-100 dark:hover:bg-white/5">
                      <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                        <Lock size={18} className="text-red-600 dark:text-red-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-gray-900 dark:text-white font-bold">{b.ip_address}</p>
                        <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-white/50 flex-wrap mt-1">
                          {b.reason && <span>Причина: {b.reason}</span>}
                          <span>Заблокирован: {new Date(b.created_at).toLocaleString("ru-RU")}</span>
                          {b.expires_at ? (
                            <span className="text-yellow-600 dark:text-yellow-400">До: {new Date(b.expires_at).toLocaleString("ru-RU")}</span>
                          ) : (
                            <span className="text-red-600 dark:text-red-400 font-bold">НАВСЕГДА</span>
                          )}
                          {b.blocked_by && <span>Кем: {b.blocked_by.display_name}</span>}
                        </div>
                      </div>
                      <IconButton
                        variant="danger"
                        size="iconSm"
                        icon={Trash2}
                        onClick={() => deleteIpBlock(b.id)}
                        title="Разблокировать"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "logs" && (
          <div className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex gap-2 flex-wrap">
                {[null, "login", "register", "ban_user", "delete_user", "block_ip", "delete_post"].map((act) => (
                  <button
                    key={act ?? "all"}
                    onClick={() => setLogsFilter(act)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                      logsFilter === act ? "bg-[#3b82f6] border-[#3b82f6] text-white" : "border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-white/5 text-white/70 hover:bg-gray-100 dark:hover:bg-white/10"
                    }`}
                  >
                    {act ? (ACTION_LABELS[act]?.label || act) : "Все"}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                {me.is_admin && (
                  <Button variant="danger" size="sm" onClick={clearLogs}>
                    Очистить логи
                  </Button>
                )}
                <IconButton icon={RefreshCw} size="iconSm" onClick={loadLogs} />
              </div>
            </div>

            {logsLoading ? (
              <p className="p-8 text-center text-gray-600 dark:text-white/50">Загрузка...</p>
            ) : logs.length === 0 ? (
              <div className="p-12 text-center border border-gray-200 dark:border-white/10 rounded-xl bg-gray-100 dark:bg-white/5">
                <Activity size={48} className="mx-auto text-gray-500 dark:text-white/20 mb-4" />
                <p className="text-gray-600 dark:text-white/50">Логов пока нет</p>
              </div>
            ) : (
              <div className="border border-gray-200 dark:border-white/10 rounded-xl bg-gray-100 dark:bg-white/5 overflow-hidden">
                {logs.map((log) => {
                  const cfg = ACTION_LABELS[log.action] || { label: log.action, color: "text-gray-600 dark:text-white/60" };
                  return (
                    <div key={log.id} className="p-4 border-b border-gray-200 dark:border-white/5 hover:bg-gray-100 dark:hover:bg-white/5 flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center shrink-0">
                        <Activity size={16} className={cfg.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`text-xs font-black uppercase ${cfg.color}`}>{cfg.label}</span>
                          {log.target_type && <span className="text-gray-500 dark:text-white/40 text-xs">→ {log.target_type} #{log.target_id}</span>}
                          {log.ip_address && <span className="text-gray-500 dark:text-white/30 text-xs font-mono">IP: {log.ip_address}</span>}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-white/60 flex-wrap">
                          <span>{new Date(log.created_at).toLocaleString("ru-RU")}</span>
                          {log.actor && (
                            <span>
                              От: <span className="text-gray-800 dark:text-white/80">{log.actor.display_name}</span>
                            </span>
                          )}
                          {log.details && (
                            <span className="text-gray-500 dark:text-white/40 truncate max-w-xs" title={JSON.stringify(log.details)}>
                              {JSON.stringify(log.details)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "bugs" && (
          <div className="p-4 sm:p-6 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(BUG_STATUS_CONFIG).map(([key, config]) => {
                const count = bugCounts[key as keyof typeof bugCounts];
                const StatusIcon = config.icon;
                return (
                  <button
                    key={key}
                    onClick={() => setBugStatusFilter(bugStatusFilter === key ? null : key)}
                    className={`border rounded-xl p-4 transition-all text-left ${bugStatusFilter === key ? `${config.border} ${config.bg}` : "border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10"}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <StatusIcon size={18} className={config.color} />
                      <span className={`text-xl sm:text-2xl font-black ${config.color}`}>{count}</span>
                    </div>
                    <p className="text-sm font-bold text-gray-800 dark:text-white/80">{config.label}</p>
                  </button>
                );
              })}
            </div>

            {bugsLoading ? (
              <p className="p-12 text-center text-gray-600 dark:text-white/50">Загрузка...</p>
            ) : bugs.length === 0 ? (
              <div className="p-12 text-center border border-gray-200 dark:border-white/10 rounded-xl bg-gray-100 dark:bg-white/5">
                <Bug size={48} className="mx-auto text-gray-500 dark:text-white/20 mb-4" />
                <p className="text-gray-600 dark:text-white/60">Обращений пока нет</p>
              </div>
            ) : (
              <div className="space-y-3">
                {bugs.map((bug) => {
                  const sc = BUG_STATUS_CONFIG[bug.status as keyof typeof BUG_STATUS_CONFIG];
                  const pc = BUG_PRIORITY_CONFIG[bug.priority as keyof typeof BUG_PRIORITY_CONFIG];
                  const StatusIcon = sc.icon;
                  return (
                    <div key={bug.id} onClick={() => setSelectedBug(bug)} className={`border rounded-xl p-4 hover:bg-gray-100 dark:hover:bg-white/5 cursor-pointer ${sc.border}`}>
                      <div className="flex items-start gap-4">
                        <div className={`p-2 rounded-lg ${sc.bg} shrink-0`}>
                          <StatusIcon size={20} className={sc.color} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <h3 className="font-bold text-gray-900 dark:text-white truncate">{bug.title}</h3>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${pc.color} bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10`}>{pc.label}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${sc.color} ${sc.bg}`}>{sc.label}</span>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-white/60 line-clamp-2">{bug.description}</p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-white/40 flex-wrap">
                            <span>От: <span className="text-gray-800 dark:text-white/70">{bug.reporter?.display_name}</span></span>
                            <span>{new Date(bug.created_at).toLocaleString("ru-RU")}</span>
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

        {selectedBug && (
          <>
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200]" onClick={() => setSelectedBug(null)} />
            <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
              <div className="w-full max-w-2xl border border-gray-200 dark:border-white/20 rounded-2xl bg-white dark:bg-[#1f1f23]/95 backdrop-blur-md shadow-2xl p-4 sm:p-6 pointer-events-auto max-h-[85vh] overflow-y-auto">
                <div className="flex items-start justify-between mb-4 gap-3">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg sm:text-xl font-black text-gray-900 dark:text-white">{selectedBug.title}</h2>
                    <p className="text-sm text-gray-600 dark:text-white/50 mt-1">
                      ID #{selectedBug.id} · От:{" "}
                      {selectedBug.reporter ? (
                        <Link href={`/user/${selectedBug.reporter.id}`} className="text-[#8b5cf6] hover:underline" onClick={(e) => e.stopPropagation()}>
                          @{selectedBug.reporter.username}
                        </Link>
                      ) : "неизвестен"}
                    </p>
                  </div>
                  <IconButton icon={X} size="iconSm" onClick={() => setSelectedBug(null)} />
                </div>
                <p className="text-gray-800 dark:text-white/90 whitespace-pre-wrap bg-gray-100 dark:bg-white/5 p-4 rounded-lg border border-gray-200 dark:border-white/10 mb-6">{selectedBug.description}</p>
                <h3 className="text-sm font-bold text-gray-800 dark:text-white/80 mb-3">Сменить статус:</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
                  {Object.entries(BUG_STATUS_CONFIG).map(([key, config]) => {
                    const StatusIcon = config.icon;
                    return (
                      <button
                        key={key}
                        onClick={() => updateBugStatus(selectedBug.id, key)}
                        disabled={selectedBug.status === key}
                        className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold ${selectedBug.status === key ? `${config.border} ${config.bg} ${config.color}` : "border-gray-200 dark:border-white/20 text-gray-600 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/10"} disabled:opacity-60`}
                      >
                        <StatusIcon size={14} /> {config.label}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-3 pt-2 border-t border-gray-200 dark:border-white/10">
                  <Button variant="danger" icon={Trash2} onClick={() => deleteBug(selectedBug.id)}>
                    Удалить
                  </Button>
                  <Button variant="secondary" className="flex-1" onClick={() => setSelectedBug(null)}>Закрыть</Button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}