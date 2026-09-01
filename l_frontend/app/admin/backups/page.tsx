"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { getToken } from "@/lib/auth";
import { ArrowLeft, Shield, RotateCcw, Trash2, Ban } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

type BackupItem = {
  id: number;
  actor_id: number;
  action: string;
  target_type: string;
  target_id: number | null;
  payload: string;
  created_at: string;
};

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  delete_post: { label: "Удаление поста", color: "text-red-400" },
  ban_user: { label: "Бан пользователя", color: "text-orange-400" },
};

export default function BackupsPage() {
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [actorFilter, setActorFilter] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const token = getToken();
      if (!token) { window.location.href = "/"; return; }
      const meRes = await fetch(`${API_URL}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
      const meData = await meRes.json();
      setMe(meData);
      if (!meData.is_admin && !meData.permissions?.includes("manage_backups")) {
        window.location.href = "/";
        return;
      }
      await load();
    })();
  }, []);

  async function load() {
    const token = getToken();
    if (!token) return;
    const q = actorFilter ? `?actor_id=${encodeURIComponent(actorFilter)}` : "";
    const res = await fetch(`${API_URL}/api/admin/backups${q}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setBackups(await res.json());
    setLoading(false);
  }

  async function restore(id: number) {
    if (!confirm("Откатить это действие? Пост будет восстановлен / бан снят.")) return;
    setBusy(id);
    const token = getToken();
    const res = await fetch(`${API_URL}/api/admin/backups/${id}/restore`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    setMsg(res.ok ? `Откат выполнен: ${JSON.stringify(data)}` : `Ошибка: ${data.detail || res.status}`);
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

  function parsePayload(b: BackupItem): string {
    try {
      const p = JSON.parse(b.payload || "{}");
      if (b.action === "delete_post") return `Постов в ветке: ${p.posts?.length ?? 0}`;
      if (b.action === "ban_user") return `Юзер: @${p.username ?? p.user_id}`;
      return "—";
    } catch { return "—"; }
  }

  const canPurge = !!me?.is_admin;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0f] text-gray-900 dark:text-white">
      <Sidebar />
      <main className="lg:pl-64 p-4 sm:p-8 max-w-5xl mx-auto">
        <Link href="/admin" className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-white/50 hover:text-purple-500 mb-6">
          <ArrowLeft size={16} /> Назад в админку
        </Link>

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <Shield size={20} className="text-purple-500" />
            </div>
            <div>
              <h1 className="text-xl font-black">Резерв действий админов</h1>
              <p className="text-xs text-gray-500 dark:text-white/40">Откат удалений и банов. При «бане админа» его действия откатываются автоматически.</p>
            </div>
          </div>
          {canPurge && (
            <button onClick={purge} className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/5">
              <Trash2 size={14} /> Чистка (30д)
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 mb-4">
          <input
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Фильтр: ID админа…"
            className="px-3 py-2 text-sm rounded-lg bg-white dark:bg-white/5 border border-gray-300 dark:border-white/10 outline-none focus:border-purple-500 w-56"
          />
          <button onClick={load} className="text-sm px-4 py-2 rounded-lg bg-purple-500 text-white font-bold hover:bg-purple-600">Обновить</button>
        </div>

        {msg && <div className="mb-4 text-sm px-4 py-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-300">{msg}</div>}

        {loading ? (
          <div className="text-sm text-gray-500 dark:text-white/40 py-10 text-center">Загрузка…</div>
        ) : backups.length === 0 ? (
          <div className="text-sm text-gray-500 dark:text-white/40 py-10 text-center border border-dashed border-gray-300 dark:border-white/10 rounded-2xl">
            Резерв пуст — деструктивных действий не зафиксировано.
          </div>
        ) : (
          <div className="space-y-2">
            {backups.map((b) => {
              const meta = ACTION_LABELS[b.action] || { label: b.action, color: "text-gray-400" };
              return (
                <div key={b.id} className="flex items-center gap-3 p-4 rounded-xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-bold ${meta.color}`}>{meta.label}</span>
                      <span className="text-xs text-gray-500 dark:text-white/40">#{b.id}</span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-white/40 mt-1">
                      Админ #{b.actor_id} · {parsePayload(b)} · {new Date(b.created_at).toLocaleString("ru-RU")}
                    </div>
                  </div>
                  {b.action === "ban_user" && <Ban size={16} className="text-orange-400 shrink-0" />}
                  <button
                    onClick={() => restore(b.id)}
                    disabled={busy === b.id}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50 shrink-0"
                  >
                    <RotateCcw size={13} /> {busy === b.id ? "…" : "Откатить"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}


