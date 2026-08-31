"use client";
import { useEffect, useMemo, useState } from "react";
import { getToken } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { StatSkeleton } from "@/components/Skeletons";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Users, Shield, Search, ArrowLeft, X, BarChart3, Clock, Settings,
  ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Ban, ExternalLink, MoreHorizontal, Activity,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const PAGE_SIZE = 10;

type TabMode = "users" | "team";
type SortField = "username" | "level" | "created_at" | "last_seen" | "posts_count" | "messages_count" | "likes_given" | "likes_received" | "visits_count" | "kpi";

function fmtDate(iso?: string | null) { return iso ? new Date(iso).toLocaleDateString("ru-RU") : "вЂ”"; }
function fmtLastSeen(iso?: string | null) {
  if (!iso) return "вЂ”";
  const d = new Date(iso), now = new Date();
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `Сегодня ${time}`;
  if (d.toDateString() === new Date(now.getTime() - 86400000).toDateString()) return `Вчера ${time}`;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" }) + " " + time;
}

function MiniBars({ data, color = "#8b5cf6", height = 36 }: { data: number[]; color?: string; height?: number }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-[3px] w-full" style={{ height }}>
      {data.map((v, i) => (
        <div key={i} className="flex-1 rounded-sm" style={{ height: `${Math.max(6, (v / max) * 100)}%`, background: color, opacity: 0.35 + 0.65 * (v / max) }} />
      ))}
    </div>
  );
}

function KpiRing({ value }: { value: number }) {
  const r = 14, c = 2 * Math.PI * r;
  const color = value >= 70 ? "#22c55e" : value >= 40 ? "#8b5cf6" : "#f59e0b";
  return (
    <div className="relative w-9 h-9 shrink-0">
      <svg width={36} height={36} viewBox="0 0 36 36">
        <circle cx={18} cy={18} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={4} />
        <circle cx={18} cy={18} r={r} fill="none" stroke={color} strokeWidth={4}
          strokeDasharray={`${(value / 100) * c} ${c}`} strokeLinecap="round" transform="rotate(-90 18 18)" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black text-gray-900 dark:text-white">{value}</span>
    </div>
  );
}

function pageList(total: number, current: number): number[] {
  const span = 5;
  let start = Math.max(1, current - 2);
  const end = Math.min(total, start + span - 1);
  start = Math.max(1, end - span + 1);
  const arr: number[] = [];
  for (let p = start; p <= end; p++) arr.push(p);
  return arr;
}

const ALL_COLUMNS = [
  { id: "posts_count", label: "Посты" },
  { id: "messages_count", label: "Сообщения" },
  { id: "likes_given", label: "Лайки поставлено" },
  { id: "likes_received", label: "Лайки получено" },
  { id: "visits_count", label: "Визиты" },
  { id: "kpi", label: "KPI" },
  { id: "group", label: "Группа" },
];

