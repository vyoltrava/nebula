"use client";
import { useState, useEffect } from "react";
import { X, Search, Users, Check } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { getToken } from "@/lib/auth";
import { Button, IconButton } from "@/components/ui/Button";

interface Props {
  onClose: () => void;
  onCreated: (chatId: number) => void;
}

export function CreateGroupModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.length < 1) { setUsers([]); return; }
    const t = setTimeout(async () => {
      const token = getToken();
      if (!token) return;
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/users?q=${encodeURIComponent(query)}&limit=10`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setUsers(data.users || []);
        }
      } catch (e) {
        console.error(e);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 49) next.add(id);
      return next;
    });
  }

  async function create() {
    if (!name.trim()) { setError("Р’РІРµРґРёС‚Рµ РЅР°Р·РІР°РЅРёРµ РіСЂСѓРїРїС‹"); return; }
    if (selected.size === 0) { setError("Р”РѕР±Р°РІСЊС‚Рµ С…РѕС‚СЏ Р±С‹ РѕРґРЅРѕРіРѕ СѓС‡Р°СЃС‚РЅРёРєР°"); return; }
    setLoading(true);
    setError(null);
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/group`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: name.trim(), user_ids: Array.from(selected) }),
      });
      if (res.ok) {
        const data = await res.json();
        onCreated(data.chat_id);
      } else {
        const err = await res.json().catch(() => ({ detail: "РћС€РёР±РєР°" }));
        setError(err.detail || "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ РіСЂСѓРїРїСѓ");
      }
    } catch {
      setError("РћС€РёР±РєР° СЃРµС‚Рё");
    } finally {
      setLoading(false);
    }
  }

  const selectedUsers = users.filter((u) => selected.has(u.id));

  return (
    <>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200]" onClick={onClose} />
      <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
        <div className="w-full max-w-lg max-h-[85vh] bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/10 rounded-2xl shadow-2xl flex flex-col pointer-events-auto">
          <div className="p-4 border-b border-line dark:border-white/10 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Users className="text-[#8b5cf6]" size={20} />
              <h2 className="text-lg font-black text-gray-900 dark:text-white">РќРѕРІР°СЏ РіСЂСѓРїРїР°</h2>
            </div>
            <IconButton icon={X} size="iconSm" onClick={onClose} />
          </div>

          <div className="p-4 border-b border-line dark:border-white/10 shrink-0">
            <label className="block text-xs text-gray-600 dark:text-white/60 mb-1.5 font-bold">РќР°Р·РІР°РЅРёРµ РіСЂСѓРїРїС‹</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 80))}
              placeholder="РќР°РїСЂРёРјРµСЂ: Р”СЂСѓР·СЊСЏ, РџСЂРѕРµРєС‚ X..."
              className="w-full px-3 py-2 rounded-xl border border-line dark:border-white/10 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-[#8b5cf6]"
              autoFocus
            />
          </div>

          <div className="p-4 border-b border-line dark:border-white/10 shrink-0">
            <label className="block text-xs text-gray-600 dark:text-white/60 mb-1.5 font-bold">
              Р”РѕР±Р°РІРёС‚СЊ СѓС‡Р°СЃС‚РЅРёРєРѕРІ ({selected.size}/49)
            </label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-white/40" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="РџРѕРёСЃРє РїРѕ РёРјРµРЅРё РёР»Рё @username..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-line dark:border-white/10 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-[#8b5cf6]"
              />
            </div>
          </div>

          {selected.size > 0 && (
            <div className="p-3 border-b border-line dark:border-white/10 flex gap-1.5 flex-wrap shrink-0">
              {selectedUsers.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-1.5 bg-[#8b5cf6]/20 text-[#8b5cf6] rounded-full pl-1 pr-2 py-1 text-xs"
                >
                  <Avatar src={u.avatar_url} name={u.display_name} id={u.id} size={20} />
                  <span className="font-bold truncate max-w-[100px]">{u.display_name}</span>
                  <button onClick={() => toggle(u.id)} className="hover:text-gray-900 dark:hover:text-white">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {query.length < 1 && (
              <p className="p-8 text-center text-gray-500 dark:text-white/40 text-sm">
                РќР°С‡РЅРёС‚Рµ РІРІРѕРґРёС‚СЊ РёРјСЏ, С‡С‚РѕР±С‹ РЅР°Р№С‚Рё РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№
              </p>
            )}
            {users.length === 0 && query.length > 0 && (
              <p className="p-8 text-center text-gray-500 dark:text-white/40 text-sm">РќРёРєРѕРіРѕ РЅРµ РЅР°Р№РґРµРЅРѕ</p>
            )}
            {users.map((u) => {
              const isSelected = selected.has(u.id);
              return (
                <div
                  key={u.id}
                  onClick={() => toggle(u.id)}
                  className={`flex items-center gap-3 p-3 border-b border-line dark:border-white/5 cursor-pointer transition-colors ${
                    isSelected ? "bg-[#8b5cf6]/10" : "hover:bg-gray-100 dark:hover:bg-white/5"
                  }`}
                >
                  <Avatar src={u.avatar_url} name={u.display_name} id={u.id} size={36} />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 dark:text-white truncate">{u.display_name}</p>
                    <p className="text-xs text-gray-600 dark:text-white/50 truncate">@{u.username}</p>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                      isSelected ? "bg-[#8b5cf6] border-[#8b5cf6]" : "border-line dark:border-white/30"
                    }`}
                  >
                    {isSelected && <Check size={12} className="text-gray-900 dark:text-white" />}
                  </div>
                </div>
              );
            })}
          </div>

          {error && (
            <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/30 text-red-600 dark:text-red-400 text-xs shrink-0">
              {error}
            </div>
          )}

          <div className="p-4 border-t border-line dark:border-white/10 shrink-0">
            <Button
              icon={Users}
              loading={loading}
              onClick={create}
              disabled={loading || !name.trim() || selected.size === 0}
              className="w-full"
            >
              {loading ? "РЎРѕР·РґР°РЅРёРµ..." : `РЎРѕР·РґР°С‚СЊ РіСЂСѓРїРїСѓ (${selected.size + 1} С‡РµР».)`}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}