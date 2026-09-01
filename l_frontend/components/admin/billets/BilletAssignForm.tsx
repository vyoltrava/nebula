"use client";
import { useState, useEffect } from "react";
import { getToken } from "@/lib/auth";
import { X, Search, User as UserIcon } from "lucide-react";

interface BilletData {
  id: number;
  name: string;
  description: string | null;
}

interface AssignFormProps {
  billet?: BilletData;
  billets?: BilletData[];
  onClose?: () => void;
  onSuccess?: () => void;
}

export function BilletAssignForm({ billet, billets, onClose, onSuccess }: AssignFormProps) {
  const [selectedBillet, setselectedBillet] = useState<BilletData | null>(billet || null);
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

  // рџ”Ќ Р РµР°Р»СЊРЅС‹Р№ РїРѕРёСЃРє РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№ РїРѕ API СЃ Р·Р°РґРµСЂР¶РєРѕР№ 300РјСЃ
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
      if (!selectedBillet) throw new Error("РџРѕР¶Р°Р»СѓР№СЃС‚Р°, РІС‹Р±РµСЂРёС‚Рµ РїР»Р°С€РєСѓ");
      if (!userId) throw new Error("РџРѕР¶Р°Р»СѓР№СЃС‚Р°, РІС‹Р±РµСЂРёС‚Рµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ");

      const token = getToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
      
      const formData = new FormData();
      formData.append("user_id", userId);
      formData.append("badge_id", selectedBillet.id.toString());
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

      // РСЃРїРѕР»СЊР·СѓРµРј РїСЂР°РІРёР»СЊРЅС‹Р№ СЌРЅРґРїРѕРёРЅС‚ РёР· С‚РІРѕРµРіРѕ main.py
      const res = await fetch(`${apiUrl}/api/billet-assignments`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `РћС€РёР±РєР°: ${res.status}`);
      }

      onSuccess?.();
      onClose?.();
    } catch (err: any) {
      setError(err.message || "РћС€РёР±РєР° РїСЂРё РІС‹РґР°С‡Рµ РїР»Р°С€РєРё");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-600 dark:text-red-300 text-sm">{error}</div>}
      
      {!billet && (
        <div>
          <label className="block text-sm font-medium mb-1">Р’С‹Р±РѕСЂ РїР»Р°С€РєРё</label>
          <select 
            value={selectedBillet?.id || ""} 
            onChange={(e) => { const b = billets?.find(b => b.id === parseInt(e.target.value)); setselectedBillet(b || null); }}
            className="w-full px-3 py-2 bg-ivory dark:bg-[#1a1a1a] border border-line dark:border-white/10 rounded-lg text-sm text-gray-900 dark:text-white"
          >
            <option value="">Р’С‹Р±РµСЂРёС‚Рµ РїР»Р°С€РєСѓ</option>
            {billets?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">РџРѕРёСЃРє РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ</label>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-gray-500" size={16} />
          <input 
            type="text" 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            placeholder="Р’РІРµРґРёС‚Рµ РёРјСЏ, @username РёР»Рё ID..."
            className="w-full pl-9 pr-3 py-2 bg-ivory dark:bg-[#1a1a1a] border border-line dark:border-white/10 rounded-lg text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none" 
          />
          {searchLoading && <div className="absolute right-3 top-2.5 w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}
        </div>
        
        {/* Р’С‹РїР°РґР°СЋС‰РёР№ СЃРїРёСЃРѕРє СЂРµР·СѓР»СЊС‚Р°С‚РѕРІ */}
        {searchResults.length > 0 && (
          <div className="mt-1 space-y-1 max-h-48 overflow-y-auto bg-ivory dark:bg-[#1a1a1a] border border-line dark:border-white/10 rounded-lg p-1">
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
                  <div className="text-xs text-gray-400">@{u.username} Р• ID: {u.id}</div>
                </div>
              </button>
            ))}
          </div>
        )}
        
        {/* РЎРєСЂС‹С‚РѕРµ РїРѕР»Рµ РёР»Рё РѕС‚РѕР±СЂР°Р¶РµРЅРёРµ РІС‹Р±СЂР°РЅРЅРѕРіРѕ ID РґР»СЏ РѕС‚Р»Р°РґРєРё */}
        {userId && searchResults.length === 0 && (
          <div className="mt-1 text-xs text-gray-500">Р’С‹Р±СЂР°РЅ ID: {userId}</div>
        )}

        {/* рџ†• Р‘С‹СЃС‚СЂР°СЏ СЃР°РјРѕРІС‹РґР°С‡Р° РїР»Р°С€РєРё */}
        <button
          type="button"
          onClick={async () => {
            const token = getToken();
            if (!token) return;
            try {
              const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/api/me`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (res.ok) {
                const me = await res.json();
                setUserId(String(me.id));
                setSearchQuery(`${me.display_name || ""} (@${me.username})`);
                setSearchResults([]);
              }
            } catch (e) {
              console.error(e);
            }
          }}
          className="w-full mt-2 text-xs text-center py-1.5 rounded-lg border border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 transition-colors"
        >
          вњЁ Р’С‹РґР°С‚СЊ СЃРµР±Рµ (С‚РµРєСѓС‰РёР№ Р°РєРєР°СѓРЅС‚)
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">РЎСЂРѕРє РґРµР№СЃС‚РІРёСЏ</label>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="radio" name="dur" checked={durationType==="permanent"} onChange={()=>setDurationType("permanent")} className="accent-blue-500" /> Р‘РµСЃСЃСЂРѕС‡РЅРѕ
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="radio" name="dur" checked={durationType==="days"} onChange={()=>setDurationType("days")} className="accent-blue-500" /> РќР° N РґРЅРµР№
          </label>
          {durationType==="days" && (
            <input type="number" value={days} onChange={(e)=>setDays(e.target.value)} min={1} className="ml-6 px-2 py-1 bg-ivory dark:bg-[#1a1a1a] border border-line dark:border-white/10 rounded w-24 text-gray-900 dark:text-white text-sm" />
          )}
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="radio" name="dur" checked={durationType==="date"} onChange={()=>setDurationType("date")} className="accent-blue-500" /> Р”Рѕ РєРѕРЅРєСЂРµС‚РЅРѕР№ РґР°С‚С‹
          </label>
          {durationType==="date" && (
            <input type="date" value={date} onChange={(e)=>setDate(e.target.value)} className="ml-6 px-2 py-1 bg-ivory dark:bg-[#1a1a1a] border border-line dark:border-white/10 rounded text-gray-900 dark:text-white text-sm" />
          )}
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" checked={priorityOverride} onChange={(e)=>setPriorityOverride(e.target.checked)} className="accent-blue-500" /> 
          РџСЂРёРѕСЂРёС‚РµС‚: РїРµСЂРµРєСЂС‹РІР°РµС‚ РІСЃРµ РѕСЃС‚Р°Р»СЊРЅС‹Рµ РїР»Р°С€РєРё
        </label>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm text-gray-300 mb-1">
          <input type="checkbox" checked={sendNotification} onChange={(e)=>setSendNotification(e.target.checked)} className="accent-blue-500" /> 
          РћС‚РїСЂР°РІРёС‚СЊ СѓРІРµРґРѕРјР»РµРЅРёРµ
        </label>
        {sendNotification && (
          <textarea 
            value={customMessage} 
            onChange={(e)=>setCustomMessage(e.target.value)} 
            placeholder="РўРµРєСЃС‚ СѓРІРµРґРѕРјР»РµРЅРёСЏ (РЅРµРѕР±СЏР·Р°С‚РµР»СЊРЅРѕ)"
            className="w-full px-3 py-2 bg-ivory dark:bg-[#1a1a1a] border border-line dark:border-white/10 rounded text-sm text-gray-900 dark:text-white" 
            rows={2} 
          />
        )}
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t border-line dark:border-white/10">
        {onClose && <button type="button" onClick={onClose} className="px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-white/5 rounded text-gray-300">РћС‚РјРµРЅР°</button>}
        <button type="submit" disabled={loading || !userId} className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded disabled:opacity-50 flex items-center gap-2">
          {loading ? "Р’С‹РґР°С‘С‚СЃСЏ..." : "Р’С‹РґР°С‚СЊ РїР»Р°С€РєСѓ"}
        </button>
      </div>
    </form>
  );
}