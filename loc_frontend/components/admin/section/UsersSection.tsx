"use client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { getToken } from "@/lib/auth";
import { Listbox } from "@headlessui/react";
import {
  Shield, ShieldCheck, Ban, UserCheck, ImageOff, Crown,
  ExternalLink, Trash2, Search, Filter, Users, X, AlertTriangle,
} from "lucide-react";

export function UsersSection({ me }: { me: any }) {
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "team" | "users">("all");
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [warnTarget, setWarnTarget] = useState<any>(null);
  const [warnReason, setWarnReason] = useState("");
  const [warnList, setWarnList] = useState<any[]>([]);
  const [warnLoading, setWarnLoading] = useState(false);

  function can(permission: string): boolean {
    if (me.is_admin) return true;
    return (me.permissions || []).includes(permission);
  }

async function load() {
  const token = getToken();
  
  // 1. Загружаем пользователей
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.ok) setUsers(await res.json());
  
  // 2. Загружаем ТОЛЬКО доступные для выдачи роли (с учётом отдела и уровня)
  const rolesRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/roles/assignable`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (rolesRes.ok) setRoles(await rolesRes.json());
  
  // 3. Загружаем категории (отделы) для названий
  const catsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/role-categories`);
  if (catsRes.ok) {
    const cats = await catsRes.json();
    // Обогащаем роли информацией о категориях
    setRoles((prev) =>
      prev.map((r) => {
        const cat = cats.find((c: any) => c.id === r.category_id);
        return {
          ...r,
          category_name: cat?.name || "Без категории",
          category_color: cat?.color || "#8b5cf6",
          category_order: cat?.order ?? 999,
        };
      })
    );
  }
}

  useEffect(() => { load(); }, []);

  // 🆕 Группировка ролей по отделам (командам)
  const groupedRoles = useMemo(() => {
    const groups: Record<string, any> = {};

    roles.forEach((r) => {
      const catId = r.category_id ? String(r.category_id) : 'no_cat';
      const catName = r.category_name || 'Без категории';
      const catColor = r.category_color || '#8b5cf6';
      const catOrder = r.category_order ?? 999;

      if (!groups[catId]) {
        groups[catId] = { id: catId, name: catName, color: catColor, order: catOrder, roles: [] };
      }
      groups[catId].roles.push(r);
    });

    return Object.values(groups).sort((a, b) => {
      if (a.id === 'no_cat') return -1;
      if (b.id === 'no_cat') return 1;
      if (a.order !== b.order) return a.order - b.order;
      return a.name.localeCompare(b.name);
    });
  }, [roles]);



  const filteredUsers = users.filter((u) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!u.username.toLowerCase().includes(q) && !u.display_name.toLowerCase().includes(q)) return false;
    }
    if (filterType === "team") {
      if (!(u.is_admin || u.is_moderator || (u.level ?? 1) >= 3)) return false;
    } else if (filterType === "users") {
      if (u.is_admin || u.is_moderator || (u.level ?? 1) >= 3) return false;
    }
    if (selectedRoleId !== null && (!u.role || u.role.id !== selectedRoleId)) return false;
    return true;
  });

  async function openWarns(u: any) {
    setWarnTarget(u); setWarnReason(""); setWarnLoading(true);
    const token = getToken();
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users/${u.id}/warnings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setWarnList(res.ok ? await res.json() : []);
    } catch { setWarnList([]); }
    setWarnLoading(false);
  }

  async function issueWarn() {
    if (!warnTarget || warnReason.trim().length < 3) return alert("Причина: минимум 3 символа");
    const token = getToken();
    const form = new FormData();
    form.append("reason", warnReason.trim());
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users/${warnTarget.id}/warn`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
    });
    if (res.ok) { setWarnReason(""); openWarns(warnTarget); load(); }
    else { const d = await res.json().catch(() => null); alert(d?.detail || "Ошибка"); }
  }

  async function revokeWarn(warnId: number) {
    const token = getToken();
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/warnings/${warnId}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    if (warnTarget) openWarns(warnTarget);
    load();
  }

  async function toggleBan(userId: number, target: any) {
    const token = getToken();
    const myLevel = me?.level ?? 1;
    const targetLevel = target?.level ?? 1;
    if (targetLevel >= myLevel && !me?.is_admin) {
      return alert(`🛡️ Иммунитет: уровень цели (${targetLevel}) ≥ вашего (${myLevel}).`);
    }
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users/${userId}/ban`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { const d = await res.json().catch(() => null); return alert(d?.detail || "Нет прав"); }
    load();
  }

  async function removeAvatar(userId: number) {
    const token = getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users/${userId}/avatar`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { const d = await res.json().catch(() => null); return alert(d?.detail || "Нет прав"); }
    load();
  }

  async function deleteAllPosts(userId: number) {
    if (!confirm("Удалить ВСЕ посты?")) return;
    const token = getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users/${userId}/posts`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { const d = await res.json().catch(() => null); return alert(d?.detail || "Нет прав"); }
    const data = await res.json();
    alert(`Удалено постов: ${data.deleted_count}`);
    load();
  }

  async function toggleModerator(userId: number) {
    const token = getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users/${userId}/moderator`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { const d = await res.json().catch(() => null); return alert(d?.detail || "Нет прав"); }
    load();
  }

  async function assignRole(userId: number, roleId: number | null) {
    const token = getToken();
    const form = new FormData();
    if (roleId) form.append("role_id", String(roleId));
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/${userId}/role`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
    });
    if (!res.ok) { const d = await res.json().catch(() => null); return alert(d?.detail || "Нет прав"); }
    load();
  }

  const myLevel = me?.level ?? 1;

  return (
    <div>
      {/* Фильтры */}
      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по нику или имени..."
            className="w-full pl-10 pr-10 py-2.5 border border-white/15 rounded-lg bg-white/5 text-white placeholder-white/40 focus:outline-none focus:border-[#8b5cf6]"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white">
              <X size={18} />
            </button>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => { setFilterType("all"); setSelectedRoleId(null); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-bold ${filterType === "all" && !selectedRoleId ? "border-[#8b5cf6] bg-[#8b5cf6]/20 text-[#8b5cf6]" : "border-white/15 text-white/60 hover:bg-white/5"}`}>
            <Users size={16} /> Все ({users.length})
          </button>
          <button onClick={() => { setFilterType("team"); setSelectedRoleId(null); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-bold ${filterType === "team" ? "border-[#3b82f6] bg-[#3b82f6]/20 text-[#3b82f6]" : "border-white/15 text-white/60 hover:bg-white/5"}`}>
            <ShieldCheck size={16} /> Команда
          </button>
          <button onClick={() => { setFilterType("users"); setSelectedRoleId(null); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-bold ${filterType === "users" ? "border-green-400 bg-green-400/20 text-green-400" : "border-white/15 text-white/60 hover:bg-white/5"}`}>
            <Filter size={16} /> Обычные
          </button>
          <select
            value={selectedRoleId ?? ""}
            onChange={(e) => { setSelectedRoleId(e.target.value ? Number(e.target.value) : null); setFilterType("all"); }}
            className="px-4 py-2 rounded-lg border border-white/15 bg-white/5 text-white text-sm font-bold focus:outline-none focus:border-[#8b5cf6] cursor-pointer"
          >
            <option value="" className="bg-gray-900">Все роли</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id} className="bg-gray-900">{r.name} (Lvl {r.level ?? 1})</option>
            ))}
          </select>
        </div>
      </div>

      {/* Список */}
      <div className="space-y-3">
        {filteredUsers.length === 0 && <p className="p-8 text-center text-white/50">Никого не найдено</p>}
        {filteredUsers.map((u) => {
          const targetLevel = u.level ?? 1;
          const canSanction = myLevel > targetLevel || me?.is_admin;
          return (
            <div key={u.id} className={`border rounded-xl p-4 ${u.is_banned ? "border-red-500/30 bg-red-500/5" : "border-white/15 bg-white/5"}`}>
              <div className="flex items-start gap-4">
                <Link href={`/user/${u.id}`} className="shrink-0">
                  <Avatar src={u.avatar_url} name={u.display_name} id={u.id} size={48} />
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/user/${u.id}`} className="font-bold text-white hover:text-[#8b5cf6]">{u.display_name}</Link>
                    {u.is_admin && <span className="px-1.5 py-0.5 rounded bg-white text-black text-[8px] font-black uppercase"><Crown size={8} className="inline" /> Founder</span>}
                    {u.is_moderator && !u.is_admin && <span className="px-2 py-0.5 rounded bg-[#3b82f6] text-white text-[10px] font-black uppercase"><ShieldCheck size={8} className="inline" /> Developer</span>}
                    {u.role && !u.is_admin && !u.is_moderator && (
                      <span className="px-2 py-0.5 rounded text-white text-[10px] font-black uppercase" style={{ backgroundColor: u.role.color }}>{u.role.name}</span>
                    )}
                    {u.is_banned && <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] font-black uppercase"><Ban size={8} className="inline" /> Banned</span>}
                    <span className="text-white/40 text-sm">@{u.username}</span>
                  </div>
                  <p className="text-white/40 text-xs mt-1">ID: {u.id} • Lvl: {targetLevel}</p>
                </div>
                <div className="flex gap-2 flex-wrap items-center">
                  {u.warnings_count > 0 && (
                    <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 text-xs font-bold">
                      <AlertTriangle size={12} /> {u.warnings_count}
                    </span>
                  )}
                  {can("warn_users") && !u.is_admin && (
                    <button onClick={() => openWarns(u)} className="px-3 py-1.5 rounded-lg border border-yellow-400/30 text-yellow-400 text-xs font-bold hover:bg-yellow-500/10">
                      <AlertTriangle size={12} className="inline mr-1" />Варны
                    </button>
                  )}
                  {can("ban_users") && !u.is_admin && u.id !== me.id && (
                    canSanction ? (
                      <button onClick={() => toggleBan(u.id, u)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${u.is_banned ? "border-green-400/30 text-green-400 hover:bg-green-500/10" : "border-red-400/30 text-red-400 hover:bg-red-500/10"}`}>
                        <Ban size={12} className="inline mr-1" />{u.is_banned ? "Разбанить" : "Забанить"}
                      </button>
                    ) : (
                      <span className="px-3 py-1.5 rounded-lg border border-white/10 text-white/30 text-xs font-bold cursor-not-allowed">
                        <Shield size={12} className="inline mr-1" />Иммунитет
                      </span>
                    )
                  )}
                  {can("remove_avatars") && u.avatar_url && !u.is_admin && canSanction && (
                    <button onClick={() => removeAvatar(u.id)} className="px-3 py-1.5 rounded-lg border border-orange-400/30 text-orange-400 text-xs font-bold hover:bg-orange-500/10">
                      <ImageOff size={12} className="inline mr-1" />Аватар
                    </button>
                  )}
                  {can("delete_posts") && !u.is_admin && canSanction && (
                    <button onClick={() => deleteAllPosts(u.id)} className="px-3 py-1.5 rounded-lg border border-red-400/30 text-red-400 text-xs font-bold hover:bg-red-500/10">
                      <Trash2 size={12} className="inline mr-1" />Посты
                    </button>
                  )}
                  {can("assign_moderator") && !u.is_admin && (me?.is_admin || canSanction) && (
                    <button onClick={() => toggleModerator(u.id)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${u.is_moderator ? "border-yellow-400/30 text-yellow-400 hover:bg-yellow-500/10" : "border-cyan-400/30 text-cyan-400 hover:bg-cyan-500/10"}`}>
                      <UserCheck size={12} className="inline mr-1" />{u.is_moderator ? "Снять" : "В разработчики"}
                    </button>
                  )}
                  
                  {/* 🆕 Выпадающий список ролей с группировкой по отделам */}
{/* 🆕 Выпадающий список ролей с группировкой по отделам */}
{(can("manage_roles") || can("assign_roles")) && !u.is_admin && canSanction && (
  <div className="relative">
    <Listbox value={u.role?.id ?? null} onChange={(roleId: number | null) => assignRole(u.id, roleId)}>
                        <Listbox.Button className="px-3 py-1.5 rounded-lg border border-white/20 bg-white/5 text-blue-400 text-xs font-bold cursor-pointer max-w-[140px] truncate">
                          {u.role?.name || "Без роли"}
                        </Listbox.Button>
                        
                        <Listbox.Options className="absolute right-0 z-50 mt-1 w-56 max-h-72 overflow-y-auto rounded-lg bg-gray-900 border border-white/10 shadow-xl">
                          {/* 1. Блок без команды */}
                          <Listbox.Option value={null} className={({ active }) => `cursor-pointer px-3 py-2 text-xs text-white ${active ? "bg-[#8b5cf6]" : "hover:bg-white/10"}`}>
                            Без роли
                          </Listbox.Option>

                          {/* 2. Блоки по командам */}
                          {groupedRoles.map((group: any) => (
                            <div key={group.id}>
                              {/* Заголовок отдела (прилипает при скролле) */}
                              <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white/40 bg-white/5 border-y border-white/10 flex items-center gap-2 sticky top-0 backdrop-blur-sm">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: group.color }}></span>
                                {group.name}
                              </div>

                              {/* Роли внутри отдела */}
{group.roles.map((r: any) => (
                                  <Listbox.Option
                                    key={r.id}
                                    value={r.id}
                                    className={({ active }) => `cursor-pointer px-3 py-2 text-xs text-white flex items-center justify-between ${active ? "bg-[#8b5cf6]" : "hover:bg-white/10"}`}
                                  >
                                    <span className="truncate">{r.name}</span>
                                    <span className="text-[10px] text-white/40 ml-2 shrink-0">Lvl {r.level ?? 1}</span>
                                  </Listbox.Option>
                                ))}
                            </div>
                          ))}
                        </Listbox.Options>
                      </Listbox>
                    </div>
                  )}

                  <Link href={`/user/${u.id}`} className="px-3 py-1.5 rounded-lg border border-white/20 text-white/60 text-xs font-bold hover:bg-white/10">
                    <ExternalLink size={12} />
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Модалка варнов */}
      {warnTarget && (
        <>
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200]" onClick={() => setWarnTarget(null)} />
          <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
            <div className="w-full max-w-md bg-[#1f1f23] border border-white/15 rounded-2xl shadow-2xl p-5 pointer-events-auto max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  <AlertTriangle className="text-yellow-400" size={18} /> Варны: {warnTarget.display_name}
                </h2>
                <button onClick={() => setWarnTarget(null)} className="text-white/60 hover:text-white p-1"><X size={18} /></button>
              </div>
              <div className="mb-4 p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
                <textarea value={warnReason} onChange={(e) => setWarnReason(e.target.value)} placeholder="Причина..." rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-white/15 bg-white/5 text-white text-sm placeholder-white/40 focus:outline-none focus:border-yellow-400 resize-none" />
                <button onClick={issueWarn} className="mt-2 w-full py-2 rounded-lg bg-yellow-500 text-black text-sm font-bold hover:bg-yellow-400">
                  Выдать варн
                </button>
              </div>
              <div className="space-y-2">
                {warnLoading && <p className="text-sm text-white/40 text-center py-3">Загрузка...</p>}
                {!warnLoading && warnList.length === 0 && <p className="text-sm text-white/40 text-center py-3">Варнов нет</p>}
                {warnList.map((w: any) => (
                  <div key={w.id} className={`p-3 rounded-xl border ${w.active ? "border-yellow-500/30 bg-yellow-500/5" : "border-white/10 bg-white/5 opacity-60"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-white/90 flex-1">{w.reason}</p>
                      {w.active && (
                        <button onClick={() => revokeWarn(w.id)} className="shrink-0 px-2 py-1 rounded-lg border border-green-400/30 text-green-400 text-[10px] font-bold hover:bg-green-500/10">
                          Снять
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-white/40 mt-1.5">
                      {w.issuer ? `Выдал: ${w.issuer.display_name}` : "Система"} • {new Date(w.created_at).toLocaleDateString("ru-RU")}
                      {!w.active && " • снят"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}