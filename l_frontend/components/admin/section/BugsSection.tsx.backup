"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getToken } from "@/lib/auth";
import { Bug, AlertCircle, Clock, CheckCircle, XCircle, Trash2, X } from "lucide-react";

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string; icon: any }> = {
  new: { label: "Новый", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10", border: "border-blue-400/30", icon: AlertCircle },
  in_progress: { label: "В обработке", color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-400/30", icon: Clock },
  resolved: { label: "Решено", color: "text-green-600 dark:text-green-400", bg: "bg-green-500/10", border: "border-green-400/30", icon: CheckCircle },
  rejected: { label: "Отклонено", color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10", border: "border-red-400/30", icon: XCircle },
};

const PRIORITY_CFG: Record<string, { label: string; color: string }> = {
  low: { label: "Низкий", color: "text-green-600 dark:text-green-400" },
  medium: { label: "Средний", color: "text-yellow-600 dark:text-yellow-400" },
  high: { label: "Высокий", color: "text-orange-600 dark:text-orange-400" },
  critical: { label: "Критический", color: "text-red-600 dark:text-red-400" },
};

export function BugsSection({ me }: { me: any }) {
  const [bugs, setBugs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<any>(null);

  async function load() {
    const token = getToken();
    const url = statusFilter
      ? `${process.env.NEXT_PUBLIC_API_URL}/api/bugs?status=${statusFilter}`
      : `${process.env.NEXT_PUBLIC_API_URL}/api/bugs`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    setBugs(res.ok ? await res.json() : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [statusFilter]);

  async function updateStatus(bugId: number, status: string) {
    const token = getToken();
    const form = new FormData();
    form.append("status", status);
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/bugs/${bugId}`, {
      method: "PATCH", headers: { Authorization: `Bearer ${token}` }, body: form,
    });
    if (res.ok) { load(); setSelected(null); }
    else { const d = await res.json().catch(() => null); alert(d?.detail ?? "Ошибка"); }
  }

  async function deleteBug(bugId: number) {
    if (!confirm("Удалить баг-репорт?")) return;
    const token = getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/bugs/${bugId}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) { load(); setSelected(null); }
  }

  const counts = {
    new: bugs.filter((b) => b.status === "new").length,
    in_progress: bugs.filter((b) => b.status === "in_progress").length,
    resolved: bugs.filter((b) => b.status === "resolved").length,
    rejected: bugs.filter((b) => b.status === "rejected").length,
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(STATUS_CFG).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <button key={key} onClick={() => setStatusFilter(statusFilter === key ? null : key)}
              className={`border rounded-xl p-4 text-left transition-all ${statusFilter === key ? `${cfg.border} ${cfg.bg}` : "border-line dark:border-white/10 bg-white dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10"}`}>
              <div className="flex items-center justify-between mb-2">
                <Icon size={18} className={cfg.color} />
                <span className={`text-2xl font-black ${cfg.color}`}>{counts[key as keyof typeof counts]}</span>
              </div>
              <p className="text-sm font-bold text-gray-800 dark:text-white/80">{cfg.label}</p>
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="text-center text-gray-600 dark:text-white/50 py-12">Загрузка...</p>
      ) : bugs.length === 0 ? (
        <div className="p-12 text-center border border-line dark:border-white/10 rounded-xl bg-gray-100 dark:bg-white/5">
          <Bug size={48} className="mx-auto text-gray-500 dark:text-white/20 mb-4" />
          <p className="text-gray-600 dark:text-white/60">Обращений пока нет</p>
        </div>
      ) : (
        <div className="space-y-3">
          {bugs.map((bug) => {
            const sc = STATUS_CFG[bug.status] || STATUS_CFG.new;
            const pc = PRIORITY_CFG[bug.priority] || PRIORITY_CFG.medium;
            const Icon = sc.icon;
            return (
              <div key={bug.id} onClick={() => setSelected(bug)} className={`border rounded-xl p-4 hover:bg-gray-100 dark:hover:bg-white/5 cursor-pointer ${sc.border}`}>
                <div className="flex items-start gap-4">
                  <div className={`p-2 rounded-lg ${sc.bg} shrink-0`}><Icon size={20} className={sc.color} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <h3 className="font-bold text-gray-900 dark:text-white truncate">{bug.title}</h3>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${pc.color} bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10`}>{pc.label}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${sc.color} ${sc.bg}`}>{sc.label}</span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-white/60 line-clamp-2">{bug.description}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-white/40 flex-wrap">
                      <span>От: <span className="text-gray-800 dark:text-white/70">{bug.reporter?.display_name}</span></span>
                      <span>{new Date(bug.created_at).toLocaleString("ru-RU")}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Модалка бага */}
      {selected && (
        <>
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200]" onClick={() => setSelected(null)} />
          <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
            <div className="w-full max-w-2xl border border-line dark:border-white/20 rounded-2xl bg-ivory dark:bg-[#1f1f23]/95 backdrop-blur-md shadow-2xl p-6 pointer-events-auto max-h-[85vh] overflow-y-auto">
              <div className="flex items-start justify-between mb-4 gap-3">
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg sm:text-xl font-black text-gray-900 dark:text-white">{selected.title}</h2>
                  <p className="text-sm text-gray-600 dark:text-white/50 mt-1">
                    ID #{selected.id} • От:{" "}
                    {selected.reporter ? (
                      <Link href={`/user/${selected.reporter.id}`} className="text-[#8b5cf6] hover:underline">@{selected.reporter.username}</Link>
                    ) : "неизвестен"}
                  </p>
                </div>
                <button onClick={() => setSelected(null)} className="text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10"><X size={20} /></button>
              </div>
              <p className="text-gray-800 dark:text-white/90 whitespace-pre-wrap bg-gray-100 dark:bg-white/5 p-4 rounded-lg border border-line dark:border-white/10 mb-6">{selected.description}</p>
              <h3 className="text-sm font-bold text-gray-800 dark:text-white/80 mb-3">Сменить статус:</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
                {Object.entries(STATUS_CFG).map(([key, cfg]) => {
                  const Icon = cfg.icon;
                  return (
                    <button key={key} onClick={() => updateStatus(selected.id, key)} disabled={selected.status === key}
                      className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold ${selected.status === key ? `${cfg.border} ${cfg.bg} ${cfg.color}` : "border-line dark:border-white/20 text-gray-600 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/10"} disabled:opacity-60`}>
                      <Icon size={14} /> {cfg.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-3 pt-2 border-t border-line dark:border-white/10">
                <button onClick={() => deleteBug(selected.id)} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-400/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 text-sm font-bold">
                  <Trash2 size={16} /> Удалить
                </button>
                <button onClick={() => setSelected(null)} className="flex-1 border border-line dark:border-white/20 rounded-lg py-2 font-bold text-gray-800 dark:text-white/80 hover:bg-gray-100 dark:hover:bg-white/10">Закрыть</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}