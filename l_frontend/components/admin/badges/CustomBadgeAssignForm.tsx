"use client";
import { useState, useEffect } from "react";
import { getToken } from "@/lib/auth";
import { X, Search, User as UserIcon } from "lucide-react";

interface BadgeData {
  id: number;
  name: string;
  description: string | null;
}

interface AssignFormProps {
  badge?: BadgeData;
  badges?: BadgeData[];
  onClose?: () => void;
  onSuccess?: () => void;
}

export function CustomBadgeAssignForm({ badge, badges, onClose, onSuccess }: AssignFormProps) {
  const [selectedBadge, setSelectedBadge] = useState<BadgeData | null>(badge || null);
  const [userId, setUserId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  
  const [durationType, setDurationType] = useState<"permanent" | "days" | "date">("permanent");
  const [days, setDays] = useState("30");
  const [date, setDate] = useState("");
  const [priorityOverride, setPriorityOverride] = useState(true);
  const [customMessage, setCustomMessage] = useState("");
  const [sendNotification, setSendNotification] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 🔍 Реальный поиск пользователей по API с задержкой 300мс
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const token = getToken();
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
        const res = await fetch(`${apiUrl}/api/users?q=${encodeURIComponent(searchQuery)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.users || []);
        }
      } catch (e) {
        console.error("Search error:", e);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectUser = (user: any) => {
    setUserId(user.id.toString());
    setSearchQuery(`${user.display_name} (@${user.username})`);
    setSearchResults([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!selectedBadge) throw new Error("Пожалуйста, выберите плашку");
      if (!userId) throw new Error("Пожалуйста, выберите пользователя");

      const token = getToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
      
      const formData = new FormData();
      formData.append("user_id", userId);
      formData.append("badge_id", selectedBadge.id.toString());
      formData.append("priority", priorityOverride ? "10" : "1");
      formData.append("notify_user", sendNotification ? "true" : "false");
      formData.append("override_priority", priorityOverride ? "true" : "false");
      if (customMessage) formData.append("custom_message", customMessage);

      if (durationType === "days") {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + parseInt(days));
        formData.append("expires_at", expiryDate.toISOString());
      } else if (durationType === "date" && date) {
        formData.append("expires_at", new Date(date).toISOString());
      }

      // Используем правильный эндпоинт из твоего main.py
      const res = await fetch(`${apiUrl}/api/custom-badge-assignments`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Ошибка: ${res.status}`);
      }

      onSuccess?.();
      onClose?.();
    } catch (err: any) {
      setError(err.message || "Ошибка при выдаче плашки");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-600 dark:text-red-300 text-sm">{error}</div>}
      
      {!badge && (
        <div>
          <label className="block text-sm font-medium mb-1">Выбор плашки</label>
          <select 
            value={selectedBadge?.id || ""} 
            onChange={(e) => { const b = badges?.find(b => b.id === parseInt(e.target.value)); setSelectedBadge(b || null); }}
            className="w-full px-3 py-2 bg-ivory dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-lg text-sm text-gray-900 dark:text-white"
          >
            <option value="">Выберите плашку</option>
            {badges?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Поиск пользователя</label>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-gray-500" size={16} />
          <input 
            type="text" 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            placeholder="Введите имя, @username или ID..."
            className="w-full pl-9 pr-3 py-2 bg-ivory dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-lg text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none" 
          />
          {searchLoading && <div className="absolute right-3 top-2.5 w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}
        </div>
        
        {/* Выпадающий список результатов */}
        {searchResults.length > 0 && (
          <div className="mt-1 space-y-1 max-h-48 overflow-y-auto bg-ivory dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-lg p-1">
            {searchResults.map((u) => (
              <button 
                key={u.id} 
                type="button" 
                onClick={() => handleSelectUser(u)}
                className="w-full flex items-center gap-3 p-2 text-left hover:bg-gray-100 dark:hover:bg-white/5 rounded transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden">
                  {u.avatar_url ? (
                    <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon size={16} className="text-gray-400" />
                  )}
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">{u.display_name}</div>
                  <div className="text-xs text-gray-400">@{u.username} • ID: {u.id}</div>
                </div>
              </button>
            ))}
          </div>
        )}
        
        {/* Скрытое поле или отображение выбранного ID для отладки */}
        {userId && searchResults.length === 0 && (
          <div className="mt-1 text-xs text-gray-500">Выбран ID: {userId}</div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Срок действия</label>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="radio" name="dur" checked={durationType==="permanent"} onChange={()=>setDurationType("permanent")} className="accent-blue-500" /> Бессрочно
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="radio" name="dur" checked={durationType==="days"} onChange={()=>setDurationType("days")} className="accent-blue-500" /> На N дней
          </label>
          {durationType==="days" && (
            <input type="number" value={days} onChange={(e)=>setDays(e.target.value)} min={1} className="ml-6 px-2 py-1 bg-ivory dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded w-24 text-gray-900 dark:text-white text-sm" />
          )}
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="radio" name="dur" checked={durationType==="date"} onChange={()=>setDurationType("date")} className="accent-blue-500" /> До конкретной даты
          </label>
          {durationType==="date" && (
            <input type="date" value={date} onChange={(e)=>setDate(e.target.value)} className="ml-6 px-2 py-1 bg-ivory dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded text-gray-900 dark:text-white text-sm" />
          )}
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" checked={priorityOverride} onChange={(e)=>setPriorityOverride(e.target.checked)} className="accent-blue-500" /> 
          Приоритет: перекрывает все остальные плашки
        </label>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm text-gray-300 mb-1">
          <input type="checkbox" checked={sendNotification} onChange={(e)=>setSendNotification(e.target.checked)} className="accent-blue-500" /> 
          Отправить уведомление
        </label>
        {sendNotification && (
          <textarea 
            value={customMessage} 
            onChange={(e)=>setCustomMessage(e.target.value)} 
            placeholder="Текст уведомления (необязательно)"
            className="w-full px-3 py-2 bg-ivory dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded text-sm text-gray-900 dark:text-white" 
            rows={2} 
          />
        )}
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t border-gray-200 dark:border-white/10">
        {onClose && <button type="button" onClick={onClose} className="px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-white/5 rounded text-gray-300">Отмена</button>}
        <button type="submit" disabled={loading || !userId} className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded disabled:opacity-50 flex items-center gap-2">
          {loading ? "Выдаётся..." : "Выдать плашку"}
        </button>
      </div>
    </form>
  );
}