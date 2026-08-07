"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Avatar } from "@/components/Avatar";
import { Users, ArrowLeft, Terminal, Crown, ShieldCheck, Shield, Wrench, Gavel } from "lucide-react";
import { API_URL } from "@/lib/api";

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

type Group = {
  key: string;
  label: string;
  color: string;
  members: Member[];
};

function getGlowColor(m: Member): string | null {
  if (m.is_system) return "#00ff41";
  if (m.is_admin) return "#ffffff";
  if (m.is_moderator) return "#3b82f6";
  return m.role?.color ?? null;
}

function getGroupIcon(key: string) {
  switch (key) {
    case "level_11": return <Terminal size={24} />;
    case "level_10": return <Crown size={24} />;
    case "level_9": return <ShieldCheck size={24} />;
    case "level_8": return <Shield size={24} />;
    case "level_7": return <Wrench size={24} />;
    case "level_6_3": return <Gavel size={24} />;
    default: return <Users size={24} />;
  }
}

function getLevelBadge(m: Member): string {
  if (m.is_system) return "System";
  if (m.is_admin) return "Founder";
  if (m.is_moderator) return "Developer";
  if (m.level === 8) return "Глава администрации";
  if (m.level === 7) return "Технический раздел";
  if (m.level >= 3 && m.level <= 6) return "Модератор";
  return "";
}

export default function TeamPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://${API_URL}/api/team')
      .then((r) => (r.ok ? r.json() : { groups: [] }))
      .then((data) => setGroups(data.groups || []))
      .finally(() => setLoading(false));
  }, []);

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
                  Администрация и разработчики NEBULA
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

          {!loading && groups.length === 0 && (
            <div className="text-center py-16">
              <Users size={56} className="text-white/20 mx-auto mb-4" />
              <p className="text-white/60 text-lg">Команда пока не сформирована</p>
            </div>
          )}

          {groups.map((g) => (
            <section key={g.key} className="space-y-4">
              {/* Заголовок группы */}
              <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                <div
                  className="p-2 rounded-lg"
                  style={{ 
                    backgroundColor: `${g.color}20`,
                    boxShadow: `0 0 20px ${g.color}40`
                  }}
                >
                  <div style={{ color: g.color }}>
                    {getGroupIcon(g.key)}
                  </div>
                </div>
                <div className="flex-1">
                  <h2
                    className="font-black text-xl uppercase tracking-widest"
                    style={{
                      color: g.color,
                      textShadow: `0 0 10px ${g.color}B3, 0 0 20px ${g.color}66`,
                    }}
                  >
                    {g.label}
                  </h2>
                </div>
                <span className="text-sm text-white/60 bg-white/5 px-4 py-1.5 rounded-full font-semibold border border-white/10">
                  {g.members.length} {g.members.length === 1 ? "человек" : g.members.length < 5 ? "человека" : "человек"}
                </span>
              </div>

              {/* Сетка участников */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {g.members.map((m) => {
                  const glow = getGlowColor(m);
                  return (
                    <Link
                      key={m.id}
                      href={`/user/${m.id}`}
                      className="group relative flex items-center gap-4 p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all overflow-hidden"
                    >
                      {/* Фоновое свечение */}
                      {glow && (
                        <div
                          className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity"
                          style={{ backgroundColor: glow }}
                        />
                      )}
                      
                      <div
                        className="shrink-0 relative"
                        style={
                          glow ? { filter: `drop-shadow(0 0 10px ${glow})` } : undefined
                        }
                      >
                        <Avatar
                          src={m.avatar_url}
                          name={m.display_name}
                          id={m.id}
                          size={56}
                        />
                      </div>
                      
                      <div className="flex-1 min-w-0 relative">
                        <p
                          className={`font-bold text-base truncate transition-all ${
                            glow ? "group-hover:opacity-80" : "text-white group-hover:text-[#8b5cf6]"
                          }`}
                          style={
                            glow
                              ? {
                                  color: glow,
                                  textShadow: `0 0 6px ${glow}B3, 0 0 14px ${glow}66`,
                                }
                              : undefined
                          }
                        >
                          {m.display_name}
                        </p>
                        <p className="text-sm text-white/50 truncate">@{m.username}</p>
                        
                        {/* Бейдж уровня */}
                        <div className="mt-2">
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border"
                            style={{
                              borderColor: `${glow}60`,
                              backgroundColor: `${glow}15`,
                            }}
                          >
                            {getLevelBadge(m)}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}