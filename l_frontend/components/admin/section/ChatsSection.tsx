"use client";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { getToken } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import {
  MessageSquare, Search, Users, ArrowLeft, Pin, PinOff, Trash2,
  Flag, CheckCircle, XCircle, Ban, AlertTriangle, Megaphone, Loader2,
  ShieldBan, ShieldAlert, ShieldCheck, UserMinus,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL;

const REASON_LABELS: Record<string, string> = {
  spam: "📢 Спам",
  insult: "🤬 Оскорбление",
  nsfw: "🔞 Контент 18+",
  rules_violation: "⚠️ Нарушение правил",
  other: "❓ Другое",
};

const TYPE_LABELS: Record<string, string> = {
  chat_message: "Сообщение в группе",
  chat: "Групповой чат",
  dm_user: "Пользователь (личный чат)",
};

export function ChatsSection({ me }: { me: any }) {
  // Внутренние вкладки секции: жалобы из чатов и сами чаты
  const [tab, setTab] = useState<"reports" | "chats">("reports");

  const [activeChat, setActiveChat] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [reports, setReports] = useState<any[]>([]);
  const [reportStatus, setReportStatus] = useState<"pending" | "resolved" | "rejected">("pending");
  const [reportsLoading, setReportsLoading] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);

  const [members, setMembers] = useState<any[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [showMembers, setShowMembers] = useState(false);

  async function loadChats() {
    const token = getToken();
    const res = await fetch(`${API}/api/admin/chats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) { await res.json(); }
  }

  async function loadReports(status: string) {
    setReportsLoading(true);
    const token = getToken();
    const res = await fetch(`${API}/api/reports?target_kind=chat&status=${status}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setReports(await res.json());
    setReportsLoading(false);
  }

  useEffect(() => { loadReports(reportStatus); }, [reportStatus]);

  async function openChat(chat: any) {
    setActiveChat(chat);
    setShowMembers(false);
    setMembers([]);
    setLoading(true);
    const token = getToken();
    const res = await fetch(`${API}/api/admin/chats/${chat.id}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setMessages(await res.json());
    else {
      const d = await res.json().catch(() => null);
      alert(d?.detail || "🔒 Доступ закрыт (жалоба обработана)");
      setActiveChat(null);
    }
    setLoading(false);
  }

  async function loadMembers(chatId: number) {
    setMembersLoading(true);
    const token = getToken();
    const res = await fetch(`${API}/api/admin/chats/${chatId}/members`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setMembers(await res.json());
    setMembersLoading(false);
  }

  async function toggleBlockChat() {
    if (!activeChat) return;
    const blocked = !!activeChat.is_blocked;
    if (!blocked) {
      const reason = prompt("Причина блокировки чата (необязательно):");
      if (reason === null) return;
    } else if (!confirm("Разблокировать чат?")) return;
    const token = getToken();
    const url = blocked
      ? `${API}/api/admin/chats/${activeChat.id}/unblock`
      : `${API}/api/admin/chats/${activeChat.id}/block`;
    const opts: any = { method: "POST", headers: { Authorization: `Bearer ${token}` } };
    if (!blocked) {
      const fd = new FormData();
      fd.append("reason", "");
      opts.body = fd;
    }
    const res = await fetch(url, opts);
    if (res.ok) {
      const updated = { ...activeChat, is_blocked: !blocked };
      setActiveChat(updated);
    } else {
      const d = await res.json().catch(() => null);
      alert(d?.detail || "Ошибка блокировки");
    }
  }

  async function memberAction(userId: number, action: "kick" | "mute" | "unmute") {
    if (!activeChat) return;
    if (action === "kick" && !confirm("Исключить участника из чата?")) return;
    const token = getToken();
    const url = `${API}/api/admin/chats/${activeChat.id}/members/${userId}/${action}`;
    const opts: any = { method: "POST", headers: { Authorization: `Bearer ${token}` } };
    if (action === "mute") {
      const mins = prompt("Мут на сколько минут?", "60");
      if (!mins) return;
      const fd = new FormData();
      fd.append("minutes", mins);
      opts.body = fd;
    }
    const res = await fetch(url, opts);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      alert(d?.detail || "Ошибка действия");
    }
    loadMembers(activeChat.id);
  }

  async function deleteMsg(msgId: number) {
    if (!confirm("Удалить сообщение?")) return;
    const token = getToken();
    const res = await fetch(`${API}/api/chats/${activeChat.id}/messages/${msgId}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) openChat(activeChat);
    else { const d = await res.json().catch(() => null); alert(d?.detail || "Ошибка"); }
  }

  async function togglePin(msg: any) {
    const token = getToken();
    const url = msg.pinned
      ? `${API}/api/chats/${activeChat.id}/messages/${msg.id}/unpin`
      : `${API}/api/chats/${activeChat.id}/messages/${msg.id}/pin`;
    const res = await fetch(url, {
      method: msg.pinned ? "DELETE" : "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) openChat(activeChat);
    else { const d = await res.json().catch(() => null); alert(d?.detail || "Нет права pin_messages"); }
  }

  function targetUser(r: any) {
    const t = r.target;
    if (!t) return null;
    if (t.type === "dm_user" || t.type === "user") return t.id;
    if (t.type === "chat_message") return t.sender_id;
    if (t.type === "post") return t.author_id;
    return null;
  }

  async function resolveReport(reportId: number, action: string) {
    setBusy(reportId);
    const token = getToken();
    if (!token) return;
    const form = new FormData();
    form.append("action", action);
    const res = await fetch(`${API}/api/reports/${reportId}/resolve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    setBusy(null);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      alert(d?.detail || "Ошибка обработки жалобы");
    }
    loadReports(reportStatus);
  }

  async function rejectReport(reportId: number) {
    if (!confirm("Отклонить жалобу?")) return;
    setBusy(reportId);
    const token = getToken();
    if (!token) return;
    const res = await fetch(`${API}/api/reports/${reportId}/reject`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    });
    setBusy(null);
    if (!res.ok) { const d = await res.json().catch(() => null); alert(d?.detail || "Ошибка"); }
    loadReports(reportStatus);
  }

  async function warnUser(userId: number) {
    const reason = prompt("Причина варна:");
    if (!reason) return;
    const token = getToken();
    const fd = new FormData();
    fd.append("reason", reason);
    const res = await fetch(`${API}/api/admin/users/${userId}/warn`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd,
    });
    if (!res.ok) { const d = await res.json().catch(() => null); alert(d?.detail || "Нет права warn_users"); }
    else alert("Варн выдан");
  }

  async function banUser(userId: number) {
    if (!confirm("Забанить пользователя?")) return;
    const token = getToken();
    const res = await fetch(`${API}/api/admin/users/${userId}/ban`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { const d = await res.json().catch(() => null); alert(d?.detail || "Нет права ban_users"); }
    else alert("Пользователь забанен");
  }

  async function openChatById(chatId: number) {
    setTab("chats");
    await openChat({ id: chatId, name: "Чат", is_group: true, members_count: "" });
    const token = getToken();
    const ch = await fetch(`${API}/api/admin/chats`, { headers: { Authorization: `Bearer ${token}` } });
    if (ch.ok) {
      const list = await ch.json();
      const found = (list as any[]).find((c: any) => c.id === chatId);
      if (found) setActiveChat((prev: any) => ({ ...(prev || {}), ...found }));
    }
  }

  return (
    <div>
      {/* Вкладки секции */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab("reports")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-medium text-sm transition-all ${
            tab === "reports"
              ? "bg-[#ef4444] text-white border-transparent"
              : "bg-white dark:bg-white/5 border-line dark:border-white/10 text-gray-800 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/10"
          }`}
        >
          <Flag size={16} /> Жалобы
        </button>
        <button
          onClick={() => setTab("chats")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-medium text-sm transition-all ${
            tab === "chats"
              ? "bg-[#06b6d4] text-white border-transparent"
              : "bg-white dark:bg-white/5 border-line dark:border-white/10 text-gray-800 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/10"
          }`}
        >
          <MessageSquare size={16} /> Чаты
        </button>
      </div>

      {tab === "reports" && (
        <div>
          <div className="flex gap-2 mb-4">
            {([["pending", "В ожидании"], ["resolved", "Обработанные"], ["rejected", "Отклонённые"]] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setReportStatus(id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  reportStatus === id
                    ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                    : "bg-white dark:bg-white/5 border border-line dark:border-white/10 text-gray-600 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/10"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {reportsLoading && (
            <div className="flex items-center justify-center gap-2 text-gray-500 dark:text-white/40 text-sm py-10">
              <Loader2 size={16} className="animate-spin" /> Загрузка...
            </div>
          )}

          {!reportsLoading && reports.length === 0 && (
            <div className="text-center py-10">
              <Flag size={40} className="text-gray-500 dark:text-white/10 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-white/30 text-sm">Жалоб из чатов нет</p>
            </div>
          )}

          {!reportsLoading && reports.length > 0 && (
            <div className="space-y-3">
              {reports.map((r) => (
                <div key={r.id} className="border border-line dark:border-white/10 rounded-xl bg-white dark:bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-[#ef4444]/15 text-[#ef4444]">
                          {TYPE_LABELS[r.target_type] || r.target_type}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-white/40">{REASON_LABELS[r.reason] || r.reason}</span>
                      </div>
                      <div className="mt-2 space-y-1 text-sm text-gray-800 dark:text-white/85">
                        {r.target_type === "chat_message" && r.target && (
                          <p className="truncate">
                            «{r.target.text || "📎 Вложение"}» — <b>{r.target.sender_name}</b>
                            {r.target.chat_name ? ` в «${r.target.chat_name}»` : ""}
                          </p>
                        )}
                        {r.target_type === "chat" && r.target && (
                          <p>На группу: <b>{r.target.name}</b></p>
                        )}
                        {r.target_type === "dm_user" && r.target && (
                          <p>На пользователя: <b>{r.target.display_name}</b></p>
                        )}
                        {r.comment && <p className="text-xs text-gray-500 dark:text-white/50">Комментарий: {r.comment}</p>}
                        {r.reporter && (
                          <p className="text-xs text-gray-500 dark:text-white/40">
                            Пожаловался: <b>{r.reporter.display_name}</b> ·{" "}
                            {new Date(r.created_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        )}
                      </div>
                    </div>

                    {r.status === "pending" ? (
                    <div className="flex flex-wrap gap-1.5 shrink-0">
                      {r.chat_id && (
                        <button
                          onClick={() => openChatById(r.chat_id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#8b5cf6] text-white text-xs font-bold hover:bg-[#7c3aed] transition-all"
                        >
                          <MessageSquare size={11} /> Открыть чат
                        </button>
                      )}
                      {targetUser(r) && (
                        <>
                          <button
                            onClick={() => warnUser(targetUser(r))}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-400/40 text-amber-600 dark:text-amber-400 text-xs font-bold hover:bg-amber-500/10 transition-all"
                          >
                            <AlertTriangle size={11} /> Варн
                          </button>
                          <button
                            onClick={() => banUser(targetUser(r))}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-400/40 text-red-600 dark:text-red-400 text-xs font-bold hover:bg-red-500/10 transition-all"
                          >
                            <Ban size={11} /> Бан
                          </button>
                        </>
                      )}
                      {r.target_type === "chat_message" && r.chat_id && (
                        <button
                          onClick={() => resolveReport(r.id, "delete_message")}
                          disabled={busy === r.id}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-400/40 text-red-600 dark:text-red-400 text-xs font-bold hover:bg-red-500/10 transition-all disabled:opacity-50"
                        >
                          <Trash2 size={11} /> Удалить сообщение
                        </button>
                      )}
                      <button
                        onClick={() => resolveReport(r.id, "ignore")}
                        disabled={busy === r.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-green-400/40 text-green-600 dark:text-green-400 text-xs font-bold hover:bg-green-500/10 transition-all disabled:opacity-50"
                      >
                        <CheckCircle size={11} /> Ок
                      </button>
                      <button
                        onClick={() => rejectReport(r.id)}
                        disabled={busy === r.id}
                        title="Отклонить"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-line dark:border-white/20 text-gray-600 dark:text-white/60 text-xs font-bold hover:bg-gray-100 dark:hover:bg-white/10 transition-all disabled:opacity-50"
                      >
                        <XCircle size={11} />
                      </button>
                    </div>
                  ) : (
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold shrink-0 ${
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
            ))}
            </div>
          )}
        </div>
      )}

      {tab === "chats" && (
        !activeChat ? (
          <div className="flex flex-col items-center justify-center h-[calc(100vh-260px)] text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 flex items-center justify-center mb-4">
              <ShieldBan size={28} className="text-gray-500 dark:text-white/30" />
            </div>
            <p className="font-bold text-gray-800 dark:text-white/70 text-sm mb-1">Приватность защищена</p>
            <p className="text-xs text-gray-500 dark:text-white/40 max-w-sm">
              Просмотр переписок без активной жалобы недоступен. Открой чат можно только из карточки жалобы на вкладке «Жалобы». После обработки жалобы доступ закрывается автоматически.
            </p>
            <div className="mt-6 flex items-center gap-3 p-3 rounded-xl border border-dashed border-line dark:border-white/15 opacity-60">
              <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-white/10 flex items-center justify-center shrink-0">
                <Megaphone size={16} className="text-gray-500 dark:text-white/40" />
              </div>
              <div className="text-left">
                <p className="font-bold text-gray-600 dark:text-white/60 text-sm">Каналы</p>
                <p className="text-[11px] text-gray-500 dark:text-white/40">Скоро — новые чат-каналы</p>
              </div>
            </div>
          </div>
        ) : (
        <div className="flex flex-col md:flex-row gap-4 h-[calc(100vh-260px)]">

          {/* Сообщения */}
          <div className={`flex-1 border border-line dark:border-white/10 rounded-xl bg-gray-100 dark:bg-white/5 flex flex-col ${activeChat ? "flex" : "hidden md:flex"}`}>
            {!activeChat ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <MessageSquare size={48} className="text-gray-500 dark:text-white/10 mx-auto mb-3" />
                  <p className="text-gray-500 dark:text-white/30 text-sm">Выбери чат для модерации</p>
                </div>
              </div>
            ) : (
              <>
                <div className="p-3 border-b border-line dark:border-white/10 flex items-center gap-3">
                  <button onClick={() => setActiveChat(null)} className="p-2 rounded-lg text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 md:hidden">
                    <ArrowLeft size={18} />
                  </button>
                  <p className="font-bold text-gray-900 dark:text-white text-sm truncate flex-1">{activeChat.name}</p>
                  {activeChat.is_blocked && (
                    <span className="px-2 py-0.5 rounded-md bg-red-500/15 text-red-600 dark:text-red-400 text-[10px] font-bold">Заблокирован</span>
                  )}
                  <span className="text-[10px] text-gray-500 dark:text-white/40">{activeChat.members_count} участников</span>
                  {activeChat.is_group && (
                    <button
                      onClick={toggleBlockChat}
                      className={`p-2 rounded-lg transition-colors ${
                        activeChat.is_blocked
                          ? "text-green-600 dark:text-green-400 hover:bg-green-500/10"
                          : "text-red-600 dark:text-red-400 hover:bg-red-500/10"
                      }`}
                      title={activeChat.is_blocked ? "Разблокировать чат" : "Заблокировать чат (запретить отправку сообщений)"}
                    >
                      {activeChat.is_blocked ? <ShieldCheck size={16} /> : <ShieldBan size={16} />}
                    </button>
                  )}
                  <button
                    onClick={() => { setShowMembers((v) => !v); if (!showMembers) loadMembers(activeChat.id); }}
                    className="p-2 rounded-lg text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10"
                    title={activeChat.is_group ? "Участники и модерация" : "Пользователи диалога"}
                  >
                    <Users size={16} />
                  </button>
                </div>
                {showMembers && (
                  <div className="border-b border-line dark:border-white/10 max-h-[45%] overflow-y-auto">
                    <div className="px-3 py-2 flex items-center justify-between sticky top-0 bg-ivory dark:bg-[#171717]/95 backdrop-blur z-10">
                      <p className="text-xs font-bold text-gray-900 dark:text-white">
                        {activeChat.is_group ? "Участники" : "Пользователи диалога"}
                      </p>
                      {membersLoading && <Loader2 size={12} className="animate-spin text-gray-400" />}
                    </div>
                    {members.map((u) => {
                      const muted = u.muted_until && new Date(u.muted_until) > new Date();
                      return (
                        <div key={u.user_id} className="px-3 py-2 flex items-center gap-2.5 border-t border-line dark:border-white/5">
                          <Avatar src={u.avatar_url} name={u.display_name} id={u.user_id} size={28} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-900 dark:text-white truncate">
                              {u.display_name}
                              {u.is_staff && <span className="ml-1 text-[9px] px-1 rounded bg-[#8b5cf6]/20 text-[#8b5cf6]">staff</span>}
                            </p>
                            <p className="text-[10px] text-gray-500 dark:text-white/40">
                              @{u.username || "—"} · {u.role}
                              {u.is_banned && <span className="text-red-500 font-bold"> · ЗАБАНЕН</span>}
                              {muted && <span className="text-amber-500 font-bold"> · мут до {new Date(u.muted_until).toLocaleString("ru-RU", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}</span>}
                            </p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button
                              onClick={() => warnUser(u.user_id)}
                              className="p-1.5 rounded-lg text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                              title="Выдать варн"
                            >
                              <AlertTriangle size={13} />
                            </button>
                            {u.is_banned ? (
                              <button
                                onClick={() => banUser(u.user_id)}
                                className="p-1.5 rounded-lg text-green-600 dark:text-green-400 hover:bg-green-500/10"
                                title="Разбанить"
                              >
                                <ShieldCheck size={13} />
                              </button>
                            ) : (
                              <button
                                onClick={() => banUser(u.user_id)}
                                className="p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-500/10"
                                title="Забанить"
                              >
                                <Ban size={13} />
                              </button>
                            )}
                            {activeChat.is_group && u.role !== "owner" && (
                              <>
                                <button
                                  onClick={() => memberAction(u.user_id, muted ? "unmute" : "mute")}
                                  className={`p-1.5 rounded-lg ${muted ? "text-green-600 dark:text-green-400 hover:bg-green-500/10" : "text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"}`}
                                  title={muted ? "Снять мут" : "Замутить в чате"}
                                >
                                  {muted ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
                                </button>
                                <button
                                  onClick={() => memberAction(u.user_id, "kick")}
                                  className="p-1.5 rounded-lg text-gray-600 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/10"
                                  title="Исключить из чата"
                                >
                                  <UserMinus size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {!membersLoading && members.length === 0 && (
                      <p className="px-3 py-3 text-xs text-gray-500 dark:text-white/40 text-center">Список пуст</p>
                    )}
                  </div>
                )}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {loading && <p className="text-center text-gray-500 dark:text-white/40 text-sm">Загрузка...</p>}
                  {!loading && messages.length === 0 && <p className="text-center text-gray-500 dark:text-white/40 text-sm">Сообщений нет</p>}
                  {!loading && messages.map((m) => (
                    <div key={m.id} className="flex items-start gap-2.5">
                      <Avatar src={m.sender_avatar} name={m.sender_name} id={m.sender_id} size={32} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-gray-600 dark:text-white/50">
                          <span className="font-bold text-gray-800 dark:text-white/80">{m.sender_name}</span> ·{" "}
                          {new Date(m.created_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                          {m.pinned && <Pin size={10} className="inline ml-1 text-[#8b5cf6]" />}
                        </p>
                        <div className="text-sm text-gray-800 dark:text-white/90 break-words mt-0.5">
                          {m.media_type === "image" || m.media_type === "sticker"
                            ? <img src={mediaUrl(m.media_url)} alt="" className="max-w-[180px] rounded-lg" />
                            : m.media_type === "video" || m.media_type === "video_note"
                            ? <video src={mediaUrl(m.media_url)} controls className="max-w-[220px] rounded-lg" />
                            : m.media_type === "audio"
                            ? <audio src={mediaUrl(m.media_url)} controls className="max-w-[220px]" />
                            : m.text || "📎 Вложение"}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => togglePin(m)} className="p-1.5 rounded-lg text-gray-500 dark:text-white/40 hover:text-[#8b5cf6] hover:bg-gray-100 dark:hover:bg-white/10" title={m.pinned ? "Открепить" : "Закрепить"}>
                          {m.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                        </button>
                        {me.is_admin && (
                          <button onClick={() => deleteMsg(m.id)} className="p-1.5 rounded-lg text-gray-500 dark:text-white/40 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10" title="Удалить">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        )
      )}
    </div>
  );
}