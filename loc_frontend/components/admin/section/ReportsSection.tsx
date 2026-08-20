"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { getToken } from "@/lib/auth";
import { Flag, CheckCircle, XCircle, Trash2, Ban } from "lucide-react";

const REASON_LABELS: Record<string, string> = {
  spam: "📢 Спам", insult: "😡 Оскорбление", nsfw: "🔞 Контент 18+",
  rules_violation: "⚠️ Нарушение правил", other: "❓ Другое",
};

export function ReportsSection({ me }: { me: any }) {
  const [reports, setReports] = useState<any[]>([]);
  const [filter, setFilter] = useState<"all" | "pending" | "resolved" | "rejected">("pending");

  async function load() {
    const token = getToken();
    const url = filter === "all"
      ? `${process.env.NEXT_PUBLIC_API_URL}/api/reports`
      : `${process.env.NEXT_PUBLIC_API_URL}/api/reports?status=${filter}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setReports(await res.json());
  }

  useEffect(() => { load(); }, [filter]);

  async function resolveReport(reportId: number, action: string) {
    const msgs: Record<string, string> = {
      delete_post: "Удалить пост и закрыть жалобу?",
      ban_user: "Забанить пользователя и закрыть жалобу?",
      ignore: "Закрыть жалобу без действий?",
    };
    if (!confirm(msgs[action])) return;
    const token = getToken();
    const form = new FormData();
    form.append("action", action);
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/reports/${reportId}/resolve`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
    });
    if (res.ok) load();
    else { const d = await res.json().catch(() => null); alert(d?.detail || "Ошибка"); }
  }

  async function rejectReport(reportId: number) {
    if (!confirm("Отклонить жалобу?")) return;
    const token = getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/reports/${reportId}/reject`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) load();
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {(["pending", "resolved", "rejected", "all"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full border text-xs font-bold ${filter === f ? "border-[#8b5cf6] bg-[#8b5cf6] text-white" : "border-white/20 text-white/60 hover:bg-white/10"}`}>
            {f === "pending" && "⏳ Новые"}
            {f === "resolved" && "✅ Обработанные"}
            {f === "rejected" && "❌ Отклонённые"}
            {f === "all" && "Все"}
          </button>
        ))}
      </div>

      {reports.length === 0 && <p className="p-8 text-center text-white/50">Нет жалоб</p>}

      <div className="space-y-3">
        {reports.map((r) => (
          <div key={r.id} className={`border rounded-xl p-4 ${
            r.status === "pending" ? "border-orange-400/30 bg-orange-500/5"
            : r.status === "resolved" ? "border-green-400/30 bg-green-500/5"
            : "border-white/15 bg-white/5"
          }`}>
            <div className="flex items-start gap-4">
              {r.reporter && <Avatar src={r.reporter.avatar_url} name={r.reporter.display_name} id={r.reporter.id} size={40} />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-white">{r.reporter?.display_name || "Unknown"}</span>
                  <span className="text-white/50 text-sm">пожаловался на</span>
                  {r.target?.type === "post"
                    ? <span className="text-[#8b5cf6] font-bold">пост</span>
                    : <span className="text-[#8b5cf6] font-bold">пользователя {r.target?.display_name}</span>}
                </div>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-1 rounded-lg bg-white/10 text-xs font-bold text-white/80">{REASON_LABELS[r.reason] || r.reason}</span>
                  <span className="text-white/40 text-xs">{new Date(r.created_at).toLocaleString("ru-RU")}</span>
                </div>
                {r.comment && <p className="mt-2 text-sm text-white/70 italic">"{r.comment}"</p>}
                {r.target?.type === "post" && (
                  <div className="mt-3 p-3 rounded-lg bg-white/5 border border-white/10">
                    <p className="text-sm text-white/80 line-clamp-3">{r.target.text}</p>
                    <p className="text-xs text-white/40 mt-1">Автор: {r.target.author_name}</p>
                  </div>
                )}
                {r.target?.type === "user" && (
                  <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-white/5 border border-white/10">
                    <Avatar src={r.target.avatar_url} name={r.target.display_name} id={r.target.id} size={32} />
                    <div>
                      <p className="text-sm font-bold text-white">{r.target.display_name}</p>
                      <p className="text-xs text-white/40">@{r.target.username}</p>
                    </div>
                  </div>
                )}
              </div>
              {r.status === "pending" && (
                <div className="flex flex-col gap-2">
                  {r.target?.type === "post" && (
                    <button onClick={() => resolveReport(r.id, "delete_post")}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-400/30 text-red-400 text-xs font-bold hover:bg-red-500/10">
                      <Trash2 size={12} /> Удалить пост
                    </button>
                  )}
                  <button onClick={() => resolveReport(r.id, "ban_user")}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-400/30 text-red-400 text-xs font-bold hover:bg-red-500/10">
                    <Ban size={12} /> Забанить
                  </button>
                  <button onClick={() => resolveReport(r.id, "ignore")}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-green-400/30 text-green-400 text-xs font-bold hover:bg-green-500/10">
                    <CheckCircle size={12} /> Закрыть
                  </button>
                  <button onClick={() => rejectReport(r.id)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/20 text-white/60 text-xs font-bold hover:bg-white/10">
                    <XCircle size={12} /> Отклонить
                  </button>
                </div>
              )}
              {r.status === "resolved" && <span className="px-2 py-1 rounded-lg bg-green-500/20 text-green-400 text-xs font-bold"><CheckCircle size={12} className="inline" /> Обработана</span>}
              {r.status === "rejected" && <span className="px-2 py-1 rounded-lg bg-white/10 text-white/60 text-xs font-bold"><XCircle size={12} className="inline" /> Отклонена</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}