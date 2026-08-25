"use client";
import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";
import { Activity, RefreshCw } from "lucide-react";

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  login: { label: "Вход", color: "text-blue-400" },
  register: { label: "Регистрация", color: "text-green-400" },
  ban_user: { label: "Бан", color: "text-red-400" },
  unban_user: { label: "Разбан", color: "text-green-400" },
  delete_user: { label: "Удаление аккаунта", color: "text-red-400" },
  delete_post: { label: "Удаление поста", color: "text-orange-400" },
  block_ip: { label: "Блок IP", color: "text-red-400" },
  unblock_ip: { label: "Разблок IP", color: "text-green-400" },
};

export function LogsSection({ me }: { me: any }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const token = getToken();
    setLoading(true);
    const url = filter
      ? `${process.env.NEXT_PUBLIC_API_URL}/api/admin/logs?limit=100&action=${filter}`
      : `${process.env.NEXT_PUBLIC_API_URL}/api/admin/logs?limit=100`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    setLogs(res.ok ? await res.json() : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [filter]);

  async function clearLogs() {
    if (!confirm("Удалить ВСЕ логи?")) return;
    const token = getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/logs`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) { const d = await res.json(); alert(`Удалено: ${d.deleted}`); load(); }
    else { const d = await res.json().catch(() => null); alert(d?.detail ?? "Нет прав"); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          {[null, "login", "register", "ban_user", "delete_user", "block_ip", "delete_post"].map((act) => (
            <button key={act ?? "all"} onClick={() => setFilter(act)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${filter === act ? "bg-[#3b82f6] border-[#3b82f6] text-white" : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"}`}>
              {act ? (ACTION_LABELS[act]?.label || act) : "Все"}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {me.is_admin && (
            <button onClick={clearLogs} className="px-3 py-1.5 rounded-lg border border-red-400/30 text-red-400 text-xs font-bold hover:bg-red-500/10">
              Очистить логи
            </button>
          )}
          <button onClick={load} className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white"><RefreshCw size={16} /></button>
        </div>
      </div>

      {loading ? (
        <p className="p-8 text-center text-white/50">Загрузка...</p>
      ) : logs.length === 0 ? (
        <div className="p-12 text-center border border-white/10 rounded-xl bg-white/5">
          <Activity size={48} className="mx-auto text-white/20 mb-4" />
          <p className="text-white/50">Логов пока нет</p>
        </div>
      ) : (
        <div className="border border-white/10 rounded-xl bg-white/5 overflow-hidden">
          {logs.map((log) => {
            const cfg = ACTION_LABELS[log.action] || { label: log.action, color: "text-white/60" };
            return (
              <div key={log.id} className="p-4 border-b border-white/5 hover:bg-white/5 flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                  <Activity size={16} className={cfg.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-xs font-black uppercase ${cfg.color}`}>{cfg.label}</span>
                    {log.target_type && <span className="text-white/40 text-xs">→ {log.target_type} #{log.target_id}</span>}
                    {log.ip_address && <span className="text-white/30 text-xs font-mono">IP: {log.ip_address}</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-white/60 flex-wrap">
                    <span>{new Date(log.created_at).toLocaleString("ru-RU")}</span>
                    {log.actor && <span>От: <span className="text-white/80">{log.actor.display_name}</span></span>}
                    {log.details && <span className="text-white/40 truncate max-w-xs" title={JSON.stringify(log.details)}>{JSON.stringify(log.details)}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}