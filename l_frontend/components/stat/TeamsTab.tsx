"use client";

/**
 * 🏢 Вкладка «Команды» в /stat (Этап 5).
 * Дерево: Отдел → Рабочий чат → участники; правка team_hierarchy и
 * team_permissions; управление межгрупповыми чатами (чат глав / замов).
 * Бэкенд: GET /api/admin/teams/structure, PATCH .../hierarchy, .../permissions,
 * POST/GET/DELETE /api/admin/cross-team-chats
 */

import { useCallback, useEffect, useState } from "react";
import { Building2, Lock, ChevronDown, Link2, Trash2, Shield } from "lucide-react";

const HIERARCHY_LABELS: Record<string, string> = {
  head: "Глава",
  cross_head: "Кросс-глава",
  deputy: "Зам",
  senior: "Старший",
  junior: "Новичок",
};

export default function TeamsTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [crossChats, setCrossChats] = useState<any[]>([]);
  const [crossName, setCrossName] = useState("");
  const [crossType, setCrossType] = useState("heads_only");
  const [openPerms, setOpenPerms] = useState<number | null>(null);
  // 🎫 Очередь заявок отдела (Этап 7)
  const [tickets, setTickets] = useState<Record<number, any[]>>({});
  const [openTicketsCat, setOpenTicketsCat] = useState<number | null>(null);
  const [ticketTitle, setTicketTitle] = useState("");
  const [ticketKind, setTicketKind] = useState("complaint");

  const getToken = () => localStorage.getItem("token") || "";

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const [sRes, cRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/teams/structure`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/cross-team-chats`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      if (sRes.status === 403) {
        setError("Нет права: manage_team_hierarchy");
        setLoading(false);
        return;
      }
      if (!sRes.ok) {
        const d = await sRes.json().catch(() => ({}));
        setError(d?.detail || `Ошибка загрузки команд (${sRes.status})`);
        setLoading(false);
        return;
      }
      setData(await sRes.json());
      if (cRes.ok) setCrossChats(await cRes.json());
      setError(null);
    } catch {
      setError("Ошибка сети. Попробуйте ещё раз.");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveHierarchy(categoryId: number, userId: number, hierarchy: string | null) {
    const key = `h-${categoryId}-${userId}`;
    setSaving(key);
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/teams/${categoryId}/hierarchy`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ user_id: userId, team_hierarchy: hierarchy }),
    });
    setSaving(null);
    await load();
  }

  async function savePermissions(categoryId: number, userId: number, permissions: string[], ticketKinds?: string[]) {
    const key = `p-${categoryId}-${userId}`;
    setSaving(key);
    const body: any = { user_id: userId, permissions };
    if (ticketKinds !== undefined) body.ticket_kinds = ticketKinds;
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/teams/${categoryId}/permissions`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(body),
    });
    setSaving(null);
    await load();
  }

  async function togglePerm(categoryId: number, userId: number, current: string[], permId: string) {
    const next = current.includes(permId) ? current.filter((p) => p !== permId) : [...current, permId];
    await savePermissions(categoryId, userId, next);
  }

  async function toggleKind(categoryId: number, userId: number, current: string[], kind: string, permissions: string[]) {
    const next = current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind];
    await savePermissions(categoryId, userId, permissions, next);
  }

  async function createCrossChat() {
    if (!crossName.trim()) return;
    const body = new FormData();
    body.append("name", crossName.trim());
    body.append("cross_team_type", crossType);
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/cross-team-chats`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
      body,
    });
    setCrossName("");
    await load();
  }

  async function deleteCrossChat(id: number) {
    if (!confirm("Удалить этот межгрупповой чат? Действие необратимо.")) return;
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/cross-team-chats/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    await load();
  }

  // ===== 🎫 Очередь заявок =====
  async function loadTickets(categoryId: number) {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/teams/${categoryId}/tickets`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok) {
      const data = await res.json();
      setTickets((prev) => ({ ...prev, [categoryId]: data }));
    }
  }

  function toggleTickets(categoryId: number) {
    if (openTicketsCat === categoryId) { setOpenTicketsCat(null); return; }
    setOpenTicketsCat(categoryId);
    loadTickets(categoryId);
  }

  async function createTicket(categoryId: number) {
    if (!ticketTitle.trim()) return;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/teams/${categoryId}/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ title: ticketTitle.trim(), kind: ticketKind }),
    });
    if (res.ok) {
      const d = await res.json();
      if (!d.auto_assigned) alert("Заявка создана, но исполнителя нет: никто не имеет права can_handle_tasks");
      setTicketTitle("");
      await loadTickets(categoryId);
    } else {
      const e = await res.json().catch(() => ({}));
      alert(e.detail || "Ошибка создания заявки");
    }
  }

  async function closeTicket(categoryId: number, ticketId: number) {
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/teams/${categoryId}/tickets/${ticketId}/close`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    await loadTickets(categoryId);
  }

  async function assignTicket(categoryId: number, ticketId: number, userId: number) {
    const body = new FormData();
    body.append("user_id", String(userId));
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/teams/${categoryId}/tickets/${ticketId}/assign`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
      body,
    });
    await loadTickets(categoryId);
  }

  if (loading) {
    return <div className="text-center py-16 text-gray-500 dark:text-white/40">Загрузка команд…</div>;
  }
  if (error) {
    return (
      <div className="text-center py-16 border border-line dark:border-white/10 rounded-2xl bg-gray-100 dark:bg-white/5">
        <Shield size={48} className="mx-auto text-gray-500 dark:text-white/20 mb-4" />
        <p className="text-gray-600 dark:text-white/50 mb-4">{error}</p>
        <button
          onClick={() => { setLoading(true); setError(null); load(); }}
          className="px-4 py-2 rounded-xl bg-purple-500 text-white text-sm font-bold hover:bg-purple-600 transition-colors"
        >
          Повторить
        </button>
      </div>
    );
  }

  const allowedPerms: any[] = data?.allowed_permissions || [];
  const hierarchies: string[] = data?.allowed_hierarchies || [];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-black text-gray-900 dark:text-white uppercase">Управление командами</h2>
      {/* ===== Отделы ===== */}
      {(data?.teams || []).map((team: any) => (
        <div key={team.category_id} className="space-y-3">
          <div className="flex items-center gap-3 pb-2 border-b border-line dark:border-white/10">
            <Building2 size={20} className="text-purple-500" />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white uppercase tracking-wide">{team.name}</h3>
            {team.chat_name && (
              <span className="text-xs text-gray-500 dark:text-white/40 bg-gray-100 dark:bg-white/5 px-2 py-0.5 rounded-full">
                💼 {team.chat_name}
              </span>
            )}
            <span className="text-xs text-gray-500 dark:text-white/40 bg-gray-100 dark:bg-white/5 px-2 py-0.5 rounded-full">
              {team.members.length} чел.
            </span>
          </div>
          {team.members.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-white/40 px-2">В рабочем чате отдела пока нет участников</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {team.members.map((m: any) => (
                <div key={m.user_id} className="bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/10 rounded-xl p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-purple-500/15 text-purple-500 flex items-center justify-center font-black text-sm shrink-0">
                      {(m.display_name || "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-900 dark:text-white font-bold text-sm truncate">{m.display_name}</p>
                      <p className="text-gray-500 dark:text-white/40 text-xs truncate">
                        @{m.username} · Lvl {m.level}{m.role_name ? ` · ${m.role_name}` : ""}
                        {m.on_shift && <span className="ml-1 text-green-500 font-bold" title="На смене (/enter)">🟢 на смене</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <select
                      value={m.team_hierarchy || ""}
                      onChange={(e) => saveHierarchy(team.category_id, m.user_id, e.target.value || null)}
                      className="flex-1 min-w-0 text-xs rounded-lg border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white px-2 py-1.5 focus:outline-none focus:border-[#8b5cf6]"
                      title={m.team_hierarchy_manual ? "Задано вручную" : "Авто по уровню роли"}
                    >
                      <option value="">— Авто по уровню —</option>
                      {hierarchies.map((h) => (
                        <option key={h} value={h}>{HIERARCHY_LABELS[h] || h}</option>
                      ))}
                    </select>
                    {m.team_hierarchy_manual && (
                      <span className="text-[10px] text-purple-500 font-bold shrink-0" title="Переопределено вручную">руч.</span>
                    )}
                    <div className="relative shrink-0">
                      <button
                        onClick={() => setOpenPerms(openPerms === m.user_id ? null : m.user_id)}
                        className={`text-xs px-2 py-1.5 rounded-lg border transition-colors ${
                          m.team_permissions.length > 0
                            ? "border-purple-500/50 text-purple-500 bg-purple-500/10"
                            : "border-line dark:border-white/15 text-gray-500 dark:text-white/40"
                        }`}
                      >
                        Права ({m.team_permissions.length})
                      </button>
                      {openPerms === m.user_id && (
                        <div className="absolute right-0 top-full mt-1 z-20 w-64 rounded-xl border border-line dark:border-white/15 bg-white dark:bg-[#1f1f23] shadow-xl p-2 space-y-1">
                          {allowedPerms.map((p) => (
                            <label key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 cursor-pointer text-xs text-gray-900 dark:text-white">
                              <input
                                type="checkbox"
                                checked={m.team_permissions.includes(p.id)}
                                onChange={() => togglePerm(team.category_id, m.user_id, m.team_permissions, p.id)}
                                className="accent-[#8b5cf6]"
                              />
                              {p.label}
                            </label>
                          ))}
                          <div className="border-t border-line dark:border-white/10 my-1" />
                          <p className="px-2 text-[10px] font-black uppercase text-gray-500 dark:text-white/40">Типы заявок (пусто = все)</p>
                          {[["complaint", "Жалобы"], ["appeal", "Обращения"], ["other", "Другое"]].map(([k, label]) => (
                            <label key={k} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 cursor-pointer text-xs text-gray-900 dark:text-white">
                              <input
                                type="checkbox"
                                checked={m.ticket_kinds.includes(k)}
                                onChange={() => toggleKind(team.category_id, m.user_id, m.ticket_kinds, k, m.team_permissions)}
                                className="accent-[#8b5cf6]"
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {saving === `h-${team.category_id}-${m.user_id}` || saving === `p-${team.category_id}-${m.user_id}` ? (
                    <p className="text-[10px] text-purple-500 mt-1">Сохранение…</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          {/* 🎫 Очередь заявок отдела (Этап 7) */}
          <div className="rounded-xl border border-line dark:border-white/10 bg-gray-100/60 dark:bg-white/[0.03]">
            <button
              onClick={() => toggleTickets(team.category_id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left"
            >
              <span className="text-sm">🎫</span>
              <span className="text-xs font-black uppercase tracking-wider text-gray-700 dark:text-white/70">Заявки отдела</span>
              <ChevronDown size={14} className={`ml-auto text-gray-400 transition-transform ${openTicketsCat === team.category_id ? "" : "-rotate-90"}`} />
            </button>
            {openTicketsCat === team.category_id && (
              <div className="px-3 pb-3 space-y-2">
                <div className="flex gap-2">
                  <select
                    value={ticketKind}
                    onChange={(e) => setTicketKind(e.target.value)}
                    className="rounded-lg border border-line dark:border-white/15 bg-white dark:bg-white/5 text-gray-900 dark:text-white text-xs px-2 focus:outline-none focus:border-[#8b5cf6]"
                  >
                    <option value="complaint">Жалоба</option>
                    <option value="appeal">Обращение</option>
                    <option value="other">Другое</option>
                  </select>
                  <input
                    value={ticketTitle}
                    onChange={(e) => setTicketTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && createTicket(team.category_id)}
                    placeholder="Новая заявка…"
                    className="flex-1 px-3 py-1.5 rounded-lg border border-line dark:border-white/15 bg-white dark:bg-white/5 text-gray-900 dark:text-white text-xs focus:outline-none focus:border-[#8b5cf6]"
                  />
                  <button
                    onClick={() => createTicket(team.category_id)}
                    className="px-3 py-1.5 rounded-lg bg-purple-500 text-white text-xs font-bold hover:bg-purple-600"
                  >
                    Создать
                  </button>
                </div>
                {(tickets[team.category_id] || []).length === 0 ? (
                  <p className="text-xs text-gray-500 dark:text-white/40">Заявок нет</p>
                ) : (
                  tickets[team.category_id].map((t: any) => (
                    <div key={t.id} className="flex items-center gap-2 text-xs bg-white dark:bg-[#1f1f23] border border-line dark:border-white/10 rounded-lg px-2.5 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase ${
                        t.status === "done" ? "bg-green-500/15 text-green-600"
                        : t.status === "assigned" ? "bg-purple-500/15 text-purple-500"
                        : "bg-gray-300/40 text-gray-600 dark:text-white/50"
                      }`}>
                        {t.status === "done" ? "закрыта" : t.status === "assigned" ? "в работе" : "открыта"}
                      </span>
                      <span className="flex-1 min-w-0 truncate text-gray-900 dark:text-white font-bold" title={t.description || t.title}>{t.title}</span>
                      {t.status !== "done" && (
                        <>
                          <select
                            value={t.assigned_to || ""}
                            onChange={(e) => e.target.value && assignTicket(team.category_id, t.id, Number(e.target.value))}
                            className="max-w-36 text-[11px] rounded-lg border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-white/70 px-1.5 py-1 focus:outline-none focus:border-[#8b5cf6]"
                            title="Назначить исполнителя"
                          >
                            <option value="">{t.assigned_to ? `@${t.assigned_to_username}` : "— не назначена —"}</option>
                            {team.members.map((m: any) => (
                              <option key={m.user_id} value={m.user_id}>@{m.username}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => closeTicket(team.category_id, t.id)}
                            className="px-2 py-1 rounded-lg bg-green-600/90 text-white font-bold hover:bg-green-600"
                            title="Закрыть заявку"
                          >
                            ✓
                          </button>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      ))}

      {/* ===== Межгрупповые чаты ===== */}
      <div className="space-y-3 pt-4 border-t border-line dark:border-white/10">
        <div className="flex items-center gap-3">
          <Link2 size={20} className="text-purple-500" />
          <h3 className="text-lg font-bold text-gray-900 dark:text-white uppercase tracking-wide">Межгрупповые чаты</h3>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            value={crossName}
            onChange={(e) => setCrossName(e.target.value)}
            placeholder="Название (например, Совет глав)"
            className="flex-1 min-w-48 px-3 py-2 rounded-xl border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-[#8b5cf6]"
          />
          <select
            value={crossType}
            onChange={(e) => setCrossType(e.target.value)}
            className="px-3 py-2 rounded-xl border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-[#8b5cf6]"
          >
            <option value="heads_only">Только главы (lvl 6+)</option>
            <option value="deputies_only">Только замы</option>
          </select>
          <button
            onClick={createCrossChat}
            className="px-4 py-2 rounded-xl bg-purple-500 text-white text-sm font-bold hover:bg-purple-600 transition-colors"
          >
            Создать
          </button>
        </div>
        {crossChats.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-white/40 px-1">Пока нет межгрупповых чатов</p>
        ) : (
          <div className="space-y-2">
            {crossChats.map((c) => (
              <div key={c.id} className="flex items-center gap-3 bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/10 rounded-xl px-4 py-3">
                <Lock size={14} className="text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 dark:text-white font-bold text-sm truncate">{c.name}</p>
                  <p className="text-gray-500 dark:text-white/40 text-xs">
                    {c.cross_team_type === "heads_only" ? "👑 Только главы" : "🛡 Только замы"} · {c.members_count} участн.
                  </p>
                </div>
                <button
                  onClick={() => deleteCrossChat(c.id)}
                  className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                  title="Удалить чат"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
