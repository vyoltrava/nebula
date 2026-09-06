"use client";
// 🏢 Отделы — настройки рабочих чатов: участники, роли, разделы, смены.
import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { Briefcase, Plus, Trash2, X, Search, Check, UserCog, Zap, Power } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

type Member = {
  user_id: number; username: string | null; display_name: string | null;
  role: string; on_shift: boolean; shift_taken: number; handles: string[];
};
type WorkChatT = {
  id: number; name: string; is_active: boolean; member_count: number;
  members: Member[];
  sections: { section: string; enabled: boolean; default_priority: string }[];
};
type StaffUser = { id: number; username: string; display_name: string };

const ROLES: [string, string][] = [
  ["head", "Старший"], ["deputy", "Зам. старшего"],
  ["worker", "Сотрудник"], ["novice", "Новичок"],
];
const SECTIONS: [string, string][] = [
  ["complaint", "Жалобы"], ["support", "Поддержка"],
  ["bug", "Баг-трекер"], ["chat", "Чаты"],
];
const ROLE_COLORS: Record<string, string> = {
  head: "#ef4444", deputy: "#f59e0b", worker: "#22c55e", novice: "#64748b",
};

export default function DepartmentsTab() {
  const [chats, setChats] = useState<WorkChatT[]>([]);
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [addingTo, setAddingTo] = useState<number | null>(null);
  const [staffQ, setStaffQ] = useState("");
  const [staffResults, setStaffResults] = useState<StaffUser[]>([]);

  async function load() {
    const token = getToken();
    if (!token) return;
    const meRes = await fetch(`${API_URL}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (meRes.ok) setMe(await meRes.json());
    const res = await fetch(`${API_URL}/api/work/chats`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setChats(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (addingTo === null) return;
    const t = setTimeout(async () => {
      const res = await fetch(`${API_URL}/api/work/staff-search?q=${encodeURIComponent(staffQ)}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) setStaffResults(await res.json());
    }, 250);
    return () => clearTimeout(t);
  }, [staffQ, addingTo]);

  const myRole = (chat: WorkChatT) =>
    chat.members.find((m) => m.user_id === me?.id)?.role || null;
  const canManage = (chat: WorkChatT) =>
    me?.is_admin || ["head", "deputy"].includes(myRole(chat) || "");

  async function addMember(chatId: number, userId: number) {
    await fetch(`${API_URL}/api/work/chats/${chatId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ user_id: userId, role: "novice" }),
    });
    setAddingTo(null); setStaffQ(""); load();
  }

  async function setRole(chatId: number, userId: number, role: string) {
    await fetch(`${API_URL}/api/work/chats/${chatId}/members/${userId}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ role }),
    });
    load();
  }

  async function removeMember(chatId: number, userId: number) {
    await fetch(`${API_URL}/api/work/chats/${chatId}/members/${userId}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${getToken()}` },
    });
    load();
  }

  async function toggleSection(chatId: number, section: string, enabled: boolean, priority: string) {
    const chat = chats.find((c) => c.id === chatId);
    const sections = (chat?.sections || []).filter((s) => s.section !== section);
    if (enabled) sections.push({ section, enabled: true, default_priority: priority });
    await fetch(`${API_URL}/api/work/chats/${chatId}/sections`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ sections }),
    });
    load();
  }

  async function toggleShift(chatId: number, on: boolean) {
    await fetch(`${API_URL}/api/work/chats/${chatId}/shift`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ on_shift: on }),
    });
    load();
  }

  async function createChat() {
    const id = prompt("ID категории роли (category_id):");
    if (!id) return;
    await fetch(`${API_URL}/api/work/chats`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ category_id: Number(id) }),
    });
    load();
  }

  async function autoCreateChats() {
    if (!confirm("Создать рабочие чаты под ВСЕ категории ролей? (удалённые вручную не тронутся)")) return;
    const res = await fetch(`${API_URL}/api/work/chats/auto`, {
      method: "POST", headers: { Authorization: `Bearer ${getToken()}` },
    });
    const d = await res.json().catch(() => ({}));
    alert(`Создано: ${d.created?.length || 0}. Категорий всего: ${d.categories_total || 0}. Чатов всего: ${d.chats_total || 0}. Осталось без чата: ${(d.missing || []).join(", ") || "—"}`);
    load();
  }

  async function deleteChat(chatId: number, name: string) {
    if (!confirm(`Удалить рабочий чат «${name}»? Он больше не будет создаваться автоматически.`)) return;
    await fetch(`${API_URL}/api/work/chats/${chatId}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${getToken()}` },
    });
    load();
  }
