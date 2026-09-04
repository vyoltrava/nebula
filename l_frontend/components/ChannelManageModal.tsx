"use client";
// 📢 Настройки канала — дизайн ТОЧЬ-В-ТОЧЬ как GroupSettingsModal:
// те же вкладки (Канал / Ссылки / Заявки / Удаление), аватар с загрузкой,
// название, описание, приватность, ссылка (@slug).
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { X, Upload, Image as ImageIcon, Link2, Copy, Trash2, Users, AlertTriangle, Settings, AtSign, CheckCircle, XCircle, Loader2, Globe, Lock, Crown, Shield, UserX, BarChart3, UserPlus } from "lucide-react";
import { getToken } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import { Avatar } from "@/components/Avatar";
import { Button, IconButton } from "@/components/ui/Button";

interface Props {
  channel: any;
  onClose: () => void;
  onChanged: () => void;
}

type Tab = "main" | "settings" | "links" | "members" | "requests" | "stats" | "danger";

export function ChannelManageModal({ channel, onClose, onChanged }: Props) {
  const router = useRouter();
  const channelId = channel.id;
  const [tab, setTab] = useState<Tab>("main");
  const [title, setTitle] = useState(channel.title || "");
  const [description, setDescription] = useState(channel.description || "");
  const [isPublic, setIsPublic] = useState(channel.is_public ?? true);
  const [slug, setSlug] = useState(channel.custom_slug || "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(channel.avatar_url || null);
  const [loading, setLoading] = useState(false);
  const [savingToggles, setSavingToggles] = useState(false);
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const isAdmin = channel?.my_role === "owner" || channel?.my_role === "admin";

  const authFetch = (url: string, opts: any = {}) => {
    const token = getToken();
    return fetch(url, { ...opts, headers: { ...(opts.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  };

  // Ссылки-инвайты
  const [inviteUrl, setInviteUrl] = useState("");
  const [autoApprove, setAutoApprove] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  // Заявки
  const [requests, setRequests] = useState<any[]>([]);
  // Участники
  const [subscribers, setSubscribers] = useState<any[]>([]);
  // ⚙️ Настройки (тумблеры)
  const [showAuthorSig, setShowAuthorSig] = useState(channel.settings?.show_author_signature !== false);
  const [silentDefault, setSilentDefault] = useState(!!channel.settings?.silent_messages_by_default);
  const [showHistory, setShowHistory] = useState(channel.settings?.show_history !== false);
  const [commentsOn, setCommentsOn] = useState(channel.comments_enabled ?? true);
  // 📊 Статистика
  const [stats, setStats] = useState<any>(null);
  // 🧑🤝🧑 Приглашение контактов (Nebula: подписки = контакты)
  const [showInvite, setShowInvite] = useState(false);
  const [inviteContacts, setInviteContacts] = useState<any[]>([]);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteSearch, setInviteSearch] = useState("");
  const [invitingIds, setInvitingIds] = useState<Set<number>>(new Set());

  const createInvite = async () => {
    setCreatingInvite(true);
    const r = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/channels/${channelId}/invites?auto_approve=${autoApprove}`, { method: "POST" });
    setCreatingInvite(false);
    if (r.ok) {
      const d = await r.json();
      const link = `${location.origin}${d.url}`;
      setInviteUrl(link);
      try { await navigator.clipboard.writeText(link); setMsg("Ссылка скопирована"); } catch { setMsg("Ссылка готова"); }
    } else {
      const d = await r.json().catch(() => null);
      setMsg(d?.detail || "Ошибка");
    }
  };

  const loadRequests = async () => {
    const r = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/channels/${channelId}/requests`);
    if (r.ok) setRequests(await r.json());
  };
  const decide = async (reqId: number, action: "approve" | "reject") => {
    const r = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/channels/${channelId}/requests/${reqId}?action=${action}`, { method: "PATCH" });
    if (r.ok) { loadRequests(); onChanged(); }
  };

  // 👥 Участники: список, роли, исключение
  const loadSubscribers = async () => {
    const r = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/channels/${channelId}/subscribers`);
    if (r.ok) setSubscribers(await r.json());
  };
  const setRole = async (uid: number, role: string) => {
    const r = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/channels/${channelId}/subscribers/${uid}?role=${role}`, { method: "PATCH" });
    if (!r.ok) { const d = await r.json().catch(() => null); alert(d?.detail || "Не удалось изменить роль"); }
    loadSubscribers();
  };
  const kickMember = async (uid: number) => {
    if (!confirm("Исключить из канала?")) return;
    const r = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/channels/${channelId}/subscribers/${uid}`, { method: "DELETE" });
    if (!r.ok) { const d = await r.json().catch(() => null); alert(d?.detail || "Не удалось исключить"); }
    loadSubscribers();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setAvatarFile(f); setAvatarPreview(URL.createObjectURL(f));
  };

  const SLUG_RE = /^[a-z0-9_]{5,32}$/;
  const slugValid = SLUG_RE.test(slug.replace(/^@/, "").toLowerCase());

  async function saveSettings() {
    setLoading(true);
    setMsg("");
    try {
      const newSlug = slug.replace(/^@/, "").toLowerCase();
      if (title !== channel.title || (description || "") !== (channel.description || "") || isPublic !== channel.is_public || newSlug !== channel.custom_slug) {
        const r = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/channels/${channelId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim() || null,
            is_public: isPublic,
            custom_slug: newSlug !== channel.custom_slug ? newSlug : undefined,
          }),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => null);
          setMsg(d?.detail || "Ошибка сохранения");
          setLoading(false);
          return;
        }
      }
      if (avatarFile) {
        const form = new FormData(); form.append("file", avatarFile);
        const r = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/channels/${channelId}/avatar`, { method: "POST", body: form });
        if (!r.ok) {
          const d = await r.json().catch(() => null);
          setMsg(d?.detail || "Ошибка загрузки аватара");
          setLoading(false);
          return;
        }
      }
      onChanged();
      onClose();
    } catch {
      setMsg("Ошибка сохранения настроек");
    } finally {
      setLoading(false);
    }
  }

  async function deleteChannel() {
    if (!confirm("Удалить канал? Все посты и комментарии будут удалены. Действие необратимо.")) return;
    const r = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/channels/${channelId}`, { method: "DELETE" });
    if (r.ok) { onClose(); router.push("/messages"); }
    else { const d = await r.json().catch(() => null); alert(d?.detail || "Нет прав на удаление"); }
  }

  const tabBtn = (id: Tab, label: string, icon: any) => (
    <button onClick={() => setTab(id)}
      className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shrink-0 ${tab === id ? "bg-[#8b5cf6] text-white" : "bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/60 hover:bg-gray-200 dark:hover:bg-white/10"}`}>
      {icon} {label}
    </button>
  );

  async function saveSettingsToggle() {
    setSavingToggles(true);
    const r = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/channels/${channelId}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        show_author_signature: showAuthorSig,
        silent_messages_by_default: silentDefault,
        show_history: showHistory,
        comments_enabled: commentsOn,
      }),
    });
    setSavingToggles(false);
    if (r.ok) { setMsg("Настройки сохранены"); onChanged(); }
    else { const d = await r.json().catch(() => null); setMsg(d?.detail || "Ошибка сохранения"); }
  }

  async function loadStats() {
    const r = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/channels/${channelId}/stats`);
    if (r.ok) setStats(await r.json());
  }

  // 🧑🤝🧑 Загрузка контактов (свои подписки) и фильтр уже-подписанных
  async function loadInviteContacts() {
    setInviteLoading(true);
    try {
      const meRes = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`);
      if (!meRes.ok) { setInviteLoading(false); return; }
      const me = await meRes.json();
      const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/${me.id}/following`);
      const contacts: any[] = res.ok ? await res.json() : [];
      const subIds = new Set((subscribers || []).map((m: any) => m.user?.id).filter(Boolean));
      setInviteContacts(contacts.filter((c: any) => !subIds.has(c.id) && c.id !== me.id));
    } catch {
      setInviteContacts([]);
    } finally {
      setInviteLoading(false);
    }
  }

  async function inviteContact(uid: number) {
    if (invitingIds.has(uid)) return;
    setInvitingIds((prev) => new Set(prev).add(uid));
    const r = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/channels/${channelId}/subscribers?user_id=${uid}`, { method: "POST" });
    if (r.ok) {
      setInviteContacts((prev) => prev.filter((c) => c.id !== uid));
      setMsg("Контакт приглашён");
      loadSubscribers();
      onChanged();
    } else {
      const d = await r.json().catch(() => null);
      setMsg(d?.detail || "Не удалось пригласить");
    }
    setInvitingIds((prev) => {
      const n = new Set(prev); n.delete(uid); return n;
    });
  }

  useEffect(() => {
    if (tab === "requests") loadRequests();
    if (tab === "members") loadSubscribers();
    if (tab === "stats") loadStats();
    if (tab !== "main") setMsg("");
    // eslint-disable-next-line
  }, [tab]);

  return (
    <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-ivory dark:bg-[#1f1f23] rounded-2xl border border-line dark:border-white/10 shadow-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-line dark:border-white/10 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-black text-gray-900 dark:text-white">Настройки канала</h2>
          <IconButton icon={X} size="iconSm" onClick={onClose} />
        </div>
        <div className="p-3 border-b border-line dark:border-white/10 flex gap-2 shrink-0 flex-wrap">
          {tabBtn("main", "Канал", <Settings size={14} />)}
          {isAdmin && tabBtn("settings", "Настройки", <Settings size={14} />)}
          {isAdmin && tabBtn("links", "Ссылки", <Link2 size={14} />)}
          {isAdmin && tabBtn("members", "Участники", <Users size={14} />)}
          {isAdmin && tabBtn("requests", "Заявки", <Users size={14} />)}
          {isAdmin && tabBtn("stats", "Статистика", <BarChart3 size={14} />)}
          {isAdmin && tabBtn("danger", "Удаление", <Trash2 size={14} />)}
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {tab === "main" && (
            <>
              <div className="flex items-center justify-center">
                <div className="relative w-24 h-24 rounded-2xl overflow-hidden bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 cursor-pointer group" onClick={() => fileRef.current?.click()}>
                  {avatarPreview ? <img src={mediaUrl(avatarPreview)} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-gray-500 dark:text-white/40"><ImageIcon size={32} /></div>}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"><Upload size={20} className="text-white" /></div>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-600 dark:text-white/60 font-bold block mb-1">Название</label>
                <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 100))}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-white/10 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-[#8b5cf6]" />
              </div>
              <div>
                <label className="text-xs text-gray-600 dark:text-white/60 font-bold block mb-1">Описание</label>
                <textarea value={description || ""} onChange={(e) => setDescription(e.target.value.slice(0, 500))} rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-white/10 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-[#8b5cf6] resize-none" />
              </div>
              <div>
                <label className="text-xs text-gray-600 dark:text-white/60 font-bold block mb-1">Приватность</label>
                <select value={isPublic ? "public" : "private"} onChange={(e) => setIsPublic(e.target.value === "public")} className="w-full px-3 py-2 rounded-lg border border-line dark:border-white/10 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm">
                  <option value="public">🌐 Публичный — подписка сразу</option>
                  <option value="private">🔒 Приватный — по заявке/инвайту</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600 dark:text-white/60 font-bold block mb-1">Ссылка на канал</label>
                <div className="relative">
                  <AtSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-white/40" />
                  <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} maxLength={33}
                    className={`w-full pl-8 pr-3 py-2 rounded-lg border bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-[#8b5cf6] ${slugValid || slug.replace(/^@/, "") === channel.custom_slug ? "border-line dark:border-white/10" : "border-red-500/60"}`} />
                </div>
                <p className="text-[11px] text-gray-500 dark:text-white/40 mt-1">Латиница, цифры, «_», 5-32 символа. Канал доступен по /channels/{slug.replace(/^@/, "") || "ссылка"}</p>
              </div>
              {msg && <p className="text-xs text-red-500 dark:text-red-400">{msg}</p>}
              <Button icon={CheckCircle} onClick={saveSettings} loading={loading} className="w-full">
                Сохранить
              </Button>
            </>
          )}

          {tab === "settings" && (
            <div className="space-y-3">
              <div className="rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 p-3 space-y-3">
                <Toggle label="Показывать подпись автора (имя и аватар админа)" value={showAuthorSig} onChange={setShowAuthorSig} />
                <Toggle label="Тихие сообщения по умолчанию" desc="Новые посты приходят без звука" value={silentDefault} onChange={setSilentDefault} />
                <Toggle label="Показывать историю чата новым участникам" value={showHistory} onChange={setShowHistory} />
                <Toggle label="Комментарии включены" value={commentsOn} onChange={setCommentsOn} />
              </div>
              {msg && <p className={`text-xs ${msg.includes("ошибк") || msg.includes("Ошибк") || msg.includes("Не удалось") ? "text-red-500 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>{msg}</p>}
              <Button icon={CheckCircle} onClick={saveSettingsToggle} loading={savingToggles} className="w-full">
                Сохранить настройки
              </Button>
            </div>
          )}

          {tab === "stats" && (
            <div className="space-y-3">
              {!stats ? (
                <p className="text-center text-gray-500 dark:text-white/40 text-sm py-8">Загрузка…</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2.5">
                    <StatCard label="Подписчики" value={stats.subscribers_count ?? 0} />
                    <StatCard label="Просмотры" value={stats.total_views ?? 0} />
                    <StatCard label="Реакции" value={stats.total_reactions ?? 0} />
                    <StatCard label="Репосты" value={stats.total_shares ?? 0} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-600 dark:text-white/60 mb-2">Посты ({stats.posts_count ?? 0})</p>
                    {(stats.per_post || []).slice(0, 10).map((pp: any) => (
                      <div key={pp.post_id} className="flex items-center justify-between py-1.5 border-b border-line dark:border-white/5 text-xs">
                        <span className="text-gray-700 dark:text-white/70 truncate">#{pp.post_id} · {pp.created_at ? new Date(pp.created_at).toLocaleDateString("ru-RU") : "—"}</span>
                        <span className="text-gray-500 dark:text-white/50 shrink-0 ml-2">👁 {pp.views} · 👍 {pp.reactions} · 💬 {pp.comments}</span>
                      </div>
                    ))}
                    {(!stats.per_post || stats.per_post.length === 0) && (
                      <p className="text-center text-gray-500 dark:text-white/40 text-sm py-4">Постов пока нет</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {tab === "links" && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-white/80 cursor-pointer py-1">
                <input type="checkbox" checked={autoApprove} onChange={(e) => setAutoApprove(e.target.checked)} className="accent-[#8b5cf6]" />
                {channel.is_public ? "Прямое вступление (публичный канал)" : "Вступление без одобрения (auto-approve)"}
              </label>
              <div className="flex gap-2">
                <input value={inviteUrl} readOnly placeholder="Ссылка появится после создания"
                  className="flex-1 px-3 py-2 rounded-lg border border-line dark:border-white/10 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm" />
                <Button icon={creatingInvite ? Loader2 : Copy} onClick={createInvite} loading={creatingInvite}>
                  Создать
                </Button>
              </div>
              {inviteUrl && <p className="text-[11px] text-gray-500 dark:text-white/40">Ссылка скопирована в буфер обмена.</p>}
            </div>
          )}

          {tab === "members" && (
            <div className="space-y-3">
              <button
                onClick={() => { setShowInvite(!showInvite); setMsg(""); if (!showInvite && inviteContacts.length === 0) loadInviteContacts(); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#8b5cf6]/10 border border-[#8b5cf6]/40 text-[#8b5cf6] text-sm font-bold hover:bg-[#8b5cf6]/20 transition-colors"
              >
                {showInvite ? "✕ Скрыть приглашение" : "+ Пригласить контактов"}
              </button>

              {showInvite && (
                <div className="rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 p-3 space-y-2.5">
                  <div className="relative">
                    <AtSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-white/40" />
                    <input value={inviteSearch} onChange={(e) => setInviteSearch(e.target.value)} placeholder="Поиск среди контактов (Nebula)…" className="w-full pl-8 pr-3 py-2 rounded-lg border border-line dark:border-white/10 bg-ivory dark:bg-[#171717] text-gray-900 dark:text-white text-sm" />
                  </div>
                  <p className="text-[10px] text-gray-500 dark:text-white/40">Ваши подписки в Nebula — они и есть контакты. Лимит ручного добавления: 200.</p>
                  {inviteLoading ? (
                    <p className="text-center text-gray-500 dark:text-white/40 text-sm py-4">Загрузка…</p>
                  ) : inviteContacts.length === 0 ? (
                    <p className="text-center text-gray-500 dark:text-white/40 text-sm py-4">Некого пригласить — все ваши контакты уже в канале, или вы никого не читаете.</p>
                  ) : (
                    <div className="max-h-56 overflow-y-auto space-y-1.5">
                      {inviteContacts
                        .filter((c) => {
                          const q = inviteSearch.trim().toLowerCase();
                          if (!q) return true;
                          return (c.display_name || "").toLowerCase().includes(q) || (c.username || "").toLowerCase().includes(q);
                        })
                        .map((c) => (
                          <div key={c.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-200/60 dark:hover:bg-white/10 transition-colors">
                            <Avatar src={c.avatar_url} name={c.display_name} id={c.id} size={32} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{c.display_name}</p>
                              <p className="text-[11px] text-gray-500 dark:text-white/50 truncate">@{c.username}</p>
                            </div>
                            <button onClick={() => inviteContact(c.id)} disabled={invitingIds.has(c.id)} className="px-3 py-1.5 rounded-lg bg-[#8b5cf6] text-white text-xs font-bold hover:bg-[#7c3aed] disabled:opacity-50 flex items-center gap-1">
                              {invitingIds.has(c.id) ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
                              Пригласить
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
              {subscribers.length === 0 ? (
                <p className="text-center text-gray-500 dark:text-white/40 text-sm py-8">Подписчиков нет</p>
              ) : (
                <div className="space-y-2.5">
                  {subscribers.map((m) => {
                    const u = m.user;
                    const isOwner = m.role === "owner";
                    return (
                      <div key={u.id} className="rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 p-3 flex items-center gap-3">
                        <Avatar src={u.avatar_url} name={u.display_name} id={u.id} size={40} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-900 dark:text-white truncate">{u.display_name}</span>
                            {isOwner ? <Crown size={14} className="text-yellow-500" /> : m.role === "admin" ? <Shield size={14} className="text-[#8b5cf6]" /> : null}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-white/50 truncate">@{u.username}</p>
                        </div>
                        {isOwner ? (
                          <span className="text-[10px] font-black text-yellow-500 uppercase">Создатель</span>
                        ) : (
                          <div className="flex items-center gap-1">
                            <select
                              value={m.role}
                              onChange={(e) => setRole(u.id, e.target.value)}
                              className="px-2 py-1 rounded-lg border border-line dark:border-white/10 bg-ivory dark:bg-[#171717] text-xs font-bold text-gray-900 dark:text-white"
                            >
                              <option value="subscriber">Подписчик</option>
                              <option value="admin">Админ</option>
                            </select>
                            <IconButton icon={UserX} variant="danger" size="iconSm" onClick={() => kickMember(u.id)} title="Исключить" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === "requests" && (
            <div>
              {requests.length === 0 && (
                <p className="text-center text-gray-500 dark:text-white/40 text-sm py-8">Заявок на вступление нет</p>
              )}
              <div className="space-y-2.5">
                {requests.map((r) => (
                  <div key={r.id} className="rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 p-3 flex items-center gap-3">
                    <Avatar src={r.user?.avatar_url} name={r.user?.display_name} id={r.user_id} size={40} />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 dark:text-white truncate">{r.user?.display_name}</p>
                      <p className="text-xs text-gray-500 dark:text-white/50 truncate">@{r.user?.username}</p>
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

          {tab === "danger" && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={18} className="text-red-500" />
                <h3 className="font-black text-gray-900 dark:text-white">Опасная зона</h3>
              </div>
              <p className="text-xs text-gray-600 dark:text-white/50 mb-4">
                Удаление канала удалит все посты, комментарии и подписчиков. Действие необратимо.
              </p>
              <Button variant="danger" icon={Trash2} onClick={deleteChannel} className="w-full">
                Удалить канал
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, desc, value, onChange }: { label: string; desc?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer py-1">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-900 dark:text-white">{label}</span>
        {desc && <span className="block text-[11px] text-gray-500 dark:text-white/40 mt-0.5">{desc}</span>}
      </span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onChange(!value); }}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${value ? "bg-[#8b5cf6]" : "bg-gray-300 dark:bg-white/15"}`}
      >
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${value ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 p-3">
      <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-white/40">{label}</p>
      <p className="text-xl font-black text-gray-900 dark:text-white mt-0.5">{value.toLocaleString("ru-RU")}</p>
    </div>
  );
}