export default function StatPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabMode>("users");
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // users tab
  const [users, setUsers] = useState<any[]>([]);
  const [overview, setOverview] = useState<any>(null);
  const [roles, setRoles] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [activityFilter, setActivityFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(Object.fromEntries(ALL_COLUMNS.map(c => [c.id, true])));
  const [showColsMenu, setShowColsMenu] = useState(false);
  const [menuUserId, setMenuUserId] = useState<number | null>(null);

  // team tab
  const [teamGroups, setTeamGroups] = useState<any[]>([]);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [memberStats, setMemberStats] = useState<any>(null);

  useEffect(() => { checkAuth(); }, []);
  useEffect(() => { if (me) loadData(); }, [activeTab, me]);
  useEffect(() => { setPage(1); }, [searchQuery, roleFilter, activityFilter]);

  async function checkAuth() {
    const token = getToken();
    if (!token) return router.push("/login");
    try {
      const res = await fetch(`${API_URL}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setMe(data);
        if (!(data.is_admin || data.is_moderator || data.permissions?.includes("manage_team_stats"))) router.push("/");
      }
    } catch { router.push("/login"); }
  }

  async function loadData() {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    try {
      if (activeTab === "users") {
        const [ovRes, usRes, rRes, cRes] = await Promise.all([
          fetch(`${API_URL}/api/admin/stats/overview`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_URL}/api/admin/stats/users`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_URL}/api/roles`),
          fetch(`${API_URL}/api/role-categories`),
        ]);
        if (ovRes.ok) setOverview(await ovRes.json());
        if (usRes.ok) setUsers(await usRes.json());
        if (rRes.ok) setRoles(await rRes.json());
        if (cRes.ok) setCats(await cRes.json());
      } else {
        const res = await fetch(`${API_URL}/api/admin/team-statistics`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) setTeamGroups((await res.json()).groups || []);
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }

  async function loadMemberStats(id: number) {
    const token = getToken();
    const res = await fetch(`${API_URL}/api/admin/team-statistics?user_id=${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setMemberStats(await res.json());
  }

  async function toggleBan(u: any) {
    if (!confirm(u.is_banned ? `Разбанить @${u.username}?` : `Забанить @${u.username}?`)) return;
    const token = getToken();
    const res = await fetch(`${API_URL}/api/admin/users/${u.id}/ban`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) loadData();
  }

  function handleSort(field: SortField) {
    if (sortField === field) setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortOrder("desc"); }
  }

  const filtered = useMemo(() => {
    let list = [...users];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(u => u.username.toLowerCase().includes(q) || u.display_name.toLowerCase().includes(q));
    }
    if (roleFilter === "admin") list = list.filter(u => u.is_admin);
    else if (roleFilter === "moderator") list = list.filter(u => u.is_moderator);
    else if (roleFilter === "staff") list = list.filter(u => u.role);
    else if (roleFilter === "norole") list = list.filter(u => !u.role && !u.is_admin && !u.is_moderator);
    if (activityFilter !== "all") {
      const now = Date.now();
      const ls = (u: any) => u.last_seen ? new Date(u.last_seen).getTime() : 0;
      if (activityFilter === "online") list = list.filter(u => now - ls(u) < 15 * 60000);
      else if (activityFilter === "today") list = list.filter(u => new Date(ls(u)).toDateString() === new Date().toDateString());
      else if (activityFilter === "week") list = list.filter(u => now - ls(u) < 7 * 86400000);
      else if (roleFilter !== "dormant" && activityFilter === "dormant") list = list.filter(u => now - ls(u) > 30 * 86400000);
    }
    list.sort((a, b) => {
      let av: any = a[sortField], bv: any = b[sortField];
      if (sortField === "created_at" || sortField === "last_seen") { av = av ? new Date(av).getTime() : 0; bv = bv ? new Date(bv).getTime() : 0; }
      if (sortField === "username") { av = (av || "").toLowerCase(); bv = (bv || "").toLowerCase(); }
      if (av < bv) return sortOrder === "asc" ? -1 : 1;
      if (av > bv) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [users, searchQuery, roleFilter, activityFilter, sortField, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const avgKpi = users.length ? Math.round(users.reduce((s, u) => s + (u.kpi || 0), 0) / users.length) : 0;
  const canBan = !!me && (me.is_admin || me.permissions?.includes("ban_users"));

  const catByRoleId = (roleId?: number) => {
    const r = roles.find(x => x.id === roleId);
    return r?.category_id ? cats.find(c => c.id === r.category_id) : null;
  };

  const th = (field: SortField, label: string) => (
    <th className="text-left p-3 text-gray-600 dark:text-white/50 font-bold text-xs uppercase cursor-pointer hover:text-gray-900 dark:hover:text-white select-none whitespace-nowrap" onClick={() => handleSort(field)}>
      {label} {sortField === field && (sortOrder === "asc" ? "в†‘" : "в†“")}
    </th>
  );

  if (loading) return <StatSkeleton />;

  return (
    <div className="min-h-screen bg-paper dark:bg-[#171717]">
      <div className="max-w-7xl mx-auto px-4 py-10">
        {/* Шапка */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 rounded-lg bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10"><ArrowLeft size={20} /></Link>
            <div>
              <h1 className="text-3xl font-black text-gray-900 dark:text-white">Панель команды</h1>
              <p className="text-gray-600 dark:text-white/50 text-sm mt-1">Статистика и управление проектом</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setActiveTab("users")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === "users" ? "bg-purple-500 text-white" : "bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/60 hover:bg-gray-200 dark:hover:bg-white/10"}`}>
              <Users size={16} /> Пользователи
            </button>
            <button onClick={() => setActiveTab("team")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === "team" ? "bg-purple-500 text-white" : "bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/60 hover:bg-gray-200 dark:hover:bg-white/10"}`}>
              <Shield size={16} /> Команда
            </button>
          </div>
        </div>

        {/* ========== ВКЛАДКА: РџРћР›Р¬Р—РћР’РђРўР•Р›Р ========== */}
        {activeTab === "users" && overview && (
          <div className="space-y-6">
            {/* ОБЗОР */}
            <div>
              <h2 className="text-xs font-black uppercase text-gray-600 dark:text-white/50 mb-3">Общие показатели</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                <div className="bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/10 rounded-xl p-4">
                  <p className="text-gray-600 dark:text-white/50 text-xs mb-1">Всего пользователей</p>
                  <p className="text-2xl font-black text-gray-900 dark:text-white mb-3">{overview.total_users}</p>
                  <MiniBars data={overview.reg_series.map((r: any) => r.count)} />
                </div>
                <div className="bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/10 rounded-xl p-4">
                  <p className="text-gray-600 dark:text-white/50 text-xs mb-1 flex items-center gap-1"><Activity size={12} /> Активные (MAU/DAU)</p>
                  <div className="flex gap-4 mb-3">
                    <div><p className="text-xl font-black text-gray-900 dark:text-white">{overview.mau}</p><p className="text-[10px] text-gray-500 dark:text-white/40">месяц</p></div>
                    <div><p className="text-xl font-black text-green-600 dark:text-green-400">{overview.dau}</p><p className="text-[10px] text-gray-500 dark:text-white/40">день</p></div>
                  </div>
                  <MiniBars data={overview.post_series.map((r: any) => r.count)} color="#22c55e" />
                </div>
                <div className="bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/10 rounded-xl p-4">
                  <p className="text-gray-600 dark:text-white/50 text-xs mb-1">Регистрации сегодня</p>
                  <p className="text-2xl font-black text-gray-900 dark:text-white">{overview.reg_today}</p>
                  <p className={`text-xs mt-2 font-bold ${overview.reg_today - overview.reg_yesterday >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                    {overview.reg_today - overview.reg_yesterday >= 0 ? "в†‘ +" : "в†“ "}{overview.reg_today - overview.reg_yesterday} к вчера
                  </p>
                  <p className="text-[10px] text-gray-500 dark:text-white/40 mt-1">Онлайн сейчас: {overview.online}</p>
                </div>
                <div className="bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/10 rounded-xl p-4">
                  <p className="text-gray-600 dark:text-white/50 text-xs mb-1">Загальний KPI</p>
                  <p className="text-2xl font-black text-gray-900 dark:text-white mb-3">{avgKpi}</p>
                  <div className="h-1.5 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full bg-purple-500" style={{ width: `${avgKpi}%` }} />
                  </div>
                  <p className="text-[10px] text-gray-500 dark:text-white/40 mt-2">Средняя оценка активности</p>
                </div>
                <div className="bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/10 rounded-xl p-4">
                  <p className="text-gray-600 dark:text-white/50 text-xs mb-3">РСЃРїРѕР»СЊР·РѕРІР°РЅРёРµ фич</p>
                  <div className="flex items-end gap-3 h-14">
                    {[
                      { v: overview.total_posts, l: "Посты", c: "#8b5cf6" },
                      { v: overview.total_messages, l: "Сообщ.", c: "#22c55e" },
                      { v: overview.total_likes, l: "Лайки", c: "#f59e0b" },
                    ].map((f) => {
                      const max = Math.max(overview.total_posts, overview.total_messages, overview.total_likes, 1);
                      return (
                        <div key={f.l} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                          <div className="w-full rounded-t" style={{ height: `${Math.max(6, (f.v / max) * 100)}%`, background: f.c }} />
                          <span className="text-[9px] text-gray-500 dark:text-white/40">{f.l}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Р¤РР›Р¬РўР Р« */}
            <div className="flex gap-3 items-center p-4 bg-gray-100 dark:bg-white/5 rounded-xl border border-line dark:border-white/10 flex-wrap relative">
              <div className="flex-1 min-w-[200px] relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-white/40" size={18} />
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Поиск пользователей..."
                  className="w-full pl-10 pr-4 py-2 rounded-lg bg-paper dark:bg-[#171717] border border-line dark:border-white/10 text-gray-900 dark:text-white focus:border-purple-500 outline-none" />
              </div>
              <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
                className="px-3 py-2 rounded-lg bg-paper dark:bg-[#171717] border border-line dark:border-white/10 text-gray-900 dark:text-white text-sm outline-none">
                <option value="all">Все роли</option>
                <option value="admin">Founder</option>
                <option value="moderator">Модераторы</option>
                <option value="staff">С ролью</option>
                <option value="norole">Без роли</option>
              </select>
              <select value={activityFilter} onChange={(e) => setActivityFilter(e.target.value)}
                className="px-3 py-2 rounded-lg bg-paper dark:bg-[#171717] border border-line dark:border-white/10 text-gray-900 dark:text-white text-sm outline-none">
                <option value="all">Любая активность</option>
                <option value="online">Онлайн сейчас</option>
                <option value="today">Были сегодня</option>
                <option value="week">Активны за 7 дней</option>
                <option value="dormant">Спят 30+ дней</option>
              </select>
              <div className="relative">
                <button onClick={() => setShowColsMenu(!showColsMenu)} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-paper dark:bg-[#171717] border border-line dark:border-white/10 text-gray-800 dark:text-white/70 text-sm hover:text-gray-900 dark:hover:text-white">
                  Колонки <ChevronDown size={14} />
                </button>
                {showColsMenu && (
                  <div className="absolute right-0 top-11 z-50 w-48 bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-xl p-2 space-y-1">
                    {ALL_COLUMNS.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 text-sm text-gray-800 dark:text-white/80 cursor-pointer">
                        <input type="checkbox" checked={visibleCols[c.id]} className="accent-purple-500"
                          onChange={() => setVisibleCols({ ...visibleCols, [c.id]: !visibleCols[c.id] })} />
                        {c.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* РўРђР‘Р›РР¦Рђ */}
            <div className="bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/10 rounded-xl overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[900px]">
                <thead>
                  <tr className="border-b border-line dark:border-white/10 bg-gray-100 dark:bg-white/5">
                    <th className="text-left p-3 text-gray-600 dark:text-white/50 font-bold text-xs uppercase">#</th>
                    {th("username", "Аватар + имя")}
                    {th("level", "Роль")}
                    {th("created_at", "Регистрация")}
                    {th("last_seen", "Активность")}
                    {visibleCols.posts_count && th("posts_count", "Посты")}
                    {visibleCols.messages_count && th("messages_count", "Сообщения")}
                    {visibleCols.likes_given && th("likes_given", "Лайки пост.")}
                    {visibleCols.likes_received && th("likes_received", "Лайки получ.")}
                    {visibleCols.visits_count && th("visits_count", "Визиты")}
                    {visibleCols.kpi && th("kpi", "KPI")}
                    {visibleCols.group && <th className="text-left p-3 text-gray-600 dark:text-white/50 font-bold text-xs uppercase">Группа</th>}
                    <th className="text-right p-3 text-gray-600 dark:text-white/50 font-bold text-xs uppercase">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line dark:divide-white/5">
                  {paged.map((u, i) => {
                    const cat = catByRoleId(u.role?.id);
                    const roleName = u.is_admin ? "Founder" : u.is_moderator ? "Модератор" : u.role?.name || "Пользователь";
                    const roleColor = u.is_admin ? "#ffffff" : u.is_moderator ? "#3b82f6" : u.role?.color || "#6b7280";
                    return (
                      <tr key={u.id} className="hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
                        <td className="p-3 text-gray-500 dark:text-white/40">{(page - 1) * PAGE_SIZE + i + 1}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-3">
                            <Avatar src={u.avatar_url} name={u.display_name} id={u.id} size={32} />
                            <div>
                              <p className="text-gray-900 dark:text-white font-bold">{u.display_name}</p>
                              <p className="text-gray-500 dark:text-white/40 text-xs">@{u.username}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-1 rounded-md text-[10px] font-black uppercase border"
                            style={{ background: `${roleColor}15`, color: roleColor, borderColor: `${roleColor}40` }}>
                            {roleName}
                          </span>
                        </td>
                        <td className="p-3 text-gray-600 dark:text-white/60 whitespace-nowrap">{fmtDate(u.created_at)}</td>
                        <td className="p-3 text-gray-600 dark:text-white/60 whitespace-nowrap">{fmtLastSeen(u.last_seen)}</td>
                        {visibleCols.posts_count && <td className="p-3 text-gray-800 dark:text-white/80 font-bold">{u.posts_count}</td>}
                        {visibleCols.messages_count && <td className="p-3 text-gray-800 dark:text-white/70">{u.messages_count}</td>}
                        {visibleCols.likes_given && <td className="p-3 text-gray-800 dark:text-white/70">{u.likes_given}</td>}
                        {visibleCols.likes_received && <td className="p-3 text-gray-800 dark:text-white/70">{u.likes_received}</td>}
                        {visibleCols.visits_count && <td className="p-3 text-gray-800 dark:text-white/70">{u.visits_count}</td>}
                        {visibleCols.kpi && <td className="p-3"><KpiRing value={u.kpi || 0} /></td>}
                        {visibleCols.group && (
                          <td className="p-3">
                            {cat ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: `${cat.color}20`, color: cat.color }}>{cat.name}</span>
                            ) : <span className="text-gray-500 dark:text-white/30">вЂ”</span>}
                          </td>
                        )}
                        <td className="p-3 text-right relative">
                          <button onClick={() => setMenuUserId(menuUserId === u.id ? null : u.id)}
                            className="p-1.5 rounded-lg text-gray-600 dark:text-white/50 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10">
                            <MoreHorizontal size={16} />
                          </button>
                          {menuUserId === u.id && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setMenuUserId(null)} />
                              <div className="absolute right-4 top-12 z-50 w-44 bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-xl p-1.5 space-y-0.5 text-left">
                                <button onClick={() => router.push(`/profile/${u.username}`)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-800 dark:text-white/80 hover:bg-gray-100 dark:hover:bg-white/5">
                                  <ExternalLink size={14} /> Профиль
                                </button>
                                <button onClick={() => { setMenuUserId(null); setSelectedMember({ user: u, role: u.role, level: u.level }); loadMemberStats(u.id); }}
                                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-800 dark:text-white/80 hover:bg-gray-100 dark:hover:bg-white/5">
                                  <BarChart3 size={14} /> Статистика
                                </button>
                                {canBan && (
                                  <button onClick={() => { setMenuUserId(null); toggleBan(u); }}
                                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${u.is_banned ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"} hover:bg-gray-100 dark:hover:bg-white/5`}>
                                    <Ban size={14} /> {u.is_banned ? "Разбанить" : "Забанить"}
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && <p className="text-center text-gray-500 dark:text-white/40 py-12">Никого не нашли</p>}
            </div>

            {/* РџРђР“РРќРђР¦РРЇ */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1">
                <button disabled={page === 1} onClick={() => setPage(1)} className="p-2 rounded-lg bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/60 disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-white/10"><ChevronsLeft size={16} /></button>
                <button disabled={page === 1} onClick={() => setPage(page - 1)} className="p-2 rounded-lg bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/60 disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-white/10"><ChevronLeft size={16} /></button>
                {pageList(totalPages, page).map(p => (
                  <button key={p} onClick={() => setPage(p)}
                    className={`w-9 h-9 rounded-lg text-sm font-bold ${p === page ? "bg-purple-500 text-white" : "bg-gray-100 dark:bg-white/5 text-white/60 hover:bg-gray-100 dark:hover:bg-white/10"}`}>
                    {p}
                  </button>
                ))}
                <button disabled={page === totalPages} onClick={() => setPage(page + 1)} className="p-2 rounded-lg bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/60 disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-white/10"><ChevronRight size={16} /></button>
                <button disabled={page === totalPages} onClick={() => setPage(totalPages)} className="p-2 rounded-lg bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/60 disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-white/10"><ChevronsRight size={16} /></button>
              </div>
            )}
          </div>
        )}

        {/* ========== ВКЛАДКА: КОМАНДА ========== */}
        {activeTab === "team" && (
          <div className="space-y-6">
            <h2 className="text-2xl font-black text-gray-900 dark:text-white uppercase"> Команда</h2>
            {teamGroups.length === 0 ? (
              <div className="text-center py-16 border border-line dark:border-white/10 rounded-2xl bg-gray-100 dark:bg-white/5">
                <Shield size={48} className="mx-auto text-gray-500 dark:text-white/20 mb-4" />
                <p className="text-gray-600 dark:text-white/50 text-lg">Команда проекта пуста</p>
              </div>
            ) : (
              teamGroups.map((group) => (
                <div key={group.id} className="space-y-4">
                  <div className="flex items-center gap-3 pb-2 border-b border-line dark:border-white/10">
                    <div className="w-1 h-6 rounded-full" style={{ backgroundColor: group.color }} />
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white uppercase tracking-wide">{group.name}</h3>
                    <span className="text-xs text-gray-500 dark:text-white/40 bg-gray-100 dark:bg-white/5 px-2 py-0.5 rounded-full">{group.members.length} чел.</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {group.members.map((member: any) => (
                      <div key={member.user.id} onClick={() => { setSelectedMember(member); loadMemberStats(member.user.id); }}
                        className="bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/10 rounded-xl p-4 hover:border-purple-500/50 transition-all cursor-pointer group">
                        <div className="flex items-start gap-3 mb-3">
                          <Avatar src={member.user.avatar_url} name={member.user.display_name} id={member.user.id} size={48} />
                          <div className="flex-1 min-w-0">
                            <h4 className="text-gray-900 dark:text-white font-bold truncate">{member.user.display_name}</h4>
                            <p className="text-gray-500 dark:text-white/40 text-xs truncate">@{member.user.username}</p>
                          </div>
                        </div>
                        {member.role && (
                          <div className="mb-3">
                            <span className="inline-block px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border"
                              style={{ background: `${member.role.color}15`, color: member.role.color, borderColor: `${member.role.color}40` }}>
                              {member.role.name}
                            </span>
                          </div>
                        )}
                        <div className="space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-gray-600 dark:text-white/50">Действий:</span>
                            <span className="text-gray-900 dark:text-white font-bold">{member.actions_count || 0}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-gray-600 dark:text-white/50">Был(а):</span>
                            <span className="text-gray-600 dark:text-white/60">{fmtLastSeen(member.user.last_seen)}</span>
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-line dark:border-white/10">
                          <div className="w-full flex items-center justify-center gap-2 py-1.5 rounded-lg bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/60 text-xs font-bold group-hover:bg-purple-500/20 group-hover:text-purple-600 dark:group-hover:text-purple-300 transition-all">
                            <BarChart3 size={14} /> Детальная статистика
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Модалка детальной статистики */}
      {selectedMember && memberStats && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[400] flex items-center justify-center p-4">
          <div className="w-full max-w-5xl bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-ivory dark:bg-[#1f1f23] border-b border-line dark:border-white/10 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar src={selectedMember.user.avatar_url} name={selectedMember.user.display_name} id={selectedMember.user.id} size={40} />
                <div>
                  <h3 className="text-lg font-black text-gray-900 dark:text-white">{selectedMember.user.display_name}</h3>
                  <p className="text-sm text-gray-600 dark:text-white/50">{selectedMember.role?.name || "Без роли"}</p>
                </div>
              </div>
              <button onClick={() => { setSelectedMember(null); setMemberStats(null); }} className="p-2 rounded-lg bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-100 dark:bg-white/5 rounded-xl p-4 border border-line dark:border-white/10">
                  <p className="text-gray-500 dark:text-white/40 text-xs mb-1">Всего действий</p>
                  <p className="text-2xl font-black text-gray-900 dark:text-white">{memberStats.total_actions || 0}</p>
                </div>
                <div className="bg-gray-100 dark:bg-white/5 rounded-xl p-4 border border-line dark:border-white/10">
                  <p className="text-gray-500 dark:text-white/40 text-xs mb-1">Уровень</p>
                  <p className="text-2xl font-black text-purple-600 dark:text-purple-400">Lvl {selectedMember.role?.level || selectedMember.level || 1}</p>
                </div>
                <div className="bg-gray-100 dark:bg-white/5 rounded-xl p-4 border border-line dark:border-white/10">
                  <p className="text-gray-500 dark:text-white/40 text-xs mb-1">Последний вход</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{fmtLastSeen(selectedMember.user.last_seen)}</p>
                </div>
                <div className="bg-gray-100 dark:bg-white/5 rounded-xl p-4 border border-line dark:border-white/10">
                  <p className="text-gray-500 dark:text-white/40 text-xs mb-1">KPI</p>
                  <div className="flex items-center gap-3"><KpiRing value={selectedMember.kpi || memberStats.total_actions ? Math.min(100, selectedMember.kpi || 50) : 0} /><span className="text-gray-600 dark:text-white/60 text-sm">/ 100</span></div>
                </div>
              </div>
              <div className="bg-gray-100 dark:bg-white/5 rounded-xl p-4 border border-line dark:border-white/10">
                <h4 className="text-gray-900 dark:text-white font-bold mb-4 flex items-center gap-2"><Clock size={18} /> РСЃС‚РѕСЂРёСЏ действий</h4>
                {memberStats.actions?.length > 0 ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {memberStats.actions.map((action: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-paper dark:bg-[#171717] border border-line dark:border-white/5">
                        <div>
                          <p className="text-gray-900 dark:text-white text-sm font-bold">{action.action_type}</p>
                          <p className="text-gray-500 dark:text-white/40 text-xs">{action.target_type && action.target_id ? `${action.target_type} #${action.target_id}` : ""}</p>
                        </div>
                        <p className="text-gray-500 dark:text-white/40 text-xs">{new Date(action.created_at).toLocaleString("ru-RU")}</p>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-gray-500 dark:text-white/40 text-sm text-center py-8">Нет записей</p>}
              </div>
              {memberStats.role_history?.length > 0 && (
                <div className="bg-gray-100 dark:bg-white/5 rounded-xl p-4 border border-line dark:border-white/10">
                  <h4 className="text-gray-900 dark:text-white font-bold mb-4 flex items-center gap-2"><Settings size={18} /> РСЃС‚РѕСЂРёСЏ выдачи роли</h4>
                  <div className="space-y-2">
                    {memberStats.role_history.map((role: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-paper dark:bg-[#171717] border border-line dark:border-white/5">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-gray-500 dark:text-white/40 text-sm">{role.old_role || "вЂ”"}</span>
                          <ArrowRight size={16} className="text-gray-500 dark:text-white/40" />
                          <span className="text-purple-600 dark:text-purple-400 text-sm font-bold">{role.new_role || "вЂ”"}</span>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          {role.changed_by && (
                            <Link href={`/user/${role.changed_by.id}`} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-white/60 hover:text-[#8b5cf6] transition-colors" title={`Выдал: ${role.changed_by.display_name || role.changed_by.username}`}>
                              <Users size={12} /> {role.changed_by.display_name || role.changed_by.username}
                            </Link>
                          )}
                          <p className="text-gray-500 dark:text-white/40 text-xs">{fmtDate(role.changed_at)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ArrowRight({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}