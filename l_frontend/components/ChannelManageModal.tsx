"use client";
// 📢 Модалка управления каналом — Заявки / Инвайты / Настройки.
// Изолированная система каналов (/api/channels/*).
import { useEffect, useState } from "react";
import { X, Settings, Megaphone, Users, Link, Copy, CheckCircle, XCircle, Loader2, AtSign, Globe, Lock } from "lucide-react";
import { getToken } from "@/lib/auth";

const API = process.env.NEXT_PUBLIC_API_URL;

export function ChannelManageModal({
  channel,
  onClose,
  onChanged,
}: {
  channel: any;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<"requests" | "invites" | "settings">("requests");
  const [requests, setRequests] = useState<any[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [autoApprove, setAutoApprove] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [sShowSig, setSShowSig] = useState(true);
  const [sSilent, setSSilent] = useState(false);
  const [sComments, setSComments] = useState(true);
  const [sSlug, setSSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const headers = (): Record<string, string> => ({ Authorization: `Bearer ${getToken()}` });

  const loadRequests = async () => {
    const res = await fetch(`${API}/api/channels/${channel.id}/requests`, { headers: headers() });
    if (res.ok) setRequests(await res.json());
  };

  useEffect(() => {
    setSShowSig(channel.settings?.show_author_signature !== false);
    setSSilent(!!channel.settings?.silent_messages_by_default);
    setSComments(channel.comments_enabled !== false);
    setSSlug(channel.custom_slug || "");
    if (tab === "requests") { setRequestsLoading(true); loadRequests().finally(() => setRequestsLoading(false)); }
    if (tab === "settings") setMsg("");
    // eslint-disable-next-line
  }, [tab, channel.id]);

  const decide = async (reqId: number, action: "approve" | "reject") => {
    const res = await fetch(`${API}/api/channels/${channel.id}/requests/${reqId}?action=${action}`, {
      method: "PATCH", headers: headers(),
    });
    if (res.ok) { loadRequests(); onChanged(); }
  };

  const createInvite = async () => {
    setCreatingInvite(true);
    const res = await fetch(`${API}/api/channels/${channel.id}/invites?auto_approve=${autoApprove}`, {
      method: "POST", headers: headers(),
    });
    setCreatingInvite(false);
    if (res.ok) {
      const d = await res.json();
      const link = `${window.location.origin}${d.url}`;
      setInviteUrl(link);
      try { await navigator.clipboard.writeText(link); setMsg("Скопировано"); }
      catch { setMsg("Ссылка готова"); }
    } else {
      const d = await res.json().catch(() => null);
      setMsg(d?.detail || "Ошибка создания ссылки");
    }
  };

  const saveSettings = async () => {
    setSaving(true); setMsg("");
    const res = await fetch(`${API}/api/channels/${channel.id}/settings`, {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ show_author_signature: sShowSig, silent_messages_by_default: sSilent, comments_enabled: sComments }),
    });
    if (res.ok) {
      const newSlug = sSlug.trim().toLowerCase().replace(/^@/, "");
      if (newSlug && newSlug !== channel.custom_slug) {
        const r2 = await fetch(`${API}/api/channels/${channel.id}`, {
          method: "PATCH",
          headers: { ...headers(), "Content-Type": "application/json" },
          body: JSON.stringify({ custom_slug: newSlug }),
        });
        if (!r2.ok) {
          const d = await r2.json().catch(() => null);
          setMsg(d?.detail || "Настройки сохранены, но ссылку изменить не удалось");
          setSaving(false); onChanged(); return;
        }
      }
      setMsg("Сохранено"); onChanged();
    } else {
      const d = await res.json().catch(() => null);
      setMsg(d?.detail || "Ошибка сохранения");
    }
    setSaving(false);
  };

  return (
    <>
      <div className="fixed inset-0 z-[2100] bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[2101] flex items-center justify-center p-4 pointer-events-none">
        <div className="w-full max-w-lg bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/10 rounded-2xl shadow-2xl pointer-events-auto animate-in zoom-in-95 duration-200 flex flex-col overflow-hidden">
          {/* Шапка */}
          <div className="p-4 border-b border-line dark:border-white/10 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#8b5cf6]/15 flex items-center justify-center">
              <Settings size={18} className="text-[#8b5cf6]" />
            </div>
            <p className="font-bold text-gray-900 dark:text-white text-sm flex-1 truncate">{channel.title}</p>
            <button onClick={onClose} className="p-2 rounded-lg text-gray-500 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/10">
              <X size={18} />
            </button>
          </div>

          {/* Вкладки */}
          <div className="flex gap-1.5 px-3 py-2 flex-wrap">
            <button onClick={() => setTab("requests")} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === "requests" ? "bg-[#8b5cf6] text-white" : "bg-white dark:bg-white/5 border border-line dark:border-white/10 text-gray-600 dark:text-white/60"}`}>
              <Users size={12} className="inline" /> Заявки{requests.length > 0 ? ` (${requests.length})` : ""}
            </button>
            <button onClick={() => setTab("invites")} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === "invites" ? "bg-[#8b5cf6] text-white" : "bg-white dark:bg-white/5 border border-line dark:border-white/10 text-gray-600 dark:text-white/60"}`}>
              <Link size={12} className="inline" /> Инвайты
            </button>
            <button onClick={() => setTab("settings")} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === "settings" ? "bg-[#8b5cf6] text-white" : "bg-white dark:bg-white/5 border border-line dark:border-white/10 text-gray-600 dark:text-white/60"}`}>
              <Settings size={12} className="inline" /> Настройки
            </button>
            {msg && <span className={`text-[11px] ml-auto ${msg.includes("Ошиб") || msg.includes("не удалось") ? "text-red-500 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>{msg}</span>}
          </div>

          {/* Тело вкладок */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* ── ЗАЯВКИ ── */}
            {tab === "requests" && (
              <div>
                {requestsLoading && <p className="text-center text-gray-500 dark:text-white/40 text-sm py-6">Загрузка...</p>}
                {!requestsLoading && requests.length === 0 && (
                  <p className="text-center text-gray-500 dark:text-white/40 text-sm py-8">Заявок на вступление нет</p>
                )}
                <div className="space-y-2.5">
                  {requests.map((r) => (
                    <div key={r.id} className="flex items-center gap-2.5 bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 rounded-xl p-2.5">
                      <img src={r.user?.avatar_url} alt="" className="w-9 h-9 rounded-full bg-gray-300 dark:bg-white/10" />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-gray-900 dark:text-white truncate">{r.user?.display_name}</p>
                        <p className="text-[11px] text-gray-500 dark:text-white/40">@{r.user?.username} · {new Date(r.created_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                      <button onClick={() => decide(r.id, "approve")} className="p-2 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25" title="Одобрить">
                        <CheckCircle size={16} />
                      </button>
                      <button onClick={() => decide(r.id, "reject")} className="p-2 rounded-lg text-gray-500 dark:text-white/40 hover:text-red-500 hover:bg-red-500/10" title="Отклонить">
                        <XCircle size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/*REQS_END*/}
            {/* ── ИНВАЙТЫ ── */}
            {tab === "invites" && (
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-white/80 cursor-pointer py-1">
                  <input type="checkbox" checked={autoApprove} onChange={(e) => setAutoApprove(e.target.checked)} className="accent-[#8b5cf6]" />
                  <>{channel.is_public ? <><Globe size={13} className="text-gray-400" /> Прямое вступление (публичный канал)</> : <><Globe size={13} className="text-gray-400" /> Вступление без одобрения (auto-approve)</>}</>
                </label>
                <div className="flex gap-2">
                  <input
                    value={inviteUrl}
                    readOnly
                    placeholder="Ссылка появится после создания"
                    className="flex-1 px-3 py-2 rounded-xl border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm"
                  />
                  <button onClick={createInvite} disabled={creatingInvite} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:opacity-50 text-white text-sm font-bold shrink-0">
                    {creatingInvite ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
                    Создать и копировать
                  </button>
                </div>
                {inviteUrl && (
                  <p className="text-[11px] text-gray-500 dark:text-white/40">
                    Ссылка скопирована в буфер обмена. По ней пользователь попадёт на /c/{channel.custom_slug}?invite=...
                  </p>
                )}
              </div>
            )}
            {/*INV_END*/}
            {/* ── НАСТРОЙКИ ── */}
            {tab === "settings" && (
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-white/80 cursor-pointer py-1">
                  <input type="checkbox" checked={sShowSig} onChange={(e) => setSShowSig(e.target.checked)} className="accent-[#8b5cf6]" />
                  Подпись автора под постами
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-white/80 cursor-pointer py-1">
                  <input type="checkbox" checked={sSilent} onChange={(e) => setSSilent(e.target.checked)} className="accent-[#8b5cf6]" />
                  Тихие посты по умолчанию
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-white/80 cursor-pointer py-1">
                  <input type="checkbox" checked={sComments} onChange={(e) => setSComments(e.target.checked)} className="accent-[#8b5cf6]" />
                  Комментарии включены
                </label>
                <div>
                  <label className="text-xs font-bold text-gray-600 dark:text-white/60 mb-1 block">Ссылка на канал</label>
                  <div className="relative">
                    <AtSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-white/40" />
                    <input
                      value={sSlug}
                      onChange={(e) => setSSlug(e.target.value.toLowerCase())}
                      maxLength={33}
                      className="w-full pl-8 pr-3 py-2 rounded-xl border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-white/40 mt-1">Латиница, цифры, «_», 5-32 символа. Канал будет доступен по /c/@ссылка</p>
                </div>
                <button onClick={saveSettings} disabled={saving} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:opacity-50 text-white text-sm font-bold">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Settings size={14} />}
                  Сохранить настройки
                </button>
              </div>
            )}
            {/*SET_END*/}
          </div>
        </div>
      </div>
    </>
  );
}