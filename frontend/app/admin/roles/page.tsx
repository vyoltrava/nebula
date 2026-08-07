"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { getToken } from "@/lib/auth";
import { Palette, Plus, Trash2, Edit2, X, ShieldCheck, AlertTriangle, Info, ChevronUp } from "lucide-react";

const AVAILABLE_PERMISSIONS = [
  { id: "delete_posts", label: "Удалять посты", icon: "🗑️" },
  { id: "ban_users", label: "Банить пользователей", icon: "🚫" },
  { id: "remove_avatars", label: "Удалять аватарки", icon: "🖼️" },
  { id: "assign_moderator", label: "Назначать модераторов", icon: "👮" },
  { id: "manage_roles", label: "Управлять ролями", icon: "🎭" },
  { id: "manage_users", label: "Доступ к панели управления", icon: "⚙️" },
  { id: "manage_reports", label: "Просматривать жалобы", icon: "🚩" },
  { id: "tech_access", label: "Техническая панель", icon: "🔧" },
  { id: "delete_users", label: "Удалять аккаунты", icon: "☠️" },
];

// Описание уровней для подсказок
const LEVEL_DESCRIPTIONS: Record<number, string> = {
  1: "Базовый уровень (обычные пользователи)",
  2: "Помощник / Стажер",
  3: "Младший модератор",
  4: "Модератор",
  5: "Старший модератор",
  6: "Куратор раздела",
  7: "Главный куратор",
  8: "Заместитель администратора",
  9: "Модератор (системный)",
  10: "Администратор (полный доступ)",
};

