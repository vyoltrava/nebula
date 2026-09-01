"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { getToken } from "@/lib/auth";
import { Trash2, Edit2, X, Crown, Info, Plus, User, ChevronUp } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";

// === Доп. роли уровней 9-11 (высшая каста). Это настоящие роли: цвет подсвечивает ник, права выдаются системой ролей ===
const LEVELS = [9, 10, 11] as const;
const LEVEL_META: Record<number, { label: string; color: string; desc: string }> = {
  9: { label: "Developer", color: "#3b82f6", desc: "Разработка и технический Рґоступ" },
  10: { label: "Founder", color: "#fbbf24", desc: "Глава проекта / владелец" },
  11: { label: "System", color: "#8b5cf6", desc: "Системный / официальный аккаунт" },
};

// Категории прав с иконками и fallback
const PERMISSION_META: Record<string, { icon: string; category: "content" | "users" | "chats" | "system" }> = {
  delete_posts:         { icon: "🗑️", category: "content" },
  edit_posts:           { icon: "✏️", category: "content" },
  remove_avatars:       { icon: "🖼️", category: "content" },
  manage_stickers:      { icon: "🎨", category: "content" },
  manage_announcements: { icon: "📢", category: "content" },
  ban_users:            { icon: "🚫", category: "users" },
  warn_users:           { icon: "⚠️", category: "users" },
  delete_users:         { icon: "☠️", category: "users" },
  assign_moderator:     { icon: "👮", category: "users" },
  assign_roles:         { icon: "🎭", category: "users" },
  pin_messages:         { icon: "📌", category: "chats" },
  manage_groups:        { icon: "👥", category: "chats" },
  manage_support:       { icon: "🎧", category: "chats" },
  manage_roles:         { icon: "🎭", category: "system" },
  manage_users:         { icon: "⚙️", category: "system" },
  manage_reports:       { icon: "🚩", category: "system" },
  tech_access:          { icon: "🔧", category: "system" },
  manage_team_stats:    { icon: "📊", category: "system" },
  manage_suggestions:   { icon: "💡", category: "content" },
  manage_usernames:     { icon: "🏷️", category: "system" },
  access_owner_panel:   { icon: "👑", category: "system" },
  manage_backups:       { icon: "🛡️", category: "system" },
};

const CATEGORY_LABELS: Record<string, string> = {
  content: "📝 Контент",
  users: "👥 Пользователи",
  chats: "💬 Чаты и группы",
  system: "⚙️ Система",
};

interface RoleData {
  id: number;
  name: string;
  color: string;
  level?: number;
  description?: string | null;
  is_staff?: boolean;
  permissions?: string[];
}

