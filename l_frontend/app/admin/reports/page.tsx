"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Avatar } from "@/components/Avatar";
import { getToken } from "@/lib/auth";
import { Flag, CheckCircle, XCircle, Trash2, Ban } from "lucide-react";

const REASON_LABELS: Record<string, string> = {
  spam: "📢 Спам",
  insult: "рџЎ Оскорбление",
  nsfw: "🔞 Контент 18+",
  rules_violation: "⚠️ Нарушение правил",
  other: "❓ Другое",
};

export default function ReportsPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [me, setMe] = useState<any>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "resolved" | "rejected">("pending");

  async function load() {
    const token = getToken();
    if (!token) return;

    const meRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const meData = await meRes.json();
    setMe(meData);

    if (!meData.is_admin && !meData.permissions?.includes("manage_reports")) {
      window.location.href = "/";
      return;
    }

    const url = filter === "all"
      ? `${process.env.NEXT_PUBLIC_API_URL}/api/reports`
      : `${process.env.NEXT_PUBLIC_API_URL}/api/reports?status=${filter}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setReports(await res.json());
  }

  useEffect(() => {
    load();
  }, [filter]);

  async function resolveReport(reportId: number, action: string) {
    const confirmMsg = {
      delete_post: "Удалить пост и закрыть жалобу?",
      ban_user: "Забанить пользователя и закрыть жалобу?",
      ignore: "Закрыть жалобу без действий?",
    }[action];

    if (!confirm(confirmMsg)) return;

    const token = getToken();
    if (!token) return;

    const form = new FormData();
    form.append("action", action);

    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/reports/${reportId}/resolve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    load();
  }

  async function rejectReport(reportId: number) {
    if (!confirm("Отклонить жалобу?")) return;
    const token = getToken();
    if (!token) return;

    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/reports/${reportId}/reject`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    load();
  }

  if (!me) return <div className="p-8 text-gray-600 dark:text-white/60">Загрузка...</div>;

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />
      <div className="w-px shrink-0 bg-gray-100 dark:bg-white/10 my-3" />
      <main className="flex-1 overflow-y-auto border-x border-line dark:border-white/10">
        <div className="p-6 border-b border-line dark:border-white/10 sticky top-0 bg-paper dark:bg-[#171717]/80 backdrop-blur-md z-10">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Flag size={24} className="text-red-600 dark:text-red-400" />
              <h1 className="text-2xl font-black text-gray-900 dark:text-white">Жалобы</h1>
            </div>
            <Link
              href="/admin"
              className="text-sm text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              ← Назад в админку
            </Link>
          </div>

          {/* Фильтры */}
          <div className="flex gap-2 mt-4 flex-wrap">
            {(["pending", "resolved", "rejected", "all"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-full border text-xs font-bold transition-all ${
                  filter === f
                    ? "border-[#8b5cf6] bg-[#8b5cf6] text-white"
                    : "border-line dark:border-white/20 text-gray-600 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/10"
                }`}
              >
                {f === "pending" && "⏳ Новые"}
                {f === "resolved" && "✅ Обработанные"}
                {f === "rejected" && "❌ Отклонённые"}
                {f === "all" && "Все"}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 space-y-3">
          {reports.length === 0 && (
            <p className="p-8 text-center text-gray-600 dark:text-white/50">Нет жалоб</p>
          )}

          {reports.map((r) => (
            <div
              key={r.id}
              className={`border rounded-xl p-4 transition-all ${
                r.status === "pending"
                  ? "border-orange-400/30 bg-orange-500/5"
                  : r.status === "resolved"
                  ? "border-green-400/30 bg-green-500/5"
                  : "border-line dark:border-white/15 bg-gray-100 dark:bg-white/5"
              }`}
            >
              <div className="flex items-start gap-4">
                {/* Кто пожаловался */}
                {r.reporter && (
                  <Avatar
                    src={r.reporter.avatar_url}
                    name={r.reporter.display_name}
                    id={r.reporter.id}
                    size={40}
                  />
                )}

                <div className="flex-1 min-w-0">
                  {/* РРЅС„Рѕ о жалобе */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-900 dark:text-white">
                      {r.reporter?.display_name || "Unknown"}
                    </span>
                    <span className="text-gray-600 dark:text-white/50 text-sm">пожаловался на</span>
                    {r.target?.type === "post" ? (
                      <span className="text-[#8b5cf6] font-bold">пост</span>
                    ) : (
                      <span className="text-[#8b5cf6] font-bold">
                        пользователя {r.target?.display_name}
                      </span>
                    )}
                  </div>

                  {/* Причина */}
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-1 rounded-lg bg-gray-100 dark:bg-white/10 text-xs font-bold text-gray-800 dark:text-white/80">
                      {REASON_LABELS[r.reason] || r.reason}
                    </span>
                    <span className="text-gray-500 dark:text-white/40 text-xs">
                      {new Date(r.created_at).toLocaleString("ru-RU")}
                    </span>
                  </div>

                  {/* Комментарий */}
                  {r.comment && (
                    <p className="mt-2 text-sm text-gray-800 dark:text-white/70 italic">
                      "{r.comment}"
                    </p>
                  )}

                  {/* Цель жалобы */}
                  {r.target?.type === "post" && (
                    <div className="mt-3 p-3 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10">
                      <p className="text-sm text-gray-800 dark:text-white/80 line-clamp-3">
                        {r.target.text}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-white/40 mt-1">
                        Автор: {r.target.author_name}
                      </p>
                    </div>
                  )}
                  {r.target?.type === "user" && (
                    <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10">
                      <Avatar
                        src={r.target.avatar_url}
                        name={r.target.display_name}
                        id={r.target.id}
                        size={32}
                      />
                      <div>
                        <p className="text-sm font-bold text-gray-900 dark:text-white">
                          {r.target.display_name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-white/40">@{r.target.username}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Действия — только для pending */}
                {r.status === "pending" && (
                  <div className="flex flex-col gap-2">
                    {r.target?.type === "post" && (
                      <button
                        onClick={() => resolveReport(r.id, "delete_post")}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-400/30 text-red-600 dark:text-red-400 text-xs font-bold hover:bg-red-500/10 transition-all"
                      >
                        <Trash2 size={12} />
                        Удалить пост
                      </button>
                    )}
                    <button
                      onClick={() => resolveReport(r.id, "ban_user")}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-400/30 text-red-600 dark:text-red-400 text-xs font-bold hover:bg-red-500/10 transition-all"
                    >
                      <Ban size={12} />
                      Забанить
                    </button>
                    <button
                      onClick={() => resolveReport(r.id, "ignore")}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-green-400/30 text-green-600 dark:text-green-400 text-xs font-bold hover:bg-green-500/10 transition-all"
                    >
                      <CheckCircle size={12} />
                      Закрыть
                    </button>
                    <button
                      onClick={() => rejectReport(r.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-line dark:border-white/20 text-gray-600 dark:text-white/60 text-xs font-bold hover:bg-gray-100 dark:hover:bg-white/10 transition-all"
                    >
                      <XCircle size={12} />
                      Отклонить
                    </button>
                  </div>
                )}

                {/* Статусы для обработанных */}
                {r.status === "resolved" && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-green-500/20 text-green-600 dark:text-green-400 text-xs font-bold">
                    <CheckCircle size={12} />
                    Обработана
                  </span>
                )}
                {r.status === "rejected" && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-white/60 text-xs font-bold">
                    <XCircle size={12} />
                    Отклонена
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}