export default function RolesPage() {
  const [roles, setRoles] = useState<any[]>([]);
  const [me, setMe] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingRole, setEditingRole] = useState<any>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#8b5cf6");
  const [level, setLevel] = useState(1); // НОВОЕ: уровень роли
  const [permissions, setPermissions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  // Определяем максимальный уровень, который может назначить текущий пользователь
  const myLevel = me?.is_admin ? 10 : me?.is_moderator ? 9 : me?.role?.level || 1;
  const maxAssignableLevel = me?.is_admin ? 8 : Math.max(1, myLevel - 1); // Админ может до 8, остальные на 1 меньше своего

  async function load() {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    try {
      const meRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!meRes.ok) throw new Error("Auth failed");
      
      const meData = await meRes.json();
      setMe(meData);

      if (!meData.is_admin && !meData.permissions?.includes("manage_roles")) {
        router.push("/");
        return;
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/roles`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setRoles(await res.json());
    } catch (err) {
      console.error("Load failed:", err);
      router.push("/");
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openForm(role?: any) {
    if (role) {
      setEditingRole(role);
      setName(role.name);
      setColor(role.color);
      setLevel(role.level || 1);
      setPermissions(role.permissions || []);
    } else {
      setEditingRole(null);
      setName("");
      setColor("#8b5cf6");
      setLevel(1);
      setPermissions([]);
    }
    setShowForm(true);
  }

  function togglePermission(permId: string) {
    setPermissions((prev) =>
      prev.includes(permId)
        ? prev.filter((p) => p !== permId)
        : [...prev, permId]
    );
  }

  async function saveRole(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;

    // Защита: уровень не должен превышать максимально доступный
    if (level > maxAssignableLevel && !me?.is_admin) {
      alert(`Вы не можете назначить уровень выше ${maxAssignableLevel} (ваш уровень: ${myLevel}).`);
      return;
    }

    setSaving(true);
    const form = new FormData();
    form.append("name", name);
    form.append("color", color);
    form.append("level", String(level)); // НОВОЕ: отправляем уровень
    form.append("permissions", JSON.stringify(permissions));

    const url = editingRole
      ? `${process.env.NEXT_PUBLIC_API_URL}/api/roles/${editingRole.id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/api/roles`;
    const method = editingRole ? "PATCH" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.detail || "Ошибка сохранения");
        return;
      }

      setShowForm(false);
      load();
    } catch (err) {
      alert("Ошибка сети");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRole(roleId: number) {
    if (!confirm("Удалить роль? Она исчезнет у всех пользователей.")) return;
    const token = getToken();
    if (!token) return;
    
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/roles/${roleId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      load();
    } catch (err) {
      alert("Ошибка удаления");
    }
  }

  if (!me) return (
    <div className="h-screen flex items-center justify-center bg-[#18181b]">
      <p className="text-white/60 animate-pulse">Загрузка...</p>
    </div>
  );

  // Цвет индикатора уровня
  function getLevelColor(lvl: number): string {
    if (lvl >= 8) return "#ef4444"; // Красный (опасный)
    if (lvl >= 6) return "#f59e0b"; // Оранжевый (высокий)
    if (lvl >= 4) return "#eab308"; // Желтый (средний)
    if (lvl >= 2) return "#22c55e"; // Зеленый (низкий)
    return "#94a3b8"; // Серый (базовый)
  }

  return (
    <div className="h-screen flex overflow-hidden bg-[#18181b]">
      <Sidebar />
      <div className="w-px shrink-0 bg-white/10 my-3" />
      <main className="flex-1 overflow-y-auto border-x border-white/10">
        {/* Шапка */}
        <div className="p-6 border-b border-white/10 sticky top-0 bg-[#171717]/80 backdrop-blur-md z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Palette size={24} className="text-[#8b5cf6]" />
              <div>
                <h1 className="text-2xl font-black text-white">Управление ролями</h1>
                <p className="text-xs text-white/50 mt-0.5">
                  Ваш уровень: <span className="font-bold" style={{ color: getLevelColor(myLevel) }}>{myLevel}</span> 
                  {!me?.is_admin && (
                    <> • Макс. доступный: <span className="font-bold" style={{ color: getLevelColor(maxAssignableLevel) }}>{maxAssignableLevel}</span></>
                  )}
                </p>
              </div>
            </div>
            <button
              onClick={() => openForm()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#8b5cf6] text-white font-bold hover:bg-[#7c3aed] transition-all active:scale-95"
            >
              <Plus size={16} />
              Создать роль
            </button>
          </div>
        </div>

        {/* Информационный блок об иерархии */}
        <div className="p-4 border-b border-white/5">
          <div className="bg-[#8b5cf6]/10 border border-[#8b5cf6]/30 rounded-xl p-4 flex gap-3">
            <Info size={20} className="text-[#8b5cf6] shrink-0 mt-0.5" />
            <div className="text-sm text-white/80">
              <p className="font-bold text-white mb-1">Система иерархии</p>
              <p>Уровни определяют, кто может применять санкции к другим. Пользователь <strong>не может</strong> забанить того, чей уровень <strong>равен или выше</strong> его собственного.</p>
              <div className="flex flex-wrap gap-2 mt-2 text-xs">
                <span className="px-2 py-0.5 rounded bg-[#8b5cf6]/30 text-[#8b5cf6]">Admin: 10</span>
                <span className="px-2 py-0.5 rounded bg-[#3b82f6]/30 text-[#3b82f6]">Mod: 9</span>
                <span className="px-2 py-0.5 rounded bg-white/10 text-white/70">Кастомные: 1-8</span>
              </div>
            </div>
          </div>
        </div>

        {/* Список ролей */}
        <div className="p-4 space-y-3">
          {roles.length === 0 && (
            <div className="text-center py-12">
              <Palette size={48} className="mx-auto text-white/20 mb-4" />
              <p className="text-white/50">Пока нет кастомных ролей. Создайте первую!</p>
            </div>
          )}
          {roles.map((role) => (
            <div
              key={role.id}
              className="border border-white/15 rounded-xl p-4 bg-white/5 hover:bg-white/[0.07] transition-all"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Плашка роли */}
                  <span
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-white text-sm font-black uppercase tracking-widest shadow-lg border"
                    style={{
                      backgroundColor: role.color,
                      borderColor: `${role.color}80`,
                      boxShadow: `0 4px 14px 0 ${role.color}40`,
                    }}
                  >
                    {role.name}
                    {/* Индикатор уровня внутри плашки */}
                    <span className="border-l border-white/30 pl-2 text-[10px] font-mono opacity-90">
                      Lvl {role.level || 1}
                    </span>
                  </span>
                  
                  {/* Отдельный визуальный индикатор уровня */}
                  <div 
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-bold border"
                    style={{
                      color: getLevelColor(role.level || 1),
                      borderColor: `${getLevelColor(role.level || 1)}40`,
                      backgroundColor: `${getLevelColor(role.level || 1)}10`,
                    }}
                    title={LEVEL_DESCRIPTIONS[role.level || 1] || ""}
                  >
                    <ChevronUp size={12} />
                    {role.level || 1}
                  </div>

                  <span className="text-sm text-white/40 font-mono hidden sm:block">{role.color}</span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => openForm(role)}
                    className="p-2 rounded-lg border border-white/20 text-white/70 hover:bg-white/10 hover:text-white transition-all"
                    title="Редактировать"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => deleteRole(role.id)}
                    className="p-2 rounded-lg border border-red-400/30 text-red-400 hover:bg-red-500/10 transition-all"
                    title="Удалить"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Права роли */}
              {role.permissions && role.permissions.length > 0 && (
                <div className="mt-3 flex gap-2 flex-wrap">
                  {role.permissions.map((perm: string) => {
                    const permInfo = AVAILABLE_PERMISSIONS.find((p) => p.id === perm);
                    return (
                      <span
                        key={perm}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-white/70"
                      >
                        <ShieldCheck size={10} className="text-green-400" />
                        {permInfo?.label || perm}
                      </span>
                    );
                  })}
                </div>
              )}
              {(!role.permissions || role.permissions.length === 0) && (
                <p className="mt-2 text-xs text-white/40">Без специальных прав (только плашка)</p>
              )}
            </div>
          ))}
        </div>

        {/* Модальное окно формы */}
        {showForm && (
          <>
            <div
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] animate-in fade-in duration-200"
              onClick={() => !saving && setShowForm(false)}
            />
            <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
              <div className="w-full max-w-lg border border-white/20 rounded-2xl bg-[#1f1f23]/95 backdrop-blur-md shadow-2xl p-6 pointer-events-auto max-h-[85vh] overflow-y-auto animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-black text-white">
                    {editingRole ? "Редактировать роль" : "Создать роль"}
                  </h2>
                  <button
                    onClick={() => !saving && setShowForm(false)}
                    className="text-white/60 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>
                <form onSubmit={saveRole} className="space-y-5">
                  {/* Название */}
                  <div>
                    <label className="block text-sm font-bold text-white/80 mb-2">
                      Название роли
                    </label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Например: VIP, Куратор, Спонсор"
                      required
                      className="w-full border border-white/15 rounded-lg px-3 py-2 bg-white/5 text-white placeholder-white/40 focus:outline-none focus:border-[#8b5cf6] transition-colors"
                    />
                  </div>

                  {/* Цвет */}
                  <div>
                    <label className="block text-sm font-bold text-white/80 mb-2">
                      Цвет плашки
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="w-16 h-10 rounded-lg border border-white/20 cursor-pointer bg-transparent"
                      />
                      <input
                        type="text"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="flex-1 border border-white/15 rounded-lg px-3 py-2 bg-white/5 text-white font-mono text-sm focus:outline-none focus:border-[#8b5cf6]"
                      />
                    </div>
                  </div>

                  {/* НОВОЕ: Уровень иерархии */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-bold text-white/80">
                        Уровень иерархии
                      </label>
                      <span 
                        className="text-xs font-mono px-2 py-0.5 rounded border"
                        style={{
                          color: getLevelColor(level),
                          borderColor: `${getLevelColor(level)}40`,
                          backgroundColor: `${getLevelColor(level)}10`,
                        }}
                      >
                        {level} / {maxAssignableLevel}
                      </span>
                    </div>
                    
                    <input
                      type="range"
                      min={1}
                      max={maxAssignableLevel}
                      value={level}
                      onChange={(e) => setLevel(Number(e.target.value))}
                      className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-[#8b5cf6] bg-white/10"
                    />
                    
                    <div className="flex justify-between text-[10px] text-white/40 mt-1 font-mono">
                      <span>1</span>
                      <span>{Math.ceil(maxAssignableLevel / 2)}</span>
                      <span>{maxAssignableLevel}</span>
                    </div>

                    {/* Описание выбранного уровня */}
                    <div className="mt-3 p-3 rounded-lg bg-white/5 border border-white/10">
                      <p className="text-xs text-white/60 mb-1">Описание уровня:</p>
                      <p className="text-sm font-bold" style={{ color: getLevelColor(level) }}>
                        {LEVEL_DESCRIPTIONS[level] || "Пользовательский уровень"}
                      </p>
                      <p className="text-xs text-white/50 mt-1">
                        ⚡ Может банить пользователей с уровнем <strong>ниже {level}</strong>
                      </p>
                    </div>

                    {/* Предупреждение, если уровень близок к максимуму */}
                    {level >= maxAssignableLevel - 1 && !me?.is_admin && (
                      <div className="mt-3 flex gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                        <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-200/90">
                          Высокий уровень! Этот пользователь сможет применять санкции почти ко всем остальным ролям.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Превью */}
                  <div>
                    <p className="text-xs text-white/50 mb-2">Превью:</p>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
                      <span
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-white text-sm font-black uppercase tracking-widest shadow-lg border"
                        style={{
                          backgroundColor: color,
                          borderColor: `${color}80`,
                          boxShadow: `0 4px 14px 0 ${color}40`,
                        }}
                      >
                        {name || "Название"}
                        <span className="border-l border-white/30 pl-2 text-[10px] font-mono opacity-90">
                          Lvl {level}
                        </span>
                      </span>
                      <div 
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold border"
                        style={{
                          color: getLevelColor(level),
                          borderColor: `${getLevelColor(level)}40`,
                          backgroundColor: `${getLevelColor(level)}10`,
                        }}
                      >
                        <ChevronUp size={12} />
                        {level}
                      </div>
                    </div>
                  </div>

                  {/* Полномочия */}
                  <div>
                    <label className="block text-sm font-bold text-white/80 mb-3">
                      Полномочия
                    </label>
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {AVAILABLE_PERMISSIONS.map((perm) => (
                        <label
                          key={perm.id}
                          className={`flex items-center gap-3 cursor-pointer p-3 rounded-lg border transition-all ${
                            permissions.includes(perm.id)
                              ? "border-[#8b5cf6] bg-purple-500/10"
                              : "border-white/10 bg-white/5 hover:bg-white/10"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={permissions.includes(perm.id)}
                            onChange={() => togglePermission(perm.id)}
                            className="w-4 h-4 rounded border-white/30 bg-white/5 text-purple-500 focus:ring-purple-500"
                          />
                          <span className="text-lg">{perm.icon}</span>
                          <span className="text-sm text-white/90 font-semibold">{perm.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Кнопки */}
                  <div className="flex gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex-1 border border-[#8b5cf6] bg-[#8b5cf6] text-white font-bold rounded-lg py-2.5 hover:bg-[#7c3aed] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving ? "Сохранение..." : editingRole ? "Сохранить" : "Создать"}
                    </button>
                    <button
                      type="button"
                      onClick={() => !saving && setShowForm(false)}
                      disabled={saving}
                      className="flex-1 border border-white/20 rounded-lg py-2.5 font-bold text-white/80 hover:bg-white/10 transition-all disabled:opacity-50"
                    >
                      Отмена
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}