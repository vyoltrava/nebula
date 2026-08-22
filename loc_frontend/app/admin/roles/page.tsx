"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { getToken } from "@/lib/auth";
import { Palette, Plus, Trash2, Edit2, X, ShieldCheck, AlertTriangle, Info, ChevronUp, Crown, Sparkles, User, FolderOpen, Settings } from "lucide-react";

// Категории прав с иконками и fallback
const PERMISSION_META: Record<string, { icon: string; category: "content" | "users" | "chats" | "system" }> = {
  // Контент
  delete_posts:         { icon: "🗑️", category: "content" },
  edit_posts:           { icon: "✏️", category: "content" },
  remove_avatars:       { icon: "🖼️", category: "content" },
  manage_stickers:      { icon: "🎨", category: "content" },
  manage_announcements: { icon: "📢", category: "content" },
  
  // Пользователи
  ban_users:            { icon: "🚫", category: "users" },
  warn_users:           { icon: "⚠️", category: "users" },
  delete_users:         { icon: "☠️", category: "users" },
  assign_moderator:     { icon: "👮", category: "users" },
  
  // Чаты
  pin_messages:         { icon: "📌", category: "chats" },
  manage_groups:        { icon: "👥", category: "chats" },
  
  // Система
  manage_roles:         { icon: "🎭", category: "system" },
  manage_users:         { icon: "⚙️", category: "system" },
  manage_reports:       { icon: "🚩", category: "system" },
  tech_access:          { icon: "🔧", category: "system" },
  support_access:       { icon: "🎧", category: "chats" }, // 🆕 Право на чат поддержки
  assign_roles:         { icon: "🎭", category: "users" },
};

const CATEGORY_LABELS: Record<string, string> = {
  content: "📝 Контент",
  users: "👥 Пользователи",
  chats: "💬 Чаты и группы",
  system: "⚙️ Система",
};

// 🆕 Умная система описания уровней
const LEVEL_DESCRIPTIONS: Record<number, { title: string; desc: string; bestFor: string }> = {
  1: { 
    title: "Базовый / Почетный", 
    desc: "Обычный пользователь или визуальная роль для бывших членов команды. Без админских прав.", 
    bestFor: "Пользователь, Легенда, Ветеран" 
  },
  2: { 
    title: "Визуальный / Премиум", 
    desc: "Чисто косметическая роль для выделения активных или поддерживающих проект пользователей.", 
    bestFor: "Premium, Donator, Актив" 
  },
  3: { 
    title: "Стажёр", 
    desc: "Начинающий сотрудник команды. Только наблюдение и обучение под присмотром старших.", 
    bestFor: "Trainee" 
  },
  4: { 
    title: "Младший специалист", 
    desc: "Начинающий модератор или помощник с базовыми, ограниченными правами.", 
    bestFor: "Junior Mod, Helper" 
  },
  5: { 
    title: "Специалист", 
    desc: "Основной рабочий состав. Самостоятельно решает типовые задачи и жалобы.", 
    bestFor: "Moderator, Tech Support" 
  },
  6: { 
    title: "Старший специалист", 
    desc: "Опытный сотрудник. Решает сложные конфликты и контролирует работу младших.", 
    bestFor: "Senior Mod, Tech Admin" 
  },
  7: { 
    title: "Куратор направления", 
    desc: "Координирует работу целого отдела или раздела. Отчитывается непосредственно перед Лидером.", 
    bestFor: "Supervisor, Curator" 
  },
  8: { 
    title: "Лидер направления", 
    desc: "Высший кастомный уровень. Полная автономия и власть в своей зоне ответственности.", 
    bestFor: "Manager, Chief Tech" 
  },
  9: { 
    title: "Developer (Системный)", 
    desc: "Ядро разработки. Управляет техническим отделом и инфраструктурой проекта.", 
    bestFor: "Developer" 
  },
  10: { 
    title: "Founder (Системный)", 
    desc: "Создатель проекта. Абсолютный контроль над всеми системами.", 
    bestFor: "Founder, Admin" 
  },
};

