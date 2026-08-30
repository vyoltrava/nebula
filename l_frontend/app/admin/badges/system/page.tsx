"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, getUserLevel } from "@/lib/auth";
import { Sparkles, Crown, Code, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SystemBadgeForm } from "@/components/admin/badges/SystemBadgeForm";

interface SystemBadgeData {
  level: number;
  name: string;
  text_content: string;
  text_color: string;
  bg_type: string;
  bg_color: string;
  bg_gradient: string | null;
  border_color: string;
  border_width: number;
  border_glow: boolean;
  border_glow_intensity: number;
  animation_flags: string[] | string | null;
  animation_speed: string;
  shadow_enabled: boolean;
  inner_glow_enabled: boolean;
  metallic_enabled: boolean;
  specular_enabled: boolean;
  is_active: boolean;
  updated_at: string | null;
}

const LEVEL_INFO: Record<number, { label: string; icon: React.ReactNode; color: string }> = {
  9: { label: "Developer", icon: <Code size={20} />, color: "text-blue-400" },
  10: { label: "Founder", icon: <Crown size={20} />, color: "text-yellow-400" },
  11: { label: "System", icon: <Sparkles size={20} />, color: "text-purple-400" },
};

export default function SystemBadgesAdminPage() {
  const router = useRouter();
  const [badges, setBadges] = useState<Record<number, SystemBadgeData | null>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formLevel, setFormLevel] = useState<number>(9);
  const [formBadge, setFormBadge] = useState<SystemBadgeData | null>(null);
  const [myLevel, setMyLevel] = useState<number>(0);

    useEffect(() => {
    const token = getToken();
    if (!token) { router.push("/login"); return; }

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        const level = getUserLevel(data);
        setMyLevel(level);
        if (level < 9) { router.push("/"); }
      })
      .finally(() => fetchBadges());
  }, [router]);

  const fetchBadges = async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/system-badges`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: SystemBadgeData[] = await res.json();
        const map: Record<number, SystemBadgeData | null> = {};
        data.forEach(b => { map[b.level] = b; });
        setBadges(map);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (level: number) => {
    setFormLevel(level);
    setFormBadge(badges[level] || null);
    setShowForm(true);
  };

  const handleDelete = async (level: number) => {
    const token = getToken();
    if (!token || !confirm(`Удалить системную плашку для уровня ${level}?`)) return;

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/system-badges/${level}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      setBadges(prev => ({ ...prev, [level]: null }));
    }
  };

  const handleSuccess = (badge: SystemBadgeData) => {
    setBadges(prev => ({ ...prev, [badge.level]: badge }));
    setShowForm(false);
  };

    const canEdit = (level: number) => {
    if (level === 11 && myLevel < 11) return false;
    if (level === 10 && myLevel < 10) return false;
    return myLevel >= level;
  };

  return (
    <div className="min-h-screen bg-ivory dark:bg-[#141416] text-gray-900 dark:text-white">
      <div className="max-w-6xl mx-auto py-8 px-4">
        <div className="flex items-center gap-3 mb-6">
          <Sparkles size={24} className="text-purple-400" />
          <h1 className="text-2xl font-black">Системные плашки (уровни 9–11)</h1>
        </div>

        <p className="text-sm text-gray-500 dark:text-white/50 mb-6">
          Системные плашки для Developer (9), Founder (10) и System (11).
          Каждая плашка — одна на уровень. Изменение требует соответствующего уровня доступа.
        </p>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[9, 10, 11].map(level => (
              <div key={level} className="bg-paper dark:bg-[#1f1f23] border border-line dark:border-white/10 rounded-2xl p-6 animate-pulse">
                <div className="h-6 bg-gray-300 dark:bg-gray-700 rounded mb-4 w-3/4"></div>
                <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded mb-2 w-1/2"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[9, 10, 11].map(level => {
              const info = LEVEL_INFO[level];
              const badge = badges[level];

              return (
                <div key={level} className="bg-paper dark:bg-[#1f1f23] border border-line dark:border-white/10 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <span className={info.color}>{info.icon}</span>
                    <h2 className={`font-bold text-lg ${info.color}`}>{info.label} (уровень {level})</h2>
                  </div>

                  {badge ? (
                    <>
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-xs"
                                                    style={{
                            backgroundColor: badge.bg_type === "gradient" ? undefined : badge.bg_color,
                            backgroundImage: badge.bg_type === "gradient" && badge.bg_gradient ? badge.bg_gradient : undefined,
                            color: badge.text_color,
                            border: `${badge.border_width || 0}px solid ${badge.border_color || "#ffffff"}`,
                          }}
                        >
                          {badge.text_content || badge.name}
                        </div>
                        <div>
                          <div className="font-medium">{badge.name}</div>
                          <div className="text-sm text-gray-500 dark:text-white/50">
                            {badge.is_active ? "Активна" : "Скрыта"}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleEdit(level)}
                          disabled={!canEdit(level)}
                          className="flex-1"
                        >
                          Изменить
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(level)}
                          disabled={!canEdit(level)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div>
                      <p className="text-sm text-gray-500 dark:text-white/50 mb-3">Плашка не создана</p>
                      <Button
                        size="sm"
                        onClick={() => handleEdit(level)}
                        disabled={!canEdit(level)}
                        className="w-full"
                      >
                        Создать плашку
                      </Button>
                    </div>
                  )}

                  {!canEdit(level) && (
                    <p className="text-xs text-red-400">
                      Требуется уровень {level}+ для изменения
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showForm && (
        <SystemBadgeForm
          level={formLevel}
          badge={formBadge || undefined}
          onClose={() => setShowForm(false)}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
