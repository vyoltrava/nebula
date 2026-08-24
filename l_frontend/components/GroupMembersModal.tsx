"use client";
import { useState, useEffect } from "react";
import { X, UserPlus, Shield, Crown, UserX, Search } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { getToken } from "@/lib/auth";
import { Button, IconButton } from "@/components/ui/Button";

interface Props {
  chatId: number;
  myRole: string | null;
  onClose: () => void;
  onChanged: () => void;
}

export function GroupMembersModal({ chatId, myRole, onClose, onChanged }: Props) {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const isAdmin = myRole === "owner" || myRole === "admin";

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
    if (role === "owner") return <Crown size={12} className="text-yellow-400" />;
    if (role === "admin") return <Shield size={12} className="text-[#8b5cf6]" />;
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200]" onClick={onClose} />
      <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
        <div className="w-full max-w-md max-h-[80vh] bg-[#1f1f23] border border-white/10 rounded-2xl shadow-2xl flex flex-col pointer-events-auto">
          <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
            <h2 className="text-lg font-black text-white">
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

          {showAdd && isAdmin && (
            <div className="p-3 border-b border-white/10 shrink-0">
              <div className="relative mb-2">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Поиск пользователя..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-white/10 bg-white/5 text-white placeholder-white/40 focus:outline-none focus:border-[#8b5cf6] text-sm"
                  autoFocus
                />
              </div>
              {searchResults.map((u) => (
                <div
                  key={u.id}
                  onClick={() => addUser(u.id)}
                  className="flex items-center gap-2 p-2 hover:bg-white/5 rounded-lg cursor-pointer"
                >
                  <Avatar src={u.avatar_url} name={u.display_name} id={u.id} size={28} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">
                      {u.display_name}
                    </p>
                    <p className="text-xs text-white/50 truncate">@{u.username}</p>
                  </div>
                  <UserPlus size={14} className="text-[#8b5cf6]" />
                </div>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {loading && (
              <p className="p-8 text-center text-white/40">Загрузка...</p>
            )}
            {members.map((m) => (
              <div
                key={m.user.id}
                className="flex items-center gap-3 p-3 border-b border-white/5 hover:bg-white/5"
              >
                <Avatar
                  src={m.user.avatar_url}
                  name={m.user.display_name}
                  id={m.user.id}
                  size={36}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-bold text-white truncate">
                      {m.user.display_name}
                    </p>
                    {roleIcon(m.role)}
                    {m.role === "owner" && (
                      <span className="text-[9px] font-black text-yellow-400 uppercase">
                        Создатель
                      </span>
                    )}
                    {m.role === "admin" && (
                      <span className="text-[9px] font-black text-[#8b5cf6] uppercase">
                        Админ
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white/50 truncate">@{m.user.username}</p>
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