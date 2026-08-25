"use client";
import { useState, useEffect, useRef } from "react";
import { Avatar } from "@/components/Avatar";
import { UserSearchFieldSkeleton } from "@/components/Skeletons";
import { getToken } from "@/lib/auth";
import { X } from "lucide-react";
import { IconButton } from "@/components/ui/Button";

interface UserSearchFieldProps {
  selectedUserId: number | null;
  onSelect: (id: number) => void;
  onClear: () => void;
}

export function UserSearchField({ selectedUserId, onSelect, onClear }: UserSearchFieldProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Загружаем данные выбранного пользователя
  useEffect(() => {
    if (selectedUserId) {
      const token = getToken();
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/${selectedUserId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) setSelectedUser(data);
        })
        .catch(() => {});
    } else {
      setSelectedUser(null);
    }
  }, [selectedUserId]);

  // Поиск с debounce
  useEffect(() => {
    if (!query.trim() || selectedUserId) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      const token = getToken();
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/search?q=${encodeURIComponent(query.trim())}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((r) => (r.ok ? r.json() : { users: [] }))
        .then((data) => {
          setResults(data.users || []);
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, selectedUserId]);

  // Если пользователь выбран - показываем его карточку
  if (selectedUser) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg bg-[#8b5cf6]/10 border border-[#8b5cf6]/30">
        <Avatar src={selectedUser.avatar_url} name={selectedUser.display_name} id={selectedUser.id} size={32} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">{selectedUser.display_name}</p>
          <p className="text-[10px] text-gray-500 dark:text-white/40 truncate">@{selectedUser.username} · ID: {selectedUser.id}</p>
        </div>
        <IconButton icon={X} variant="danger" size="iconSm" onClick={onClear} />
      </div>
    );
  }

  // Иначе - поле поиска с выпадающим списком
  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Поиск по ID, username или имени..."
        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-xs placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:border-purple-600 dark:focus:border-purple-400"
      />
      {query.trim() && (loading || results.length > 0) && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#1f1f23] border border-gray-200 dark:border-white/15 rounded-xl shadow-2xl overflow-hidden z-50 max-h-48 overflow-y-auto">
          {loading && <UserSearchFieldSkeleton />}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-500 dark:text-white/40 text-center">Ничего не найдено</div>
          )}
          {results.map((u: any) => (
            <button
              key={u.id}
              onClick={() => {
                onSelect(u.id);
                setQuery("");
                setResults([]);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-white/10 text-left transition-colors"
            >
              <Avatar src={u.avatar_url} name={u.display_name} id={u.id} size={28} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">{u.display_name}</p>
                <p className="text-[10px] text-gray-500 dark:text-white/40 truncate">@{u.username} · ID: {u.id}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}