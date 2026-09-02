"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Avatar } from "@/components/Avatar";
import { getToken } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import { ArrowLeft, MessageSquare, Search, Trash2, Pin, PinOff, Flag, Ban, AlertTriangle, CheckCircle, XCircle, Radio } from "lucide-react";
import { IconButton } from "@/components/ui/Button";

type AdminTab = "reports" | "chats";

const REASON_LABELS: Record<string, string> = {
  spam: "📢 Спам",
  insult: "😡 Оскорбление",
  nsfw: "🔞 Контент 18+",
  rules_violation: "⚠️ Нарушение правил",
  other: "❓ Другое",
};

const TARGET_TYPE_LABELS: Record<string, string> = {
  chat: "Канал/группа",
  chat_message: "Сообщение",
  dm_user: "Пользователь (ЛС)",
};

export default function AdminChatsPage() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [tab, setTab] = useState<AdminTab>("reports");
  const [reportFilter, setReportFilter] = useState<"pending" | "resolved" | "rejected">("pending");
  const [reports, setReports] = useState<any[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [chats, setChats] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [activeChat, setActiveChat] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.push("/login"); return; }
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        if (!data.is_admin && !data.permissions?.includes("manage_groups")) {
          router.push("/admin");
          return;
        }
        setMe(data);
        loadChats();
      });
  }, []);

  useEffect(() => {
    if (tab === "reports" && me) loadReports();
  }, [tab, reportFilter, me]);

  async function loadChats() {
    const token = getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/chats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setChats(await res.json());
  }

  async function loadReports() {
    setReportsLoading(true);
    const token = getToken();
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/reports?target_kind=chat&status=${reportFilter}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.ok) setReports(await res.json());
    setReportsLoading(false);
  }

  async function resolveReport(reportId: number, action: string, confirmMsg: string) {
    if (!confirm(confirmMsg)) return;
    const token = getToken();
    const form = new FormData();
    form.append("action", action);
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/reports/${reportId}/resolve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      alert(d?.detail || "Ошибка (нет права?)");
    }
    loadReports();
  }

  async function rejectReport(reportId: number) {
    if (!confirm("Отклонить жалобу?")) return;
    const token = getToken();
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/reports/${reportId}/reject`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    loadReports();
  }

  async function openChat(chat: any) {
    setActiveChat(chat);
    setLoading(true);
    const token = getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/chats/${chat.id}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setMessages(await res.json());
    setLoading(false);
  }

  async function openChatById(chatId: number | null | undefined) {
    if (!chatId) { alert("Чат для этой жалобы недоступен"); return; }
    const existing = chats.find((c) => c.id === chatId);
    if (existing) { openChat(existing); return; }
    setTab("chats");
    await loadChats();
    const token = getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/chats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const list = await res.json();
      const chat = list.find((c: any) => c.id === chatId);
      if (chat) openChat(chat);
      else alert("Чат не найден");
    }
  }

  async function deleteMsg(msgId: number) {
    if (!confirm("Удалить сообщение?")) return;
    const token = getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${activeChat.id}/messages/${msgId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) openChat(activeChat);
    else {
      const d = await res.json().catch(() => null);
      alert(d?.detail || "Ошибка удаления (возможно, только для Founder)");
    }
  }

  async function banUserFromChat(userId: number | undefined) {
    if (!userId) return;
    if (!confirm("Забанить этого пользователя?")) return;
    const token = getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users/${userId}/ban`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      alert(d?.detail || "Ошибка (нет права ban_users?)");
    }
  }

  async function warnUserFromChat(userId: number | undefined) {
    if (!userId) return;
    const reason = prompt("Причина предупреждения:");
    if (!reason || reason.trim().length < 3) return;
    const token = getToken();
    const form = new FormData();
    form.append("reason", reason.trim());
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users/${userId}/warn`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      alert(d?.detail || "Ошибка (нет права warn_users?)");
    } else alert("Предупреждение выдано");
  }

  function reportTargetLine(r: any): { name: string; sub: string; avatar?: string; userId?: number } {
    const t = r.target;
    if (!t) return { name: TARGET_TYPE_LABELS[r.target_type] || r.target_type, sub: "Цель удалена" };
    if (r.target_type === "chat_message")
      return { name: t.sender_name || "Unknown", sub: t.text || "(вложение)", avatar: t.sender_avatar, userId: t.sender_id };
    if (r.target_type === "chat")
      return { name: t.name, sub: "Групповой чат" };
    return { name: t.display_name || "Unknown", sub: t.username ? `@${t.username}` : "", avatar: t.avatar_url, userId: t.id };
  }

  const filtered = chats.filter((c) =>
    (c.name || "").toLowerCase().includes(search.toLowerCase())
  );

  if (!me) {
    return <div className="h-screen flex items-center justify-center bg-ivory dark:bg-[#18181b]"><p className="text-gray-600 dark:text-white/60 animate-pulse">Загрузка...</p></div>;
  }

  return (
    <div className="h-screen flex overflow-hidden bg-ivory dark:bg-[#18181b]">
      <Sidebar />
      <div className="w-px shrink-0 bg-gray-100 dark:bg-white/10 my-3" />
      <main className="flex-1 flex overflow-hidden">
        {/* Список: репорты или чаты */}
        <div className={`w-full md:w-[380px] shrink-0 border-r border-line dark:border-white/10 flex flex-col ${activeChat ? "hidden md:flex" : "flex"}`}>
          <div className="p-4 border-b border-line dark:border-white/10">
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => { setTab("reports"); setActiveChat(null); }}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition-all ${
                  tab === "reports"
                    ? "bg-[#ef4444] text-white"
                    : "bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/60 hover:bg-gray-200 dark:hover:bg-white/10"
                }`}
              >
                <Flag size={15} /> Жалобы
              </button>
              <button
                onClick={() => setTab("chats")}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition-all ${
                  tab === "chats"
                    ? "bg-[#8b5cf6] text-white"
                    : "bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/60 hover:bg-gray-200 dark:hover:bg-white/10"
                }`}
              >
                <MessageSquare size={15} /> Чаты
              </button>
            </div>
            {tab === "reports" && (
              <div className="flex gap-1.5">
                {(["pending", "resolved", "rejected"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setReportFilter(f)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      reportFilter === f
                        ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                        : "bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/50"
                    }`}
                  >
                    {f === "pending" ? "В ожидании" : f === "resolved" ? "Обработанные" : "Отклонённые"}
                  </button>
                ))}
              </div>
            )}
            {tab === "chats" && (
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск чатов..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 text-sm text-gray-900 dark:text-white outline-none focus:border-[#8b5cf6]"
                />
              </div>
            )}
          </div>
          {/* LIST-CONTENT */}
          <div className="flex-1 overflow-y-auto">
            {tab === "reports" && (
              <>
                {reportsLoading && <p className="text-center text-gray-500 dark:text-white/40 text-sm mt-6">Загрузка...</p>}
                {!reportsLoading && reports.length === 0 && (
                  <div className="flex flex-col items-center justify-center mt-16 px-6 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-white/5 flex items-center justify-center mb-3">
                      <Flag size={24} className="text-gray-400" />
                    </div>
                    <p className="text-sm font-bold text-gray-700 dark:text-white/70">Жалоб нет</p>
                    <p className="text-xs text-gray-500 dark:text-white/40 mt-1">Здесь появятся жалобы из чатов: на сообщения, каналы и пользователей</p>
                  </div>
                )}
                {reports.map((r) => {
                  const t = reportTargetLine(r);
                  return (
                    <div key={r.id} className="p-4 border-b border-line dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                      <div className="flex items-start gap-3">
                        <Avatar src={t.avatar} name={t.name} id={t.userId || r.reporter?.id || 0} size={38} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#8b5cf6]/15 text-[#8b5cf6]">
                              {TARGET_TYPE_LABELS[r.target_type] || r.target_type}
                            </span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-white/50">
                              {REASON_LABELS[r.reason] || r.reason}
                            </span>
                          </div>
                          <p className="text-sm font-bold text-gray-900 dark:text-white mt-1 truncate">{t.name}</p>
                          {t.sub && <p className="text-xs text-gray-600 dark:text-white/50 truncate">{t.sub}</p>}
                          {r.comment && (
                            <p className="text-xs text-gray-500 dark:text-white/40 italic mt-1 truncate">«{r.comment}»</p>
                          )}
                          <p className="text-[10px] text-gray-400 dark:text-white/30 mt-1">
                            От {r.reporter?.display_name || "?"} · {new Date(r.created_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </p>
                          {r.status === "pending" ? (
                            <div className="flex flex-wrap gap-1.5 mt-2.5">
                              {r.chat_id && (
                                <button
                                  onClick={() => openChatById(r.chat_id)}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#8b5cf6] text-white text-xs font-bold hover:bg-[#7c3aed] transition-all"
                                >
                                  <MessageSquare size={11} /> Открыть чат
                                </button>
                              )}
                              {t.userId && (
                                <>
                                  <button
                                    onClick={() => warnUserFromChat(t.userId)}
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-400/40 text-amber-600 dark:text-amber-400 text-xs font-bold hover:bg-amber-500/10 transition-all"
                                  >
                                    <AlertTriangle size={11} /> Варн
                                  </button>
                                  <button
                                    onClick={() => banUserFromChat(t.userId)}
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-400/40 text-red-600 dark:text-red-400 text-xs font-bold hover:bg-red-500/10 transition-all"
                                  >
                                    <Ban size={11} /> Бан
                                  </button>
                                </>
                              )}
                              {r.target_type === "chat_message" && r.chat_id && (
                                <button
                                  onClick={() => resolveReport(r.id, "delete_message", "Удалить сообщение и закрыть жалобу?")}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-400/40 text-red-600 dark:text-red-400 text-xs font-bold hover:bg-red-500/10 transition-all"
                                >
                                  <Trash2 size={11} /> Удалить сообщение
                                </button>
                              )}
                              <button
                                onClick={() => resolveReport(r.id, "ignore", "Закрыть жалобу без действий?")}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-green-400/40 text-green-600 dark:text-green-400 text-xs font-bold hover:bg-green-500/10 transition-all"
                              >
                                <CheckCircle size={11} /> Ок
                              </button>
                              <button
                                onClick={() => rejectReport(r.id)}
                                title="Отклонить"
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-line dark:border-white/20 text-gray-600 dark:text-white/60 text-xs font-bold hover:bg-gray-100 dark:hover:bg-white/10 transition-all"
                              >
                                <XCircle size={11} />
                              </button>
                            </div>
                          ) : (
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold mt-2 ${
                              r.status === "resolved"
                                ? "bg-green-500/15 text-green-600 dark:text-green-400"
                                : "bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-white/50"
                            }`}>
                              {r.status === "resolved" ? <CheckCircle size={11} /> : <XCircle size={11} />}
                              {r.status === "resolved" ? "Обработана" : "Отклонена"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {tab === "chats" && (
              <>
                {/* Заглушка под будущие публичные каналы (как в ТГ) */}
                <div className="m-4 p-4 rounded-2xl border border-dashed border-gray-300 dark:border-white/15 bg-gray-50 dark:bg-white/5 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#8b5cf6]/15 flex items-center justify-center shrink-0">
                    <Radio size={20} className="text-[#8b5cf6]" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-800 dark:text-white/80">Каналы — скоро</p>
                    <p className="text-xs text-gray-500 dark:text-white/40 mt-0.5">
                      Публичные каналы платформы появятся здесь позже. Сейчас доступна модерация групп и личных чатов.
                    </p>
                  </div>
                </div>
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => openChat(c)}
                    className={`w-full text-left px-4 py-3 border-b border-line dark:border-white/5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors ${
                      activeChat?.id === c.id ? "bg-gray-100 dark:bg-white/10" : ""
                    }`}
                  >
                    <Avatar src={c.avatar_url} name={c.name} id={c.id} size={40} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{c.name || "Без названия"}</p>
                      <p className="text-xs text-gray-500 dark:text-white/40">{c.members_count} участников</p>
                    </div>
                    <MessageSquare size={16} className="text-gray-400 shrink-0" />
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="text-center text-gray-500 dark:text-white/40 text-sm mt-6">Чатов нет</p>
                )}
              </>
            )}
          </div>

        </div>
        {/* CHAT-WINDOW */}
      </main>
    </div>
  );
}
