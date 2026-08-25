"use client";
import { useState, useRef } from "react";
import { getToken } from "@/lib/auth";
import { Check, Sparkles, Upload, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/LanguageProvider";

export function BadgeSelector({ currentUser, availableBadges, onUpdate }: { currentUser: any, availableBadges: any[], onUpdate: () => void }) {
  const [selecting, setSelecting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { t } = useI18n();

  const myBadges = availableBadges.filter((b) => 
    b.role_id === currentUser?.role?.id || 
    (b.user_id === currentUser?.id) ||
    (b.is_selectable && (currentUser?.level ?? 1) >= 3)
  );

  // Проверяем, может ли пользователь загружать свои значки
  const canUploadCustom = myBadges.some(b => b.is_selectable) || (currentUser?.level ?? 1) >= 3;

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
      onUpdate();
    } else {
      alert("Не удалось изменить значок");
    }
  }

  async function handleCustomUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const token = getToken();
    if (!token) return;
    
    const form = new FormData();
    form.append("file", file);
    
    setUploading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me/custom-badge`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      
      if (res.ok) {
        const data = await res.json();
        // Автоматически выбираем загруженный значок
        await selectBadge(null); // Снимаем выбор предустановленного
        onUpdate();
      } else {
        const err = await res.json().catch(() => null);
        alert(err?.detail || "Ошибка загрузки значка");
      }
    } catch (err) {
      alert("Ошибка сети");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function deleteCustomBadge() {
    if (!confirm("Удалить загруженный значок?")) return;
    
    const token = getToken();
    if (!token) return;
    
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me/custom-badge`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (res.ok) {
        onUpdate();
      }
    } catch (err) {
      alert("Ошибка сети");
    }
  }

  if (myBadges.length === 0 && !canUploadCustom) return null;

  const currentBadge = availableBadges.find(b => b.id === currentUser?.selected_badge_id);
  const hasCustomBadge = currentUser?.custom_badge_url;

  return (
    <div className="mt-4 p-4 rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Sparkles size={16} className="text-purple-600 dark:text-purple-400" /> Значок профиля
        </h3>
        <button onClick={() => setSelecting(!selecting)} className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-600 dark:hover:text-purple-300 font-bold">
          {selecting ? "Отмена" : "Изменить"}
        </button>
      </div>

      {!selecting ? (
        <div className="flex items-center gap-3">
          {hasCustomBadge ? (
            <>
              <div 
                className="w-10 h-10 rounded-full bg-paper dark:bg-[#171717] flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
                style={{ filter: `drop-shadow(0 0 6px #8b5cf699)` }}
                onClick={() => setSelecting(true)}
                title="Нажми чтобы сменить"
              >
                <img src={currentUser.custom_badge_url} className="w-6 h-6 object-contain" alt="custom badge" />
              </div>
              <span className="text-sm text-gray-800 dark:text-white/70">Свой значок</span>
            </>
          ) : currentBadge ? (
            <>
              <div 
                className="w-10 h-10 rounded-full bg-paper dark:bg-[#171717] flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
                style={{ filter: `drop-shadow(0 0 6px ${currentBadge.glow_color || '#8b5cf6'}99)` }}
                onClick={() => setSelecting(true)}
                title="Нажми чтобы сменить"
              >
                <img src={currentBadge.icon_url} className="w-6 h-6 object-contain" alt="badge" />
              </div>
              <span className="text-sm text-gray-800 dark:text-white/70">{currentBadge.name}</span>
            </>
          ) : (
            <span className="text-sm text-gray-500 dark:text-white/40">Значок не выбран</span>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Кнопка загрузки своего значка */}
          {canUploadCustom && (
            <div className="border-b border-line dark:border-white/10 pb-3">
              <p className="text-xs text-gray-600 dark:text-white/60 mb-2">Загрузить свой значок:</p>
              <div className="flex gap-2">
                <input 
                  ref={fileRef}
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={handleCustomUpload}
                />
                <button 
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#8b5cf6]/20 border border-[#8b5cf6]/30 text-[#8b5cf6] text-xs font-bold hover:bg-[#8b5cf6]/30 disabled:opacity-50"
                >
                  {uploading ? (
                    <>
                      <div className="w-3 h-3 border-2 border-[#8b5cf6] border-t-transparent rounded-full animate-spin" />
                      Загрузка...
                    </>
                  ) : (
                    <>
                      <Upload size={14} />
                      {hasCustomBadge ? "Заменить" : "Загрузить"}
                    </>
                  )}
                </button>
                {hasCustomBadge && (
                  <button 
                    onClick={deleteCustomBadge}
                    className="px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-bold hover:bg-red-500/30"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Выбор из предустановленных */}
          {myBadges.length > 0 && (
            <div>
              <p className="text-xs text-gray-600 dark:text-white/60 mb-2">Или выбери из списка:</p>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                <button onClick={() => selectBadge(null)} className={`aspect-square rounded-lg border flex items-center justify-center text-xs font-bold transition-all ${!currentUser?.selected_badge_id && !hasCustomBadge ? "border-red-600 dark:border-red-400 bg-red-500/10 text-red-600 dark:text-red-400" : "border-line dark:border-white/10 text-white/40 hover:bg-gray-100 dark:hover:bg-white/5"}`}>
                  Снять
                </button>
                
                {myBadges.map((badge) => {
                  const isActive = currentUser?.selected_badge_id === badge.id && !hasCustomBadge;
                  return (
                    <button key={badge.id} onClick={() => selectBadge(badge.id)} 
                      className={`aspect-square rounded-lg border flex items-center justify-center relative transition-all ${isActive ? "border-purple-600 dark:border-purple-400 bg-purple-500/20" : "border-line dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/5"}`}
                      style={{ filter: isActive ? `drop-shadow(0 0 8px ${badge.glow_color || '#8b5cf6'}99)` : "none" }}
                    >
                      <img src={badge.icon_url} className="w-6 h-6 object-contain" alt={badge.name} />
                      {isActive && <Check size={14} className="absolute -top-1 -right-1 bg-purple-500 text-white rounded-full p-0.5" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}