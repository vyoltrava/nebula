"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { getToken } from "@/lib/auth";
import {
  Users, BarChart3, Bug, Globe, Activity, Flag,
  MessageSquare, SmilePlus, Palette, Headphones, Shield, Crown, Wrench, ArrowLeft
} from "lucide-react";

import { UsersSection } from "@/components/admin/section/UsersSection";
import { StatsSection } from "@/components/admin/section/StatsSection";
import { BugsSection } from "@/components/admin/section/BugsSection";
import { IpSection } from "@/components/admin/section/IpSection";
import { LogsSection } from "@/components/admin/section/LogsSection";
import { ReportsSection } from "@/components/admin/section/ReportsSection";
import { ChatsSection } from "@/components/admin/section/ChatsSection";
import { StickersSection } from "@/components/admin/section/StickersSection";
import { ThemesSection } from "@/components/admin/section/ThemesSection";
import { SupportSection } from "@/components/admin/section/SupportSection";
import { TechUsersSection } from "@/components/admin/section/TechUsersSection";

type TabId =
  | "users" | "tech_users" | "stats" | "bugs" | "ip" | "logs"
  | "reports" | "chats" | "support" | "stickers" | "themes";

interface TabDef {
  id: TabId;
  label: string;
  icon: any;
  color: string;
  permission: string | null;
}

const TABS: TabDef[] = [
  { id: "users",     label: "Пользователи", icon: Users,         color: "#8b5cf6", permission: "manage_users" },
  { id: "tech_users",label: "Управление",   icon: Wrench,        color: "#0E7490", permission: "tech_access" },
  { id: "reports",   label: "Жалобы",       icon: Flag,          color: "#ef4444", permission: "manage_reports" },
  { id: "support",   label: "Поддержка",    icon: Headphones,    color: "#22c55e", permission: "manage_support" },
  { id: "chats",     label: "Чаты",         icon: MessageSquare, color: "#06b6d4", permission: "manage_groups" },
  { id: "stats",     label: "Статистика",   icon: BarChart3,     color: "#8b5cf6", permission: "tech_access" },
  { id: "bugs",      label: "Баг-трекер",   icon: Bug,           color: "#f59e0b", permission: "tech_access" },
  { id: "ip",        label: "IP блоки",     icon: Globe,         color: "#ef4444", permission: "ban_users" },
  { id: "logs",      label: "Логи",         icon: Activity,      color: "#3b82f6", permission: "tech_access" },
  { id: "stickers",  label: "Стикеры",      icon: SmilePlus,     color: "#f59e0b", permission: "manage_stickers" },
  { id: "themes",    label: "Темы",         icon: Palette,       color: "#a855f7", permission: null },
];

// Общий класс для иконок-кнопок (прозрачный фон, белый цвет, подсветка при наведении)
const iconBtnClass = "p-2 rounded-lg text-gray-600 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white transition-all flex items-center justify-center";

export default function AdminPage() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [roles, setRoles] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<TabId | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.push("/login"); return; }
    
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data.is_admin && !data.is_moderator && (!data.permissions || data.permissions.length === 0)) {
          router.push("/");
          return;
        }
        setMe(data);
        
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/roles`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((r) => r.json())
          .then((rolesData) => setRoles(rolesData))
          .catch(console.error);

        const visible = TABS.filter((t) => {
          if (t.permission === null) return data.is_admin;
          return data.is_admin || (data.permissions || []).includes(t.permission!);
        });
        if (visible.length > 0) setActiveTab(visible[0].id);
        else router.push("/");
      })
      .catch(() => router.push("/login"));
  }, [router]);

  if (!me || !activeTab) {
    return (
      <div className="h-screen flex items-center justify-center bg-ivory dark:bg-[#18181b]">
        <p className="text-gray-600 dark:text-white/60 animate-pulse">Загрузка...</p>
      </div>
    );
  }

  const visibleTabs = TABS.filter((t) => {
    if (t.permission === null) return me.is_admin;
    return me.is_admin || (me.permissions || []).includes(t.permission!);
  });

  const canRoles = me.is_admin || (me.permissions || []).includes("manage_roles");

  return (
    <div className="h-screen flex overflow-hidden bg-ivory dark:bg-[#18181b]">
      <Sidebar />
      <div className="w-px shrink-0 bg-gray-100 dark:bg-white/10 my-3 hidden md:block" />
      <main className="flex-1 overflow-y-auto border-x border-line dark:border-white/10">
        {/* Шапка */}
        <div className="p-4 sm:p-6 border-b border-line dark:border-white/10 sticky top-0 bg-paper dark:bg-[#171717]/95 backdrop-blur-md z-10">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Shield size={24} className="text-[#8b5cf6]" />
              <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">Центр управления</h1>
              <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-white/60 text-xs font-mono">
                Lvl {me.level ?? 1}
              </span>
            </div>
            
            {/* 🛠️ ИСПРАВЛЕНО: Только иконки, без текста и цветных фонов */}
            <div className="flex items-center gap-1 shrink-0">
              {canRoles && (
                <Link href="/admin/roles" className={iconBtnClass} title="Роли">
                  <Crown size={20} />
                </Link>
              )}
              {(me?.level ?? 0) >= 9 && (
                <Link href="/adminnew/badges" className={iconBtnClass} title="Кастомные плашки">
                  <Palette size={20} />
                </Link>
              )}
              {(me.is_admin || (me.permissions || []).includes("manage_team_stats")) && (
                <Link href="/stat" className={iconBtnClass} title="Команда">
                  <Shield size={20} />
                </Link>
              )}
              
              <div className="w-px h-6 bg-gray-100 dark:bg-white/10 mx-1" /> {/* Разделитель */}
              
              <Link href="/" className={iconBtnClass} title="На главную">
                <ArrowLeft size={20} />
              </Link>
            </div>
          </div>

          {/* Вкладки */}
          <div className="flex gap-2 mt-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-white/20 scrollbar-track-transparent">
            {visibleTabs.map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-medium transition-all whitespace-nowrap shrink-0 text-sm ${
                    active
                      ? "text-gray-900 dark:text-white border-transparent"
                      : "bg-white dark:bg-white/5 border-line dark:border-white/10 text-gray-800 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white"
                  }`}
                  style={active ? { backgroundColor: t.color } : undefined}
                >
                  <Icon size={16} /> {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Контент */}
        <div className="p-4 sm:p-6">
          {activeTab === "users"     && <UsersSection me={me} />}
          {activeTab === "tech_users"&& <TechUsersSection me={me} />}
          {activeTab === "reports"   && <ReportsSection me={me} />}
          {activeTab === "support"   && <SupportSection me={me} />}
          {activeTab === "chats"     && <ChatsSection me={me} />}
          {activeTab === "stats"     && <StatsSection me={me} />}
          {activeTab === "bugs"      && <BugsSection me={me} />}
          {activeTab === "ip"        && <IpSection me={me} />}
          {activeTab === "logs"      && <LogsSection me={me} />}
          {activeTab === "stickers"  && <StickersSection me={me} roles={roles} />}
          {activeTab === "themes"    && <ThemesSection me={me} />}
        </div>
      </main>
    </div>
  );
}