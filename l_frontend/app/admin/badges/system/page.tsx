"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { getToken } from "@/lib/auth";
import { Trash2, Edit2, X, Crown, ShieldCheck, Info, Sparkles, Plus } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";

const LEVEL_META: Record<number, { label: string; icon: string; color: string }> = {
  9: { label: "Developer", icon: "</>", color: "#3b82f6" },
  10: { label: "Founder", icon: "★", color: "#fbbf24" },
  11: { label: "System", icon: "S", color: "#8b5cf6" },
};

interface SystemBadgeData {
  level: number;
  name: string;
  text_content: string | null;
  text_color: string | null;
  bg_type: string | null;
  bg_color: string | null;
  bg_gradient: string | null;
  border_color: string | null;
  border_width: number | null;
  border_glow: boolean;
  border_glow_intensity: number | null;
  animation_flags: string | null;
  animation_speed: string | null;
  shadow_enabled: boolean;
  inner_glow_enabled: boolean;
  metallic_enabled: boolean;
  specular_enabled: boolean;
  is_active: boolean;
  updated_at: string | null;
}

export default function SystemBadgeAdminPage() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [badges, setBadges] = useState<Record<number, SystemBadgeData | null>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formLevel, setFormLevel] = useState<number>(9);
  const [formBadge, setFormBadge] = useState<SystemBadgeData | null>(null);
  const [saving, setSaving] = useState(false);

  // Форма
  const [name, setName] = useState("");
  const [textContent, setTextContent] = useState("");
  const [textColor, setTextColor] = useState("#ffffff");
  const [bgColor, setBgColor] = useState("#8b5cf6");
  const [bgGradient, setBgGradient] = useState("linear-gradient(135deg,#3b82f6,#8b5cf6)");
  const [bgType, setBgType] = useState("solid");
  const [borderColor, setBorderColor] = useState("#ffffff");
  const [borderWidth, setBorderWidth] = useState(2);
  const [borderGlow, setBorderGlow] = useState(false);
  const [borderGlowIntensity, setBorderGlowIntensity] = useState(50);
  const [animations, setAnimations] = useState<string[]>([]);
  const [animationSpeed, setAnimationSpeed] = useState("normal");
  const [shadowEnabled, setShadowEnabled] = useState(true);
  const [innerGlowEnabled, setInnerGlowEnabled] = useState(false);
  const [metallicEnabled, setMetallicEnabled] = useState(false);
  const [specularEnabled, setSpecularEnabled] = useState(false);

  const myLevel = me?.is_admin ? 11 : me?.is_moderator ? 9 : me?.role?.level || 1;
  const canEditLevel = (lvl: number) => {
    if (lvl === 11) return myLevel >= 11;
    if (lvl === 10) return myLevel >= 10;
    return myLevel >= 9;
  };

  async function load() {
    const token = getToken();
    if (!token) { router.push("/login"); return; }
    try {
      const meRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!meRes.ok) throw new Error("Auth failed");
      const meData = await meRes.json();
      setMe(meData);

      const lvl = meData.is_admin ? 11 : meData.is_moderator ? 9 : meData.role?.level || 1;
      if (lvl < 9) { router.push("/"); return; }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/system-badges`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: SystemBadgeData[] = await res.json();
        const map: Record<number, SystemBadgeData | null> = {};
        [9, 10, 11].forEach(l => { map[l] = data.find(b => b.level === l) || null; });
        setBadges(map);
      }
    } catch {
      router.push("/");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openForm(level: number) {
    const b = badges[level];
    setFormLevel(level);
    setFormBadge(b);
    setName(b?.name || LEVEL_META[level].label);
    setTextContent(b?.text_content || LEVEL_META[level].label);
    setTextColor(b?.text_color || "#ffffff");
    setBgType(b?.bg_type || "solid");
    setBgColor(b?.bg_color || LEVEL_META[level].color);
    setBgGradient(b?.bg_gradient || "linear-gradient(135deg,#3b82f6,#8b5cf6)");
    setBorderColor(b?.border_color || "#ffffff");
    setBorderWidth(b?.border_width ?? 2);
    setBorderGlow(b?.border_glow ?? false);
    setBorderGlowIntensity(b?.border_glow_intensity ?? 50);
    try {
      const anims = typeof b?.animation_flags === "string" ? JSON.parse(b.animation_flags) : (b?.animation_flags || []);
      setAnimations(Array.isArray(anims) ? anims : []);
    } catch { setAnimations([]); }
    setAnimationSpeed(b?.animation_speed || "normal");
    setShadowEnabled(b?.shadow_enabled ?? true);
    setInnerGlowEnabled(b?.inner_glow_enabled ?? false);
    setMetallicEnabled(b?.metallic_enabled ?? false);
    setSpecularEnabled(b?.specular_enabled ?? false);
    setShowForm(true);
  }

  async function saveBadge(e: React.FormEvent) {
    e.preventDefault();
    if (!canEditLevel(formLevel)) {
      alert(`Для изменения плашки уровня ${formLevel} нужен уровень ${formLevel}+`);
      return;
    }
    setSaving(true);
    const token = getToken();
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/system-badges/${formLevel}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: name.trim() || LEVEL_META[formLevel].label,
          text_content: textContent || LEVEL_META[formLevel].label,
          text_color: textColor,
          bg_type: bgType,
          bg_color: bgColor,
          bg_gradient: bgType === "gradient" ? bgGradient : null,
          border_color: borderColor,
          border_width: borderWidth,
          border_glow: borderGlow,
          border_glow_intensity: borderGlowIntensity,
          animation_flags: animations,
          animation_speed: animationSpeed,
          shadow_enabled: shadowEnabled,
          inner_glow_enabled: innerGlowEnabled,
          metallic_enabled: metallicEnabled,
          specular_enabled: specularEnabled,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.detail || "Ошибка сохранения");
        return;
      }
      setShowForm(false);
      load();
    } catch {
      alert("Ошибка сети");
    } finally {
      setSaving(false);
    }
  }

  // === Выдача плашки пользователю ===
  const [showAssign, setShowAssign] = useState(false);
  const [assignQuery, setAssignQuery] = useState("");
  const [assignResults, setAssignResults] = useState<any[]>([]);
  const [assignTarget, setAssignTarget] = useState<any>(null);
  const [assignableRoles, setAssignableRoles] = useState<any[]>([]);
  const [assignRoleId, setAssignRoleId] = useState<number | null>(null);
  const [assignSaving, setAssignSaving] = useState(false);

  useEffect(() => {
    if (!showAssign) return;
    const token = getToken();
    if (!token) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/roles/assignable`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.ok ? r.json() : []).then(setAssignableRoles).catch(() => {});
  }, [showAssign]);

  useEffect(() => {
    if (!assignQuery.trim()) { setAssignResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/search?q=${encodeURIComponent(assignQuery.trim())}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (res.ok) {
          const data = await res.json();
          setAssignResults((data.users || []).slice(0, 8));
        }
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [assignQuery]);

  async function assignRoleToUser() {
    if (!assignTarget) return;
    setAssignSaving(true);
    const token = getToken();
    const form = new FormData();
    if (assignRoleId) form.append("role_id", String(assignRoleId));
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/${assignTarget.id}/role`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.detail || "Ошибка выдачи");
        return;
      }
      setShowAssign(false);
      setAssignTarget(null);
      setAssignQuery("");
      setAssignRoleId(null);
      load();
    } catch {
      alert("Ошибка сети");
    } finally {
      setAssignSaving(false);
    }
  }

  async function deleteBadge(level: number) {
    if (!confirm(`Сбросить плашку "${LEVEL_META[level].label}" на дефолт?`)) return;
    const token = getToken();
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/system-badges/${level}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.detail || "Ошибка удаления");
        return;
      }
      load();
    } catch {
      alert("Ошибка сети");
    }
  }

  const previewStyle = (lvlOverride?: { bg: string; text: string; bw: number; bc: string }): React.CSSProperties => ({
    backgroundColor: bgType === "solid" ? bgColor : undefined,
    backgroundImage: bgType === "gradient" ? bgGradient : undefined,
    color: textColor,
    border: `${borderWidth}px solid ${borderColor}`,
    boxShadow: borderGlow ? `0 0 ${borderGlowIntensity * 2}px ${borderColor}80` : undefined,
  });

  const badgePreviewStyle = (b: SystemBadgeData | null, level: number): React.CSSProperties => ({
    backgroundColor: b?.bg_type !== "gradient" ? (b?.bg_color || LEVEL_META[level].color) : undefined,
    backgroundImage: b?.bg_type === "gradient" ? b.bg_gradient || undefined : undefined,
    color: b?.text_color || "#ffffff",
    border: `${b?.border_width ?? 2}px solid ${b?.border_color || "#ffffff"}`,
    boxShadow: b?.border_glow ? `0 0 ${(b.border_glow_intensity ?? 50) * 2}px ${(b.border_color || "#ffffff")}80` : undefined,
  });

  if (!me) return (
    <div className="h-screen flex items-center justify-center bg-ivory dark:bg-[#18181b]">
      <p className="text-gray-600 dark:text-white/60 animate-pulse">Загрузка...</p>
    </div>
  );

  return (
    <div className="h-screen flex overflow-hidden bg-ivory dark:bg-[#18181b]">
      <Sidebar />
      <div className="w-px shrink-0 bg-gray-100 dark:bg-white/10 my-3" />
      <main className="flex-1 overflow-y-auto border-x border-line dark:border-white/10">
        <div className="p-6 border-b border-line dark:border-white/10 sticky top-0 bg-paper dark:bg-[#171717]/80 backdrop-blur-md z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Crown size={24} className="text-[#fbbf24]" />
              <div>
                <h1 className="text-2xl font-black text-gray-900 dark:text-white">Системные плашки</h1>
                <p className="text-xs text-gray-600 dark:text-white/50 mt-0.5">
                  Уровни 9–11 • Ваш уровень: <span className="font-bold" style={{ color: LEVEL_META[Math.min(myLevel, 11)]?.color }}>{myLevel}</span>
                </p>
              </div>
            </div>
            <Button icon={Sparkles} onClick={() => setShowAssign(true)}>
              Выдать плашку
            </Button>
          </div>
        </div>

        <div className="p-4 border-b border-line dark:border-white/5">
          <div className="bg-[#fbbf24]/10 border border-[#fbbf24]/30 rounded-xl p-4 flex gap-3">
            <Info size={20} className="text-[#fbbf24] shrink-0 mt-0.5" />
            <div className="text-sm text-gray-800 dark:text-white/80 space-y-1">
              <p className="font-bold text-gray-900 dark:text-white">Системные плашки уровней 9–11</p>
              <p>Плашка автоматически отображается у всех пользователей соответствующего уровня. Одна плашка на уровень.</p>
              <div className="flex flex-wrap gap-2 mt-2 text-xs">
                {([9, 10, 11] as const).map(l => (
                  <span key={l} className="px-2 py-0.5 rounded border" style={{ color: LEVEL_META[l].color, borderColor: `${LEVEL_META[l].color}40`, background: `${LEVEL_META[l].color}15` }}>
                    {LEVEL_META[l].label}: {l}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {([9, 10, 11] as const).map(level => {
            const meta = LEVEL_META[level];
            const badge = badges[level];
            const editable = canEditLevel(level);
            return (
              <div key={level} className="bg-paper dark:bg-[#171717] border border-line dark:border-white/10 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-white text-sm font-black uppercase tracking-widest shadow-lg border" style={badgePreviewStyle(badge, level)}>
                      {badge?.text_content || meta.label}
                      <span className="border-l border-white/30 pl-2 text-[10px] font-mono opacity-90">Lvl {level}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-bold border" style={{ color: meta.color, borderColor: `${meta.color}40`, backgroundColor: `${meta.color}10` }}>
                    <ShieldCheck size={12} />
                    {meta.label}
                  </div>
                </div>

                {!badge && (
                  <p className="text-xs text-gray-500 dark:text-white/40">Плашка не настроена — используется дефолтный вид.</p>
                )}

                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" icon={badge ? Edit2 : Plus} disabled={!editable} onClick={() => openForm(level)}>
                    {badge ? "Изменить" : "Создать"}
                  </Button>
                  {badge && (
                    <IconButton icon={Trash2} variant="danger" size="iconSm" disabled={!editable} onClick={() => deleteBadge(level)} title="Сбросить" />
                  )}
                </div>

                {!editable && (
                  <p className="text-xs text-red-400 flex items-center gap-1">
                    <ShieldCheck size={12} /> Требуется уровень {level}+
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* МОДАЛКА СОЗДАНИЯ/РЕДАКТИРОВАНИЯ ПЛАШКИ */}
        {showForm && (
          <>
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] animate-in fade-in duration-200" onClick={() => !saving && setShowForm(false)} />
            <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
              <div className="w-full max-w-lg border border-line dark:border-white/20 rounded-2xl bg-ivory dark:bg-[#1f1f23]/95 backdrop-blur-md shadow-2xl p-6 pointer-events-auto max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-black text-gray-900 dark:text-white">
                    {formBadge ? `Редактировать: ${LEVEL_META[formLevel].label}` : `Создать плашку: ${LEVEL_META[formLevel].label}`}
                  </h2>
                  <IconButton icon={X} size="iconSm" onClick={() => !saving && setShowForm(false)} />
                </div>
                <form onSubmit={saveBadge} className="space-y-5">
                  <div>
                    <label className="block text-sm font-bold text-gray-800 dark:text-white/80 mb-2">Название плашки</label>
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Developer, Founder, Junior Dev" required
                      className="w-full border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-[#8b5cf6] transition-colors" />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-800 dark:text-white/80 mb-2">Текст на плашке</label>
                    <input value={textContent} onChange={(e) => setTextContent(e.target.value)} maxLength={40} placeholder="Что видно пользователям"
                      className="w-full border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-[#8b5cf6] transition-colors" />
                    <span className="text-xs text-gray-500 dark:text-white/40 mt-1 block">{textContent.length}/40</span>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-800 dark:text-white/80 mb-2">Цвет плашки</label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={bgColor} onChange={(e) => { setBgColor(e.target.value); setBgType("solid"); }} className="w-16 h-10 rounded-lg border border-line dark:border-white/20 cursor-pointer bg-transparent" />
                      <input type="text" value={bgColor} onChange={(e) => { setBgColor(e.target.value); setBgType("solid"); }} className="flex-1 border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white font-mono text-sm focus:outline-none focus:border-[#8b5cf6]" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-800 dark:text-white/80 mb-2">Цвет текста</label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="w-16 h-10 rounded-lg border border-line dark:border-white/20 cursor-pointer bg-transparent" />
                      <input type="text" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="flex-1 border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white font-mono text-sm focus:outline-none focus:border-[#8b5cf6]" />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-bold text-gray-800 dark:text-white/80">Уровень</label>
                      <span className="text-xs font-mono px-2 py-0.5 rounded border" style={{ color: LEVEL_META[formLevel].color, borderColor: `${LEVEL_META[formLevel].color}40`, backgroundColor: `${LEVEL_META[formLevel].color}10` }}>
                        {formLevel} / 11
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {([9, 10, 11] as const).map(l => (
                        <button key={l} type="button" onClick={() => setFormLevel(l)} disabled={!canEditLevel(l)}
                          className={`py-2 px-3 rounded-lg text-sm font-bold border transition-all disabled:opacity-40 ${formLevel === l ? "text-white" : "text-gray-700 dark:text-white/70 border-line dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/5"}`}
                          style={formLevel === l ? { backgroundColor: LEVEL_META[l].color, borderColor: LEVEL_META[l].color } : undefined}>
                          {LEVEL_META[l].label} ({l})
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-gray-600 dark:text-white/50 mb-2">Предпросмотр:</p>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10">
                      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-black uppercase tracking-widest shadow-lg border" style={previewStyle()}>
                        {textContent || name}
                        <span className="border-l border-white/30 pl-2 text-[10px] font-mono opacity-90">Lvl {formLevel}</span>
                      </span>
                      <span className="text-xs text-gray-500 dark:text-white/40">Так плашку увидят пользователи</span>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button type="submit" loading={saving} disabled={saving} className="flex-1">
                      {saving ? "Сохранение..." : formBadge ? "Сохранить" : "Создать"}
                    </Button>
                    <Button variant="secondary" onClick={() => !saving && setShowForm(false)} disabled={saving} className="flex-1">
                      Отмена
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </>
        )}

        {/* МОДАЛКА ВЫДАЧИ ПЛАШКИ ПОЛЬЗОВАТЕЛЮ */}
        {showAssign && (
          <>
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] animate-in fade-in duration-200" onClick={() => !assignSaving && setShowAssign(false)} />
            <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
              <div className="w-full max-w-md border border-line dark:border-white/20 rounded-2xl bg-ivory dark:bg-[#1f1f23]/95 backdrop-blur-md shadow-2xl p-6 pointer-events-auto max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                    <Crown size={18} className="text-[#fbbf24]" /> Выдать плашку
                  </h2>
                  <IconButton icon={X} size="iconSm" onClick={() => !assignSaving && setShowAssign(false)} />
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-800 dark:text-white/80 mb-2">Найти пользователя</label>
                    <input value={assignQuery} onChange={(e) => { setAssignQuery(e.target.value); setAssignTarget(null); }} placeholder="Введите username или имя..."
                      className="w-full border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-[#8b5cf6]" />
                  </div>

                  {!assignTarget && assignResults.length > 0 && (
                    <div className="border border-line dark:border-white/10 rounded-lg divide-y divide-gray-100 dark:divide-white/5 max-h-52 overflow-y-auto">
                      {assignResults.map(u => (
                        <button key={u.id} type="button" onClick={() => { setAssignTarget(u); setAssignQuery(""); }}
                          className="w-full flex items-center gap-3 p-2.5 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left">
                          {u.avatar_url ? <img src={u.avatar_url} className="w-8 h-8 rounded-full object-cover" /> : <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-white/10" />}
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{u.display_name || u.username}</p>
                            <p className="text-xs text-gray-500 dark:text-white/40">@{u.username}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {assignTarget && (
                    <div className="p-3 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 flex items-center gap-3">
                      {assignTarget.avatar_url ? <img src={assignTarget.avatar_url} className="w-10 h-10 rounded-full object-cover" /> : <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-white/10" />}
                      <div>
                        <p className="text-sm font-bold text-gray-900 dark:text-white">{assignTarget.display_name || assignTarget.username}</p>
                        <p className="text-xs text-gray-500 dark:text-white/40">@{assignTarget.username}</p>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-bold text-gray-800 dark:text-white/80 mb-2">Плашка / Роль</label>
                    <select value={assignRoleId ?? ""} onChange={(e) => setAssignRoleId(e.target.value ? Number(e.target.value) : null)}
                      className="w-full border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:border-[#8b5cf6]">
                      <option value="">— Снять роль —</option>
                      {assignableRoles.map(r => (
                        <option key={r.id} value={r.id}>{r.name} (lvl {r.level})</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 dark:text-white/40 mt-1.5">
                      Пользователь получит роль, а системная плашка соответствующего уровня отобразится автоматически.
                    </p>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button onClick={assignRoleToUser} loading={assignSaving} disabled={!assignTarget || assignSaving} className="flex-1">
                      Выдать
                    </Button>
                    <Button variant="secondary" onClick={() => !assignSaving && setShowAssign(false)} disabled={assignSaving} className="flex-1">
                      Отмена
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

      </main>
    </div>
  );
}

