"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Avatar } from "@/components/Avatar";
import { Users, ArrowLeft, Crown, ShieldCheck, Shield, Wrench, Gavel, Star } from "lucide-react";

type Member = {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_admin: boolean;
  is_moderator: boolean;
  is_system: boolean;
  level: number;
  role: { id: number; name: string; color: string } | null;
};

type GroupConfig = {
  key: string;
  label: string;
  levels: number[];
  icon: React.ReactNode;
};

const GROUP_CONFIG: GroupConfig[] = [
  { key: "special", label: "Специальный отдел", levels: [10], icon: <Crown size={20} /> },
  { key: "head_admin", label: "Глава администрации", levels: [8], icon: <ShieldCheck size={20} /> },
  { key: "dept_heads", label: "Главы отделов", levels: [7], icon: <Star size={20} /> },
  { key: "deputies", label: "Заместители главы отдела", levels: [6], icon: <Shield size={20} /> },
  { key: "staff", label: "Действующие сотрудники", levels: [5, 4], icon: <Wrench size={20} /> },
  { key: "junior", label: "Младший состав отделов", levels: [3, 2, 1], icon: <Gavel size={20} /> },
];

export default function TeamPage() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/team`)
      .then((r) => (r.ok ? r.json() : { groups: [] }))
      .then((data) => {
        // Собираем всех участников из всех групп бэкенда в один плоский массив
        const allMembers: Member[] = [];
        for (const g of data.groups || []) {
          for (const m of g.members || []) {
            // Исключаем системных пользователей (уровень 11 / is_system)
            if (!m.is_system && m.level !== 11) {
              allMembers.push(m);
            }
          }
        }
        setMembers(allMembers);
      })
      .finally(() => setLoading(false));
  }, []);

  // Группируем участников по уровням согласно конфигурации
  const groupedMembers = GROUP_CONFIG.map((config) => ({
    ...config,
    members: members.filter((m) => config.levels.includes(m.level)),
  })).filter((g) => g.members.length > 0);

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />
      <div className="w-px shrink-0 bg-white/10 my-3" />
      <main className="flex-1 overflow-y-auto border-x border-white/10">
        {/* Шапка */}
        <div className="p-6 border-b border-white/10 sticky top-0 bg-[#171717]/95 backdrop-blur-md z-10">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-3">
              <Users size={28} className="text-[#8b5cf6]" />
              <div>
                <h1 className="text-3xl font-black text-white">Команда проекта</h1>
                <p className="text-sm text-white/50 mt-1">
                  Администрация и разработчики trelod
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Контент */}
        <div className="p-6 space-y-8">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-2 border-[#8b5cf6] border-t-transparent rounded-full animate-spin" />
                <p className="text-white/60">Загрузка команды...</p>
              </div>
            </div>
          )}

          {!loading && groupedMembers.length === 0 && (
            <div className="text-center py-16">
              <Users size={56} className="text-white/20 mx-auto mb-4" />
              <p className="text-white/60 text-lg">Команда пока не сформирована</p>
            </div>
          )}

          {groupedMembers.map((g) => (
            <section key={g.key} className="space-y-4">
              {/* Заголовок группы — фиолетовый полупрозрачный фон */}
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#8b5cf6]/10 border border-[#8b5cf6]/20">
                <div className="text-[#8b5cf6]">{g.icon}</div>
                <h2 className="font-black text-lg uppercase tracking-widest text-[#8b5cf6]">
                  {g.label}
                </h2>
                <span className="ml-auto text-sm text-white/50 font-semibold">
                  {g.members.length}{" "}
                  {g.members.length === 1
                    ? "человек"
                    : g.members.length < 5
                      ? "человека"
                      : "человек"}
                </span>
              </div>

              {/* Сетка участников */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {g.members.map((m) => (
                  <Link
                    key={m.id}
                    href={`/user/${m.id}`}
                    className="group flex items-center gap-4 p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all"
                  >
                    <Avatar
                      src={m.avatar_url}
                      name={m.display_name}
                      id={m.id}
                      size={48}
                    />

                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white truncate group-hover:text-[#8b5cf6] transition-colors">
                        {m.display_name}
                      </p>
                      <p className="text-sm text-white/50 truncate">@{m.username}</p>

                      {/* Плашка роли */}
                      {m.role && (
                        <div className="mt-2">
                          <span
                            className="inline-block px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider text-white"
                            style={{ backgroundColor: m.role.color }}
                          >
                            {m.role.name}
                          </span>
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}