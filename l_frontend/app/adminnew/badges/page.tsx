"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, getUserLevel } from "@/lib/auth";
import { Plus, Shield, Gift, List, Sparkles } from "lucide-react";
import { CustomBadgeForm } from "@/components/admin/badges/CustomBadgeForm";
import { CustomBadgeAssignForm } from "@/components/admin/badges/CustomBadgeAssignForm";
import { CustomBadgeList } from "@/components/admin/badges/CustomBadgeList";

type TabId = "my" | "assign" | "assigned";

interface CustomBadgeData {
  id: number;
  name: string;
  description: string | null;
  icon_url: string | null;
  text_content: string | null;
  bg_type: string;
  bg_color: string | null;
  bg_gradient: string | null;
  bg_gradient_type: string | null;
  bg_gradient_angle: number | null;
  bg_image_url: string | null;
  bg_image_mode: string | null;
  border_color: string | null;
  border_width: number | null;
  border_style: string | null;
  border_glow: boolean;
  border_glow_intensity: number | null;
  animation_flags: string | null;
  animation_speed: string | null;
  shadow_enabled: boolean;
  shadow_blur: number | null;
  shadow_offset_x: number | null;
  shadow_offset_y: number | null;
  shadow_color: string | null;
  inner_glow_enabled: boolean;
  inner_glow_intensity: number | null;
  specular_enabled: boolean;
  metallic_enabled: boolean;
  priority: number | null;
  is_active: boolean;
  created_at: string;
}

interface AssignmentData {
  id: number;
  user_id: number;
  badge_id: number;
  badge: CustomBadgeData | null;
  granted_by: number;
  granted_at: string;
  expires_at: string | null;
  is_active: boolean;
  custom_message: string | null;
}

