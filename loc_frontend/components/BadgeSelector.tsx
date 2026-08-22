"use client";
import { useState } from "react";
import { getToken } from "@/lib/auth";
import { Check, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n/LanguageProvider";

export function BadgeSelector({ currentUser, availableBadges, onUpdate }: { currentUser: any, availableBadges: any[], onUpdate: () => void }) {
  const [selecting, setSelecting] = useState(false);
  const { t } = useI18n();

  // Показываем значки, которые привязаны к роли пользователя ИЛИ которые разрешено выбирать (и у юзера есть мин. уровень, например 3 для спонсоров)
  const myBadges = availableBadges.filter((b) => 
    b.role_id === currentUser?.role?.id || (b.is_selectable && (currentUser?.level ?? 1) >= 3)
  );

  async function selectBadge(badgeId: number | null) {
    const token = getToken();
    if (!token) return;
    
    const form = new FormData();
    if (badgeId) form.append("badge_id", String(badgeId));
    
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me/badge`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form
    });
    
    if (res.ok) {
      setSelecting(false);
      onUpdate(); // Обновляем данные профиля на странице
    } else {
      alert("Не удалось изменить значок");
    }
  }

  if (myBadges.length === 0) return null; // Нечего выбирать

  return (
    <div className="mt-4 p-4 rounded-xl bg-white/5 border border-white/10">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Sparkles size={16} className="text-purple-400" /> Значок профиля
        </h3>
        <button onClick={() => setSelecting(!selecting)} className="text-xs text-purple-400 hover:text-purple-300 font-bold">
          {selecting ? "Отмена" : "Изменить"}
        </button>
      </div>

      {!selecting ? (
        <div className="flex items-center gap-3">
          {currentUser?.selected_badge_id ? (
            <>
              <div className="w-10 h-10 rounded-full bg-[#171717] flex items-center justify-center" style={{ filter: `drop-shadow(0 0 6px ${availableBadges.find(b=>b.id===currentUser.selected_badge_id)?.glow_color || '#8b5cf6'}99)` }}>
                <img src={availableBadges.find(b=>b.id===currentUser.selected_badge_id)?.icon_url} className="w-6 h-6 object-contain" alt="badge" />
              </div>
              <span className="text-sm text-white/70">{availableBadges.find(b=>b.id===currentUser.selected_badge_id)?.name}</span>
            </>
          ) : (
            <span className="text-sm text-white/40">Значок не выбран</span>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          <button onClick={() => selectBadge(null)} className={`aspect-square rounded-lg border flex items-center justify-center text-xs font-bold transition-all ${!currentUser?.selected_badge_id ? "border-red-400 bg-red-500/10 text-red-400" : "border-white/10 text-white/40 hover:bg-white/5"}`}>
            Снять
          </button>
          
          {myBadges.map((badge) => {
            const isActive = currentUser?.selected_badge_id === badge.id;
            return (
              <button key={badge.id} onClick={() => selectBadge(badge.id)} 
                className={`aspect-square rounded-lg border flex items-center justify-center relative transition-all ${isActive ? "border-purple-400 bg-purple-500/20" : "border-white/10 hover:bg-white/5"}`}
                style={{ filter: isActive ? `drop-shadow(0 0 8px ${badge.glow_color}99)` : "none" }}
              >
                <img src={badge.icon_url} className="w-6 h-6 object-contain" alt={badge.name} />
                {isActive && <Check size={14} className="absolute -top-1 -right-1 bg-purple-500 text-white rounded-full p-0.5" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}