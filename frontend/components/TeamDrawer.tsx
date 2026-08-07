"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Users } from "lucide-react";
import { Avatar } from "@/components/Avatar";


type Member = {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_admin: boolean;
  is_moderator: boolean;
  role: { id: number; name: string; color: string } | null;
};

type Group = {
  key: string;
  label: string;
  color: string;
  members: Member[];
};

function getGlowColor(m: Member): string | null {
  if (m.is_admin) return "#8b5cf6";
  if (m.is_moderator) return "#3b82f6";
  return m.role?.color ?? null;
}

export function TeamDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/team`)
      .then((r) => (r.ok ? r.json() : { groups: [] }))
      .then((data) => setGroups(data.groups || []))
      .finally(() => setLoading(false));
  }, [open]);

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200]"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-96 max-w-full bg-[#171717] border-l border-white/10 z-[201] transform transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Шапка */}
          <div className="p-5 border-b border-white/10 flex items-center justify-between sticky top-0 bg-[#171717] z-10">
            <div className="flex items-center gap-3">
              <Users size={22} className="text-[#8b5cf6]" />
              <h2 className="text-xl font-black text-white">Команда разработчиков</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all"
            >
              <X size={20} />
            </button>
          </div>

          {/* Контент */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {loading && (
              <p className="text-center text-white/50 py-8">Загрузка...</p>
            )}

            {!loading && groups.length === 0 && (
              <p className="text-center text-white/50 py-8">Пока никого нет</p>
            )}

            {groups.map((g) => (
              <div key={g.key} className="space-y-3">
                {/* Заголовок группы с цветным акцентом */}
                <div className="flex items-center gap-3 pb-2 border-b border-white/5">
                  <div
                    className="w-1 h-6 rounded-full"
                    style={{ backgroundColor: g.color, boxShadow: `0 0 10px ${g.color}` }}
                  />
                  <h3
                    className="font-black text-sm uppercase tracking-widest"
                    style={{
                      color: g.color,
                      textShadow: `0 0 8px ${g.color}99`,
                    }}
                  >
                    {g.label}
                  </h3>
                  <span className="ml-auto text-xs text-white/40 bg-white/5 px-2 py-0.5 rounded-full">
                    {g.members.length}
                  </span>
                </div>

                {/* Участники */}
                <div className="space-y-1">
                  {g.members.map((m) => {
                    const glow = getGlowColor(m);
                    return (
                      <Link
                        key={m.id}
                        href={`/user/${m.id}`}
                        onClick={onClose}
                        className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-all group"
                      >
                        <div
                          className="shrink-0"
                          style={
                            glow ? { filter: `drop-shadow(0 0 8px ${glow})` } : undefined
                          }
                        >
                          <Avatar
                            src={m.avatar_url}
                            name={m.display_name}
                            id={m.id}
                            size={40}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className={`font-bold text-sm truncate transition-all ${
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
                          <p className="text-xs text-white/40 truncate">@{m.username}</p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}