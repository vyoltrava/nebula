"use client";
import { useState, useEffect } from "react";
import { FormEvent } from "react";

import { getToken } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

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

interface UserSearchResult {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string | null;
  level: number;
}

export function CustomBadgeAssignForm({ badge, badges, onClose, onSuccess }: AssignFormProps) {
  const [selectedBadge, setSelectedBadge] = useState<BadgeData | null>(badge || null);
  const [userId, setUserId] = useState("");
  const [username, setUsername] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [durationType, setDurationType] = useState<"permanent" | "days" | "date" | "range" | "24h">("permanent");
  const [days, setDays] = useState("30");
  const [date, setDate] = useState("");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [priorityOverride, setPriorityOverride] = useState(false);
  const [customMessage, setCustomMessage] = useState("");
  const [sendNotification, setSendNotification] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!selectedBadge) {
        throw new Error("Пожалуйста, выберите плашку");
      }
      if (!userId) {
        throw new Error("Пожалуйста, укажите ID пользователя");
      }

      const payload = {
        badge_id: selectedBadge.id,
        user_id: parseInt(userId),
        duration_type: durationType,
        ...(durationType === 'days' && { duration_days: parseInt(days) }),
        ...(durationType === 'date' && { expires_at: date }),
        ...(durationType === 'range' && { expires_at: rangeEnd }),
        custom_message: customMessage || undefined,
        override_priority: priorityOverride,
        send_notification: sendNotification
      };

      const response = await apiFetch('/admin/badges/assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Не удалось выдать плашку');
      }

      onSuccess?.();
      onClose?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при выдаче плашки');
    } finally {
      setLoading(false);
    }
  };
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (<div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-sm">{error}</div>)}
      {!badge && (
        <div>
          <label className="block text-sm font-medium mb-1">Выбор плашки</label>
          <select value={selectedBadge?.id || ""} onChange={(e) => { const b = badges?.find(b => b.id === parseInt(e.target.value)); setSelectedBadge(b || null); }}
            className="w-full px-3 py-2 bg-[#1a1a1a] border border-white/10 rounded-lg text-sm">
            <option value="">Выберите плашку</option>
            {badges?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Поиск пользователя</label>
        <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username или @ nickname или имя"
          className="w-full px-3 py-2 bg-[#1a1a1a] border border-white/10 rounded-lg text-sm" />
        <input type="number" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="ID пользователя"
          className="w-full mt-2 px-3 py-1.5 bg-[#1a1a1a] border border-white/10 rounded text-sm" />
        {searchResults.length > 0 && (<div className="mt-1 space-y-1 max-h-40 overflow-y-auto">
          {searchResults.map(u => (<button key={u.id} type="button" onClick={() => { setUserId(u.id.toString()); setUsername(u.display_name); setSearchResults([]); }}
            className="w-full flex items-center gap-2 p-2 text-left hover:bg-white/5 rounded">
            <img src={u.avatar_url || "/default-avatar.png"} alt="" className="w-6 h-6 rounded-full" />
            <div><span className="text-sm">{u.display_name}</span>
            <span className="text-xs text-gray-500">@{u.username}</span></div>
          </button>))} 
        </div>)}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Срок действия</label>
        <div className="space-y-2">
          <label className="flex items-center gap-2"><input type="radio" name="dur" checked={durationType==="permanent"} onChange={()=>setDurationType("permanent")} /> <span>Бессрочно</span></label>
          <label className="flex items-center gap-2"><input type="radio" name="dur" checked={durationType==="24h"} onChange={()=>setDurationType("24h")} /> <span>Ровно 24 часа</span></label>
          <label className="flex items-center gap-2"><input type="radio" name="dur" checked={durationType==="days"} onChange={()=>setDurationType("days")} /> <span>На N дней</span></label>
          {durationType==="days"&&(<input type="number" value={days} onChange={(e)=>setDays(e.target.value)} min={1} className="ml-6 px-2 py-1 bg-[#1a1a1a] border border-white/10 rounded w-20" />)}
          <label className="flex items-center gap-2"><input type="radio" name="dur" checked={durationType==="date"} onChange={()=>setDurationType("date")} /> <span>До даты</span></label>
          {durationType==="date"&&(<input type="date" value={date} onChange={(e)=>setDate(e.target.value)} className="ml-6 px-2 py-1 bg-[#1a1a1a] border border-white/10 rounded" />)}
          <label className="flex items-center gap-2"><input type="radio" name="dur" checked={durationType==="range"} onChange={()=>setDurationType("range")} /> <span>Диапазон</span></label>
          {durationType==="range"&&(<div className="ml-6 flex gap-2">
            <input type="date" value={rangeStart} onChange={(e)=>setRangeStart(e.target.value)} className="px-2 py-1 bg-[#1a1a1a] border border-white/10 rounded" />
            <input type="date" value={rangeEnd} onChange={(e)=>setRangeEnd(e.target.value)} className="px-2 py-1 bg-[#1a1a1a] border border-white/10 rounded" />
          </div>)}
        </div>
      </div>

      <div><label className="flex items-center gap-2"><input type="checkbox" checked={priorityOverride} onChange={(e)=>setPriorityOverride(e.target.checked)} /> <span>Приоритет: перекрывает все плашки</span></label></div>

      <div>
        <label className="block text-sm font-medium mb-1">Уведомление</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={sendNotification} onChange={(e)=>setSendNotification(e.target.checked)} /> <span>Отправить уведомление</span></label>
        <textarea value={customMessage} onChange={(e)=>setCustomMessage(e.target.value)} placeholder="Кастомный текст"
          className="w-full mt-2 px-3 py-2 bg-[#1a1a1a] border border-white/10 rounded text-sm" rows={2} />
      </div>

      <div className="flex justify-end gap-2 pt-4">
        {onClose && (<button type="button" onClick={onClose} className="px-3 py-1 text-sm hover:bg-white/5 rounded">Отмена</button>)}
        <button type="submit" disabled={loading} className="px-4 py-2 text-sm bg-green-500 hover:bg-green-600 rounded disabled:opacity-50">
          {loading ? "Выдаётся..." : "Выдать плашку"}
        </button>
      </div>
    </form>
  );
}
