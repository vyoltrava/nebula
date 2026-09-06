"use client";
import { useState, useEffect } from "react";
import { X, UserPlus, Shield, Crown, UserX, Search } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { UserRowSkeleton } from "@/components/Skeletons";
import { UserPrefix } from "@/components/UserPrefixProvider";
import { getToken } from "@/lib/auth";
import { Button, IconButton } from "@/components/ui/Button";

interface Props {
  chatId: number;
  myRole: string | null;
  onClose: () => void;
  onChanged: () => void;
  openAdd?: boolean;
  openBots?: boolean;
}

export function GroupMembersModal({ chatId, myRole, onClose, onChanged, openAdd, openBots }: Props) {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(!!openAdd);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const isAdmin = myRole === "owner" || myRole === "admin";
  const [myBots, setMyBots] = useState<any[]>([]);
  const [showBots, setShowBots] = useState(!!openBots);
  const [newBotName, setNewBotName] = useState("");
  const [botBusy, setBotBusy] = useState(false);

  useEffect(() => { if (openBots) loadMyBots(); }, [openBots]);

  async function loadMyBots() {
    const token = getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/bots?mine=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setMyBots(await res.json());
  }

  async function addBotToChat(botId: number) {
    const token = getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/bots/${botId}/add-to-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ chat_id: chatId }),
    });
    if (res.ok) { loadMembers(); onChanged(); } else alert("Не удалось добавить бота");
  }

  async function createBotHere() {
    const nm = newBotName.trim();
    if (!nm || botBusy) return;
    setBotBusy(true);
    const token = getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/bots`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: nm, type: "custom" }),
    });
    setBotBusy(false);
    if (res.ok) {
      const bot = await res.json();
      setNewBotName("");
      loadMyBots();
      if (bot.user_id) addBotToChat(bot.id);
    } else {
      const d = await res.json().catch(() => null);
      alert(d?.detail || "Ошибка создания бота");
    }
  }

  async function loadMembers() {
    const token = getToken();
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/members`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) setMembers(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMembers();
  }, [chatId]);

  useEffect(() => {
    if (!showAdd || query.length < 1) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/users?q=${encodeURIComponent(query)}&limit=10`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        const memberIds = new Set(members.map((m) => m.user.id));
        setSearchResults((data.users || []).filter((u: any) => !memberIds.has(u.id)));
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, showAdd, members]);

  async function addUser(userId: number) {
    const token = getToken();
    const fd = new FormData();
    fd.append("user_id", String(userId));
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/members`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd }
    );
    if (res.ok) {
      loadMembers();
      onChanged();
      setQuery("");
    } else {
      alert("Не удалось добавить");
    }
  }

  async function removeUser(userId: number) {
    if (!confirm("Удалить участника?")) return;
    const token = getToken();
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/members/${userId}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.ok) {
      loadMembers();
      onChanged();
    } else {
      alert("Не удалось удалить");
    }
  }

  function roleIcon(role: string) {
    if (role === "owner") return <Crown size={12} className="text-yellow-600 dark:text-yellow-400" />;
    if (role === "admin") return <Shield size={12} className="text-[#8b5cf6]" />;
    return null;
  }
  void roleIcon;

  return (
    <>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200]" onClick={onClose} />
      <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
        <div className="w-full max-w-md max-h-[80vh] bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/10 rounded-2xl shadow-2xl flex flex-col pointer-events-auto">
          <div className="p-4 border-b border-line dark:border-white/10 flex items-center justify-between shrink-0">
            <h2 className="text-lg font-black text-gray-900 dark:text-white">
              Участники ({members.length})
            </h2>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <IconButton
                  icon={UserPlus}
                  size="iconSm"
                  variant={showAdd ? "primary" : "ghost"}
                  onClick={() => setShowAdd(!showAdd)}
                />
              )}
              <IconButton icon={X} size="iconSm" onClick={onClose} />
            </div>
          </div>

          {(showAdd || showBots) && isAdmin && (
            <div className="p-3 border-b border-line dark:border-white/10 shrink-0">
              {showAdd && (
              <div className="relative mb-2">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-white/40"
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Поиск пользователя..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-line dark:border-white/10 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-[#8b5cf6] text-sm"
                  autoFocus
                />
              </div>
              )}
              {/* 🤖 Боты: добавить моего / создать нового прямо здесь */}
              <div className="mb-2 rounded-xl border border-[#8b5cf6]/30 bg-[#8b5cf6]/5 p-2.5">
                <button onClick={() => { const n = !showBots; setShowBots(n); if (n) loadMyBots(); }}
                  className="w-full flex items-center justify-between text-xs font-black uppercase tracking-wide text-[#8b5cf6]">
                  <span className="flex items-center gap-1.5">🤖 Боты</span>
                  <span>{showBots ? "−" : "+"}</span>
                </button>
                {showBots && (
                  <div className="mt-2 space-y-2">
                    <div className="flex gap-1.5">
                      <input value={newBotName} onChange={(e) => setNewBotName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") createBotHere(); }}
                        placeholder="Имя нового бота…"
                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-line dark:border-white/10 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-xs focus:outline-none focus:border-[#8b5cf6]" />
                      <button onClick={createBotHere} disabled={botBusy || !newBotName.trim()}
                        className="px-3 py-1.5 rounded-lg bg-[#8b5cf6] text-white text-xs font-bold disabled:opacity-40">
                        Создать
                      </button>
                    </div>
                    {myBots.map((b) => (
                      <div key={b.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10">
                        <span className="text-xs font-bold text-gray-900 dark:text-white truncate">🤖 {b.name}</span>
                        <button onClick={() => addBotToChat(b.id)}
                          className="px-2.5 py-1 rounded-lg bg-[#8b5cf6] text-white text-[11px] font-bold hover:bg-[#7c3aed]">
                          Добавить
                        </button>
                      </div>
                    ))}
                    {myBots.length === 0 && <p className="text-[10px] text-gray-500 dark:text-white/40">Своих ботов нет — создай выше или в BOT Company (/bots)</p>}
                  </div>
                )}
              </div>
              {showAdd && searchResults.map((u) => (
                <div
                  key={u.id}
                  onClick={() => addUser(u.id)}
                  className="flex items-center gap-3 p-3 rounded-xl border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 cursor-pointer transition-colors"
                >
                  <Avatar src={u.avatar_url} name={u.display_name} id={u.id} size={36} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                      {u.display_name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-white/50 truncate">@{u.username}</p>
                  </div>
                  <span className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[#8b5cf6]/40 text-[#8b5cf6] text-xs font-bold">
                    <UserPlus size={12} /> Добавить
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loading && (
              <div className="p-3 space-y-1"><UserRowSkeleton /><UserRowSkeleton /><UserRowSkeleton /></div>
            )}
            {members.map((m) => (
              <div
                key={m.user.id}
                className="flex items-center gap-3 p-3 rounded-xl border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
              >
                <Avatar
                  src={m.user.avatar_url}
                  name={m.user.display_name}
                  id={m.user.id}
                  size={40}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-gray-900 dark:text-white truncate">
                      {m.user.display_name}
                    </p>
                    <UserPrefix userId={m.user.id} size={14} />
                    {m.role === "owner" && (
                      <span className="px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 text-[10px] font-black uppercase">
                        Создатель
                      </span>
                    )}
                    {m.user.is_bot && (
                      <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-600 dark:text-blue-400 text-[10px] font-black uppercase">
                        🤖 Бот
                      </span>
                    )}
                    {m.role === "admin" && (
                      <span className="px-2 py-0.5 rounded bg-[#8b5cf6]/20 text-[#8b5cf6] text-[10px] font-black uppercase">
                        Админ
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-white/50 truncate">@{m.user.username}</p>
                </div>
                {isAdmin && m.role !== "owner" && (
                  <IconButton
                    icon={UserX}
                    variant="danger"
                    size="iconSm"
                    onClick={() => removeUser(m.user.id)}
                    title="Удалить из группы"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}