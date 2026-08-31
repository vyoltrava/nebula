"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { getToken } from "@/lib/auth";
import { Palette, Plus, Trash2, Edit2, X, ShieldCheck, AlertTriangle, Info, ChevronUp, Crown, Sparkles, User, FolderOpen, Settings, CreditCard } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";

// РљР°С‚РµРіРѕСЂРёРё РїСЂР°РІ СЃ РёРєРѕРЅРєР°РјРё Рё fallback
const PERMISSION_META: Record<string, { icon: string; category: "content" | "users" | "chats" | "system" }> = {
  // РљРѕРЅС‚РµРЅС‚
  delete_posts:         { icon: "рџ—‘пёЏ", category: "content" },
  edit_posts:           { icon: "вњЏпёЏ", category: "content" },
  remove_avatars:       { icon: "рџ–јпёЏ", category: "content" },
  manage_stickers:      { icon: "рџЋЁ", category: "content" },
  manage_announcements: { icon: "рџ“ў", category: "content" },
  
  // РџРѕР»СЊР·РѕРІР°С‚РµР»Рё
  ban_users:            { icon: "рџљ«", category: "users" },
  warn_users:           { icon: "вљ пёЏ", category: "users" },
  delete_users:         { icon: "в пёЏ", category: "users" },
  assign_moderator:     { icon: "рџ‘®", category: "users" },
  
  // Р§Р°С‚С‹
  pin_messages:         { icon: "рџ“Њ", category: "chats" },
  manage_groups:        { icon: "рџ‘Ґ", category: "chats" },
  
  // РЎРёСЃС‚РµРјР°
  manage_roles:         { icon: "рџЋ­", category: "system" },
  manage_users:         { icon: "вљ™пёЏ", category: "system" },
  manage_reports:       { icon: "рџљ©", category: "system" },
  tech_access:          { icon: "рџ”§", category: "system" },
  manage_support:       { icon: "рџЋ§", category: "chats" }, // рџ†• РџСЂР°РІРѕ РЅР° С‡Р°С‚ РїРѕРґРґРµСЂР¶РєРё
  assign_roles:         { icon: "рџЋ­", category: "users" },
  manage_team_stats:    { icon: "рџ“Љ", category: "system" }, // рџ†• Р”РћР‘РђР’Р›Р•РќРћ
  manage_suggestions:   { icon: "рџ’Ў", category: "content" },

};

const CATEGORY_LABELS: Record<string, string> = {
  content: "рџ“ќ РљРѕРЅС‚РµРЅС‚",
  users: "рџ‘Ґ РџРѕР»СЊР·РѕРІР°С‚РµР»Рё",
  chats: "рџ’¬ Р§Р°С‚С‹ Рё РіСЂСѓРїРїС‹",
  system: "вљ™пёЏ РЎРёСЃС‚РµРјР°",
};

