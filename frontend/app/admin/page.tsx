"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Avatar } from "@/components/Avatar";
import { getToken } from "@/lib/auth";
import { Listbox } from '@headlessui/react'
import { Shield, ShieldCheck, Ban, UserCheck, ImageOff, Crown, Palette, ExternalLink, Trash2, Flag, Search, Filter, Users, X, SmilePlus, } from "lucide-react";

export default function AdminPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [me, setMe] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "team" | "users">("all");
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const router = useRouter();

  function can(permission: string): boolean {
    if (!me) return false;
    if (me.is_admin) return true;
    return me.permissions?.includes(permission) ?? false;
  }

  async function load() {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }

    const meRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!meRes.ok) {
      router.push("/login");
      return;
    }
    const meData = await meRes.json();
    setMe(meData);

    if (!meData.is_admin && !meData.is_moderator && (!meData.permissions || meData.permissions.length === 0)) {
      router.push("/");
      return;
    }

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setUsers(await res.json());

    const rolesRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/roles`);
    if (rolesRes.ok) setRoles(await rolesRes.json());
  }

  useEffect(() => {
    load();
  }, []);

  // ✅ Фильтрация пользователей
  const filteredUsers = users.filter((u) => {
    // Поиск по нику или display_name
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = 
        u.username.toLowerCase().includes(query) ||
        u.display_name.toLowerCase().includes(query);
      if (!matchesSearch) return false;
    }

    // Фильтр по типу
    if (filterType === "team") {
      // Команда: админы, модераторы, или уровень >= 3
      const isTeam = u.is_admin || u.is_moderator || (u.level ?? 1) >= 3;
      if (!isTeam) return false;
    } else if (filterType === "users") {
      // Обычные пользователи: не админ, не модератор, уровень < 3
      const isRegularUser = !u.is_admin && !u.is_moderator && (u.level ?? 1) < 3;
      if (!isRegularUser) return false;
    }

    // Фильтр по роли
    if (selectedRoleId !== null) {
      if (!u.role || u.role.id !== selectedRoleId) return false;
    }

    return true;
  });

  // ✅ ИСПРАВЛЕНО: используем userId (числовой ID)
  async function deleteAllPosts(userId: number) {
    if (!confirm("Удалить ВСЕ посты этого пользователя? Это действие нельзя отменить!")) return;
    const token = getToken();
    if (!token) return;
    
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users/${userId}/posts`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.detail || "Нет прав");
      return;
    }
    const data = await res.json();
    alert(`Удалено постов: ${data.deleted_count}`);
    load();
  }

  // ✅ ИСПРАВЛЕНО + проверка иерархии
  async function toggleBan(userId: number, target: any) {
    const token = getToken();
    if (!token) return;

    // 🛡️ Клиентская проверка иерархии
    const myLevel = me?.level ?? 1;
    const targetLevel = target?.level ?? 1;
    
    if (targetLevel >= myLevel && !me?.is_admin) {
      alert(`🛡️ Иммунитет: уровень цели (${targetLevel}) ≥ вашего (${myLevel}). Вы не можете забанить этого пользователя.`);
      return;
    }

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users/${userId}/ban`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.detail || "Нет прав");
      return;
    }
    load();
  }

  // ✅ ИСПРАВЛЕНО
  async function removeAvatar(userId: number) {
    const token = getToken();
    if (!token) return;
    
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users/${userId}/avatar`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.detail || "Нет прав");
      return;
    }
    load();
  }

  // ✅ ИСПРАВЛЕНО
  async function toggleModerator(userId: number) {
    const token = getToken();
    if (!token) return;
    
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users/${userId}/moderator`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.detail || "Нет прав");
      return;
    }
    load();
  }

  // ✅ ИСПРАВЛЕНО
  async function assignRole(userId: number, roleId: number | null) {
    const token = getToken();
    if (!token) return;
    
    const form = new FormData();
    if (roleId) form.append("role_id", String(roleId));
    
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/${userId}/role`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.detail || "Нет прав");
      return;
    }
    load();
  }

  if (!me) return <div className="p-8 text-white/60">Загрузка...</div>;

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />
      <div className="w-px shrink-0 bg-white/10 my-3" />
      <main className="flex-1 overflow-y-auto border-x border-white/10">
        {/* Шапка */}
        <div className="p-6 border-b border-white/10 sticky top-0 bg-[#171717]/80 backdrop-blur-md z-10">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <Shield size={24} className="text-[#8b5cf6]" />
              <h1 className="text-2xl font-black text-white">Панель управления</h1>

              {!me.is_admin && me.is_moderator && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#3b82f6] text-white text-xs font-black uppercase">
                  <ShieldCheck size={10} /> Moderator
                </span>
              )}
              
              {/* 🆕 Ваш уровень */}
              <span className="px-2 py-0.5 rounded bg-white/10 text-white/60 text-xs font-mono">
                Уровень: {me.level ?? 1}
              </span>
            </div>


            
            <div className="flex gap-2 flex-wrap">

              {(me.is_admin || me.permissions?.includes("manage_stickers")) && (
                <Link
                  href="/admin/stickers"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-yellow-400/50 bg-yellow-500/20 text-yellow-400 text-sm font-bold hover:bg-yellow-500/30 transition-all"
                >
                  <SmilePlus size={16} />
                  Стикеры
                </Link>
              )}

              {/* 🆕 КОНСТРУКТОР ТЕМ */}
              {me.is_admin && (
                <Link
                  href="/admin/themes"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-400/50 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-bold hover:shadow-lg hover:shadow-purple-500/30 transition-all"
                >
                  <Palette size={16} />
                  Темы
                </Link>
              )}

              {can("manage_roles") && (
                <Link
                  href="/admin/roles"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#8b5cf6] bg-[#8b5cf6] text-white text-sm font-bold transition-all"
                >
                  <Palette size={16} />
                  Роли
                </Link>
              )}

              {can("manage_reports") && (
                <Link
                  href="/admin/reports"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-400/50 bg-[#ef4444] text-white text-sm font-bold hover:shadow-lg hover:shadow-red-500/30 transition-all"
                >
                  <Flag size={16} />
                  Жалобы
                </Link>
              )}
            </div>
          </div>
          <p className="text-white/50 text-sm mt-2">
            {me.is_admin
              ? "Полный доступ: все права"
              : `Права: ${me.permissions?.map((p: string) => p).join(", ") || "нет"}`}
          </p>
          <p className="text-white/40 text-xs mt-1">
            Всего пользователей: {users.length} • Ролей: {roles.length}
          </p>
        </div>

        {/* 🆕 Фильтры и поиск */}
        <div className="p-4 border-b border-white/10 bg-[#1a1a1a]/50">
          <div className="flex flex-col gap-3">
            {/* Поиск */}
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по нику или имени..."
                className="w-full pl-10 pr-10 py-2.5 border border-white/15 rounded-lg bg-white/5 text-white placeholder-white/40 focus:outline-none focus:border-[#8b5cf6] transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Кнопки фильтров */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => {
                  setFilterType("all");
                  setSelectedRoleId(null);
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-bold transition-all ${
                  filterType === "all" && !selectedRoleId
                    ? "border-[#8b5cf6] bg-[#8b5cf6]/20 text-[#8b5cf6]"
                    : "border-white/15 text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Users size={16} />
                Все ({users.length})
              </button>

              <button
                onClick={() => {
                  setFilterType("team");
                  setSelectedRoleId(null);
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-bold transition-all ${
                  filterType === "team"
                    ? "border-[#3b82f6] bg-[#3b82f6]/20 text-[#3b82f6]"
                    : "border-white/15 text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                <ShieldCheck size={16} />
                Команда
              </button>

              <button
                onClick={() => {
                  setFilterType("users");
                  setSelectedRoleId(null);
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-bold transition-all ${
                  filterType === "users"
                    ? "border-green-400 bg-green-400/20 text-green-400"
                    : "border-white/15 text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Filter size={16} />
                Обычные
              </button>

              {/* Фильтр по ролям */}
              <select
                value={selectedRoleId ?? ""}
                onChange={(e) => {
                  setSelectedRoleId(e.target.value ? Number(e.target.value) : null);
                  setFilterType("all");
                }}
                className="px-4 py-2 rounded-lg border border-white/15 bg-white/5 text-white text-sm font-bold focus:outline-none focus:border-[#8b5cf6] transition-all cursor-pointer"
              >
                <option value="" className="bg-gray-900">Все роли</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id} className="bg-gray-900">
                    {r.name} (Lvl {r.level ?? 1})
                  </option>
                ))}
              </select>
            </div>

            {/* Индикатор активных фильтров */}
            {(searchQuery || filterType !== "all" || selectedRoleId) && (
              <div className="flex items-center gap-2 text-sm text-white/60">
                <span>Найдено: <span className="font-bold text-white">{filteredUsers.length}</span></span>
                {(searchQuery || filterType !== "all" || selectedRoleId) && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setFilterType("all");
                      setSelectedRoleId(null);
                    }}
                    className="text-[#8b5cf6] hover:text-[#7c3aed] font-bold transition-colors"
                  >
                    Сбросить фильтры
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Список пользователей */}
        <div className="p-4 space-y-3">
          {filteredUsers.length === 0 && (
            <p className="p-8 text-center text-white/50">
              {users.length === 0 ? "Пользователи не найдены" : "Нет пользователей по заданным фильтрам"}
            </p>
          )}
          {filteredUsers.map((u) => {
            const myLevel = me?.level ?? 1;
            const targetLevel = u.level ?? 1;
            // 🛡️ Можно ли применять санкции (уровень цели строго ниже)
            const canSanction = myLevel > targetLevel || me?.is_admin;
            
            return (
              <div
                key={u.id}
                className={`border rounded-xl p-4 transition-all ${
                  u.is_banned
                    ? "border-red-500/30 bg-red-500/5"
                    : "border-white/15 bg-white/5"
                }`}
              >
                <div className="flex items-start gap-4">
                  <Link href={`/user/${u.id}`} className="shrink-0">
                    <Avatar src={u.avatar_url} name={u.display_name} id={u.id} size={48} />
                  </Link>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/user/${u.id}`}
                        className="font-bold text-white hover:text-[#8b5cf6] transition-colors"
                      >
                        {u.display_name}
                      </Link>
                      {u.is_admin && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white text-black text-[8px] font-black uppercase tracking-widest shrink-0 border border-white shadow-[0_0_8px_rgba(255,255,255,0.6)]">
                      <Crown size={8} />
                          Founder (10)
                        </span>
                      )}
                      {u.is_moderator && !u.is_admin && (
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-[#3b82f6] text-white text-[10px] font-black uppercase tracking-widest">
                          <ShieldCheck size={8} />
                          Developer (9)
                        </span>
                      )}
                      {u.role && !u.is_admin && !u.is_moderator && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-white text-[10px] font-black uppercase tracking-widest border shadow-sm"
                          style={{
                            backgroundColor: u.role.color,
                            borderColor: `${u.role.color}80`,
                            boxShadow: `0 2px 8px 0 ${u.role.color}40`,
                          }}
                        >
                          {u.role.name}
                          <span className="opacity-70 border-l border-white/30 pl-1 text-[9px]">
                            Lvl {u.role.level ?? 1}
                          </span>
                        </span>
                      )}
                      {u.is_banned && (
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] font-black uppercase border border-red-500/30">
                          <Ban size={8} />
                          Banned
                        </span>
                      )}
                      <span className="text-white/40 text-sm">@{u.username}</span>
                    </div>
                    <p className="text-white/40 text-xs mt-1">
                      ID: {u.id} • Уровень: <span className="text-white/60 font-mono">{targetLevel}</span> • Регистрация: {new Date(u.created_at).toLocaleDateString("ru-RU")}
                    </p>
                  </div>

                  <div className="flex gap-2 flex-wrap items-center">
                    {/* 🛡️ Кнопка бана с защитой иерархии */}
                    {can("ban_users") && !u.is_admin && u.id !== me.id && (
                      canSanction ? (
                        <button
                          onClick={() => toggleBan(u.id, u)}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                            u.is_banned
                              ? "border-green-400/30 text-green-400 hover:bg-green-500/10"
                              : "border-red-400/30 text-red-400 hover:bg-red-500/10"
                          }`}
                          title={u.is_banned ? "Разбанить" : `Забанить (ваш ${myLevel} > цель ${targetLevel})`}
                        >
                          <Ban size={12} />
                          {u.is_banned ? "Разбанить" : "Забанить"}
                        </button>
                      ) : (
                        <div
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/10 text-white/30 text-xs font-bold cursor-not-allowed"
                          title={`Иммунитет: уровень цели (${targetLevel}) ≥ вашего (${myLevel})`}
                        >
                          <Shield size={12} />
                          Иммунитет
                        </div>
                      )
                    )}

                    {can("remove_avatars") && u.avatar_url && !u.is_admin && canSanction && (
                      <button
                        onClick={() => removeAvatar(u.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-orange-400/30 text-orange-400 text-xs font-bold hover:bg-orange-500/10 transition-all"
                        title="Удалить аватарку"
                      >
                        <ImageOff size={12} />
                        Аватар
                      </button>
                    )}

                    {can("delete_posts") && !u.is_admin && canSanction && (
                      <button
                        onClick={() => deleteAllPosts(u.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-400/30 text-red-400 text-xs font-bold hover:bg-red-500/10 transition-all"
                        title="Удалить все посты пользователя"
                      >
                        <Trash2 size={12} />
                        Удалить посты
                      </button>
                    )}

                    {can("assign_moderator") && !u.is_admin && (me?.is_admin || canSanction) && (
                      <button
                        onClick={() => toggleModerator(u.id)}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                          u.is_moderator
                            ? "border-yellow-400/30 text-yellow-400 hover:bg-yellow-500/10"
                            : "border-cyan-400/30 text-cyan-400 hover:bg-cyan-500/10"
                        }`}
                      >
                        <UserCheck size={12} />
                        {u.is_moderator ? "Снять разработчика" : "В разработчика"}
                      </button>
                    )}

{can("manage_roles") && !u.is_admin && canSanction && (
  <div className="relative">
    <Listbox
      value={u.role?.id ?? null}
      onChange={(roleId: number | null) => assignRole(u.id, roleId)}
    >
      <Listbox.Button className="px-3 py-1.5 rounded-lg border border-white/20 bg-white/5 text-blue-400 text-xs font-bold focus:outline-none focus:border-[#8b5cf6] cursor-pointer max-w-[120px] truncate whitespace-nowrap">
        {u.role?.name || "Без роли"}
      </Listbox.Button>

      <Listbox.Options className="absolute right-0 z-50 mt-1 w-48 overflow-auto rounded-lg bg-gray-900 border border-white/10 shadow-xl focus:outline-none">
        {/* Опция "Без роли" */}
        <Listbox.Option
          value={null}
          className={({ active }) =>
            `cursor-pointer select-none px-3 py-2 text-xs text-white ${
              active ? "bg-[#8b5cf6]" : "hover:bg-white/10"
            }`
          }
        >
          Без роли
        </Listbox.Option>

        {/* Доступные роли */}
        {roles
          .filter((r) => (r.level ?? 1) < myLevel || me?.is_admin)
          .map((r) => (
            <Listbox.Option
              key={r.id}
              value={r.id}
              className={({ active }) =>
                `cursor-pointer select-none px-3 py-2 text-xs text-white ${
                  active ? "bg-[#8b5cf6]" : "hover:bg-white/10"
                }`
              }
            >
              {r.name} (Lvl {r.level ?? 1})
            </Listbox.Option>
          ))}
      </Listbox.Options>
    </Listbox>
  </div>
)}
                    <Link
                      href={`/user/${u.id}`}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/20 text-white/60 text-xs font-bold hover:bg-white/10 hover:text-white transition-all"
                      title="Открыть профиль"
                    >
                      <ExternalLink size={12} />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}