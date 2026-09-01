"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Crown, Users, Activity, DollarSign, AlertTriangle, Shield,
  BarChart3, Database, GitBranch, Eye, Clock, Zap, TrendingUp, FileText,
  ArrowLeft,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Sidebar } from "@/components/Sidebar";

interface OwnerStats {
  total_users: number;
  dau: number;
  monthly_revenue: number;
  total_revenue: number;
  username_sales: number;
  pending_reports: number;
  posts_per_day: number;
  messages_per_day: number;
  new_chats_per_day: number;
  top_users?: { display_name: string; username: string; posts_count: number }[];
  audit_logs?: { time: string; user: string; action: string; ip: string }[];
  shop_enabled?: boolean;
  premium_usernames_total?: number;
}

type OwnerTab = "analytics" | "users" | "financial" | "system" | "audit" | "backup";

const OWNER_TABS: { id: OwnerTab; label: string; icon: any }[] = [
  { id: "analytics", label: "Аналитика", icon: BarChart3 },
  { id: "users", label: "Пользователи", icon: Users },
  { id: "financial", label: "Финансы", icon: DollarSign },
  { id: "system", label: "Система", icon: Database },
  { id: "audit", label: "Аудит", icon: FileText },
  { id: "backup", label: "Бэкапы", icon: GitBranch },
];

function MetricCard({ icon: Icon, title, value, change, tint }: {
  icon: typeof Users; title: string; value: string | number; change: string; tint?: string;
}) {
  return (
    <div className="bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/10 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-600 dark:text-white/50">{title}</p>
        <Icon size={16} className={tint || "text-[#8b5cf6]"} />
      </div>
      <p className="text-2xl font-black text-gray-900 dark:text-white">{value}</p>
      <p className="text-[11px] text-gray-500 dark:text-white/40 mt-1">{change}</p>
    </div>
  );
}

