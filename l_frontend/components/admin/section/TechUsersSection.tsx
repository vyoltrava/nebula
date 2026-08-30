// components/admin/section/TechUsersSection.tsx
"use client";
import { useTheme } from "next-themes";
import { resolveNickColor } from "@/lib/nickGlow";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { getToken } from "@/lib/auth";
import {
  Users, Search, Upload, Save, Ban, ShieldCheck, RefreshCw,
  Trash2, AlertTriangle, Lock, History, Tag,
} from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";

export function TechUsersSection({ me }: { me: any }) {
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
  const [blockIpTarget, setBlockIpTarget] = useState<string | null>(null);

function getGlowColor(user: any): string | null {
if (user?.username === "trelod") return "#e4e4e7"; // Zinc-200
  if (user?.is_admin) return "#fff";
  if (user?.is_moderator) return "#3b82f6";
  if (user?.role?.color) return user.role.color;
  return null;
}

  const { resolvedTheme } = useTheme();
  function glowStyle(user: any): React.CSSProperties | undefined {
    const c = resolveNickColor(getGlowColor(user), resolvedTheme);
    if (!c) return undefined;
    return { color: c, textShadow: `0 0 6px ${c}B3, 0 0 14px ${c}66` };
  }

  async function loadUsers() {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAllUsers(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("load users error:", err);
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

  useEffect(() => { loadUsers(); }, []);
  useEffect(() => { if (selectedUser) loadIpHistory(selectedUser.id); }, [selectedUser]);

  const [viewMode, setViewMode] = useState<"users" | "nicks">("users");
  const [nickLogs, setNickLogs] = useState<any[]>([]);
  const [nickLoading, setNickLoading] = useState(false);

  async function loadNickLogs() {
    const token = getToken();
    if (!token) return;
    setNickLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/nick-history?limit=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setNickLogs(await res.json());
    } catch (err) {
      console.error("load nick logs error:", err);
    } finally {
      setNickLoading(false);
    }
  }

  useEffect(() => { if (viewMode === "nicks") loadNickLogs(); }, [viewMode]);

  function selectUser(user: any) {
    setSelectedUser(user);
    setEditUsername(user.username);
    setEditDisplayName(user.display_name);
    setNewPassword("");
    setSaveMsg(null);
    setDeleteConfirm("");
    setShowReset2FAConfirm(false);
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
        loadUsers();
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
        { method: "POST", headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setSaveMsg({ text: data?.detail ?? "Ошибка сброса 2FA", type: "err" });
      } else {
        setSaveMsg({ text: `2FA для @${selectedUser.username} сброшена!`, type: "ok" });
        setTimeout(() => setSaveMsg(null), 3000);
        setShowReset2FAConfirm(false);
        loadUsers();
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
        setSaveMsg({ text: data?.detail ?? "Ошибка анонимизации", type: "err" });
      } else {
        // 🆕 Бэкенд теперь возвращает просто ok при мягком удалении
        setSaveMsg({ text: "Аккаунт успешно анонимизирован и заблокирован", type: "ok" });
        setTimeout(() => setSaveMsg(null), 3000);
        
        setSelectedUser(null);
        setDeleteConfirm("");
        loadUsers(); // Перезагружаем список, чтобы увидеть обновлённые данные (is_banned: true)
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
      loadUsers();
    } else {
      const data = await res.json().catch(() => null);
      setSaveMsg({ text: data?.detail ?? "Ошибка загрузки", type: "err" });
    }
  }

  const filteredUsers = allUsers.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (u.username?.toLowerCase().includes(q)) || (u.display_name?.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-4">
      {/* Переключатель режима */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setViewMode("users")} className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-bold transition-all ${viewMode === "users" ? "bg-[#8b5cf6] border-[#8b5cf6] text-white" : "border-line dark:border-white/10 bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/10"}`}>
          <Users size={16} /> Пользователи
        </button>
        <button onClick={() => setViewMode("nicks")} className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-bold transition-all ${viewMode === "nicks" ? "bg-[#8b5cf6] border-[#8b5cf6] text-white" : "border-line dark:border-white/10 bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/10"}`}>
          <Tag size={16} /> Смена ников
        </button>
      </div>

      {viewMode === "nicks" ? (
        <div className="border border-line dark:border-white/10 rounded-xl bg-gray-100 dark:bg-white/5 overflow-hidden">
          <div className="p-4 border-b border-line dark:border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History size={18} className="text-[#8b5cf6]" />
              <h3 className="font-bold text-gray-900 dark:text-white">История смены ников (все пользователи)</h3>
            </div>
            <button onClick={loadNickLogs} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white"><RefreshCw size={16} /></button>
          </div>
          {nickLoading ? (
            <p className="p-8 text-center text-gray-600 dark:text-white/50">Загрузка...</p>
          ) : nickLogs.length === 0 ? (
            <p className="p-12 text-center text-gray-600 dark:text-white/50">Логов пока нет</p>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto divide-y divide-line dark:divide-white/5">
              {nickLogs.map((log) => (
                <div key={log.id} className="p-3 sm:p-4 flex items-center gap-4">
                  {/* Кому изменили */}
                  <div className="flex items-center gap-2 min-w-0">
                    {log.user ? (
                      <Link href={`/user/${log.user.id}`} className="flex items-center gap-2 min-w-0 group">
                        <Avatar src={log.user.avatar_url} name={log.user.display_name} id={log.user.id} size={32} />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-900 dark:text-white truncate group-hover:text-[#8b5cf6]">{log.user.display_name || log.user.username}</p>
                          <p className="text-[10px] text-gray-500 dark:text-white/40 truncate">@{log.user.username}</p>
                        </div>
                      </Link>
                    ) : <span className="text-gray-500 dark:text-white/40 text-sm">Удалён</span>}
                  </div>

                  {/* Стрелка */}
                  <span className="text-gray-500 dark:text-white/40 shrink-0 text-xs">→</span>

                  {/* Кто изменил */}
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] text-gray-500 dark:text-white/40 shrink-0">выдал</span>
                    {log.changed_by ? (
                      <Link href={`/user/${log.changed_by.id}`} className="flex items-center gap-2 min-w-0 group">
                        <Avatar src={log.changed_by.avatar_url} name={log.changed_by.display_name} id={log.changed_by.id} size={24} />
                        <span className="text-sm text-gray-700 dark:text-white/70 truncate group-hover:text-[#8b5cf6]">{log.changed_by.display_name || log.changed_by.username}</span>
                      </Link>
                    ) : <span className="text-gray-500 dark:text-white/40 text-sm">Система</span>}
                  </div>

                  {/* Само изменение */}
                  <div className="flex-1 min-w-0 text-right sm:text-left">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${log.field === "username" ? "bg-blue-500/20 text-blue-600 dark:text-blue-400" : "bg-purple-500/20 text-purple-600 dark:text-purple-400"}`}>{log.field === "username" ? "@username" : "имя"}</span>
                    <div className="text-xs text-gray-600 dark:text-white/60 mt-0.5 truncate">
                      <span className="line-through opacity-50">{log.old_value}</span>
                      <span className="mx-1">→</span>
                      <span className="font-semibold">{log.new_value}</span>
                    </div>
                  </div>

                  <span className="text-gray-500 dark:text-white/40 text-xs shrink-0">{new Date(log.changed_at).toLocaleString("ru-RU")}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Список пользователей */}
      <div className="lg:col-span-1 border border-line dark:border-white/10 rounded-xl bg-gray-100 dark:bg-white/5 overflow-hidden flex flex-col max-h-[75vh]">
        <div className="p-3 border-b border-line dark:border-white/10">
          <div className="flex items-center gap-2 bg-gray-100 dark:bg-white/5 rounded-lg px-3 py-2 border border-line dark:border-white/10">
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
                <p className={`font-semibold text-sm truncate ${glowStyle(u) ? "" : "text-gray-900 dark:text-white"}`} style={glowStyle(u)}>{u.display_name}</p>
                <p className="text-xs text-gray-500 dark:text-white/40 truncate">@{u.username}</p>
                {u.last_ip && <p className="text-[10px] text-gray-500 dark:text-white/30 truncate">IP: {u.last_ip}</p>}
              </div>
              {u.is_banned && <Ban size={14} className="text-red-600 dark:text-red-400 shrink-0" />}
            </button>
          ))}
        </div>
      </div>

      {/* Редактирование */}
      <div className="lg:col-span-2">
        {!selectedUser ? (
          <div className="border border-line dark:border-white/10 rounded-xl bg-gray-100 dark:bg-white/5 p-12 text-center">
            <Users size={48} className="mx-auto text-gray-500 dark:text-white/20 mb-4" />
            <p className="text-gray-600 dark:text-white/50">Выбери пользователя для редактирования</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="border border-line dark:border-white/10 rounded-xl bg-gray-100 dark:bg-white/5 p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row items-start gap-6 mb-6">
                <div className="text-center">
                  <Avatar src={selectedUser.avatar_url} name={selectedUser.display_name} id={selectedUser.id} size={96} />
                  <label className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-line dark:border-white/10 bg-gray-100 dark:bg-white/5 text-gray-800 dark:text-white/70 text-xs font-semibold hover:bg-gray-100 dark:hover:bg-white/10 cursor-pointer">
                    <Upload size={12} /> Сменить
                    <input type="file" accept="image/*" className="hidden" onChange={uploadAvatar} />
                  </label>
                </div>

                <div className="flex-1 w-full">
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    <h2 className={`text-lg sm:text-xl font-black ${glowStyle(selectedUser) ? "" : "text-gray-900 dark:text-white"}`} style={glowStyle(selectedUser)}>{selectedUser.display_name}</h2>
                    {selectedUser.is_admin && <span className="px-1.5 py-0.5 rounded bg-black text-white dark:bg-white dark:text-black text-[8px] font-black uppercase">Founder</span>}
                    {selectedUser.is_moderator && !selectedUser.is_admin && <span className="px-2 py-0.5 rounded bg-blue-500 text-white text-[10px] font-black uppercase">Developer</span>}
                    {selectedUser.role && !selectedUser.is_admin && !selectedUser.is_moderator && <span className="px-2 py-0.5 rounded text-white text-[10px] font-black uppercase" style={{ backgroundColor: selectedUser.role.color }}>{selectedUser.role.name}</span>}
                    {selectedUser.is_banned && <span className="px-2 py-0.5 rounded bg-red-500 text-white text-[10px] font-black uppercase">BANNED</span>}
                  </div>
                  <p className="text-gray-600 dark:text-white/50 text-sm mb-3">@{selectedUser.username} · ID #{selectedUser.id}</p>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div className="border border-line dark:border-white/10 rounded-lg p-3 bg-gray-100 dark:bg-white/5">
                      <p className="text-gray-500 dark:text-white/40 text-xs">Постов</p>
                      <p className="text-gray-900 dark:text-white font-bold text-lg">{selectedUser.posts_count ?? "—"}</p>
                    </div>
                    <div className="border border-line dark:border-white/10 rounded-lg p-3 bg-gray-100 dark:bg-white/5">
                      <p className="text-gray-500 dark:text-white/40 text-xs">Подписчиков</p>
                      <p className="text-gray-900 dark:text-white font-bold text-lg">{selectedUser.followers_count ?? "—"}</p>
                    </div>
                    <div className="border border-line dark:border-white/10 rounded-lg p-3 bg-gray-100 dark:bg-white/5">
                      <p className="text-gray-500 dark:text-white/40 text-xs">Регистрация</p>
                      <p className="text-gray-900 dark:text-white font-bold text-xs">{selectedUser.created_at ? new Date(selectedUser.created_at).toLocaleDateString("ru-RU") : "—"}</p>
                    </div>
                    <div className="border border-line dark:border-white/10 rounded-lg p-3 bg-gray-100 dark:bg-white/5">
                      <p className="text-gray-500 dark:text-white/40 text-xs">Последний IP</p>
                      <p className="text-gray-900 dark:text-white font-bold text-xs font-mono truncate">{selectedUser.last_ip || "—"}</p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 mt-4">
                    <Link href={`/user/${selectedUser.id}`} className="px-4 py-2 rounded-lg border border-[#8b5cf6] text-[#8b5cf6] hover:bg-[#8b5cf6]/10 text-sm font-bold text-center">
                      Открыть профиль →
                    </Link>
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-line dark:border-white/10">
                <div>
                  <label className="block text-sm font-semibold text-gray-800 dark:text-white/70 mb-1">Username (@)</label>
                  <input value={editUsername} onChange={(e) => setEditUsername(e.target.value)} className="w-full border border-line dark:border-white/10 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:border-[#8b5cf6]" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-800 dark:text-white/70 mb-1">Отображаемое имя</label>
                  <input value={editDisplayName} onChange={(e) => setEditDisplayName(e.target.value)} className="w-full border border-line dark:border-white/10 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:border-[#8b5cf6]" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-800 dark:text-white/70 mb-1">
                    Новый пароль <span className="text-gray-500 dark:text-white/40">(пусто = не менять)</span>
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full border border-line dark:border-white/10 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:border-[#8b5cf6]"
                  />
                </div>

                <div className="border border-amber-500/30 rounded-lg bg-amber-500/5 p-3">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={16} className={selectedUser.two_fa_enabled ? "text-emerald-600 dark:text-emerald-400" : "text-gray-500 dark:text-white/40"} />
                      <span className="text-sm font-bold text-gray-900 dark:text-white">2FA</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                      selectedUser.two_fa_enabled
                        ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                        : "bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-white/40 border border-line dark:border-white/10"
                    }`}>
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
                          ⚠️ Пользователю придётся заново настроить 2FA.
                          {selectedUser.id === me?.id && <span className="block mt-1 font-bold text-amber-200">Вы сбрасываете 2FA сами себе.</span>}
                        </p>
                        <div className="flex gap-2">
                          <Button variant="danger" size="sm" loading={resetting2FA} onClick={resetUser2FA} disabled={resetting2FA} className="flex-1">
                            {resetting2FA ? "Сброс..." : "Подтвердить"}
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => setShowReset2FAConfirm(false)} disabled={resetting2FA} className="flex-1">
                            Отмена
                          </Button>
                        </div>
                      </div>
                    )
                  ) : (
                    <p className="text-xs text-gray-500 dark:text-white/40">2FA не настроена.</p>
                  )}
                </div>

                {saveMsg && (
                  <div className={`p-3 rounded-lg border text-sm font-semibold ${saveMsg.type === "ok" ? "bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400" : "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400"}`}>
                    {saveMsg.text}
                  </div>
                )}

                <Button icon={Save} loading={saving} onClick={saveUser} disabled={saving} className="w-full">
                  {saving ? "Сохранение..." : "Сохранить"}
                </Button>
              </div>
            </div>

            <div className="border border-line dark:border-white/10 rounded-xl bg-gray-100 dark:bg-white/5 p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-4">
                <History size={18} className="text-[#8b5cf6]" />
                <h3 className="font-bold text-gray-900 dark:text-white">История IP</h3>
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
                      <span className="text-gray-500 dark:text-white/40 text-xs">{new Date(log.created_at).toLocaleString("ru-RU")}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* 🆕 История смены ников (в детальной стате пользователя) */}
            {selectedUser.nick_history && selectedUser.nick_history.length > 0 && (
              <div className="border border-line dark:border-white/10 rounded-xl bg-gray-100 dark:bg-white/5 p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-4">
                  <History size={18} className="text-emerald-500" />
                  <h3 className="font-bold text-gray-900 dark:text-white">История смены ников</h3>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {selectedUser.nick_history.map((log: any) => (
                    <div key={log.changed_at} className="flex items-center justify-between p-2 rounded-lg bg-gray-100 dark:bg-white/5 text-sm">
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${log.field === "username" ? "bg-blue-500/20 text-blue-600 dark:text-blue-400" : "bg-purple-500/20 text-purple-600 dark:text-purple-400"}`}>{log.field === "username" ? "@username" : "имя"}</span>
                        <span className="line-through opacity-50 text-gray-500 dark:text-white/40">{log.old_value}</span>
                        <span className="text-gray-500 dark:text-white/40">→</span>
                        <span className="font-semibold">{log.new_value}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {log.changed_by && (
                          <>
                            <Link href={`/user/${log.changed_by.id}`} className="flex items-center gap-1 group">
                              <Avatar src={log.changed_by.avatar_url} name={log.changed_by.display_name} id={log.changed_by.id} size={20} />
                              <span className="text-xs text-gray-600 dark:text-white/60 group-hover:text-[#8b5cf6] truncate">{log.changed_by.display_name || log.changed_by.username}</span>
                            </Link>
                          </>
                        )}
                        <span className="text-gray-500 dark:text-white/40 text-xs">{new Date(log.changed_at).toLocaleString("ru-RU")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {me.permissions?.includes("delete_users") && (
              <div className="border border-red-400/30 rounded-xl bg-red-500/5 p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={18} className="text-red-600 dark:text-red-400" />
                  <h3 className="font-bold text-red-600 dark:text-red-400">Анонимизация аккаунта</h3>
                </div>
                <p className="text-sm text-gray-600 dark:text-white/60 mb-3">
                  Аккаунт будет переименован в "Удаленный аккаунт", аватарка и данные будут стёрты, а вход заблокирован. 
                  История чатов и постов <span className="text-gray-900 dark:text-white font-semibold">сохранится</span>.
                </p>
                <input
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value.replace(/^@/, ""))}
                  placeholder={`Введите ${selectedUser.username} для подтверждения`}
                  className="w-full border border-red-400/30 rounded-lg px-3 py-2 bg-red-500/5 text-white focus:outline-none focus:border-red-600 dark:focus:border-red-400 mb-3 placeholder-red-400/40"
                />
                <Button
                  variant="danger"
                  icon={Trash2}
                  loading={deleting}
                  onClick={deleteUser}
                  disabled={deleting || deleteConfirm !== selectedUser.username}
                  className="w-full"
                >
                  {deleting ? "Обработка..." : "Анонимизировать аккаунт"}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
        </div>
      )} 
    </div>
  );
}