if (loading) return <p className="text-center text-gray-500 dark:text-white/40 py-16">Загрузка…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-black uppercase text-gray-600 dark:text-white/50">
          Рабочие чаты отделов ({chats.length})
        </h2>
        {me?.is_admin && (
          <div className="flex gap-2">
            <button onClick={autoCreateChats} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#8b5cf6]/40 text-[#8b5cf6] text-xs font-bold hover:bg-[#8b5cf6]/10">
              ⚙️ Создать все авто-чаты
            </button>
            <button onClick={createChat} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#8b5cf6] text-white text-xs font-bold hover:bg-[#7c3aed]">
              <Plus size={14} /> Создать рабочий чат
            </button>
          </div>
        )}
      </div>

      {chats.length === 0 && (
        <div className="text-center py-12 border border-dashed border-line dark:border-white/15 rounded-2xl bg-gray-100 dark:bg-white/5">
          <Briefcase size={44} className="mx-auto text-gray-400 dark:text-white/20 mb-3" />
          <p className="text-gray-600 dark:text-white/50 text-sm">Рабочих чатов пока нет</p>
          <p className="text-gray-500 dark:text-white/30 text-xs mt-1">Они создаются автоматически под каждую категорию ролей</p>
        </div>
      )}

      {chats.map((chat) => {
        const canM = canManage(chat);
        const myR = myRole(chat);
        return (
          <div key={chat.id} className="border border-line dark:border-white/10 rounded-2xl bg-gray-100 dark:bg-white/5 overflow-hidden">
            <div className="p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-gray-200/50 dark:hover:bg-white/10 transition-all"
              onClick={() => setExpanded(expanded === chat.id ? null : chat.id)}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[#8b5cf6]/15 text-[#8b5cf6] flex items-center justify-center shrink-0">
                  <Briefcase size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-gray-900 dark:text-white font-bold truncate">{chat.name}</p>
                  <p className="text-gray-500 dark:text-white/40 text-xs">{chat.member_count} участников
                    {myR && <> · вы: <span className="font-bold" style={{ color: ROLE_COLORS[myR] }}>{ROLES.find(([r]) => r === myR)?.[1]}</span></>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!chat.is_active && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-400/15 text-gray-500">Закрыт</span>}
                {me?.is_admin && (
                  <button onClick={(e) => { e.stopPropagation(); deleteChat(chat.id, chat.name); }}
                    title="Удалить рабочий чат (не будет создаваться заново)"
                    className="p-1.5 rounded-lg bg-gray-200 dark:bg-white/10 text-gray-700 dark:text-white/70 hover:text-red-600 transition-all">
                    <Trash2 size={14} />
                  </button>
                )}
                {myR && (
                  <button onClick={(e) => { e.stopPropagation(); toggleShift(chat.id, !chat.members.find((m) => m.user_id === me?.id)?.on_shift); }}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                      chat.members.find((m) => m.user_id === me?.id)?.on_shift
                        ? "border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-300"
                        : "border-line dark:border-white/15 text-gray-600 dark:text-white/50"}`}>
                    <Zap size={12} /> {chat.members.find((m) => m.user_id === me?.id)?.on_shift ? "На смене" : "Выйти на смену"}
                  </button>
                )}
              </div>
            </div>

            {expanded === chat.id && (
              <div className="px-4 pb-4 space-y-4 border-t border-line dark:border-white/10 pt-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[11px] font-black uppercase text-gray-600 dark:text-white/50 flex items-center gap-1"><UserCog size={12} /> Участники</h4>
                    {canM && (
                      <button onClick={() => { setAddingTo(addingTo === chat.id ? null : chat.id); setStaffQ(""); }} className="flex items-center gap-1 text-[11px] font-bold text-[#8b5cf6] hover:text-[#7c3aed]">
                        <Plus size={12} /> Добавить
                      </button>
                    )}
                  </div>

                  {addingTo === chat.id && (
                    <div className="mb-3 p-3 rounded-xl border border-[#8b5cf6]/30 bg-[#8b5cf6]/5">
                      <div className="flex items-center gap-2 mb-2">
                        <Search size={14} className="text-gray-500" />
                        <input value={staffQ} onChange={(e) => setStaffQ(e.target.value)} autoFocus
                          placeholder="Поиск сотрудников (staff)…"
                          className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white focus:outline-none" />
                        <button onClick={() => setAddingTo(null)} className="text-gray-500 hover:text-gray-900 dark:hover:text-white"><X size={14} /></button>
                      </div>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {staffResults.map((u) => (
                          <button key={u.id} onClick={() => addMember(chat.id, u.id)}
                            className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-purple-500/10 transition-all">
                            <span className="text-sm text-gray-900 dark:text-white">{u.display_name} <span className="text-gray-500 dark:text-white/40">@{u.username}</span></span>
                            <Plus size={14} className="text-[#8b5cf6]" />
                          </button>
                        ))}
                        {staffResults.length === 0 && <p className="text-xs text-gray-500 dark:text-white/40 text-center py-2">Никого не найдено (только staff)</p>}
                      </div>
                    </div>
                  )}
<div className="space-y-1.5">
                    {chat.members.map((m) => (
                      <div key={m.user_id} className="flex items-center gap-2.5 p-2 rounded-lg bg-paper dark:bg-[#171717] border border-line dark:border-white/5">
                        <Avatar src={undefined} name={m.display_name || m.username || "?"} id={m.user_id} size={32} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 dark:text-white font-bold truncate">{m.display_name}</p>
                          <p className="text-[10px] text-gray-500 dark:text-white/40">@{m.username} · смен: {m.shift_taken}</p>
                        </div>
                        {canM ? (
                          <select value={m.role} onChange={(e) => setRole(chat.id, m.user_id, e.target.value)}
                            className="text-[11px] font-bold rounded-lg border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white px-1.5 py-1 focus:outline-none"
                            style={{ color: ROLE_COLORS[m.role] }}>
                            {ROLES.filter(([r]) => r !== "head" || me?.is_admin).map(([r, label]) => (
                              <option key={r} value={r}>{label}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase border"
                            style={{ color: ROLE_COLORS[m.role], borderColor: ROLE_COLORS[m.role] + "40", background: ROLE_COLORS[m.role] + "10" }}>
                            {ROLES.find(([r]) => r === m.role)?.[1]}
                          </span>
                        )}
                        {(canM || m.user_id === me?.id) && m.role !== "head" && (
                          <button onClick={() => removeMember(chat.id, m.user_id)} className="p-1 text-gray-500 dark:text-white/40 hover:text-red-600 transition-all">
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {canM && (
                  <div>
                    <h4 className="text-[11px] font-black uppercase text-gray-600 dark:text-white/50 mb-2 flex items-center gap-1"><Power size={12} /> Разделы заявок</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {SECTIONS.map(([sec, label]) => {
                        const cfg = chat.sections.find((s) => s.section === sec);
                        const enabled = !!cfg?.enabled;
                        return (
                          <button key={sec} onClick={() => toggleSection(chat.id, sec, !enabled, cfg?.default_priority || "medium")}
                            className={`flex items-center gap-1.5 p-2 rounded-lg border text-xs font-bold transition-all ${enabled ? "border-[#8b5cf6] bg-purple-500/10 text-gray-900 dark:text-white" : "border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-white/40"}`}>
                            <span className={`w-4 h-4 rounded flex items-center justify-center text-[9px] border ${enabled ? "bg-[#8b5cf6] text-white border-transparent" : "border-gray-400 dark:border-white/30"}`}>
                              {enabled && <Check size={10} />}
                            </span>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-gray-500 dark:text-white/40 mt-1.5">
                      Новички получают только заявки с приоритетом low. Старший и зам. в раздаче не участвуют.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
