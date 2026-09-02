"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { X, Upload, Image as ImageIcon, Save, Link2, Plus, Copy, Trash2, UserPlus, UserX, Crown, Shield, Settings, Users, AlertTriangle, Search } from "lucide-react";
import { getToken } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import { Avatar } from "@/components/Avatar";
import { Button, IconButton } from "@/components/ui/Button";

interface Props {
  chatId: number;
  chat: any;
  onClose: () => void;
  onUpdate: () => void;
}

type Tab = "main" | "links" | "members" | "danger";

export function GroupSettingsModal({ chatId, chat, onClose, onUpdate }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("main");
  const [name, setName] = useState(chat.name || "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(chat.avatar_url || null);
  const [canAddMembers, setCanAddMembers] = useState(chat.can_add_members || "admins");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const isAdmin = chat?.my_role === "owner" || chat?.my_role === "admin";

  const authFetch = (url: string, opts: any = {}) => {
    const token = getToken();
    return fetch(url, { ...opts, headers: { ...(opts.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  };

  const [invites, setInvites] = useState<any[]>([]);
  const [invName, setInvName] = useState("");
  const [invHours, setInvHours] = useState("");
  const [invError, setInvError] = useState("");
  const [members, setMembers] = useState<any[]>([]);
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<any[]>([]);
const loadInvites = async () => {
    if (!isAdmin) return;
    const r = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/invites`);
    if (r.ok) setInvites(await r.json());
  };
  const createInvite = async () => {
    setInvError("");
    const hours = invHours ? Number(invHours) : null;
    if (invHours && (!hours || hours <= 0)) { setInvError("Срок должен быть положительным числом"); return; }
    const r = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/invites`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: invName.trim() || null, expires_in_hours: hours }),
    });
    if (r.ok) { setInvName(""); setInvHours(""); loadInvites(); }
    else { const d = await r.json().catch(() => null); setInvError(d?.detail || "Ошибка"); }
  };
  const revokeInvite = async (id: number) => {
    await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/invites/${id}`, { method: "DELETE" });
    loadInvites();
  };
  const copyInvite = (link: string) => {
    try { navigator.clipboard?.writeText(`${location.origin}${link}`); } catch {}
  };

  const loadMembers = async () => {
    const r = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/members`);
    if (r.ok) setMembers(await r.json());
  };
  const setRole = async (uid: number, role: string) => {
    const r = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/members/${uid}/role`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }),
    });
    if (r.ok) loadMembers();
  };
  const removeMember = async (uid: number) => {
    if (!confirm("Удалить участника?")) return;
    await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/members/${uid}`, { method: "DELETE" });
    loadMembers();
  };
  const addMember = async (uid: number) => {
    const fd = new FormData(); fd.append("user_id", String(uid));
    const r = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/members`, { method: "POST", body: fd });
    if (r.ok) { loadMembers(); setAddQuery(""); setAddResults([]); }
    else { const d = await r.json().catch(() => null); alert(d?.detail || "Не удалось добавить"); }
  };
  const searchUsers = async (q: string) => {
    if (q.trim().length < 1) { setAddResults([]); return; }
    const r = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users?q=${encodeURIComponent(q)}&limit=8`);
    if (r.ok) {
      const d = await r.json();
      const memberIds = new Set(members.map((m) => m.user.id));
      setAddResults((d.users || []).filter((u: any) => !memberIds.has(u.id)));
    }
  };

  useEffect(() => { loadInvites(); loadMembers(); /* eslint-disable-next-line */ }, [chatId]);

  async function saveSettings() {
    setLoading(true);
    try {
      if (name !== chat.name) {
        const form = new FormData(); form.append("name", name);
        await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}`, { method: "PATCH", body: form });
      }
      if (avatarFile) {
        const form = new FormData(); form.append("file", avatarFile);
        const r = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/avatar`, { method: "POST", body: form });
        if (r.ok) { const d = await r.json(); setAvatarPreview(d.avatar_url); }
      }
      const priv = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/settings`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ can_add_members: canAddMembers }),
      });
      if (!priv.ok) throw new Error("Failed to update settings");
      onUpdate();
      onClose();
    } catch (e) {
      console.error(e);
      alert("Ошибка сохранения настроек");
    } finally {
      setLoading(false);
    }
  }

  async function deleteChat() {
    if (!confirm("Удалить этот чат? Это действие необратимо.")) return;
    const r = await authFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}`, { method: "DELETE" });
    if (r.ok) { onClose(); router.push("/messages"); }
    else { const d = await r.json().catch(() => null); alert(d?.detail || "Нет прав на удаление"); }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setAvatarFile(f); setAvatarPreview(URL.createObjectURL(f));
  };

  const tabBtn = (id: Tab, label: string, icon: any) => (
    <button onClick={() => setTab(id)}
      className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${tab === id ? "bg-[#8b5cf6] text-white" : "bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/60 hover:bg-gray-200 dark:hover:bg-white/10"}`}>
      {icon} {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-ivory dark:bg-[#1f1f23] rounded-2xl border border-line dark:border-white/10 shadow-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-line dark:border-white/10 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-black text-gray-900 dark:text-white">Настройки группы</h2>
          <IconButton icon={X} size="iconSm" onClick={onClose} />
        </div>
        <div className="p-3 border-b border-line dark:border-white/10 flex gap-2 shrink-0">
          {tabBtn("main", "Группа", <Settings size={14} />)}
          {isAdmin && tabBtn("links", "Ссылки", <Link2 size={14} />)}
          {isAdmin && tabBtn("members", "Участники", <Users size={14} />)}
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
                <input value={name} onChange={(e) => setName(e.target.value.slice(0, 80))}
                  className="w-full px-3 py-2 rounded-lg border border-line dark:border-white/10 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-[#8b5cf6]" />
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-600 dark:text-white/60 font-bold block mb-1">Кто может добавлять участников</label>
                  <select value={canAddMembers} onChange={(e) => setCanAddMembers(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-line dark:border-white/10 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm">
                    <option value="admins">Только администраторы</option>
                    <option value="members">Все участники</option>
                  </select>
                </div>
              </div>
              <Button icon={Save} loading={loading} onClick={saveSettings} disabled={loading} className="w-full">
                {loading ? "Сохранение..." : "Сохранить"}
              </Button>
            </>
          )}
{tab === "links" && (
            <>
              <div className="rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 p-3 space-y-2">
                <div>
                  <label className="text-xs text-gray-600 dark:text-white/60 font-bold block mb-1">Название ссылки</label>
                  <input value={invName} onChange={(e) => setInvName(e.target.value)} placeholder="Например: для друзей"
                    className="w-full px-3 py-2 rounded-lg border border-line dark:border-white/10 bg-ivory dark:bg-[#171717] text-gray-900 dark:text-white text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-600 dark:text-white/60 font-bold block mb-1">Срок действия (часов) — пусто = постоянно</label>
                  <input value={invHours} onChange={(e) => setInvHours(e.target.value)} type="number" min="1" placeholder="24"
                    className="w-full px-3 py-2 rounded-lg border border-line dark:border-white/10 bg-ivory dark:bg-[#171717] text-gray-900 dark:text-white text-sm" />
                </div>
                {invError && <p className="text-xs text-red-500">{invError}</p>}
                <Button icon={Plus} onClick={createInvite} className="w-full">Создать ссылку</Button>
              </div>
              <div className="space-y-2">
                {invites.length === 0 && <p className="text-sm text-gray-500 dark:text-white/40 text-center py-4">Ссылок пока нет</p>}
                {invites.map((inv) => (
                  <div key={inv.id} className="rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sm text-gray-900 dark:text-white truncate">{inv.name || "Приглашение"}</span>
                      <div className="flex items-center gap-1">
                        <IconButton icon={Copy} size="iconSm" onClick={() => copyInvite(inv.invite_link)} title="Скопировать" />
                        <IconButton icon={Trash2} variant="danger" size="iconSm" onClick={() => revokeInvite(inv.id)} title="Отозвать" />
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-white/40 truncate mt-1">/{inv.token}</p>
                    {inv.expires_at && <p className="text-[10px] text-amber-500 mt-0.5">⏰ до {new Date(inv.expires_at).toLocaleString()}</p>}
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === "members" && (
            <>
              <div className="rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 p-3">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-white/40" />
                  <input value={addQuery}
                    onChange={(e) => { setAddQuery(e.target.value); searchUsers(e.target.value); }}
                    placeholder="Найти и добавить участника..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-line dark:border-white/10 bg-ivory dark:bg-[#171717] text-gray-900 dark:text-white text-sm" />
                </div>
                {addResults.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {addResults.map((u) => (
                      <button key={u.id} onClick={() => addMember(u.id)} className="w-full flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg text-left">
                        <Avatar src={u.avatar_url} name={u.display_name} id={u.id} size={24} />
                        <span className="flex-1 truncate text-sm text-gray-900 dark:text-white">{u.display_name}</span>
                        <UserPlus size={14} className="text-[#8b5cf6]" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                {members.map((m) => {
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
                      {!isOwner && isAdmin && (
                        <div className="flex items-center gap-1">
                          <select value={m.role} onChange={(e) => setRole(u.id, e.target.value)}
                            className="px-2 py-1 rounded-lg border border-line dark:border-white/10 bg-ivory dark:bg-[#171717] text-xs font-bold text-gray-900 dark:text-white">
                            <option value="member">Участник</option>
                            <option value="admin">Админ</option>
                          </select>
                          <IconButton icon={UserX} variant="danger" size="iconSm" onClick={() => removeMember(u.id)} title="Удалить" />
                        </div>
                      )}
                      {isOwner && <span className="text-[10px] font-black text-yellow-500 uppercase">Создатель</span>}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {tab === "danger" && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={18} className="text-red-500" />
                <h3 className="font-black text-gray-900 dark:text-white">Опасная зона</h3>
              </div>
              <p className="text-xs text-gray-600 dark:text-white/50 mb-4">
                Удаление группы удалит все сообщения и участников. Действие необратимо.
              </p>
              <Button variant="danger" icon={Trash2} onClick={deleteChat} className="w-full">
                Удалить группу
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}