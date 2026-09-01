"use client";
import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";
import { Shield, RotateCcw, Trash2, Ban, Search } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

type BackupItem = {
  id: number;
  actor_id?: number;
  actor?: { id: number; username: string; avatar_url: string } | null;
  action: string;
  target_type: string;
  target_id: number | null;
  payload_preview?: string;
  created_at: string;
};

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  delete_post: { label: "Удаление поста", color: "text-red-400" },
  ban_user: { label: "Бан пользователя", color: "text-orange-400" },
};

export function BackupsSection({ me }: { me: any }) {
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [banTargetId, setBanTargetId] = useState("");
  const [banBusy, setBanBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const token = getToken();
    if (!token) return;
    const res = await fetch(`${API_URL}/api/admin/backups`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      // Бэкенд возвращает { backups: [...] }
      setBackups(Array.isArray(data) ? data : (data.backups || []));
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function restore(id: number) {
    if (!confirm("Откатить это действие? Пост будет восстановлен / бан снят.")) return;
    setBusy(id);
    const token = getToken();
    const res = await fetch(`${API_URL}/api/admin/backups/${id}/restore`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    setMsg(res.ok
      ? `Откат выполнен: ${JSON.stringify(data)}`
      : `Ошибка: ${data.detail || res.status}`);
    if (res.ok) await load();
  }

  async function purge() {
    if (!confirm("Удалить все ОТКАЧЕННЫЕ записи старше 30 дней?")) return;
    const token = getToken();
    const res = await fetch(`${API_URL}/api/admin/backups/purge?days=30`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    setMsg(`Чистка: удалено ${data.deleted ?? 0}`);
    await load();
  }

  async function banAdmin() {
    const id = Number(banTargetId);
    if (!id) { setMsg("Введите ID админа"); return; }
    if (!confirm("Бан админа + мгновенный откат ВСЕХ его действий из резервной БД?")) return;
    setBanBusy(true);
    const token = getToken();
    const res = await fetch(`${API_URL}/api/admin/users/${id}/ban-admin`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    setBanBusy(false);
    if (res.ok) {
      setMsg(`Админ @${data.banned} забанен. Откачено: ${JSON.stringify(data.restored)}`);
      setBanTargetId("");
    } else {
      setMsg(`Ошибка: ${data.detail || res.status}`);
    }
  }

  const canPurge = !!me?.is_admin;
  const canBanAdmin = !!me?.is_admin || (me?.permissions || []).includes("manage_backups");

  const normalize = (s: any) => String(s ?? "").toLowerCase();
  const filtered = backups.filter((b) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const haystack = [
      b.id,
      b.actor_id,
      b.actor?.id,
      b.actor?.username,
      b.action,
      ACTION_LABELS[b.action]?.label,
      b.target_type,
      b.target_id,
      b.payload_preview,
      b.created_at ? new Date(b.created_at).toLocaleString("ru-RU") : "",
    ].map(normalize).join(" ");
    return haystack.includes(q);
  });

  const actorName = (b: BackupItem) =>
    b.actor ? `@${b.actor.username}` : `Админ #${b.actor_id ?? "?"}`;

  const summary = (b: BackupItem): string => {
    if (b.action === "delete_post") {
      try {
        const p = JSON.parse(b.payload_preview || "{}");
        return `Постов в ветке: ${p.posts?.length ?? 0}`;
      } catch { return "—"; }
    }
    if (b.action === "ban_user") return `Юзер: @${b.target_id ?? "?"}`;
    return "—";
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="border border-line dark:border-white/10 rounded-xl bg-gray-100 dark:bg-white/5 p-5">

        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <Shield size={20} className="text-purple-500" />
            </div>
            <div>
              <h2 className="text-lg font-black">Резерв действий админов</h2>
              <p className="text-xs text-gray-500 dark:text-white/40">
                Откат удалений и банов. При «бане админа» его действия откатываются автоматически.
              </p>
            </div>
          </div>
          {canPurge && (
            <button onClick={purge}
              className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/5">
              <Trash2 size={14} /> Чистка (30д)
            </button>
          )}
        </div>

        {/* Универсальный поиск: админ, ID, действие, цель, дата */}
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-white/40" />
            <input value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск: @админ, ID, действие, цель, дата…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-white dark:bg-white/5 border border-line dark:border-white/15 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-purple-500" />
          </div>
          <button onClick={load}
            className="text-sm px-4 py-2 rounded-lg bg-purple-500 text-white font-bold hover:bg-purple-600">
            Обновить
          </button>
        </div>

        {/* Бан админа + автооткат */}
        {canBanAdmin && (
          <div className="flex items-center gap-2 flex-wrap mb-4 p-3 rounded-xl border border-red-500/30 bg-red-500/5">
            <Ban size={16} className="text-red-500 shrink-0" />
            <input value={banTargetId}
              onChange={(e) => setBanTargetId(e.target.value)}
              placeholder="ID админа"
              className="w-32 px-3 py-2 text-sm rounded-lg bg-white dark:bg-white/5 border border-line dark:border-white/15 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-red-500" />
            <button onClick={banAdmin} disabled={banBusy}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50">
              <Ban size={13} /> {banBusy ? "…" : "Бан админа + откат"}
            </button>
          </div>
        )}

        {msg && <div className="mb-4 text-sm px-4 py-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-300">{msg}</div>}

        {loading ? (
          <p className="text-sm text-gray-500 dark:text-white/40 py-8 text-center">Загрузка…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-white/40 py-8 text-center border border-dashed border-gray-300 dark:border-white/10 rounded-2xl">
            Резерв пуст — деструктивных действий не зафиксировано.
          </p>
        ) : (
          <div className="space-y-2 max-h-[26rem] overflow-y-auto">
            {filtered.map((b) => {
              const meta = ACTION_LABELS[b.action] || { label: b.action, color: "text-gray-400" };
              return (
                <div key={b.id} className="flex items-center gap-3 p-4 rounded-xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-bold ${meta.color}`}>{meta.label}</span>
                      <span className="text-xs text-gray-500 dark:text-white/40">#{b.id}</span>
                      {b.action === "ban_user" && <Ban size={14} className="text-orange-400" />}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-white/40 mt-1">
                      {actorName(b)} · {summary(b)} · {b.created_at ? new Date(b.created_at).toLocaleString("ru-RU") : "—"}
                    </div>
                  </div>
                  <button
                    onClick={() => restore(b.id)}
                    disabled={busy === b.id}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50 shrink-0">
                    <RotateCcw size={13} /> {busy === b.id ? "…" : "Откатить"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}