export default function EliteRolesPage() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [roles, setRoles] = useState<RoleData[]>([]);
  const [availablePermissions, setAvailablePermissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Форма создания/редактирования роли
  const [showForm, setShowForm] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleData | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#8b5cf6");
  const [level, setLevel] = useState<number>(9);
  const [description, setDescription] = useState("");
  const [isStaff, setIsStaff] = useState(true);
  const [permissions, setPermissions] = useState<string[]>([]);

  // Выдача роли пользователю
  const [showAssign, setShowAssign] = useState(false);
  const [assignQuery, setAssignQuery] = useState("");
  const [assignResults, setAssignResults] = useState<any[]>([]);
  const [assignTarget, setAssignTarget] = useState<any>(null);
  const [assignRoleId, setAssignRoleId] = useState<number | null>(null);
  const [assignSaving, setAssignSaving] = useState(false);

  const myLevel = me?.is_admin ? 11 : me?.is_moderator ? 9 : me?.role?.level || 1;
  const canEditLevel = (lvl: number) => {
    if (lvl >= 11) return myLevel >= 11;
    if (lvl >= 10) return myLevel >= 10;
    return myLevel >= 9;
  };

  async function load() {
    const token = getToken();
    if (!token) { router.push("/login"); return; }
    try {
      const meRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!meRes.ok) throw new Error("Auth failed");
      const meData = await meRes.json();
      setMe(meData);
      if (myLevelOf(meData) < 9) { router.push("/"); return; }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/roles`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: RoleData[] = await res.json();
        const filtered = data.filter(r => LEVELS.includes((r.level ?? 0) as 9 | 10 | 11));
        setRoles(filtered);
        setAssignableRoles(filtered);
      }

      try {
        const permsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/permissions`);
        if (permsRes.ok) {
          const permsData = await permsRes.json();
          setAvailablePermissions(permsData.map((p: any) => ({
            ...p,
            icon: PERMISSION_META[p.id]?.icon || "🔑",
            category: PERMISSION_META[p.id]?.category || p.category || "system",
          })));
        }
      } catch { /* fallback: права останутся пустыми */ }
    } catch {
      router.push("/");
    } finally {
      setLoading(false);
    }
  }

  function myLevelOf(u: any): number {
    return u?.is_admin ? 11 : u?.is_moderator ? 9 : u?.role?.level || 1;
  }

  useEffect(() => { load(); }, []);

  function togglePermission(permId: string) {
    setPermissions(prev => prev.includes(permId) ? prev.filter(p => p !== permId) : [...prev, permId]);
  }

  function openForm(role?: RoleData) {
    if (role) {
      setEditingRole(role);
      setName(role.name);
      setColor(role.color);
      setLevel(role.level ?? 9);
      setDescription(role.description || "");
      setIsStaff(role.is_staff ?? true);
      setPermissions(role.permissions || []);
    } else {
      setEditingRole(null);
      setName("");
      setColor("#8b5cf6");
      setLevel(9);
      setDescription("");
      setIsStaff(true);
      setPermissions([]);
    }
    setShowForm(true);
  }

  async function saveRole(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    if (level > myLevel) {
      alert(`Вы РЅе можете создавать роли уровня выше ${myLevel}.`);
      return;
    }
    setSaving(true);
    const form = new FormData();
    form.append("name", name);
    form.append("color", color);
    form.append("level", String(level));
    form.append("description", description);
    form.append("is_staff", String(isStaff));
    form.append("permissions", JSON.stringify(permissions));

    try {
      const res = await fetch(
        editingRole
          ? `${process.env.NEXT_PUBLIC_API_URL}/api/roles/${editingRole.id}`
          : `${process.env.NEXT_PUBLIC_API_URL}/api/roles`,
        {
          method: editingRole ? "PATCH" : "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.detail || "Ошибка сохранения роли");
        return;
      }
      setShowForm(false);
      load();
    } catch {
      alert("Ошибка сети");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRole(roleId: number) {
    if (!confirm("Удалить роль? Она исчезнет у всех пользователей этой роли.")) return;
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/roles/${roleId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.detail || "Ошибка удаления");
        return;
      }
      load();
    } catch {
      alert("Ошибка сети");
    }
  }

  // === Выдача роли пользователю (система ролей) ===
  const [assignableRoles, setAssignableRoles] = useState<RoleData[]>([]);

  useEffect(() => {
    if (!assignQuery.trim()) { setAssignResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/search?q=${encodeURIComponent(assignQuery.trim())}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (res.ok) {
          const data = await res.json();
          setAssignResults((data.users || []).slice(0, 8));
        }
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [assignQuery]);

  async function assignRoleToUser() {
    if (!assignTarget || !assignRoleId) return;
    setAssignSaving(true);
    const token = getToken();
    const form = new FormData();
    form.append("role_id", String(assignRoleId));
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/${assignTarget.id}/role`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.detail || "Ошибка выдачи роли");
        return;
      }
      setShowAssign(false);
      setAssignTarget(null);
      setAssignQuery("");
      setAssignRoleId(null);
    } catch {
      alert("Ошибка сети");
    } finally {
      setAssignSaving(false);
    }
  }

  if (!me) return (
    <div className="h-screen flex items-center justify-center bg-ivory dark:bg-[#18181b]">
      <p className="text-gray-600 dark:text-white/60 animate-pulse">Загрузка...</p>
    </div>
  );

  return (
    <div className="h-screen flex overflow-hidden bg-ivory dark:bg-[#18181b]">
      <Sidebar />
      <div className="w-px shrink-0 bg-gray-100 dark:bg-white/10 my-3" />
      <main className="flex-1 overflow-y-auto border-x border-line dark:border-white/10">
        <div className="p-6 border-b border-line dark:border-white/10 sticky top-0 bg-paper dark:bg-[#171717]/80 backdrop-blur-md z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Crown size={24} className="text-[#fbbf24]" />
              <div>
                <h1 className="text-2xl font-black text-gray-900 dark:text-white">РРѕлРё высшей касты (9–11)</h1>
                <p className="text-xs text-gray-600 dark:text-white/50 mt-0.5">
                  Ваш уровень: <span className="font-bold">{myLevel}</span>
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button icon={Plus} onClick={() => openForm()}>Создать роль</Button>
              <Button variant="secondary" icon={User} onClick={() => setShowAssign(true)}>Выдать роль</Button>
            </div>
          </div>
        </div>

        <div className="p-4 border-b border-line dark:border-white/5">
          <div className="bg-[#fbbf24]/10 border border-[#fbbf24]/30 rounded-xl p-4 flex gap-3">
            <Info size={20} className="text-[#fbbf24] shrink-0 mt-0.5" />
            <div className="text-sm text-gray-800 dark:text-white/80 space-y-1">
              <p className="font-bold text-gray-900 dark:text-white">Это полноценные роли уровней 9–11</p>
<p>Создаются через систему ролей: <strong>цвет роли подсвечивает ник</strong>, права работают во всём приложении. Выдача — через «Выдать роль»( та же система, что в управлении ролями.).</p>
              <div className="flex flex-wrap gap-2 mt-2 text-xs">
                {LEVELS.map(l => (
                  <span key={l} className="px-2 py-0.5 rounded border" style={{ color: LEVEL_META[l].color, borderColor: `${LEVEL_META[l].color}40`, background: `${LEVEL_META[l].color}15` }}>
                    {LEVEL_META[l].label}: {l} — {LEVEL_META[l].desc}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {loading && <p className="text-center text-gray-500 dark:text-white/40 py-8 animate-pulse">Загрузка...</p>}
          {!loading && roles.length === 0 && (
            <div className="text-center py-12">
              <Crown size={48} className="mx-auto text-gray-300 dark:text-white/10 mb-3" />
              <p className="text-gray-500 dark:text-white/40 text-sm">РРѕлеР№ 9–11 РїРѕРєа нет. Нажмите ЫСоздать рольл.</p>
            </div>
          )}
          {roles.map(role => {
            const lvl = role.level ?? 9;
            const meta = LEVEL_META[lvl] || LEVEL_META[9];
            return (
              <div key={role.id} className="bg-paper dark:bg-[#171717] border border-line dark:border-white/10 rounded-xl p-4 hover:bg-white/[0.07] transition-colors">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-wrap flex-1">
                    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-white text-sm font-black uppercase tracking-widest shadow-lg border"
                      style={{ backgroundColor: role.color, borderColor: `${role.color}80`, boxShadow: `0 4px 14px 0 ${role.color}40` }}>
                      {role.name}
                      <span className="border-l border-white/30 pl-2 text-[10px] font-mono opacity-90">Lvl {lvl}</span>
                    </span>
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-bold border"
                      style={{ color: meta.color, borderColor: `${meta.color}40`, backgroundColor: `${meta.color}10` }}>
                      <ChevronUp size={12} /> {lvl}
                    </div>
                    {role.description && <p className="text-xs text-gray-600 dark:text-white/60 italic hidden md:block">"{role.description}"</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <IconButton icon={Edit2} variant="secondary" size="iconSm" disabled={!canEditLevel(lvl)} onClick={() => openForm(role)} title="Редактировать" />
                    <IconButton icon={Trash2} variant="danger" size="iconSm" disabled={!canEditLevel(lvl)} onClick={() => deleteRole(role.id)} title="Удалить" />
                  </div>
                </div>

                {role.permissions && role.permissions.length > 0 && (
                  <div className="mt-3 flex gap-1.5 flex-wrap">
                    {role.permissions.map(perm => {
                      const metaP = PERMISSION_META[perm];
                      const categoryColor = {
                        content: "border-orange-400/30 bg-orange-500/10 text-orange-600 dark:text-orange-300",
                        users: "border-red-400/30 bg-red-500/10 text-red-600 dark:text-red-300",
                        chats: "border-blue-400/30 bg-blue-500/10 text-blue-600 dark:text-blue-300",
                        system: "border-purple-400/30 bg-purple-500/10 text-purple-600 dark:text-purple-300",
                      }[metaP?.category || "system"];
                      return (
                        <span key={perm} className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs ${categoryColor}`}>
                          <span>{metaP?.icon || "🔑"}</span>
                          <span>{perm}</span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* МОДАЛКА СОЗДАНР?Я/РЕДАКТР?РОВАНР?Я РОЛР? 9-11 */}
        {showForm && (
          <>
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] animate-in fade-in duration-200" onClick={() => !saving && setShowForm(false)} />
            <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
              <div className="w-full max-w-lg border border-line dark:border-white/20 rounded-2xl bg-ivory dark:bg-[#1f1f23]/95 backdrop-blur-md shadow-2xl p-6 pointer-events-auto max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-black text-gray-900 dark:text-white">
                    {editingRole ? "Редактировать роль" : "Создать роль"}
                  </h2>
                  <IconButton icon={X} size="iconSm" onClick={() => !saving && setShowForm(false)} />
                </div>
                <form onSubmit={saveRole} className="space-y-5">
                  <div>
                    <label className="block text-sm font-bold text-gray-800 dark:text-white/80 mb-2">Название роли</label>
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Младший разработчик, 2nd Founder" required
                      className="w-full border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-[#8b5cf6]" />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-800 dark:text-white/80 mb-2">Цвет плашки и подсветки РЅРёРєа</label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-16 h-10 rounded-lg border border-line dark:border-white/20 cursor-pointer bg-transparent" />
                      <input type="text" value={color} onChange={(e) => setColor(e.target.value)} className="flex-1 border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white font-mono text-sm focus:outline-none focus:border-[#8b5cf6]" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-800 dark:text-white/80 mb-2">Описание роли</label>
<textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Чем занимается носитель этой роли?"
                      className="w-full border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-[#8b5cf6] resize-none" />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-bold text-gray-800 dark:text-white/80">Уровень иерархии</label>
                      <span className="text-xs font-mono px-2 py-0.5 rounded border" style={{ color: LEVEL_META[level]?.color, borderColor: `${LEVEL_META[level]?.color}40`, backgroundColor: `${LEVEL_META[level]?.color}10` }}>
                        {level} / 11
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {LEVELS.map(l => (
                        <button key={l} type="button" onClick={() => setLevel(l)} disabled={!canEditLevel(l)}
                          className={`py-2 px-3 rounded-lg text-sm font-bold border transition-all disabled:opacity-40 ${level === l ? "text-white" : "text-gray-700 dark:text-white/70 border-line dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/5"}`}
                          style={level === l ? { backgroundColor: LEVEL_META[l].color, borderColor: LEVEL_META[l].color } : undefined}>
                          {LEVEL_META[l].label} ({l})
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-white/40 mt-2">{LEVEL_META[level]?.desc}</p>
                  </div>

                  {/* 🆕 Предпросмотр плашки */ }
                  <div>
                    <label className="block text-sm font-bold text-gray-800 dark:text-white/80 mb-2">Предпросмотр плашки</label>
                    <div className="flex flex-wrap items-center gap-3 p-4 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10">
                      {isStaff && (
                        <span className="px-2 py-0.5 rounded-full bg-[#8b5cf6]/20 text-[#8b5cf6] text-xs font-bold border border-[#8b5cf6]/40 flex items-center gap-1">
                          <Crown size={10} /> Staff
                        </span>
                      )}
                      <span
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-white text-sm font-black uppercase tracking-widest shadow-lg border"
                        style={{ backgroundColor: color, borderColor: `${color}80`, boxShadow: `0 4px 14px 0 ${color}40` }}
                      >
                        <img src="/role-icon.svg" alt="" className="w-4 h-4 shrink-0" />
                        {name || "Название"}
                        <span className="border-l border-white/30 pl-2 text-[10px] font-mono opacity-90">
                          Lvl {level}
                        </span>
                      </span>
                      <div
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold border"
                        style={{ color: LEVEL_META[level]?.color, borderColor: `${LEVEL_META[level]?.color}40`, backgroundColor: `${LEVEL_META[level]?.color}10` }}
                      >
                        <ChevronUp size={12} />
                        {level}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-800 dark:text-white/80 mb-2">Права роли</label>
                    <div className="max-h-56 overflow-y-auto space-y-3 border border-line dark:border-white/10 rounded-lg p-3">
                      {(["content", "users", "chats", "system"] as const).map(cat => {
                        const group = availablePermissions.filter(p => p.category === cat);
                        if (group.length === 0) return null;
                        return (
                          <div key={cat} className="space-y-1.5">
                            <h4 className="text-xs font-black text-gray-600 dark:text-white/50 uppercase tracking-wider px-1">{CATEGORY_LABELS[cat]}</h4>
                            {group.map(perm => (
                              <label key={perm.id} className={`flex items-center gap-3 cursor-pointer p-2 rounded-lg border transition-all ${permissions.includes(perm.id) ? "border-[#8b5cf6] bg-purple-500/10" : "border-line dark:border-white/10 bg-gray-100 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10"}`}>
                                <input type="checkbox" checked={permissions.includes(perm.id)} onChange={() => togglePermission(perm.id)} className="w-4 h-4 rounded border-line dark:border-white/30 bg-gray-100 dark:bg-white/5 text-purple-500 focus:ring-purple-500" />
                                <span className="text-base">{perm.icon}</span>
                                <span className="text-sm text-gray-800 dark:text-white/90 font-semibold flex-1">{perm.label || perm.id}</span>
                              </label>
                            ))}
                          </div>
                        );
                      })}
                      {availablePermissions.length === 0 && (
                        <p className="text-xs text-gray-500 dark:text-white/40 text-center py-4">Права РЅе загружены</p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button type="submit" loading={saving} disabled={saving} className="flex-1">
                      {saving ? "Сохранение..." : editingRole ? "Сохранить" : "Создать"}
                    </Button>
                    <Button variant="secondary" onClick={() => !saving && setShowForm(false)} disabled={saving} className="flex-1">
                      Отмена
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </>
        )}

        {/* МОДАЛКА ВЫДАЧР? РОЛР? ПОЛЬЗОВАТЕЛЮ */}
        {showAssign && (
          <>
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] animate-in fade-in duration-200" onClick={() => !assignSaving && setShowAssign(false)} />
            <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
              <div className="w-full max-w-md border border-line dark:border-white/20 rounded-2xl bg-ivory dark:bg-[#1f1f23]/95 backdrop-blur-md shadow-2xl p-6 pointer-events-auto max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
<Crown size={18} className="text-[#fbbf24]" /> Выдать роль
                  </h2>
                  <IconButton icon={X} size="iconSm" onClick={() => !assignSaving && setShowAssign(false)} />
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-800 dark:text-white/80 mb-2">Найти пользователя</label>
                    <input value={assignQuery} onChange={(e) => { setAssignQuery(e.target.value); setAssignTarget(null); }} placeholder="Введите username РёлРё имя..."
                      className="w-full border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-[#8b5cf6]" />
                  </div>

                  {!assignTarget && assignResults.length > 0 && (
                    <div className="border border-line dark:border-white/10 rounded-lg divide-y divide-gray-100 dark:divide-white/5 max-h-52 overflow-y-auto">
                      {assignResults.map(u => (
                        <button key={u.id} type="button" onClick={() => { setAssignTarget(u); setAssignQuery(""); }}
                          className="w-full flex items-center gap-3 p-2.5 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left">
                          {u.avatar_url ? <img src={u.avatar_url} className="w-8 h-8 rounded-full object-cover" /> : <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-white/10" />}
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{u.display_name || u.username}</p>
                            <p className="text-xs text-gray-500 dark:text-white/40">@{u.username}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {assignTarget && (
                    <div className="p-3 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 flex items-center gap-3">
                      {assignTarget.avatar_url ? <img src={assignTarget.avatar_url} className="w-10 h-10 rounded-full object-cover" /> : <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-white/10" />}
                      <div>
                        <p className="text-sm font-bold text-gray-900 dark:text-white">{assignTarget.display_name || assignTarget.username}</p>
                        <p className="text-xs text-gray-500 dark:text-white/40">@{assignTarget.username}</p>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-bold text-gray-800 dark:text-white/80 mb-2">Роль (9–11)</label>
                    <div className="space-y-2">
                      {assignableRoles.length === 0 && (
                        <p className="text-sm text-gray-500 dark:text-white/40 py-2 text-center">РРѕлРё РЅе загружены</p>
                      )}
                      {assignableRoles.map(r => {
                        const lvl = r.level ?? 9;
                        const meta = LEVEL_META[lvl] || LEVEL_META[9];
                        const selected = assignRoleId === r.id;
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => setAssignRoleId(r.id)}
                            className={`w-full flex items-center justify-between gap-3 p-2.5 rounded-lg border transition-all text-left ${
                              selected
                                ? "border-transparent ring-2 ring-[#8b5cf6]"
                                : "border-line dark:border-white/10 bg-gray-100 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10"
                            }`}
                            style={selected ? { backgroundColor: `${meta.color}22` } : undefined}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <span
                                className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-white text-xs font-black uppercase tracking-widest shadow border shrink-0"
                                style={{ backgroundColor: r.color, borderColor: `${r.color}80`, boxShadow: `0 4px 14px 0 ${r.color}40` }}
                              >
                                {r.name}
                                <span className="border-l border-white/30 pl-1.5 text-[9px] font-mono opacity-90">Lvl {lvl}</span>
                              </span>
                            </span>
                            <span
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border shrink-0"
                              style={{ color: meta.color, borderColor: `${meta.color}40`, backgroundColor: `${meta.color}10` }}
                            >
                              <ChevronUp size={10} /> {lvl}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-white/40 mt-2">
                      Роль выдаётся через систему ролей — подсветка РЅРёРєа и права применятся автоматически.
                    </p>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button onClick={assignRoleToUser} loading={assignSaving} disabled={!assignTarget || !assignRoleId || assignSaving} className="flex-1">
                      Выдать
                    </Button>
                    <Button variant="secondary" onClick={() => !assignSaving && setShowAssign(false)} disabled={assignSaving} className="flex-1">
                      Отмена
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

      </main>
    </div>
  );
}