// рџ†• РЈРјРЅР°СЏ СЃРёСЃС‚РµРјР° РѕРїРёСЃР°РЅРёСЏ СѓСЂРѕРІРЅРµР№
const LEVEL_DESCRIPTIONS: Record<number, { title: string; desc: string; bestFor: string }> = {
  1: { 
    title: "Р‘Р°Р·РѕРІС‹Р№ / РџРѕС‡РµС‚РЅС‹Р№", 
    desc: "РћР±С‹С‡РЅС‹Р№ РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ РёР»Рё РІРёР·СѓР°Р»СЊРЅР°СЏ СЂРѕР»СЊ РґР»СЏ Р±С‹РІС€РёС… С‡Р»РµРЅРѕРІ РєРѕРјР°РЅРґС‹. Р‘РµР· Р°РґРјРёРЅСЃРєРёС… РїСЂР°РІ.", 
    bestFor: "РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ, Р›РµРіРµРЅРґР°, Р’РµС‚РµСЂР°РЅ" 
  },
  2: { 
    title: "Р’РёР·СѓР°Р»СЊРЅС‹Р№ / РџСЂРµРјРёСѓРј", 
    desc: "Р§РёСЃС‚Рѕ РєРѕСЃРјРµС‚РёС‡РµСЃРєР°СЏ СЂРѕР»СЊ РґР»СЏ РІС‹РґРµР»РµРЅРёСЏ Р°РєС‚РёРІРЅС‹С… РёР»Рё РїРѕРґРґРµСЂР¶РёРІР°СЋС‰РёС… РїСЂРѕРµРєС‚ РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№.", 
    bestFor: "Premium, Donator, РђРєС‚РёРІ" 
  },
  3: { 
    title: "РЎС‚Р°Р¶С‘СЂ", 
    desc: "РќР°С‡РёРЅР°СЋС‰РёР№ СЃРѕС‚СЂСѓРґРЅРёРє РєРѕРјР°РЅРґС‹. РўРѕР»СЊРєРѕ РЅР°Р±Р»СЋРґРµРЅРёРµ Рё РѕР±СѓС‡РµРЅРёРµ РїРѕРґ РїСЂРёСЃРјРѕС‚СЂРѕРј СЃС‚Р°СЂС€РёС….", 
    bestFor: "Trainee" 
  },
  4: { 
    title: "РњР»Р°РґС€РёР№ СЃРїРµС†РёР°Р»РёСЃС‚", 
    desc: "РќР°С‡РёРЅР°СЋС‰РёР№ РјРѕРґРµСЂР°С‚РѕСЂ РёР»Рё РїРѕРјРѕС‰РЅРёРє СЃ Р±Р°Р·РѕРІС‹РјРё, РѕРіСЂР°РЅРёС‡РµРЅРЅС‹РјРё РїСЂР°РІР°РјРё.", 
    bestFor: "Junior Mod, Helper" 
  },
  5: { 
    title: "РЎРїРµС†РёР°Р»РёСЃС‚", 
    desc: "РћСЃРЅРѕРІРЅРѕР№ СЂР°Р±РѕС‡РёР№ СЃРѕСЃС‚Р°РІ. РЎР°РјРѕСЃС‚РѕСЏС‚РµР»СЊРЅРѕ СЂРµС€Р°РµС‚ С‚РёРїРѕРІС‹Рµ Р·Р°РґР°С‡Рё Рё Р¶Р°Р»РѕР±С‹.", 
    bestFor: "Moderator, Tech Support" 
  },
  6: { 
    title: "РЎС‚Р°СЂС€РёР№ СЃРїРµС†РёР°Р»РёСЃС‚", 
    desc: "РћРїС‹С‚РЅС‹Р№ СЃРѕС‚СЂСѓРґРЅРёРє. Р РµС€Р°РµС‚ СЃР»РѕР¶РЅС‹Рµ РєРѕРЅС„Р»РёРєС‚С‹ Рё РєРѕРЅС‚СЂРѕР»РёСЂСѓРµС‚ СЂР°Р±РѕС‚Сѓ РјР»Р°РґС€РёС….", 
    bestFor: "Senior Mod, Tech Admin" 
  },
  7: { 
    title: "РљСѓСЂР°С‚РѕСЂ РЅР°РїСЂР°РІР»РµРЅРёСЏ", 
    desc: "РљРѕРѕСЂРґРёРЅРёСЂСѓРµС‚ СЂР°Р±РѕС‚Сѓ С†РµР»РѕРіРѕ РѕС‚РґРµР»Р° РёР»Рё СЂР°Р·РґРµР»Р°. РћС‚С‡РёС‚С‹РІР°РµС‚СЃСЏ РЅРµРїРѕСЃСЂРµРґСЃС‚РІРµРЅРЅРѕ РїРµСЂРµРґ Р›РёРґРµСЂРѕРј.", 
    bestFor: "Supervisor, Curator" 
  },
  8: { 
    title: "Р›РёРґРµСЂ РЅР°РїСЂР°РІР»РµРЅРёСЏ", 
    desc: "Р’С‹СЃС€РёР№ РєР°СЃС‚РѕРјРЅС‹Р№ СѓСЂРѕРІРµРЅСЊ. РџРѕР»РЅР°СЏ Р°РІС‚РѕРЅРѕРјРёСЏ Рё РІР»Р°СЃС‚СЊ РІ СЃРІРѕРµР№ Р·РѕРЅРµ РѕС‚РІРµС‚СЃС‚РІРµРЅРЅРѕСЃС‚Рё.", 
    bestFor: "Manager, Chief Tech" 
  },
  9: { 
    title: "Developer (РЎРёСЃС‚РµРјРЅС‹Р№)", 
    desc: "РЇРґСЂРѕ СЂР°Р·СЂР°Р±РѕС‚РєРё. РЈРїСЂР°РІР»СЏРµС‚ С‚РµС…РЅРёС‡РµСЃРєРёРј РѕС‚РґРµР»РѕРј Рё РёРЅС„СЂР°СЃС‚СЂСѓРєС‚СѓСЂРѕР№ РїСЂРѕРµРєС‚Р°.", 
    bestFor: "Developer" 
  },
  10: { 
    title: "Founder (РЎРёСЃС‚РµРјРЅС‹Р№)", 
    desc: "РЎРѕР·РґР°С‚РµР»СЊ РїСЂРѕРµРєС‚Р°. РђР±СЃРѕР»СЋС‚РЅС‹Р№ РєРѕРЅС‚СЂРѕР»СЊ РЅР°Рґ РІСЃРµРјРё СЃРёСЃС‚РµРјР°РјРё.", 
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

            // рџ†• Р—Р°РіСЂСѓР¶Р°РµРј СЃРїРёСЃРѕРє РїСЂР°РІ СЃ Р±СЌРєРµРЅРґР°
      try {
        const permsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/permissions`);
        if (permsRes.ok) {
          const permsData = await permsRes.json();
          // РћР±РѕРіР°С‰Р°РµРј РїСЂР°РІР° РёР· Р±СЌРєР° РЅР°С€РёРјРё РјРµС‚Р°-РґР°РЅРЅС‹РјРё
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
      alert(`Р’С‹ РЅРµ РјРѕР¶РµС‚Рµ РЅР°Р·РЅР°С‡РёС‚СЊ СѓСЂРѕРІРµРЅСЊ РІС‹С€Рµ ${maxAssignableLevel} (РІР°С€ СѓСЂРѕРІРµРЅСЊ: ${myLevel}).`);
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
        alert(data?.detail || "РћС€РёР±РєР° СЃРѕС…СЂР°РЅРµРЅРёСЏ");
        return;
      }

      setShowForm(false);
      load();
    } catch (err) {
      alert("РћС€РёР±РєР° СЃРµС‚Рё");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRole(roleId: number) {
    if (!confirm("РЈРґР°Р»РёС‚СЊ СЂРѕР»СЊ? РћРЅР° РёСЃС‡РµР·РЅРµС‚ Сѓ РІСЃРµС… РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№.")) return;
    const token = getToken();
    if (!token) return;
    
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/roles/${roleId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      load();
    } catch (err) {
      alert("РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ");
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
      alert("РћС€РёР±РєР° РїРµСЂРµРјРµС‰РµРЅРёСЏ");
    }
  }

  if (!me) return (
    <div className="h-screen flex items-center justify-center bg-ivory dark:bg-[#18181b]">
      <p className="text-gray-600 dark:text-white/60 animate-pulse">Р—Р°РіСЂСѓР·РєР°...</p>
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
        alert(data?.detail || "РћС€РёР±РєР° СЃРѕС…СЂР°РЅРµРЅРёСЏ");
      }
    } catch {
      alert("РћС€РёР±РєР° СЃРµС‚Рё");
    } finally {
      setCatSaving(false);
    }
  }

  async function deleteCategory(catId: number) {
    if (!confirm("РЈРґР°Р»РёС‚СЊ РіСЂСѓРїРїСѓ? Р РѕР»Рё РѕСЃС‚Р°РЅСѓС‚СЃСЏ Р±РµР· РіСЂСѓРїРїС‹.")) return;
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
    if (lvl === 8) return "#ef4444"; // Р›РёРґРµСЂ (РєСЂР°СЃРЅС‹Р№/РѕСЂР°РЅР¶РµРІС‹Р№)
    if (lvl === 7) return "#f59e0b"; // РљСѓСЂР°С‚РѕСЂ (Р¶РµР»С‚С‹Р№)
    if (lvl === 6) return "#22c55e"; // РЎС‚Р°СЂС€РёР№ (Р·РµР»РµРЅС‹Р№)
    if (lvl === 5) return "#10b981"; // РЎРїРµС†РёР°Р»РёСЃС‚ (РёР·СѓРјСЂСѓРґРЅС‹Р№)
    if (lvl === 4) return "#14b8a6"; // РњР»Р°РґС€РёР№ (Р±РёСЂСЋР·РѕРІС‹Р№)
    if (lvl === 3) return "#64748b"; // РЎС‚Р°Р¶РµСЂ (СЃРµСЂС‹Р№)
    if (lvl === 2) return "#a855f7"; // РџСЂРµРјРёСѓРј (С„РёРѕР»РµС‚РѕРІС‹Р№)
    return "#94a3b8"; // Р‘Р°Р·РѕРІС‹Р№
  }

  // РЎРѕСЂС‚РёСЂСѓРµРј СЂРѕР»Рё: СЃРЅР°С‡Р°Р»Р° is_staff=true РїРѕ position, РїРѕС‚РѕРј РѕСЃС‚Р°Р»СЊРЅС‹Рµ РїРѕ СѓСЂРѕРІРЅСЋ
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
                <h1 className="text-2xl font-black text-gray-900 dark:text-white">РЈРїСЂР°РІР»РµРЅРёРµ СЂРѕР»СЏРјРё</h1>
                <p className="text-xs text-gray-600 dark:text-white/50 mt-0.5">
                  Р’Р°С€ СѓСЂРѕРІРµРЅСЊ: <span className="font-bold" style={{ color: getLevelColor(myLevel) }}>{myLevel}</span> 
                  {!me?.is_admin && (
                    <> вЂў РњР°РєСЃ. РґРѕСЃС‚СѓРїРЅС‹Р№ РґР»СЏ РЅР°Р·РЅР°С‡РµРЅРёСЏ: <span className="font-bold" style={{ color: getLevelColor(maxAssignableLevel) }}>{maxAssignableLevel}</span></>
                  )}
                </p>
              </div>
            </div>
            <Button icon={Plus} onClick={() => openForm()}>
              РЎРѕР·РґР°С‚СЊ СЂРѕР»СЊ
            </Button>
          </div>
        </div>
        {/* рџ—‚пёЏ Р’РљР›РђР”РљР Р“Р РЈРџРџ */}
        <div className="px-6 pt-3 pb-0 border-b border-line dark:border-white/10 bg-paper dark:bg-[#171717]/40 flex items-center gap-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-4 py-2.5 text-sm font-bold whitespace-nowrap border-b-2 transition-all ${
              activeTab === "all" ? "border-[#8b5cf6] text-[#8b5cf6]" : "border-transparent text-gray-600 dark:text-white/50 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            Р’СЃРµ СЂРѕР»Рё <span className="text-[10px] ml-1 text-gray-500 dark:text-white/30">({roles.length})</span>
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
            title="РЈРїСЂР°РІР»РµРЅРёРµ РіСЂСѓРїРїР°РјРё"
          />
        </div>

        <div className="p-4 border-b border-line dark:border-white/5"></div>
        <div className="p-4 border-b border-line dark:border-white/5">
          <div className="bg-[#8b5cf6]/10 border border-[#8b5cf6]/30 rounded-xl p-4 flex gap-3">
            <Info size={20} className="text-[#8b5cf6] shrink-0 mt-0.5" />
            <div className="text-sm text-gray-800 dark:text-white/80 space-y-1">
              <p className="font-bold text-gray-900 dark:text-white">РЎРёСЃС‚РµРјР° РёРµСЂР°СЂС…РёРё</p>
              <p>РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ <strong>РЅРµ РјРѕР¶РµС‚</strong> РїСЂРёРјРµРЅСЏС‚СЊ СЃР°РЅРєС†РёРё Рє С‚РµРј, С‡РµР№ СѓСЂРѕРІРµРЅСЊ <strong>СЂР°РІРµРЅ РёР»Рё РІС‹С€Рµ</strong> РµРіРѕ СЃРѕР±СЃС‚РІРµРЅРЅРѕРіРѕ.</p>
              <p className="text-xs text-gray-600 dark:text-white/60 mt-2">
                <strong>Р“Р°Р»РѕС‡РєР° "РџРѕРєР°Р·С‹РІР°С‚СЊ РІ РїСЂР°РІРёР»Р°С…"</strong> вЂ” СЂРѕР»СЊ РїРѕСЏРІРёС‚СЃСЏ РЅР° СЃС‚СЂР°РЅРёС†Рµ /rules РІ СЃРµРєС†РёРё "РљРѕРјР°РЅРґР° trelod".
              </p>
              <div className="flex flex-wrap gap-2 mt-2 text-xs">
                <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white border border-line dark:border-white/20">Founder: 10</span>
                <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30">Developer: 9</span>
                <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30">Р›РёРґРµСЂС‹: 8</span>
                <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30">Р’РёР·СѓР°Р»СЊРЅС‹Рµ: 1-2</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {roles.length === 0 && (
            <div className="text-center py-12">
              <Palette size={48} className="mx-auto text-gray-500 dark:text-white/20 mb-4" />
              <p className="text-gray-600 dark:text-white/50">РџРѕРєР° РЅРµС‚ РєР°СЃС‚РѕРјРЅС‹С… СЂРѕР»РµР№. РЎРѕР·РґР°Р№С‚Рµ РїРµСЂРІСѓСЋ!</p>
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
                      {categories.find((c) => c.id === role.category_id)?.name || "Р“СЂСѓРїРїР°"}
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
                        title="РџРµСЂРµРјРµСЃС‚РёС‚СЊ РІС‹С€Рµ"
                      />
                      <IconButton
                        icon={ChevronUp}
                        iconClassName="rotate-180"
                        variant="secondary"
                        size="iconSm"
                        onClick={() => moveRole(role.id, "down")}
                        disabled={index === sortedRoles.filter(r => r.is_staff).length - 1 || !sortedRoles[index + 1]?.is_staff}
                        title="РџРµСЂРµРјРµСЃС‚РёС‚СЊ РЅРёР¶Рµ"
                      />
                    </>
                  )}
                  <IconButton
                    icon={Edit2}
                    variant="secondary"
                    size="iconSm"
                    onClick={() => openForm(role)}
                    title="Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ"
                  />
                  <IconButton
                    icon={Trash2}
                    variant="danger"
                    size="iconSm"
                    onClick={() => deleteRole(role.id)}
                    title="РЈРґР°Р»РёС‚СЊ"
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
                  <span>Р’РёР·СѓР°Р»СЊРЅР°СЏ СЂРѕР»СЊ (Р±РµР· СЃРїРµС†РёР°Р»СЊРЅС‹С… РїСЂР°РІ)</span>
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
                    {editingRole ? "Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ СЂРѕР»СЊ" : "РЎРѕР·РґР°С‚СЊ СЂРѕР»СЊ"}
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
                      РќР°Р·РІР°РЅРёРµ СЂРѕР»Рё
                    </label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="РќР°РїСЂРёРјРµСЂ: Premium, РљСѓСЂР°С‚РѕСЂ, Chief Tech"
                      required
                      className="w-full border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-[#8b5cf6] transition-colors"
                    />
                  </div>


                                    <div>
                    <label className="block text-sm font-bold text-gray-800 dark:text-white/80 mb-2">
                      Р“СЂСѓРїРїР° (РѕС‚РґРµР»)
                    </label>
                    <select
                      value={categoryId ?? ""}
                      onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
                      className="w-full border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:border-[#8b5cf6]"
                    >
                      <option value="" className="bg-gray-900">Р‘РµР· РіСЂСѓРїРїС‹</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id} className="bg-gray-900">
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>


                  <div>
                    <label className="block text-sm font-bold text-gray-800 dark:text-white/80 mb-2">
                      Р¦РІРµС‚ РїР»Р°С€РєРё
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
                      РћРїРёСЃР°РЅРёРµ СЂРѕР»Рё
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Р§РµРј Р·Р°РЅРёРјР°РµС‚СЃСЏ СЌС‚Р° СЂРѕР»СЊ? РќР°РїСЂРёРјРµСЂ: РЎР»РµРґРёС‚ Р·Р° РїРѕСЂСЏРґРєРѕРј РІ С‡Р°С‚Р°С…, РїРѕРјРѕРіР°РµС‚ РЅРѕРІРёС‡РєР°Рј"
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
                      РџРѕРєР°Р·С‹РІР°С‚СЊ РІ РїСЂР°РІРёР»Р°С… (/rules в†’ "РљРѕРјР°РЅРґР° trelod")
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
                      РџРѕРєР°Р·С‹РІР°С‚СЊ РІ СЃРёСЃС‚РµРјРµ РѕРїР»Р°С‚С‹ (Р°РґРјРёРЅРєР° в†’ РћРїР»Р°С‚Р°)
                    </label>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-bold text-gray-800 dark:text-white/80">
                        РЈСЂРѕРІРµРЅСЊ РёРµСЂР°СЂС…РёРё
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

                    {/* рџ†• РЈРјРЅС‹Р№ Р±Р»РѕРє РѕРїРёСЃР°РЅРёСЏ СѓСЂРѕРІРЅСЏ */}
                    <div className="mt-3 p-3 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600 dark:text-white/50">РЎС‚Р°С‚СѓСЃ:</span>
                        <span className="text-sm font-bold" style={{ color: getLevelColor(level) }}>
                          {LEVEL_DESCRIPTIONS[level]?.title || "РџРѕР»СЊР·РѕРІР°С‚РµР»СЊСЃРєРёР№ СѓСЂРѕРІРµРЅСЊ"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-800 dark:text-white/70 leading-relaxed">
                        {LEVEL_DESCRIPTIONS[level]?.desc}
                      </p>
                      <div className="flex items-center gap-2 pt-1 border-t border-line dark:border-white/10">
                        <User size={12} className="text-gray-500 dark:text-white/40" />
                        <p className="text-xs text-gray-600 dark:text-white/50">
                          РРґРµР°Р»СЊРЅРѕ РґР»СЏ: <span className="text-gray-800 dark:text-white/80 font-semibold">{LEVEL_DESCRIPTIONS[level]?.bestFor}</span>
                        </p>
                      </div>
                      {level >= 4 && (
                        <p className="text-xs text-green-400/80 mt-1 flex items-center gap-1">
                          <ShieldCheck size={12} />
                          РњРѕР¶РµС‚ Р±Р°РЅРёС‚СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№ СЃ СѓСЂРѕРІРЅРµРј <strong>РЅРёР¶Рµ {level}</strong>
                        </p>
                      )}
                    </div>

                    {level >= maxAssignableLevel - 1 && !me?.is_admin && (
                      <div className="mt-3 flex gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                        <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-200/90">
                          Р’С‹СЃРѕРєРёР№ СѓСЂРѕРІРµРЅСЊ! Р­С‚РѕС‚ РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ СЃРјРѕР¶РµС‚ РїСЂРёРјРµРЅСЏС‚СЊ СЃР°РЅРєС†РёРё РїРѕС‡С‚Рё РєРѕ РІСЃРµРј РѕСЃС‚Р°Р»СЊРЅС‹Рј СЂРѕР»СЏРј.
                        </p>
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-xs text-gray-600 dark:text-white/50 mb-2">РџСЂРµРґРїСЂРѕСЃРјРѕС‚СЂ:</p>
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
                        {name || "РќР°Р·РІР°РЅРёРµ"}
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
                      РџРѕР»РЅРѕРјРѕС‡РёСЏ
                      {!permissionsLoaded && <span className="ml-2 text-xs text-gray-500 dark:text-white/40 animate-pulse">Р—Р°РіСЂСѓР·РєР°...</span>}
                    </label>
                    <div className="space-y-4 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
                      {(() => {
                        // Р“СЂСѓРїРїРёСЂСѓРµРј РїРѕ РєР°С‚РµРіРѕСЂРёСЏРј
                        const grouped: Record<string, any[]> = {};
                        availablePermissions.forEach(p => {
                          const cat = p.category || "system";
                          if (!grouped[cat]) grouped[cat] = [];
                          grouped[cat].push(p);
                        });
                        
                        // РЎРѕСЂС‚РёСЂСѓРµРј РєР°С‚РµРіРѕСЂРёРё
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
                        <p className="text-xs text-gray-500 dark:text-white/40 text-center py-4">РџСЂР°РІР° РЅРµ Р·Р°РіСЂСѓР¶РµРЅС‹</p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button type="submit" loading={saving} disabled={saving} className="flex-1">
                      {saving ? "РЎРѕС…СЂР°РЅРµРЅРёРµ..." : editingRole ? "РЎРѕС…СЂР°РЅРёС‚СЊ" : "РЎРѕР·РґР°С‚СЊ"}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => !saving && setShowForm(false)}
                      disabled={saving}
                      className="flex-1"
                    >
                      РћС‚РјРµРЅР°
                    </Button>
                  </div>
                </form>
                
              </div>
            </div>
          </>
        )}

        {/* рџ—‚пёЏ РњРћР”РђР›РљРђ РЈРџР РђР’Р›Р•РќРРЇ Р“Р РЈРџРџРђРњР */}
        {showCatManager && (
          <>
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200]" onClick={() => !catSaving && setShowCatManager(false)} />
            <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
              <div className="w-full max-w-md border border-line dark:border-white/20 rounded-2xl bg-ivory dark:bg-[#1f1f23]/95 backdrop-blur-md shadow-2xl p-6 pointer-events-auto max-h-[80vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
                    <FolderOpen size={18} className="text-[#8b5cf6]" />
                    {editingCat ? "Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ РіСЂСѓРїРїСѓ" : "РќРѕРІР°СЏ РіСЂСѓРїРїР°"}
                  </h2>
                  <IconButton icon={X} size="iconSm" onClick={() => !catSaving && setShowCatManager(false)} />
                </div>

                <form onSubmit={saveCategory} className="space-y-4 mb-5">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-1.5">РќР°Р·РІР°РЅРёРµ РіСЂСѓРїРїС‹</label>
                    <input
                      value={catName}
                      onChange={(e) => setCatName(e.target.value)}
                      placeholder="РќР°РїСЂРёРјРµСЂ: РњРѕРґРµСЂР°С†РёСЏ, РўРµС…. РѕС‚РґРµР», Р”РёР·Р°Р№РЅ"
                      required
                      className="w-full border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-[#8b5cf6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-1.5">РћРїРёСЃР°РЅРёРµ</label>
                    <input
                      value={catDesc}
                      onChange={(e) => setCatDesc(e.target.value)}
                      placeholder="Р§РµРј Р·Р°РЅРёРјР°РµС‚СЃСЏ СЌС‚РѕС‚ РѕС‚РґРµР»?"
                      className="w-full border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-[#8b5cf6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-1.5">Р¦РІРµС‚</label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={catColor} onChange={(e) => setCatColor(e.target.value)}
                        className="w-12 h-9 rounded-lg border border-line dark:border-white/20 cursor-pointer bg-transparent" />
                      <input type="text" value={catColor} onChange={(e) => setCatColor(e.target.value)}
                        className="flex-1 border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white font-mono text-sm focus:outline-none focus:border-[#8b5cf6]" />
                    </div>
                  </div>
                  <Button type="submit" loading={catSaving} disabled={catSaving || !catName.trim()} className="w-full">
                    {catSaving ? "РЎРѕС…СЂР°РЅРµРЅРёРµ..." : editingCat ? "РЎРѕС…СЂР°РЅРёС‚СЊ" : "РЎРѕР·РґР°С‚СЊ РіСЂСѓРїРїСѓ"}
                  </Button>
                </form>

                <div className="border-t border-line dark:border-white/10 pt-4">
                  <p className="text-xs font-bold text-gray-600 dark:text-white/50 uppercase tracking-wider mb-3">РЎСѓС‰РµСЃС‚РІСѓСЋС‰РёРµ РіСЂСѓРїРїС‹</p>
                  <div className="space-y-2">
                    {categories.length === 0 && <p className="text-xs text-gray-500 dark:text-white/40 text-center py-3">Р“СЂСѓРїРї РїРѕРєР° РЅРµС‚</p>}
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
                  Р“РѕС‚РѕРІРѕ
                </Button>
              </div>
            </div>
          </>
        )}

      </main>
    </div>
  );
}