export default function OwnerPanel() {
  const router = useRouter();
  const { t } = useI18n();
  const { hasPermission, isLoading } = usePermissions();
  const [stats, setStats] = useState<OwnerStats | null>(null);
  const [tab, setTab] = useState<OwnerTab>("analytics");

  useEffect(() => {
    if (!isLoading && !hasPermission("access_owner_panel")) { router.push("/"); return; }
    if (isLoading) return;
    let alive = true;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/owner-panel/stats`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("denied"))))
      .then((d) => { if (alive) setStats(d as OwnerStats); })
      .catch(() => { if (alive) router.push("/"); });
    return () => { alive = false; };
  }, [isLoading, hasPermission, router]);

  if (isLoading || !stats) {
    return (
      <div className="h-screen flex overflow-hidden bg-ivory dark:bg-[#18181b]">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-4 py-10">
            <div className="h-10 w-1/3 rounded-lg bg-gray-100 dark:bg-white/5 mb-8" />
            <div className="grid md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_: unknown, i: number) => (
                <div key={i} className="h-28 rounded-xl bg-gray-100 dark:bg-white/5" />
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }
  return (
    <div className="h-screen flex overflow-hidden bg-ivory dark:bg-[#18181b]">
      <Sidebar />
      <div className="w-px shrink-0 bg-gray-100 dark:bg-white/10 my-3 hidden md:block" />
      <main className="flex-1 overflow-y-auto border-x border-line dark:border-white/10">
      <div className="max-w-6xl mx-auto px-4 py-10">
      {/* ==== ШАПКА ==== */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/adminnew")}
            title="Назад в админ-панель"
            className="w-10 h-10 rounded-full flex items-center justify-center border border-line dark:border-white/10 text-gray-600 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
          <h1 className="text-3xl font-black flex items-center gap-3">
            <Crown size={30} className="text-amber-500" />
            {t("nav.ownerPanel")}
          </h1>
          <p className="text-gray-600 dark:text-white/50 text-sm">Полный контроль над платформой. Только для владельцев и фаундеров.</p>
          </div>
        </div>
        <Button variant="secondary" icon={Shield}>Безопасный доступ</Button>
      </div>

      {/* ==== МЕТРИКИ ==== */}
      <div className="grid md:grid-cols-4 gap-4">
        <MetricCard icon={Users} title="Всего пользователей" value={stats.total_users} change="за всё время" />
        <MetricCard icon={Activity} title="Активность (DAU)" value={stats.dau} change="за 24 часа" tint="text-green-500" />
        <MetricCard icon={DollarSign} title="Доход (месяц)" value={`$${stats.monthly_revenue}`} change="платежи за 30 дней" />
        <MetricCard icon={AlertTriangle} title="Репорты" value={stats.pending_reports} change="в очереди" tint={stats.pending_reports > 0 ? "text-red-500" : "text-gray-400"} />
      </div>
{/* ==== ВКЛАДКИ ==== */}
      <div className="flex flex-wrap gap-2 mt-8">
        {OWNER_TABS.map((n) => (
          <button key={n.id} onClick={() => setTab(n.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === n.id ? "bg-purple-500 text-white" : "bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/60 hover:bg-gray-200 dark:hover:bg-white/10"}`}>
            <n.icon size={16} /> {n.label}
          </button>
        ))}
      </div>

      <div className="space-y-6 mt-6">
        {tab === "analytics" && (
          <div className="bg-gray-100 dark:bg-white/5 rounded-xl p-5 border border-line dark:border-white/10">
            <h2 className="text-sm font-black mb-4 flex items-center gap-2"><TrendingUp size={18} /> Активность за день</h2>
            <div className="grid grid-cols-3 gap-4">
              <div><p className="text-2xl font-black">{stats.posts_per_day}</p><p className="text-xs text-gray-500 dark:text-white/40">постов</p></div>
              <div><p className="text-2xl font-black">{stats.messages_per_day}</p><p className="text-xs text-gray-500 dark:text-white/40">сообщений</p></div>
              <div><p className="text-2xl font-black">{stats.new_chats_per_day}</p><p className="text-xs text-gray-500 dark:text-white/40">новых чатов</p></div>
            </div>
            <h2 className="text-sm font-black mb-4 mt-6 flex items-center gap-2"><Crown size={18} /> Топ-активные пользователи</h2>
            <div className="space-y-2">
              {(stats.top_users || []).map((u: { display_name: string; username: string; posts_count: number }, i: number) => (
                <div key={i} className="flex items-center justify-between border-b py-2 text-sm">
                  <span className="text-gray-500 dark:text-white/40">#{i + 1}</span>
                  <span className="font-medium">{u.display_name}</span>
                  <span className="text-gray-500 dark:text-white/40">@{u.username}</span>
                  <span className="rounded-md bg-purple-500/10 px-2 py-0.5 text-xs">{u.posts_count} постов</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ---------- ОСТАЛЬНЫЕ ВКЛАДКИ ---------- */}
{tab === "users" && (
          <div className="bg-gray-100 dark:bg-white/5 rounded-xl p-5 border border-line dark:border-white/10">
            <h2 className="text-sm font-black mb-4 flex items-center gap-2"><Users size={18} /> Пользователи</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><p className="text-2xl font-black">{stats.total_users}</p><p className="text-xs text-gray-500 dark:text-white/40">всего</p></div>
              <div><p className="text-2xl font-black">{stats.dau}</p><p className="text-xs text-gray-500 dark:text-white/40">DAU</p></div>
              <div><p className="text-2xl font-black">{stats.pending_reports}</p><p className="text-xs text-gray-500 dark:text-white/40">репортов</p></div>
              <div><p className="text-2xl font-black">{stats.premium_usernames_total || 0}</p><p className="text-xs text-gray-500 dark:text-white/40">премиум @</p></div>
            </div>
            <p className="text-xs text-gray-500 dark:text-white/40 mt-4">Магазин премиум-юзернеймов: {stats.shop_enabled ? "включён" : "выключен"}</p>
          </div>
        )}

        {tab === "financial" && (
          <div className="bg-gray-100 dark:bg-white/5 rounded-xl p-5 border border-line dark:border-white/10">
            <h2 className="text-sm font-black mb-4 flex items-center gap-2"><DollarSign size={18} /> Финансы</h2>
            <div className="grid grid-cols-3 gap-4">
              <div><p className="text-2xl font-black">${stats.monthly_revenue}</p><p className="text-xs text-gray-500 dark:text-white/40">доход за месяц</p></div>
              <div><p className="text-2xl font-black">{stats.username_sales}</p><p className="text-xs text-gray-500 dark:text-white/40">продано @ за месяц</p></div>
              <div><p className="text-2xl font-black">${stats.total_revenue}</p><p className="text-xs text-gray-500 dark:text-white/40">всего за всё время</p></div>
            </div>
          </div>
        )}

        {tab === "system" && (
          <div className="bg-gray-100 dark:bg-white/5 rounded-xl p-5 border border-line dark:border-white/10">
            <h2 className="text-sm font-black mb-4 flex items-center gap-2"><Database size={18} /> Система</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><p className="text-2xl font-black">{stats.total_users}</p><p className="text-xs text-gray-500 dark:text-white/40">пользователей</p></div>
              <div><p className="text-2xl font-black">{stats.posts_per_day}</p><p className="text-xs text-gray-500 dark:text-white/40">постов/день</p></div>
              <div><p className="text-2xl font-black">{stats.messages_per_day}</p><p className="text-xs text-gray-500 dark:text-white/40">сообщений/день</p></div>
              <div><p className="text-2xl font-black">{stats.premium_usernames_total || 0}</p><p className="text-xs text-gray-500 dark:text-white/40">премиум @</p></div>
            </div>
          </div>
        )}

        {tab === "audit" && (
          <div className="bg-gray-100 dark:bg-white/5 rounded-xl p-5 border border-line dark:border-white/10">
            <h2 className="text-sm font-black mb-4 flex items-center gap-2"><Eye size={18} /> Логи действий (50)</h2>
            <div className="space-y-1.5 max-h-[28rem] overflow-y-auto">
              {(stats.audit_logs || []).map((log: { time: string; user: string; action: string; ip: string }, i: number) => (
                <div key={i} className="flex items-center justify-between border-b py-1.5 text-sm">
                  <span className="text-gray-500 dark:text-white/40">{log.time}</span>
                  <span className="font-medium">{log.user}</span>
                  <span className="text-gray-500 dark:text-white/40">{log.action}</span>
                  <span className="rounded-md bg-gray-100 dark:bg-white/5 px-2 py-0.5 text-[10px]">{log.ip}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "backup" && (
          <div className="bg-gray-100 dark:bg-white/5 rounded-xl p-5 border border-line dark:border-white/10">
            <h2 className="text-sm font-black mb-4 flex items-center gap-2"><GitBranch size={18} /> Бэкапы</h2>
            <div className="flex gap-3">
              <Button variant="success" icon={Database}>Создать бэкап</Button>
              <Button variant="secondary" icon={Eye}>Список бэкапов</Button>
              <Button variant="danger" icon={Clock}>Восстановить</Button>
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between border-b py-2 text-sm">
                <span>backup_2026_08_31_14_30.sql</span>
                <span className="text-gray-500 dark:text-white/40">245 MB Е 2 часа назад</span>
              </div>
              <div className="flex items-center justify-between border-b py-2 text-sm">
                <span>backup_2026_08_30_02_00.sql</span>
                <span className="text-gray-500 dark:text-white/40">238 MB Е 1 день назад</span>
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-white/40 mt-3 flex items-center gap-1.5"><Zap size={12} /> Возможности восстановления пока в разработке</p>
          </div>
        )}
      </div>
      </div>
      </main>
    </div>
  );
}