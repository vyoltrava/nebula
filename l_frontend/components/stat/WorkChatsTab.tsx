"use client";

/**
 * 💼 Управление рабочими чатами заявок (/stat → Отделы → Рабочие чаты).
 * Создание/удаление (только admin), назначение участников с ролями
 * leader|deputy|senior|novice, привязка к одной из 4 вкладок админки.
 * Только через API /api/admin/work-chats*. Носители staff-плашки
 * (Role.is_staff) добавляются автоматически на бэке.
 */

import { useCallback, useEffect, useState } from "react";
import { Briefcase, Plus, Trash2, Search, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { getToken } from "@/lib/auth";

const API = process.env.NEXT_PUBLIC_API_URL;

const SECTIONS: [string, string][] = [
  ["reports", "Жалобы"],
  ["support", "Поддержка"],
  ["bugs", "Баг-трекер"],
  ["chats", "Чаты"],
];

const ROLES: [string, string, string][] = [
  ["leader", "👑 Руководитель", "#f59e0b"],
  ["deputy", "🛡 Зам. руководителя", "#8b5cf6"],
  ["senior", "⭐ Старший", "#22c55e"],
  ["novice", "🌱 Новичок", "#06b6d4"],
];

type Member = { user_id: number; username: string; display_name: string; avatar_url?: string | null; role: string; auto_assigned?: boolean };
type WorkChat = {
  id: number; name: string; assigned_section: string;
  chat_id?: number | null; is_active: boolean;
  created_at?: string | null; members: Member[];
};

export default function WorkChatsTab({ isAdmin }: { isAdmin: boolean }) {
  const [chats, setChats] = useState<WorkChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [section, setSection] = useState("reports");
  const [creating, setCreating] = useState(false);
  const [openMembers, setOpenMembers] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<any[]>([]);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const r = await fetch(`${API}/api/admin/work-chats`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.status === 403) { setError("Нет доступа (только staff)"); setLoading(false); return; }
      if (!r.ok) { setError(`Ошибка ${r.status}`); setLoading(false); return; }
      setChats(await r.json());
      setError(null);
    } catch { setError("Ошибка сети"); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (query.trim().length < 1) { setFound([]); return; }
    const t = setTimeout(async () => {
      const token = getToken();
      if (!token) return;
      try {
        const r = await fetch(`${API}/api/users?q=${encodeURIComponent(query.trim())}&limit=10`,
          { headers: { Authorization: `Bearer ${token}` } });
        if (r.ok) setFound((await r.json()).users || []);
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);
async function createWorkChat() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const r = await fetch(`${API}/api/admin/work-chats`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ name: name.trim(), assigned_section: section, member_roles: {} }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d?.detail || `Ошибка ${r.status}`);
      } else {
        setName("");
        setError(null);
        await load();
      }
    } catch { setError("Ошибка сети"); }
    setCreating(false);
  }

  async function addMember(chatId: number, userId: number) {
    await fetch(`${API}/api/admin/work-chats/${chatId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ user_id: userId, role: "novice" }),
    });
    setQuery(""); setFound([]);
    await load();
  }

  async function setRole(chatId: number, userId: number, role: string) {
    await fetch(`${API}/api/admin/work-chats/${chatId}/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ role }),
    });
    await load();
  }

  async function removeMember(chatId: number, userId: number) {
    await fetch(`${API}/api/admin/work-chats/${chatId}/members/${userId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    await load();
  }

  async function deleteChat(chatId: number) {
    if (!confirm("Удалить рабочий чат? Заявки этого раздела перестанут распределяться.")) return;
    await fetch(`${API}/api/admin/work-chats/${chatId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    await load();
  }

  async function toggleActive(chat: WorkChat) {
    const r = await fetch(`${API}/api/admin/work-chats/${chat.id}/active`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ is_active: !chat.is_active }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      alert(d?.detail || "Не удалось изменить статус");
      return;
    }
    await load();
  }

  const sectionLabel = (s: string) => SECTIONS.find(([k]) => k === s)?.[1] || s;
  const roleInfo = (r: string) => ROLES.find(([k]) => k === r) || ["", r, "#8b5cf6"] as [string, string, string];

  if (loading) {
    return <p className="text-sm text-gray-500 dark:text-white/40 px-1 py-4">Загрузка рабочих чатов…</p>;
  }
return (
    <div className="space-y-4 pb-8">
      {isAdmin && (
        <div className="space-y-3 pt-4 border-t border-line dark:border-white/10">
          <div className="flex items-center gap-3">
            <Briefcase size={20} className="text-purple-500" />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white uppercase tracking-wide">Рабочие чаты заявок</h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-white/40 -mt-2">
            Заявки из выбранной вкладки админки приходят ТОЛЬКО в привязанный рабочий чат (папка «РАБОТА»).
            Носители staff-плашки добавляются автоматически.
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Название (например, Отдел модерации)"
              className="flex-1 min-w-48 px-3 py-2 rounded-xl border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-[#8b5cf6]"
            />
            <select
              value={section}
              onChange={(e) => setSection(e.target.value)}
              className="px-3 py-2 rounded-xl border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-[#8b5cf6]"
            >
              {SECTIONS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            <button
              onClick={createWorkChat}
              disabled={creating || !name.trim()}
              className="px-4 py-2 rounded-xl bg-purple-500 text-white text-sm font-bold hover:bg-purple-600 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <Plus size={14} /> Создать
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs">{error}</p>
      )}

      {chats.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-white/40 px-1">Рабочих чатов пока нет</p>
      ) : (
        <div className="space-y-3">
          {chats.map((wc) => (
            <WorkChatCard
              key={wc.id}
              wc={wc}
              isAdmin={isAdmin}
              openMembers={openMembers === wc.id}
              onToggleOpen={() => setOpenMembers(openMembers === wc.id ? null : wc.id)}
              sectionLabel={sectionLabel}
              roleInfo={roleInfo}
              onSetRole={setRole}
              onRemoveMember={removeMember}
              onDelete={deleteChat}
              onToggleActive={toggleActive}
              onAddMember={addMember}
              query={query}
              setQuery={setQuery}
              found={found}
            />
          ))}
        </div>
      )}
    </div>
  );
}
function WorkChatCard(props: {
  wc: WorkChat;
  isAdmin: boolean;
  openMembers: boolean;
  onToggleOpen: () => void;
  sectionLabel: (s: string) => string;
  roleInfo: (r: string) => [string, string, string];
  onSetRole: (chatId: number, userId: number, role: string) => void;
  onRemoveMember: (chatId: number, userId: number) => void;
  onDelete: (chatId: number) => void;
  onToggleActive: (wc: WorkChat) => void;
  onAddMember: (chatId: number, userId: number) => void;
  query: string;
  setQuery: (v: string) => void;
  found: any[];
}) {
  const { wc, isAdmin, openMembers, onToggleOpen, sectionLabel, roleInfo,
          onSetRole, onRemoveMember, onDelete, onToggleActive, onAddMember,
          query, setQuery, found } = props;

  return (
    <div className="bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/10 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <Briefcase size={18} className={wc.is_active ? "text-green-500" : "text-gray-400"} />
        <div className="flex-1 min-w-0">
          <p className="text-gray-900 dark:text-white font-bold text-sm truncate">{wc.name}</p>
          <p className="text-xs text-gray-500 dark:text-white/40">
            Раздел: <span className="font-bold">{sectionLabel(wc.assigned_section)}</span> · {wc.members.length} участн.
            {!wc.is_active && " · неактивен"}
          </p>
        </div>
        {isAdmin && (
          <>
            <button
              onClick={() => onToggleActive(wc)}
              className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase border transition-colors ${
                wc.is_active ? "bg-green-500/10 text-green-600 border-green-500/30" : "text-gray-500 border-line dark:border-white/15"
              }`}
            >
              {wc.is_active ? "активен" : "выкл"}
            </button>
            <button
              onClick={onToggleOpen}
              className="px-2 py-1 rounded-lg text-[10px] font-black uppercase border border-line dark:border-white/15 text-gray-600 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/10"
            >
              участники
            </button>
            <button
              onClick={() => onDelete(wc.id)}
              className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
              title="Удалить рабочий чат"
            >
              <Trash2 size={16} />
            </button>
          </>
        )}
      </div>

      <div className="px-4 pb-3 flex flex-wrap gap-1.5">
        {wc.members.map((m) => {
          const [, rLabel, rColor] = roleInfo(m.role);
          return (
            <span
              key={m.user_id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border"
              style={{ color: rColor, borderColor: `${rColor}55`, backgroundColor: `${rColor}14` }}
              title={m.auto_assigned ? "Добавлен автоматически (staff)" : undefined}
            >
              <Avatar src={m.avatar_url} name={m.display_name} id={m.user_id} size={16} />
              {m.username}
              <span className="opacity-70">· {rLabel.replace(/^\S+\s/, "")}</span>
              {isAdmin && (
                <button
                  onClick={() => onRemoveMember(wc.id, m.user_id)}
                  className="opacity-50 hover:opacity-100"
                  title="Убрать из чата"
                >
                  <X size={11} />
                </button>
              )}
            </span>
          );
        })}
        {wc.members.length === 0 && (
          <span className="text-xs text-gray-500 dark:text-white/40">Нет участников</span>
        )}
      </div>
      {isAdmin && openMembers && (
        <div className="px-4 pb-4 space-y-2 border-t border-line dark:border-white/10 pt-3">
          {wc.members.map((m) => (
            <div key={m.user_id} className="flex items-center gap-2 text-xs">
              <Avatar src={m.avatar_url} name={m.display_name} id={m.user_id} size={20} />
              <span className="flex-1 min-w-0 truncate text-gray-800 dark:text-white/80">
                {m.display_name} <span className="text-gray-400">@{m.username}</span>
              </span>
              <select
                value={m.role}
                onChange={(e) => onSetRole(wc.id, m.user_id, e.target.value)}
                className="px-2 py-1 rounded-lg border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-xs"
              >
                {ROLES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
              <button
                onClick={() => onRemoveMember(wc.id, m.user_id)}
                className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg"
                title="Убрать"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <Search size={14} className="text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Найти пользователя и добавить…"
              className="flex-1 px-3 py-1.5 rounded-xl border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-xs focus:outline-none focus:border-[#8b5cf6]"
            />
          </div>
          {found.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {found
                .filter((u) => !wc.members.some((m) => m.user_id === u.id))
                .map((u) => (
                  <button
                    key={u.id}
                    onClick={() => onAddMember(wc.id, u.id)}
                    className="px-2 py-1 rounded-lg text-[11px] font-bold border border-[#8b5cf6]/40 text-[#8b5cf6] hover:bg-[#8b5cf6]/10"
                  >
                    + {u.display_name || u.username}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}