export default function RolesPage() {
  const [roles, setRoles] = useState<any[]>([]);
  const [me, setMe] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [availablePermissions, setAvailablePermissions] = useState<any[]>([]);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [editingRole, setEditingRole] = useState<any>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#8b5cf6");
  const [level, setLevel] = useState(1);
  const [description, setDescription] = useState("");
  const [isStaff, setIsStaff] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<number | "all">("all");
  const [showCatManager, setShowCatManager] = useState(false);
  const [editingCat, setEditingCat] = useState<any>(null);
  const [catName, setCatName] = useState("");
  const [catColor, setCatColor] = useState("#8b5cf6");
  const [catDesc, setCatDesc] = useState("");
  const [catSaving, setCatSaving] = useState(false);
  const router = useRouter();

  const myLevel = me?.is_admin ? 10 : me?.is_moderator ? 9 : me?.role?.level || 1;
  const maxAssignableLevel = me?.is_admin ? 8 : Math.max(1, myLevel - 1);

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

            // 🆕 Загружаем список прав с бэкенда
      try {
        const permsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/permissions`);
        if (permsRes.ok) {
          const permsData = await permsRes.json();
          // Обогащаем права из бэка нашими мета-данными
          const enriched = permsData.map((p: any) => ({
            ...p,
            icon: PERMISSION_META[p.id]?.icon || "🔑",
            category: PERMISSION_META[p.id]?.category || p.category || "system",
          }));
          setAvailablePermissions(enriched);
        }
      } catch {
        console.warn("Failed to load permissions, using fallback");
      }
      setPermissionsLoaded(true);
      setMe(meData);

      if (!meData.is_admin && !meData.permissions?.includes("manage_roles")) {
        router.push("/");
        return;
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/roles`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setRoles(await res.json());

      const catsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/role-categories`);
      if (catsRes.ok) setCategories(await catsRes.json());
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
      setDescription(role.description || "");
      setIsStaff(role.is_staff || false);
      setPermissions(role.permissions || []);
      setCategoryId(role.category_id ?? null);
    } else {
      setEditingRole(null);
      setName("");
      setColor("#8b5cf6");
      setLevel(1);
      setDescription("");
      setIsStaff(false);
      setPermissions([]);
      setCategoryId(null);
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

    if (level > maxAssignableLevel && !me?.is_admin) {
      alert(`Вы не можете назначить уровень выше ${maxAssignableLevel} (ваш уровень: ${myLevel}).`);
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
    if (categoryId !== null) form.append("category_id", String(categoryId));

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

  async function moveRole(roleId: number, direction: "up" | "down") {
    const token = getToken();
    if (!token) return;

    const form = new FormData();
    form.append("direction", direction);

    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/roles/${roleId}/move`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      load();
    } catch (err) {
      alert("Ошибка перемещения");
    }
  }

  if (!me) return (
    <div className="h-screen flex items-center justify-center bg-[#18181b]">
      <p className="text-white/60 animate-pulse">Загрузка...</p>
    </div>
  );


  function openCatForm(cat?: any) {
    if (cat) {
      setEditingCat(cat);
      setCatName(cat.name);
      setCatColor(cat.color);
      setCatDesc(cat.description || "");
    } else {
      setEditingCat(null);
      setCatName("");
      setCatColor("#8b5cf6");
      setCatDesc("");
    }
    setShowCatManager(true);
  }

  async function saveCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!catName.trim()) return;
    setCatSaving(true);
    const token = getToken();
    const form = new FormData();
    form.append("name", catName.trim());
    form.append("color", catColor);
    form.append("description", catDesc.trim());

    const url = editingCat
      ? `${process.env.NEXT_PUBLIC_API_URL}/api/role-categories/${editingCat.id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/api/role-categories`;
    const method = editingCat ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.ok) {
        setShowCatManager(false);
        load();
      } else {
        const data = await res.json().catch(() => null);
        alert(data?.detail || "Ошибка сохранения");
      }
    } catch {
      alert("Ошибка сети");
    } finally {
      setCatSaving(false);
    }
  }

  async function deleteCategory(catId: number) {
    if (!confirm("Удалить группу? Роли останутся без группы.")) return;
    const token = getToken();
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/role-categories/${catId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    load();
  }


  function getLevelColor(lvl: number): string {
    if (lvl === 10) return "#ffffff";
    if (lvl === 9) return "#3b82f6";
    if (lvl === 8) return "#ef4444"; // Лидер (красный/оранжевый)
    if (lvl === 7) return "#f59e0b"; // Куратор (желтый)
    if (lvl === 6) return "#22c55e"; // Старший (зеленый)
    if (lvl === 5) return "#10b981"; // Специалист (изумрудный)
    if (lvl === 4) return "#14b8a6"; // Младший (бирюзовый)
    if (lvl === 3) return "#64748b"; // Стажер (серый)
    if (lvl === 2) return "#a855f7"; // Премиум (фиолетовый)
    return "#94a3b8"; // Базовый
  }

  // Сортируем роли: сначала is_staff=true по position, потом остальные по уровню
  const filteredRoles = activeTab === "all" ? roles : roles.filter((r) => r.category_id === activeTab);
  const sortedRoles = [...filteredRoles].sort((a, b) => {
    if (a.is_staff && !b.is_staff) return -1;
    if (!a.is_staff && b.is_staff) return 1;
    if (a.is_staff && b.is_staff) return (a.position || 0) - (b.position || 0);
    return (b.level || 0) - (a.level || 0);
  });

  return (
    <div className="h-screen flex overflow-hidden bg-[#18181b]">
      <Sidebar />
      <div className="w-px shrink-0 bg-white/10 my-3" />
      <main className="flex-1 overflow-y-auto border-x border-white/10">
        <div className="p-6 border-b border-white/10 sticky top-0 bg-[#171717]/80 backdrop-blur-md z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Palette size={24} className="text-[#8b5cf6]" />
              <div>
                <h1 className="text-2xl font-black text-white">Управление ролями</h1>
                <p className="text-xs text-white/50 mt-0.5">
                  Ваш уровень: <span className="font-bold" style={{ color: getLevelColor(myLevel) }}>{myLevel}</span> 
                  {!me?.is_admin && (
                    <> • Макс. доступный для назначения: <span className="font-bold" style={{ color: getLevelColor(maxAssignableLevel) }}>{maxAssignableLevel}</span></>
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
        {/* 🗂️ ВКЛАДКИ ГРУПП */}
        <div className="px-6 pt-3 pb-0 border-b border-white/10 bg-[#171717]/40 flex items-center gap-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-4 py-2.5 text-sm font-bold whitespace-nowrap border-b-2 transition-all ${
              activeTab === "all" ? "border-[#8b5cf6] text-[#8b5cf6]" : "border-transparent text-white/50 hover:text-white"
            }`}
          >
            Все роли <span className="text-[10px] ml-1 text-white/30">({roles.length})</span>
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveTab(c.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold whitespace-nowrap border-b-2 transition-all ${
                activeTab === c.id ? "border-[#8b5cf6] text-white" : "border-transparent text-white/50 hover:text-white"
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
              {c.name}
              <span className="text-[10px] text-white/30">
                ({roles.filter((r) => r.category_id === c.id).length})
              </span>
            </button>
          ))}
          <button
            onClick={() => openCatForm()}
            className="px-3 py-2.5 text-sm text-white/40 hover:text-[#8b5cf6] whitespace-nowrap flex items-center gap-1"
            title="Управление группами"
          >
            <Settings size={14} />
          </button>
        </div>

        <div className="p-4 border-b border-white/5"></div>
        <div className="p-4 border-b border-white/5">
          <div className="bg-[#8b5cf6]/10 border border-[#8b5cf6]/30 rounded-xl p-4 flex gap-3">
            <Info size={20} className="text-[#8b5cf6] shrink-0 mt-0.5" />
            <div className="text-sm text-white/80 space-y-1">
              <p className="font-bold text-white">Система иерархии</p>
              <p>Пользователь <strong>не может</strong> применять санкции к тем, чей уровень <strong>равен или выше</strong> его собственного.</p>
              <p className="text-xs text-white/60 mt-2">
                <strong>Галочка "Показывать в правилах"</strong> — роль появится на странице /rules в секции "Команда trelod".
              </p>
              <div className="flex flex-wrap gap-2 mt-2 text-xs">
                <span className="px-2 py-0.5 rounded bg-white/10 text-white border border-white/20">Founder: 10</span>
                <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">Developer: 9</span>
                <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">Лидеры: 8</span>
                <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">Визуальные: 1-2</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {roles.length === 0 && (
            <div className="text-center py-12">
              <Palette size={48} className="mx-auto text-white/20 mb-4" />
              <p className="text-white/50">Пока нет кастомных ролей. Создайте первую!</p>
            </div>
          )}
          {sortedRoles.map((role, index) => (
            <div
              key={role.id}
              className={`border rounded-xl p-4 transition-all ${
                role.is_staff ? "border-[#8b5cf6]/40 bg-[#8b5cf6]/5" : "border-white/15 bg-white/5"
              } hover:bg-white/[0.07]`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-wrap flex-1">
                  {role.is_staff && (
                    <span className="px-2 py-0.5 rounded-full bg-[#8b5cf6]/20 text-[#8b5cf6] text-xs font-bold border border-[#8b5cf6]/40 flex items-center gap-1">
                      <Crown size={10} /> Staff
                    </span>
                  )}

                                    {role.category_id && (
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1"
                      style={{
                        color: categories.find((c) => c.id === role.category_id)?.color || "#8b5cf6",
                        borderColor: `${categories.find((c) => c.id === role.category_id)?.color || "#8b5cf6"}60`,
                        background: `${categories.find((c) => c.id === role.category_id)?.color || "#8b5cf6"}15`,
                      }}
                    >
                      <FolderOpen size={10} />
                      {categories.find((c) => c.id === role.category_id)?.name || "Группа"}
                    </span>
                  )}
                  
                  <span
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-white text-sm font-black uppercase tracking-widest shadow-lg border"
                    style={{
                      backgroundColor: role.color,
                      borderColor: `${role.color}80`,
                      boxShadow: `0 4px 14px 0 ${role.color}40`,
                    }}
                  >
                    {role.level === 8 && (
                      <img
                        src="/role-icon.svg"
                        alt=""
                        className="w-4 h-4 shrink-0"
                        style={{ filter: "drop-shadow(1px 0 0 #000) drop-shadow(-1px 0 0 #000) drop-shadow(0 1px 0 #000) drop-shadow(0 -1px 0 #000)" }}
                      />
                    )}
                    {role.name}
                    <span className="border-l border-white/30 pl-2 text-[10px] font-mono opacity-90">
                      Lvl {role.level || 1}
                    </span>
                  </span>
                  
                  <div 
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-bold border"
                    style={{
                      color: getLevelColor(role.level || 1),
                      borderColor: `${getLevelColor(role.level || 1)}40`,
                      backgroundColor: `${getLevelColor(role.level || 1)}10`,
                    }}
                  >
                    <ChevronUp size={12} />
                    {role.level || 1}
                  </div>

                  {role.description && (
                    <p className="text-xs text-white/60 italic hidden md:block">"{role.description}"</p>
                  )}
                </div>
                
                <div className="flex gap-2 shrink-0">
                  {role.is_staff && (
                    <>
                      <button
                        onClick={() => moveRole(role.id, "up")}
                        disabled={index === 0 || !sortedRoles[index - 1]?.is_staff}
                        className="p-2 rounded-lg border border-white/20 text-white/70 hover:bg-white/10 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Переместить выше"
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button
                        onClick={() => moveRole(role.id, "down")}
                        disabled={index === sortedRoles.filter(r => r.is_staff).length - 1 || !sortedRoles[index + 1]?.is_staff}
                        className="p-2 rounded-lg border border-white/20 text-white/70 hover:bg-white/10 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Переместить ниже"
                      >
                        <ChevronUp size={16} className="rotate-180" />
                      </button>
                    </>
                  )}
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

              {role.permissions && role.permissions.length > 0 && (
                <div className="mt-3 flex gap-1.5 flex-wrap">
                  {role.permissions.map((perm: string) => {
                    const permInfo = availablePermissions.find((p: any) => p.id === perm);
                    const meta = PERMISSION_META[perm];
                    const categoryColor = {
                      content: "border-orange-400/30 bg-orange-500/10 text-orange-300",
                      users: "border-red-400/30 bg-red-500/10 text-red-300",
                      chats: "border-blue-400/30 bg-blue-500/10 text-blue-300",
                      system: "border-purple-400/30 bg-purple-500/10 text-purple-300",
                    }[meta?.category || "system"];
                    
                    return (
                      <span
                        key={perm}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs ${categoryColor}`}
                      >
                        <span>{meta?.icon || "🔑"}</span>
                        <span>{permInfo?.label || perm}</span>
                      </span>
                    );
                  })}
                </div>
              )}
              {(!role.permissions || role.permissions.length === 0) && (
                <div className="mt-3 flex items-center gap-1.5 text-xs text-white/40">
                  <Sparkles size={12} />
                  <span>Визуальная роль (без специальных прав)</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {showForm && (
          <>
            <div
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] animate-in fade-in duration-200"
              onClick={() => !saving && setShowForm(false)}
            />
            <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
              <div className="w-full max-w-lg border border-white/20 rounded-2xl bg-[#1f1f23]/95 backdrop-blur-md shadow-2xl p-6 pointer-events-auto max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
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
                  <div>
                    <label className="block text-sm font-bold text-white/80 mb-2">
                      Название роли
                    </label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Например: Premium, Куратор, Chief Tech"
                      required
                      className="w-full border border-white/15 rounded-lg px-3 py-2 bg-white/5 text-white placeholder-white/40 focus:outline-none focus:border-[#8b5cf6] transition-colors"
                    />
                  </div>


                                    <div>
                    <label className="block text-sm font-bold text-white/80 mb-2">
                      Группа (отдел)
                    </label>
                    <select
                      value={categoryId ?? ""}
                      onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
                      className="w-full border border-white/15 rounded-lg px-3 py-2 bg-white/5 text-white focus:outline-none focus:border-[#8b5cf6]"
                    >
                      <option value="" className="bg-gray-900">Без группы</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id} className="bg-gray-900">
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>


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

                  <div>
                    <label className="block text-sm font-bold text-white/80 mb-2">
                      Описание роли
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Чем занимается эта роль? Например: Следит за порядком в чатах, помогает новичкам"
                      rows={2}
                      className="w-full border border-white/15 rounded-lg px-3 py-2 bg-white/5 text-white placeholder-white/40 focus:outline-none focus:border-[#8b5cf6] resize-none"
                    />
                  </div>

                  <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
                    <input
                      type="checkbox"
                      id="is_staff"
                      checked={isStaff}
                      onChange={(e) => setIsStaff(e.target.checked)}
                      className="w-4 h-4 rounded border-white/30 bg-white/5 text-purple-500 focus:ring-purple-500"
                    />
                    <label htmlFor="is_staff" className="text-sm text-white/90 font-semibold cursor-pointer flex items-center gap-2">
                      <Crown size={14} className="text-[#8b5cf6]" />
                      Показывать в правилах (/rules → "Команда trelod")
                    </label>
                  </div>

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

                    {/* 🆕 Умный блок описания уровня */}
                    <div className="mt-3 p-3 rounded-lg bg-white/5 border border-white/10 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white/50">Статус:</span>
                        <span className="text-sm font-bold" style={{ color: getLevelColor(level) }}>
                          {LEVEL_DESCRIPTIONS[level]?.title || "Пользовательский уровень"}
                        </span>
                      </div>
                      <p className="text-xs text-white/70 leading-relaxed">
                        {LEVEL_DESCRIPTIONS[level]?.desc}
                      </p>
                      <div className="flex items-center gap-2 pt-1 border-t border-white/10">
                        <User size={12} className="text-white/40" />
                        <p className="text-xs text-white/50">
                          Идеально для: <span className="text-white/80 font-semibold">{LEVEL_DESCRIPTIONS[level]?.bestFor}</span>
                        </p>
                      </div>
                      {level >= 4 && (
                        <p className="text-xs text-green-400/80 mt-1 flex items-center gap-1">
                          <ShieldCheck size={12} />
                          Может банить пользователей с уровнем <strong>ниже {level}</strong>
                        </p>
                      )}
                    </div>

                    {level >= maxAssignableLevel - 1 && !me?.is_admin && (
                      <div className="mt-3 flex gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                        <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-200/90">
                          Высокий уровень! Этот пользователь сможет применять санкции почти ко всем остальным ролям.
                        </p>
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-xs text-white/50 mb-2">Предпросмотр:</p>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10 flex-wrap">
                      {isStaff && (
                        <span className="px-2 py-0.5 rounded-full bg-[#8b5cf6]/20 text-[#8b5cf6] text-xs font-bold border border-[#8b5cf6]/40 flex items-center gap-1">
                          <Crown size={10} /> Staff
                        </span>
                      )}
                      <span
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-white text-sm font-black uppercase tracking-widest shadow-lg border"
                        style={{
                          backgroundColor: color,
                          borderColor: `${color}80`,
                          boxShadow: `0 4px 14px 0 ${color}40`,
                        }}
                      >
                        {level === 8 && (
                          <img
                            src="/role-icon.svg"
                            alt=""
                            className="w-4 h-4 shrink-0"
                            style={{ filter: "drop-shadow(1px 0 0 #000) drop-shadow(-1px 0 0 #000) drop-shadow(0 1px 0 #000) drop-shadow(0 -1px 0 #000)" }}
                          />
                        )}
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

                  <div>
                    <label className="block text-sm font-bold text-white/80 mb-3">
                      Полномочия
                      {!permissionsLoaded && <span className="ml-2 text-xs text-white/40 animate-pulse">Загрузка...</span>}
                    </label>
                    <div className="space-y-4 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
                      {(() => {
                        // Группируем по категориям
                        const grouped: Record<string, any[]> = {};
                        availablePermissions.forEach(p => {
                          const cat = p.category || "system";
                          if (!grouped[cat]) grouped[cat] = [];
                          grouped[cat].push(p);
                        });
                        
                        // Сортируем категории
                        const categoryOrder = ["content", "users", "chats", "system"];
                        const sortedCategories = Object.keys(grouped).sort(
                          (a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b)
                        );
                        
                        return sortedCategories.map(cat => (
                          <div key={cat} className="space-y-1.5">
                            <h4 className="text-xs font-black text-white/50 uppercase tracking-wider px-1">
                              {CATEGORY_LABELS[cat] || cat}
                            </h4>
                            {grouped[cat].map((perm) => (
                              <label
                                key={perm.id}
                                className={`flex items-center gap-3 cursor-pointer p-2.5 rounded-lg border transition-all ${
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
                                <span className="text-base">{perm.icon}</span>
                                <span className="text-sm text-white/90 font-semibold flex-1">{perm.label}</span>
                              </label>
                            ))}
                          </div>
                        ));
                      })()}
                      
                      {availablePermissions.length === 0 && permissionsLoaded && (
                        <p className="text-xs text-white/40 text-center py-4">Права не загружены</p>
                      )}
                    </div>
                  </div>

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

        {/* 🗂️ МОДАЛКА УПРАВЛЕНИЯ ГРУППАМИ */}
        {showCatManager && (
          <>
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200]" onClick={() => !catSaving && setShowCatManager(false)} />
            <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
              <div className="w-full max-w-md border border-white/20 rounded-2xl bg-[#1f1f23]/95 backdrop-blur-md shadow-2xl p-6 pointer-events-auto max-h-[80vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-black text-white flex items-center gap-2">
                    <FolderOpen size={18} className="text-[#8b5cf6]" />
                    {editingCat ? "Редактировать группу" : "Новая группа"}
                  </h2>
                  <button onClick={() => !catSaving && setShowCatManager(false)} className="text-white/60 hover:text-white p-1">
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={saveCategory} className="space-y-4 mb-5">
                  <div>
                    <label className="block text-xs font-bold text-white/60 mb-1.5">Название группы</label>
                    <input
                      value={catName}
                      onChange={(e) => setCatName(e.target.value)}
                      placeholder="Например: Модерация, Тех. отдел, Дизайн"
                      required
                      className="w-full border border-white/15 rounded-lg px-3 py-2 bg-white/5 text-white text-sm placeholder-white/40 focus:outline-none focus:border-[#8b5cf6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-white/60 mb-1.5">Описание</label>
                    <input
                      value={catDesc}
                      onChange={(e) => setCatDesc(e.target.value)}
                      placeholder="Чем занимается этот отдел?"
                      className="w-full border border-white/15 rounded-lg px-3 py-2 bg-white/5 text-white text-sm placeholder-white/40 focus:outline-none focus:border-[#8b5cf6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-white/60 mb-1.5">Цвет</label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={catColor} onChange={(e) => setCatColor(e.target.value)}
                        className="w-12 h-9 rounded-lg border border-white/20 cursor-pointer bg-transparent" />
                      <input type="text" value={catColor} onChange={(e) => setCatColor(e.target.value)}
                        className="flex-1 border border-white/15 rounded-lg px-3 py-2 bg-white/5 text-white font-mono text-sm focus:outline-none focus:border-[#8b5cf6]" />
                    </div>
                  </div>
                  <button type="submit" disabled={catSaving || !catName.trim()}
                    className="w-full py-2.5 rounded-lg bg-[#8b5cf6] text-white font-bold hover:bg-[#7c3aed] disabled:opacity-40 transition-all">
                    {catSaving ? "Сохранение..." : editingCat ? "Сохранить" : "Создать группу"}
                  </button>
                </form>

                <div className="border-t border-white/10 pt-4">
                  <p className="text-xs font-bold text-white/50 uppercase tracking-wider mb-3">Существующие группы</p>
                  <div className="space-y-2">
                    {categories.length === 0 && <p className="text-xs text-white/40 text-center py-3">Групп пока нет</p>}
                    {categories.map((c) => (
                      <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: c.color }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white truncate">{c.name}</p>
                          {c.description && <p className="text-[10px] text-white/40 truncate">{c.description}</p>}
                          <p className="text-[10px] text-white/30">{roles.filter((r) => r.category_id === c.id).length} ролей</p>
                        </div>
                        <button onClick={() => openCatForm(c)} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => deleteCategory(c.id)} className="p-1.5 rounded-lg text-red-400/60 hover:text-red-400 hover:bg-red-500/10">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <button onClick={() => !catSaving && setShowCatManager(false)}
                  className="w-full mt-4 py-2.5 rounded-lg border border-white/20 text-white/80 font-bold hover:bg-white/10 transition-all">
                  Готово
                </button>
              </div>
            </div>
          </>
        )}

      </main>
    </div>
  );
}