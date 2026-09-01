"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { getToken } from "@/lib/auth";
import { Palette, Plus, Trash2, Edit2, X, ShieldCheck, AlertTriangle, Info, ChevronUp, Crown, Sparkles, User, FolderOpen, Settings, CreditCard } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";

// Категории прав СЃ иконками Рё fallback
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
  content: "рџ“ќ Контент",
  users: "СЂСџвЂ�Тђ Пользователи",
  chats: "рџ’¬ Чаты Рё группы",
  system: "⚙️ Система",
};

// рџ†• Умная система описания СѓСЂРѕРІРЅРµР№
const LEVEL_DESCRIPTIONS: Record<number, { title: string; desc: string; bestFor: string }> = {
  1: { 
    title: "Р‘Р°Р·РѕРІС‹Р№ / РџРѕС‡РµС‚РЅС‹Р№", 
    desc: "РћР±С‹С‡РЅС‹Р№ пользователь или визуальная роль Рґля бывших членов РєРѕРјР°РЅРґС‹. Без Р°Рґминских прав.", 
    bestFor: "Пользователь, Р›РµРіРµРЅРґР°, Ветеран" 
  },
  2: { 
    title: "Р’РёР·СѓР°Р»СЊРЅС‹Р№ / Премиум", 
    desc: "Чисто косметическая роль Рґля РІС‹Рґеления активных или РїРѕРґРґерживающих проект РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№.", 
    bestFor: "Premium, Donator, Актив" 
  },
  3: { 
    title: "Стажёр", 
    desc: "РќР°С‡РёРЅР°СЋС‰РёР№ СЃРѕС‚СЂСѓРґник РєРѕРјР°РЅРґС‹. Только РЅР°Р±Р»СЋРґение Рё обучение РїРѕРґ присмотром старших.", 
    bestFor: "Trainee" 
  },
  4: { 
    title: "РњР»Р°РґС€РёР№ специалист", 
    desc: "РќР°С‡РёРЅР°СЋС‰РёР№ РјРѕРґератор или помощник СЃ базовыми, ограниченными правами.", 
    bestFor: "Junior Mod, Helper" 
  },
  5: { 
    title: "Специалист", 
    desc: "РћСЃРЅРѕРІРЅРѕР№ СЂР°Р±РѕС‡РёР№ состав. Самостоятельно решает типовые Р·Р°Рґачи Рё жалобы.", 
    bestFor: "Moderator, Tech Support" 
  },
  6: { 
    title: "РЎС‚Р°СЂС€РёР№ специалист", 
    desc: "РћРїС‹С‚РЅС‹Р№ СЃРѕС‚СЂСѓРґник. Решает сложные конфликты Рё контролирует работу РјР»Р°Рґших.", 
    bestFor: "Senior Mod, Tech Admin" 
  },
  7: { 
    title: "Куратор направления", 
    desc: "РљРѕРѕСЂРґинирует работу целого РѕС‚Рґела или СЂР°Р·Рґела. Отчитывается РЅРµРїРѕСЃСЂРµРґственно РїРµСЂРµРґ Р›РёРґером.", 
    bestFor: "Supervisor, Curator" 
  },
  8: { 
    title: "Р›РёРґер направления", 
    desc: "Р’С‹СЃС€РёР№ РєР°СЃС‚РѕРјРЅС‹Р№ уровень. Полная автономия Рё власть РІ СЃРІРѕРµР№ зоне ответственности.", 
    bestFor: "Manager, Chief Tech" 
  },
  9: { 
    title: "Developer (РЎРёСЃС‚РµРјРЅС‹Р№)", 
    desc: "РЇРґро разработки. Управляет техническим РѕС‚Рґелом Рё РёРЅС„СЂР°СЃС‚СЂСѓРєС‚СѓСЂРѕР№ проекта.", 
    bestFor: "Developer" 
  },
  10: { 
    title: "Founder (РЎРёСЃС‚РµРјРЅС‹Р№)", 
    desc: "РЎРѕР·Рґатель проекта. РђР±СЃРѕР»СЋС‚РЅС‹Р№ контроль РЅР°Рґ всеми системами.", 
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
  const [showInPayments, setShowInPayments] = useState(false);
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

            // рџ†• Загружаем список прав СЃ Р±СЌРєРµРЅРґР°
      try {
        const permsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/permissions`);
        if (permsRes.ok) {
          const permsData = await permsRes.json();
          // Обогащаем права из бэка нашими мета-Рґанными
          const enriched = permsData.map((p: any) => ({
            ...p,
            icon: PERMISSION_META[p.id]?.icon || "рџ”‘",
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
      setShowInPayments(role.show_in_payments || false);
      setPermissions(role.permissions || []);
      setCategoryId(role.category_id ?? null);
    } else {
      setEditingRole(null);
      setName("");
      setColor("#8b5cf6");
      setLevel(1);
      setDescription("");
      setIsStaff(false);
      setShowInPayments(false);
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
    form.append("show_in_payments", String(showInPayments));
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
    if (!confirm("РЈРґалить роль? Она исчезнет Сѓ всех РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№.")) return;
    const token = getToken();
    if (!token) return;
    
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/roles/${roleId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      load();
    } catch (err) {
      alert("Ошибка СѓРґаления");
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
    <div className="h-screen flex items-center justify-center bg-ivory dark:bg-[#18181b]">
      <p className="text-gray-600 dark:text-white/60 animate-pulse">Загрузка...</p>
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
    if (!confirm("РЈРґалить группу? Роли останутся без группы.")) return;
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
    if (lvl === 8) return "#ef4444"; // Р›РёРґер (РєСЂР°СЃРЅС‹Р№/РѕСЂР°РЅР¶РµРІС‹Р№)
    if (lvl === 7) return "#f59e0b"; // Куратор (Р¶РµР»С‚С‹Р№)
    if (lvl === 6) return "#22c55e"; // РЎС‚Р°СЂС€РёР№ (Р·РµР»РµРЅС‹Р№)
    if (lvl === 5) return "#10b981"; // Специалист (РёР·СѓРјСЂСѓРґРЅС‹Р№)
    if (lvl === 4) return "#14b8a6"; // РњР»Р°РґС€РёР№ (Р±РёСЂСЋР·РѕРІС‹Р№)
    if (lvl === 3) return "#64748b"; // Стажер (СЃРµСЂС‹Р№)
    if (lvl === 2) return "#a855f7"; // Премиум (С„РёРѕР»РµС‚РѕРІС‹Р№)
    return "#94a3b8"; // Р‘Р°Р·РѕРІС‹Р№
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
    <div className="h-screen flex overflow-hidden bg-ivory dark:bg-[#18181b]">
      <Sidebar />
      <div className="w-px shrink-0 bg-gray-100 dark:bg-white/10 my-3" />
      <main className="flex-1 overflow-y-auto border-x border-line dark:border-white/10">
        <div className="p-6 border-b border-line dark:border-white/10 sticky top-0 bg-paper dark:bg-[#171717]/80 backdrop-blur-md z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Palette size={24} className="text-[#8b5cf6]" />
              <div>
                <h1 className="text-2xl font-black text-gray-900 dark:text-white">Управление ролями</h1>
                <p className="text-xs text-gray-600 dark:text-white/50 mt-0.5">
                  Ваш уровень: <span className="font-bold" style={{ color: getLevelColor(myLevel) }}>{myLevel}</span> 
                  {!me?.is_admin && (
                    <> вЂў Макс. РґРѕСЃС‚СѓРїРЅС‹Р№ Рґля назначения: <span className="font-bold" style={{ color: getLevelColor(maxAssignableLevel) }}>{maxAssignableLevel}</span></>
                  )}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {/* рџ”— Кнопка-ссылка РІ окно СЂРѕР»РµР№ РІС‹СЃС€РµР№ касты (9-11) вЂ” Рґоступ по праву manage_roles */}
              {(me?.is_admin || me?.permissions?.includes("manage_roles")) && (
                <Button variant="secondary" icon={Crown} onClick={() => router.push("/admin/badges/system")}>
                  Роли 9вЂ“11
                </Button>
              )}
              <Button icon={Plus} onClick={() => openForm()}>
                РЎРѕР·Рґать роль
              </Button>
            </div>
          </div>
        </div>
        {/* 🗂️ Р вЂ™Р С™Р вЂєР С’Р вЂќР С™Р В� ГРУПП */}
        <div className="px-6 pt-3 pb-0 border-b border-line dark:border-white/10 bg-paper dark:bg-[#171717]/40 flex items-center gap-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-4 py-2.5 text-sm font-bold whitespace-nowrap border-b-2 transition-all ${
              activeTab === "all" ? "border-[#8b5cf6] text-[#8b5cf6]" : "border-transparent text-gray-600 dark:text-white/50 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            Все роли <span className="text-[10px] ml-1 text-gray-500 dark:text-white/30">({roles.length})</span>
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveTab(c.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold whitespace-nowrap border-b-2 transition-all ${
                activeTab === c.id ? "border-[#8b5cf6] text-gray-900 dark:text-white" : "border-transparent text-gray-600 dark:text-white/50 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
              {c.name}
              <span className="text-[10px] text-gray-500 dark:text-white/30">
                ({roles.filter((r) => r.category_id === c.id).length})
              </span>
            </button>
          ))}
          <IconButton
            icon={Settings}
            variant="ghost"
            size="iconSm"
            onClick={() => openCatForm()}
            title="Управление группами"
          />
        </div>

        <div className="p-4 border-b border-line dark:border-white/5"></div>
        <div className="p-4 border-b border-line dark:border-white/5">
          <div className="bg-[#8b5cf6]/10 border border-[#8b5cf6]/30 rounded-xl p-4 flex gap-3">
            <Info size={20} className="text-[#8b5cf6] shrink-0 mt-0.5" />
            <div className="text-sm text-gray-800 dark:text-white/80 space-y-1">
              <p className="font-bold text-gray-900 dark:text-white">Система иерархии</p>
              <p>Пользователь <strong>не может</strong> применять санкции Рє тем, С‡РµР№ уровень <strong>равен или выше</strong> его собственного.</p>
              <p className="text-xs text-gray-600 dark:text-white/60 mt-2">
                <strong>Галочка "Показывать РІ правилах"</strong> вЂ” роль появится на странице /rules РІ секции "РљРѕРјР°РЅРґР° trelod".
              </p>
              <div className="flex flex-wrap gap-2 mt-2 text-xs">
                <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white border border-line dark:border-white/20">Founder: 10</span>
                <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30">Developer: 9</span>
                <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30">Р›РёРґеры: 8</span>
                <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30">Визуальные: 1-2</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {roles.length === 0 && (
            <div className="text-center py-12">
              <Palette size={48} className="mx-auto text-gray-500 dark:text-white/20 mb-4" />
              <p className="text-gray-600 dark:text-white/50">Пока нет кастомных СЂРѕР»РµР№. РЎРѕР·РґР°Р№те первую!</p>
            </div>
          )}
          {sortedRoles.map((role, index) => (
            <div
              key={role.id}
              className={`border rounded-xl p-4 transition-all ${
                role.is_staff ? "border-[#8b5cf6]/40 bg-[#8b5cf6]/5" : "border-line dark:border-white/15 bg-gray-100 dark:bg-white/5"
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
                    <p className="text-xs text-gray-600 dark:text-white/60 italic hidden md:block">"{role.description}"</p>
                  )}
                </div>
                
                <div className="flex gap-2 shrink-0">
                  {role.is_staff && (
                    <>
                      <IconButton
                        icon={ChevronUp}
                        variant="secondary"
                        size="iconSm"
                        onClick={() => moveRole(role.id, "up")}
                        disabled={index === 0 || !sortedRoles[index - 1]?.is_staff}
                        title="Переместить выше"
                      />
                      <IconButton
                        icon={ChevronUp}
                        iconClassName="rotate-180"
                        variant="secondary"
                        size="iconSm"
                        onClick={() => moveRole(role.id, "down")}
                        disabled={index === sortedRoles.filter(r => r.is_staff).length - 1 || !sortedRoles[index + 1]?.is_staff}
                        title="Переместить ниже"
                      />
                    </>
                  )}
                  <IconButton
                    icon={Edit2}
                    variant="secondary"
                    size="iconSm"
                    onClick={() => openForm(role)}
                    title="Р РµРґактировать"
                  />
                  <IconButton
                    icon={Trash2}
                    variant="danger"
                    size="iconSm"
                    onClick={() => deleteRole(role.id)}
                    title="РЈРґалить"
                  />
                </div>
              </div>

              {role.permissions && role.permissions.length > 0 && (
                <div className="mt-3 flex gap-1.5 flex-wrap">
                  {role.permissions.map((perm: string) => {
                    const permInfo = availablePermissions.find((p: any) => p.id === perm);
                    const meta = PERMISSION_META[perm];
                    const categoryColor = {
                      content: "border-orange-400/30 bg-orange-500/10 text-orange-600 dark:text-orange-300",
                      users: "border-red-400/30 bg-red-500/10 text-red-600 dark:text-red-300",
                      chats: "border-blue-400/30 bg-blue-500/10 text-blue-600 dark:text-blue-300",
                      system: "border-purple-400/30 bg-purple-500/10 text-purple-600 dark:text-purple-300",
                    }[meta?.category || "system"];
                    
                    return (
                      <span
                        key={perm}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs ${categoryColor}`}
                      >
                        <span>{meta?.icon || "рџ”‘"}</span>
                        <span>{permInfo?.label || perm}</span>
                      </span>
                    );
                  })}
                </div>
              )}
              {(!role.permissions || role.permissions.length === 0) && (
                <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-500 dark:text-white/40">
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
              <div className="w-full max-w-lg border border-line dark:border-white/20 rounded-2xl bg-ivory dark:bg-[#1f1f23]/95 backdrop-blur-md shadow-2xl p-6 pointer-events-auto max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-black text-gray-900 dark:text-white">
                    {editingRole ? "Р РµРґактировать роль" : "РЎРѕР·Рґать роль"}
                  </h2>
                  <IconButton
                    icon={X}
                    size="iconSm"
                    onClick={() => !saving && setShowForm(false)}
                  />
                </div>
                <form onSubmit={saveRole} className="space-y-5">
                  <div>
                    <label className="block text-sm font-bold text-gray-800 dark:text-white/80 mb-2">
                      Название роли
                    </label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Например: Premium, Куратор, Chief Tech"
                      required
                      className="w-full border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-[#8b5cf6] transition-colors"
                    />
                  </div>


                                    <div>
                    <label className="block text-sm font-bold text-gray-800 dark:text-white/80 mb-2">
                      Группа (РѕС‚Рґел)
                    </label>
                    <select
                      value={categoryId ?? ""}
                      onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
                      className="w-full border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:border-[#8b5cf6]"
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
                    <label className="block text-sm font-bold text-gray-800 dark:text-white/80 mb-2">
                      Цвет плашки
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="w-16 h-10 rounded-lg border border-line dark:border-white/20 cursor-pointer bg-transparent"
                      />
                      <input
                        type="text"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="flex-1 border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white font-mono text-sm focus:outline-none focus:border-[#8b5cf6]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-800 dark:text-white/80 mb-2">
                      Описание роли
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Чем занимается эта роль? Например: РЎР»РµРґит за РїРѕСЂСЏРґком РІ чатах, помогает новичкам"
                      rows={2}
                      className="w-full border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-[#8b5cf6] resize-none"
                    />
                  </div>

                  <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10">
                    <input
                      type="checkbox"
                      id="is_staff"
                      checked={isStaff}
                      onChange={(e) => setIsStaff(e.target.checked)}
                      className="w-4 h-4 rounded border-line dark:border-white/30 bg-gray-100 dark:bg-white/5 text-purple-500 focus:ring-purple-500"
                    />
                    <label htmlFor="is_staff" className="text-sm text-gray-800 dark:text-white/90 font-semibold cursor-pointer flex items-center gap-2">
                      <Crown size={14} className="text-[#8b5cf6]" />
                      Показывать РІ правилах (/rules в†’ "РљРѕРјР°РЅРґР° trelod")
                    </label>
                  </div>

                  <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10">
                    <input
                      type="checkbox"
                      id="show_in_payments"
                      checked={showInPayments}
                      onChange={(e) => setShowInPayments(e.target.checked)}
                      className="w-4 h-4 rounded border-line dark:border-white/30 bg-gray-100 dark:bg-white/5 text-purple-500 focus:ring-purple-500"
                    />
                    <label htmlFor="show_in_payments" className="text-sm text-gray-800 dark:text-white/90 font-semibold cursor-pointer flex items-center gap-2">
                      <CreditCard size={14} className="text-violet-500" />
                      Показывать РІ системе оплаты (Р°Рґминка в†’ Оплата)
                    </label>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-bold text-gray-800 dark:text-white/80">
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
                      className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-[#8b5cf6] bg-gray-100 dark:bg-white/10"
                    />
                    
                    <div className="flex justify-between text-[10px] text-gray-500 dark:text-white/40 mt-1 font-mono">
                      <span>1</span>
                      <span>{Math.ceil(maxAssignableLevel / 2)}</span>
                      <span>{maxAssignableLevel}</span>
                    </div>

                    {/* рџ†• РЈРјРЅС‹Р№ блок описания уровня */}
                    <div className="mt-3 p-3 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600 dark:text-white/50">Статус:</span>
                        <span className="text-sm font-bold" style={{ color: getLevelColor(level) }}>
                          {LEVEL_DESCRIPTIONS[level]?.title || "РџРѕР»СЊР·РѕРІР°С‚РµР»СЊСЃРєРёР№ уровень"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-800 dark:text-white/70 leading-relaxed">
                        {LEVEL_DESCRIPTIONS[level]?.desc}
                      </p>
                      <div className="flex items-center gap-2 pt-1 border-t border-line dark:border-white/10">
                        <User size={12} className="text-gray-500 dark:text-white/40" />
                        <p className="text-xs text-gray-600 dark:text-white/50">
                          Р В�РґеалСЊРЅРѕ Рґля: <span className="text-gray-800 dark:text-white/80 font-semibold">{LEVEL_DESCRIPTIONS[level]?.bestFor}</span>
                        </p>
                      </div>
                      {level >= 4 && (
                        <p className="text-xs text-green-400/80 mt-1 flex items-center gap-1">
                          <ShieldCheck size={12} />
                          Может банить РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№ СЃ уровнем <strong>ниже {level}</strong>
                        </p>
                      )}
                    </div>

                    {level >= maxAssignableLevel - 1 && !me?.is_admin && (
                      <div className="mt-3 flex gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                        <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-200/90">
                          Р’С‹СЃРѕРєРёР№ уровень! Этот пользователь сможет применять санкции почти ко всем остальным ролям.
                        </p>
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-xs text-gray-600 dark:text-white/50 mb-2">РџСЂРµРґпросмотр:</p>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 flex-wrap">
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
                    <label className="block text-sm font-bold text-gray-800 dark:text-white/80 mb-3">
                      Полномочия
                      {!permissionsLoaded && <span className="ml-2 text-xs text-gray-500 dark:text-white/40 animate-pulse">Загрузка...</span>}
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
                            <h4 className="text-xs font-black text-gray-600 dark:text-white/50 uppercase tracking-wider px-1">
                              {CATEGORY_LABELS[cat] || cat}
                            </h4>
                            {grouped[cat].map((perm) => (
                              <label
                                key={perm.id}
                                className={`flex items-center gap-3 cursor-pointer p-2.5 rounded-lg border transition-all ${
                                  permissions.includes(perm.id)
                                    ? "border-[#8b5cf6] bg-purple-500/10"
                                    : "border-line dark:border-white/10 bg-gray-100 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={permissions.includes(perm.id)}
                                  onChange={() => togglePermission(perm.id)}
                                  className="w-4 h-4 rounded border-line dark:border-white/30 bg-gray-100 dark:bg-white/5 text-purple-500 focus:ring-purple-500"
                                />
                                <span className="text-base">{perm.icon}</span>
                                <span className="text-sm text-gray-800 dark:text-white/90 font-semibold flex-1">{perm.label}</span>
                              </label>
                            ))}
                          </div>
                        ));
                      })()}
                      
                      {availablePermissions.length === 0 && permissionsLoaded && (
                        <p className="text-xs text-gray-500 dark:text-white/40 text-center py-4">Права не загружены</p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button type="submit" loading={saving} disabled={saving} className="flex-1">
                      {saving ? "Сохранение..." : editingRole ? "Сохранить" : "РЎРѕР·Рґать"}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => !saving && setShowForm(false)}
                      disabled={saving}
                      className="flex-1"
                    >
                      Отмена
                    </Button>
                  </div>
                </form>
                
              </div>
            </div>
          </>
        )}

        {/* 🗂️ МОДАЛКА Р Р€Р СџР Р С’Р вЂ™Р вЂєР вЂўР СњР В�РЇ Р вЂњР Р Р€Р СџР СџР С’Р СљР В� */}
        {showCatManager && (
          <>
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200]" onClick={() => !catSaving && setShowCatManager(false)} />
            <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
              <div className="w-full max-w-md border border-line dark:border-white/20 rounded-2xl bg-ivory dark:bg-[#1f1f23]/95 backdrop-blur-md shadow-2xl p-6 pointer-events-auto max-h-[80vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
                    <FolderOpen size={18} className="text-[#8b5cf6]" />
                    {editingCat ? "Р РµРґактировать группу" : "Новая группа"}
                  </h2>
                  <IconButton icon={X} size="iconSm" onClick={() => !catSaving && setShowCatManager(false)} />
                </div>

                <form onSubmit={saveCategory} className="space-y-4 mb-5">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-1.5">Название группы</label>
                    <input
                      value={catName}
                      onChange={(e) => setCatName(e.target.value)}
                      placeholder="Например: РњРѕРґерация, Тех. РѕС‚Рґел, Р”РёР·Р°Р№РЅ"
                      required
                      className="w-full border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-[#8b5cf6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-1.5">Описание</label>
                    <input
                      value={catDesc}
                      onChange={(e) => setCatDesc(e.target.value)}
                      placeholder="Чем занимается этот РѕС‚Рґел?"
                      className="w-full border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-[#8b5cf6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-1.5">Цвет</label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={catColor} onChange={(e) => setCatColor(e.target.value)}
                        className="w-12 h-9 rounded-lg border border-line dark:border-white/20 cursor-pointer bg-transparent" />
                      <input type="text" value={catColor} onChange={(e) => setCatColor(e.target.value)}
                        className="flex-1 border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white font-mono text-sm focus:outline-none focus:border-[#8b5cf6]" />
                    </div>
                  </div>
                  <Button type="submit" loading={catSaving} disabled={catSaving || !catName.trim()} className="w-full">
                    {catSaving ? "Сохранение..." : editingCat ? "Сохранить" : "РЎРѕР·Рґать группу"}
                  </Button>
                </form>

                <div className="border-t border-line dark:border-white/10 pt-4">
                  <p className="text-xs font-bold text-gray-600 dark:text-white/50 uppercase tracking-wider mb-3">Существующие группы</p>
                  <div className="space-y-2">
                    {categories.length === 0 && <p className="text-xs text-gray-500 dark:text-white/40 text-center py-3">Групп пока нет</p>}
                    {categories.map((c) => (
                      <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: c.color }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{c.name}</p>
                          {c.description && <p className="text-[10px] text-gray-500 dark:text-white/40 truncate">{c.description}</p>}
                          <p className="text-[10px] text-gray-500 dark:text-white/30">{roles.filter((r) => r.category_id === c.id).length} СЂРѕР»РµР№</p>
                        </div>
                        <IconButton icon={Edit2} size="iconSm" onClick={() => openCatForm(c)} />
                        <IconButton icon={Trash2} variant="danger" size="iconSm" onClick={() => deleteCategory(c.id)} />
                      </div>
                    ))}
                  </div>
                </div>

                <Button variant="secondary" className="w-full mt-4" onClick={() => !catSaving && setShowCatManager(false)}>
                  Готово
                </Button>
              </div>
            </div>
          </>
        )}

      </main>
    </div>
  );
}