export default function BadgesAdminPage() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<TabId>("my");
  const [badges, setBadges] = useState<CustomBadgeData[]>([]);
  const [badgesLoading, setBadgesLoading] = useState(false);
  const [assignments, setAssignments] = useState<AssignmentData[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formBadge, setFormBadge] = useState<CustomBadgeData | null>(null);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [assignBadge, setAssignBadge] = useState<CustomBadgeData | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const token = getToken();
    if (!token) { router.push("/login"); return; }
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json()).then((data) => {
      setMe(data);
      if ((data.level ?? getUserLevel(data)) < 9) { router.push("/"); }
    });
  }, [router]);

  const fetchBadges = async () => {
    const token = getToken();
    if (!token) return;
    setBadgesLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/custom-badges`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { const data = await res.json(); setBadges(data); }
    } finally { setBadgesLoading(false); }
  };

  const fetchAssignments = async () => {
    const token = getToken();
    if (!token) return;
    setAssignmentsLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/custom-badge-assignments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { const data = await res.json(); setAssignments(data); }
    } finally { setAssignmentsLoading(false); }
  };

  useEffect(() => {
    if (me && (me.level ?? getUserLevel(me)) >= 9) { fetchBadges(); fetchAssignments(); }
  }, [me]);

  const deleteBadge = async (badgeId: number) => {
    if (!confirm("Удалить эту плашку? Это действие нельзя отменить.")) return;
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/custom-badges/${badgeId}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { setBadges(badges.filter((b) => b.id !== badgeId)); }
    } catch (e) { console.error(e); }
  };

  const revokeAssignment = async (assignId: number) => {
    if (!confirm("Отозвать плашку у этого пользователя?")) return;
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/custom-badge-assignments/${assignId}/revoke`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setAssignments(assignments.map((a) => a.id === assignId ? { ...a, is_active: false } : a));
      }
    } catch (e) { console.error(e); }
  };

  const extendAssignment = async (assignId: number, days: number) => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/custom-badge-assignments/${assignId}/extend`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ days }),
      });
      if (res.ok) {
        const updated = await res.json();
        setAssignments(assignments.map((a) => (a.id === assignId ? updated : a)));
      }
    } catch (e) { console.error(e); }
  };

  const handleBadgeSuccess = (badge: any) => {
    if (formBadge) {
      setBadges(badges.map((b) => (b.id === badge.id ? badge : b)));
    } else {
      setBadges([badge, ...badges]);
    }
  };

  const handleAssignmentSuccess = () => { fetchAssignments(); };

  const filteredBadges = badges.filter(b => b.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredAssignments = assignments.filter(a =>
    (a.badge?.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (a.badge?.text_content || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
  };

  if (!me || (me.level ?? getUserLevel(me)) < 9) { return null; }
  const level = me.level ?? getUserLevel(me);

  return (
    <div className="min-h-screen bg-[#101010] text-white">
      <div className="max-w-6xl mx-auto p-4 pt-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Shield className="text-blue-400" /> Кастомные плашки</h1>
            <p className="text-sm text-gray-400 mt-1">Управление кастомными плашками (level {level})</p>
          </div>
        </div>

        <div className="flex gap-1 mb-6 bg-[#171717] p-1 rounded-lg border border-white/10">
          <button onClick={() => setActiveTab("my")} className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${activeTab === "my" ? "bg-blue-500/20 text-blue-400" : "text-gray-400 hover:text-gray-300"}`}>
            <List className="inline mr-2" size={16} /> Мои плашки
          </button>
          <button onClick={() => setActiveTab("assign")} className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${activeTab === "assign" ? "bg-blue-500/20 text-blue-400" : "text-gray-400 hover:text-gray-300"}`}>
            <Gift className="inline mr-2" size={16} /> Выдать плашку
          </button>
          <button onClick={() => setActiveTab("assigned")} className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${activeTab === "assigned" ? "bg-blue-500/20 text-blue-400" : "text-gray-400 hover:text-gray-300"}`}>
            <Sparkles className="inline mr-2" size={16} /> Выданные плашки
          </button>
        </div>

        {activeTab === "my" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Поиск плашек..."
                className="px-3 py-1.5 bg-[#1a1a1a] border border-white/10 rounded-lg text-sm focus:outline-none focus:border-blue-500/50" />
              <button onClick={() => { setFormBadge(null); setShowForm(true); }}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                <Plus size={16} /> Создать плашку
              </button>
            </div>
            <CustomBadgeList badges={filteredBadges} loading={badgesLoading}
              onEdit={(badge) => { setFormBadge(badge); setShowForm(true); }}
              onDelete={deleteBadge}
              onAssign={(badge) => { setAssignBadge(badge); setShowAssignForm(true); }} />
          </div>
        )}

        {activeTab === "assign" && (
          <div className="bg-[#171717] border border-white/10 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Выдача плашки пользователю</h2>
            <CustomBadgeAssignForm badges={badges} onSuccess={handleAssignmentSuccess} />
          </div>
        )}

        {activeTab === "assigned" && (
          <div className="space-y-4">
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Поиск выданных плашек..."
              className="w-full px-3 py-2 bg-[#1a1a1a] border border-white/10 rounded-lg text-sm focus:outline-none focus:border-blue-500/50" />
            <div className="bg-[#171717] border border-white/10 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead><tr className="border-b border-white/10">
                  <th className="text-left p-4 text-sm font-medium text-gray-300">Пользователь</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-300">Плашка</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-300">Выдана</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-300">Истекает</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-300">Статус</th>
                  <th className="text-right p-4 text-sm font-medium text-gray-300">Действия</th>
                </tr></thead>
                <tbody>
                  {assignmentsLoading ? <tr><td colSpan={6} className="p-8 text-center text-gray-400">Загрузка...</td></tr>
                  : filteredAssignments.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-gray-400">Нет выданных плашек</td></tr>
: filteredAssignments.map((a) => (
    <tr key={a.id} className="border-b border-white/5">
      <td className="p-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#1a1a1a]"></div>
          <span className="text-sm">ID: {a.user_id}</span>
        </div>
      </td>
      <td className="p-4">{a.badge?.name || "—"}</td>
      <td className="p-4 text-sm text-gray-400">{formatDate(a.granted_at)}</td>
      <td className="p-4 text-sm text-gray-400">
        {a.expires_at ? formatDate(a.expires_at) : <span className="text-green-400">Бессрочно</span>}
      </td>
      <td className="p-4">
        <span className={`px-2 py-1 rounded text-xs ${a.is_active ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"}`}>
          {a.is_active ? "Активна" : "Истекла"}
        </span>
      </td>
      <td className="p-4 text-right">
        <div className="flex justify-end gap-1">
          <button onClick={() => extendAssignment(a.id, 30)} className="px-2 py-1 text-xs bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded">+30 дней</button>
          <button onClick={() => revokeAssignment(a.id)} className="px-2 py-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded">Отозвать</button>
        </div>
      </td>
    </tr>
  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showForm && <CustomBadgeForm badge={formBadge || undefined} onClose={() => setShowForm(false)} onSuccess={handleBadgeSuccess} />}
      {showAssignForm && assignBadge && <CustomBadgeAssignForm badge={assignBadge} onClose={() => setShowAssignForm(false)} onSuccess={handleAssignmentSuccess} />}
    </div>
  );
}
