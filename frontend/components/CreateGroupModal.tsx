"use client";
import { useState, useEffect } from "react";
import { X, Search, Users, Check } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { getToken } from "@/lib/auth";

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
    if (query.length < 1) {
      setUsers([]);
      return;
    }
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
    if (!name.trim()) {
      setError("Введите название группы");
      return;
    }
    if (selected.size === 0) {
      setError("Добавьте хотя бы одного участника");
      return;
    }
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
        const err = await res.json().catch(() => ({ detail: "Ошибка" }));
        setError(err.detail || "Не удалось создать группу");
      }
    } catch (e) {
      setError("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }

  const selectedUsers = users.filter((u) => selected.has(u.id));

  return (
    <>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200]" onClick={onClose} />
      <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
        <div className="w-full max-w-lg max-h-[85vh] bg-[#1f1f23] border border-white/10 rounded-2xl shadow-2xl flex flex-col pointer-events-auto">
          {/* Шапка */}
          <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Users className="text-[#8b5cf6]" size={20} />
              <h2 className="text-lg font-black text-white">Новая группа</h2>
            </div>
            <button onClick={onClose} className="text-white/60 hover:text-white p-1">
              <X size={20} />
            </button>
          </div>

          {/* Название */}
          <div className="p-4 border-b border-white/10 shrink-0">
            <label className="block text-xs text-white/60 mb-1.5 font-bold">Название группы</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 80))}
              placeholder="Например: Друзья, Проект X..."
              className="w-full px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-white placeholder-white/40 focus:outline-none focus:border-[#8b5cf6]"
              autoFocus
            />
          </div>

          {/* Поиск */}
          <div className="p-4 border-b border-white/10 shrink-0">
            <label className="block text-xs text-white/60 mb-1.5 font-bold">
              Добавить участников ({selected.size}/49)
            </label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по имени или @username..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-white/10 bg-white/5 text-white placeholder-white/40 focus:outline-none focus:border-[#8b5cf6]"
              />
            </div>
          </div>

          {/* Выбранные */}
          {selected.size > 0 && (
            <div className="p-3 border-b border-white/10 flex gap-1.5 flex-wrap shrink-0">
              {selectedUsers.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-1.5 bg-[#8b5cf6]/20 text-[#8b5cf6] rounded-full pl-1 pr-2 py-1 text-xs"
                >
                  <Avatar src={u.avatar_url} name={u.display_name} id={u.id} size={20} />
                  <span className="font-bold truncate max-w-[100px]">{u.display_name}</span>
                  <button onClick={() => toggle(u.id)} className="hover:text-white">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Список пользователей */}
          <div className="flex-1 overflow-y-auto">
            {query.length < 1 && (
              <p className="p-8 text-center text-white/40 text-sm">
                Начните вводить имя, чтобы найти пользователей
              </p>
            )}
            {users.length === 0 && query.length > 0 && (
              <p className="p-8 text-center text-white/40 text-sm">Никого не найдено</p>
            )}
            {users.map((u) => {
              const isSelected = selected.has(u.id);
              return (
                <div
                  key={u.id}
                  onClick={() => toggle(u.id)}
                  className={`flex items-center gap-3 p-3 border-b border-white/5 cursor-pointer transition-colors ${
                    isSelected ? "bg-[#8b5cf6]/10" : "hover:bg-white/5"
                  }`}
                >
                  <Avatar src={u.avatar_url} name={u.display_name} id={u.id} size={36} />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white truncate">{u.display_name}</p>
                    <p className="text-xs text-white/50 truncate">@{u.username}</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                    isSelected ? "bg-[#8b5cf6] border-[#8b5cf6]" : "border-white/30"
                  }`}>
                    {isSelected && <Check size={12} className="text-white" />}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Ошибка */}
          {error && (
            <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/30 text-red-400 text-xs shrink-0">
              {error}
            </div>
          )}

          {/* Кнопка создания */}
          <div className="p-4 border-t border-white/10 shrink-0">
            <button
              onClick={create}
              disabled={loading || !name.trim() || selected.size === 0}
              className="w-full py-2.5 rounded-xl bg-[#8b5cf6] text-white font-bold hover:bg-[#7c3aed] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Создание..." : `Создать группу (${selected.size + 1} чел.)`}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}