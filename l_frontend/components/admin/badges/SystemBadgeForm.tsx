"use client";
import { useState } from "react";
import { getToken } from "@/lib/auth";
import { X, Check } from "lucide-react";

interface Props {
  badge?: any;
  level: number;
  onClose: () => void;
  onSuccess: (badge: any) => void;
}

const LEVEL_META: Record<number, { label: string; icon: string }> = {
  9: { label: "Developer", icon: "</>" },
  10: { label: "Founder", icon: "★" },
  11: { label: "System", icon: "01" },
};

const ANIM_OPTIONS = ["pulse", "shimmer", "glow", "float"];
const SPEED_OPTIONS = ["slow", "normal", "fast"];
const QUALITY_PRESETS = [
  { bg_type: "solid", bg_color: "#8b5cf6", name: "Фиолетовый" },
  { bg_type: "solid", bg_color: "#3b82f6", name: "Синий" },
  { bg_type: "solid", bg_color: "#fbbf24", name: "Золотой" },
  { bg_type: "solid", bg_color: "#10b981", name: "Изумруд" },
  { bg_type: "solid", bg_color: "#ef4444", name: "Красный" },
  { bg_type: "gradient", bg_gradient: "linear-gradient(135deg,#3b82f6,#8b5cf6)", name: "Blue-Purple" },
  { bg_type: "gradient", bg_gradient: "linear-gradient(135deg,#ffffff,#e5e7eb)", name: "White Founder" },
  { bg_type: "gradient", bg_gradient: "linear-gradient(135deg,#18181b,#27272a)", name: "Dark Metal" },
  { bg_type: "gradient", bg_gradient: "linear-gradient(135deg,#00ff41,#00b34a)", name: "Green System" },
];

export function SystemBadgeForm({ badge, level, onClose, onSuccess }: Props) {
  const isEdit = !!badge;
  const meta = LEVEL_META[level] || { label: "Level " + level, icon: "" };

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(badge?.name || meta.label);
  const [textContent, setTextContent] = useState(badge?.text_content || meta.label);
  const [textColor, setTextColor] = useState(badge?.text_color || "#ffffff");

  const [bgType, setBgType] = useState(badge?.bg_type || "solid");
  const [bgColor, setBgColor] = useState(badge?.bg_color || "#8b5cf6");
  const [bgGradient, setBgGradient] = useState(badge?.bg_gradient || "linear-gradient(135deg,#3b82f6,#8b5cf6)");

  const [borderColor, setBorderColor] = useState(badge?.border_color || "#ffffff");
  const [borderWidth, setBorderWidth] = useState(badge?.border_width ?? 0);
  const [borderGlow, setBorderGlow] = useState(badge?.border_glow ?? false);
  const [borderGlowIntensity, setBorderGlowIntensity] = useState(badge?.border_glow_intensity ?? 50);

  const [animations, setAnimations] = useState<string[]>(
    Array.isArray(badge?.animation_flags) ? badge.animation_flags : []
  );
  const [animationSpeed, setAnimationSpeed] = useState(badge?.animation_speed || "normal");

  const [shadowEnabled, setShadowEnabled] = useState(badge?.shadow_enabled ?? true);
  const [innerGlowEnabled, setInnerGlowEnabled] = useState(badge?.inner_glow_enabled ?? false);
    const [metallicEnabled, setMetallicEnabled] = useState(badge?.metallic_enabled ?? false);
  const [specularEnabled, setSpecularEnabled] = useState(badge?.specular_enabled ?? false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const token = getToken();
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
    const payload = {
      name,
      text_content: textContent || null,
      text_color: textColor,
      bg_type: bgType,
      bg_color: bgColor,
      bg_gradient: bgType === "gradient" ? bgGradient : null,
      border_color: borderColor,
      border_width: borderWidth,
      border_glow: borderGlow,
      border_glow_intensity: borderGlowIntensity,
      animation_flags: JSON.stringify(animations),
      animation_speed: animationSpeed,
      shadow_enabled: shadowEnabled,
      inner_glow_enabled: innerGlowEnabled,
      metallic_enabled: metallicEnabled,
      specular_enabled: specularEnabled,
    };

    try {
      const headers: any = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`${apiUrl}/api/system-badges/${level}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`Ошибка: ${res.status}`);
      const result = await res.json();
      // Убеждаемся, что level присутствует в ответе
      onSuccess?.({ ...result, level });
      onClose();
    } catch (err: any) {
      setError(err.message || "Произошла ошибка");
    } finally {
      setLoading(false);
    }
  };

  const getPreviewStyle = (): React.CSSProperties => {
    const style: React.CSSProperties = {};

    if (bgType === "gradient") {
      style.backgroundImage = bgGradient;
    } else {
      style.backgroundColor = bgColor;
    }

    style.color = textColor;
    if (borderWidth > 0) {
      style.border = `${borderWidth}px solid ${borderColor}`;
    }
    if (borderGlow) {
      style.boxShadow = `0 0 ${borderGlowIntensity * 2}px ${borderColor}`;
    }

    return style;
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-paper dark:bg-[#1f1f23] border border-line dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        {/* Header */ }
        <div className="p-6 border-b border-line dark:border-white/10 flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span className="text-2xl">{meta.icon}</span> {isEdit ? "Редактировать" : "Создать"} плашку: {meta.label}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">×</button>
        </div>

        {/* Error */ }
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Preview */ }
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center font-bold text-sm transition-all" style={getPreviewStyle()}>
              {textContent || name}
            </div>
          </div>

          {/* Name */ }
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-white/60 mb-1.5">Название</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-ivory dark:bg-[#1a1a1a] border border-line dark:border-white/10 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:border-blue-500/50"
              placeholder="Введите название"
            />
          </div>

          {/* Text Content */ }
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-white/60 mb-1.5">Текст (будет виден пользователям)</label>
            <input
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              className="w-full bg-ivory dark:bg-[#1a1a1a] border border-line dark:border-white/10 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:border-blue-500/50"
              placeholder={meta.label}
              maxLength={40}
            />
            <span className="text-xs text-gray-500 mt-1 block">{textContent.length}/40 символов</span>
          </div>

          {/* Text Color */ }
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-white/60 mb-1.5">Цвет текста</label>
            <div className="flex gap-2">
              <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="w-12 h-10 rounded border border-line dark:border-white/10 cursor-pointer p-0.5" />
                            <input value={textColor} onChange={(e) => setTextColor(e.target.value)} className="flex-1 bg-ivory dark:bg-[#1a1a1a] border border-line dark:border-white/10 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:border-blue-500/50" placeholder="#ffffff" />
            </div>
          </div>

          {/* BG Type */ }
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-white/60 mb-1.5">Тип фона</label>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setBgType("solid")} className={`py-2 px-3 rounded-lg text-sm border transition-all ${bgType === "solid" ? "border-blue-500 bg-blue-500/10" : "border-line dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/5"}`}>Сплошной</button>
              <button type="button" onClick={() => setBgType("gradient")} className={`py-2 px-3 rounded-lg text-sm border transition-all ${bgType === "gradient" ? "border-blue-500 bg-blue-500/10" : "border-line dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/5"}`}>Градиент</button>
            </div>
          </div>

          {/* BG Color */ }
          {bgType === "solid" && (
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-white/60 mb-1.5">Цвет фона</label>
              <div className="flex gap-2">
                <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="w-12 h-10 rounded border border-line dark:border-white/10 cursor-pointer p-0.5" />
                <input value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="flex-1 bg-ivory dark:bg-[#1a1a1a] border border-line dark:border-white/10 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:border-blue-500/50" placeholder="#3b82f6" />
              </div>
                        </div>
          )}

          {/* BG Gradient */ }
          {bgType === "gradient" && (
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-white/60 mb-1.5">Градиент</label>
              <div className="space-y-2">
                <input value={bgGradient} onChange={(e) => setBgGradient(e.target.value)} className="w-full bg-ivory dark:bg-[#1a1a1a] border border-line dark:border-white/10 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:border-blue-500/50 font-mono text-sm" placeholder="linear-gradient(135deg,#3b82f6,#8b5cf6)" />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {QUALITY_PRESETS.map((p) => (
                    <button key={p.name} type="button" onClick={() => { setBgType(p.bg_type); if (p.bg_gradient) setBgGradient(p.bg_gradient); if (p.bg_color) setBgColor(p.bg_color); }} className="py-1.5 px-3 rounded-lg text-xs border border-line dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-center">{p.name}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Border */ }
          <div className="space-y-3">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-600 dark:text-white/60 mb-1.5">Цвет обводки</label>
                <input type="color" value={borderColor} onChange={(e) => setBorderColor(e.target.value)} className="w-full h-10 rounded border border-line dark:border-white/10 cursor-pointer p-0.5" />
              </div>
              <div className="w-20">
                <label className="block text-sm font-medium text-gray-600 dark:text-white/60 mb-1.5">Толщина</label>
                <input type="number" min={0} max={10} value={borderWidth} onChange={(e) => setBorderWidth(Number(e.target.value))} className="w-full bg-ivory dark:bg-[#1a1a1a] border border-line dark:border-white/10 rounded-lg px-3 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:border-blue-500/50" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={borderGlow} onChange={(e) => setBorderGlow(e.target.checked)} className="w-4 h-4 rounded border-line dark:border-white/30" />
                <span className="text-sm text-gray-700 dark:text-white/80">Свечение обводки</span>
              </label>
              {borderGlow && <input type="range" min={10} max={200} value={borderGlowIntensity} onChange={(e) => setBorderGlowIntensity(Number(e.target.value))} className="flex-1" />}
            </div>
          </div>

          {/* Animations */ }
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-white/60 mb-1.5">Анимации</label>
            <div className="flex flex-wrap gap-2">
              {ANIM_OPTIONS.map((anim) => (
                <button key={anim} type="button" onClick={() => animations.includes(anim) ? setAnimations(animations.filter((a) => a !== anim)) : setAnimations([...animations, anim])} className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${animations.includes(anim) ? "border-blue-500 bg-blue-500/10 text-blue-400" : "border-line dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/5"}`}>{anim}</button>
              ))}
            </div>
          </div>

          {/* Animation Speed */ }
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-white/60 mb-1.5">Скорость анимаций</label>
                        <select value={animationSpeed} onChange={(e) => setAnimationSpeed(e.target.value)} className="w-full bg-ivory dark:bg-[#1a1a1a] border border-line dark:border-white/10 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:border-blue-500/50">
              {SPEED_OPTIONS.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
          </div>

          {/* Effects */ }
          <div className="grid grid-cols-2 gap-4">
            {[
              { checked: shadowEnabled, setter: setShadowEnabled, label: "Тень" },
              { checked: innerGlowEnabled, setter: setInnerGlowEnabled, label: "Внутреннее свечение" },
              { checked: metallicEnabled, setter: setMetallicEnabled, label: "Металлик" },
              { checked: specularEnabled, setter: setSpecularEnabled, label: "Блики" },
            ].map((item) => (
              <label key={item.label} className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={item.checked} onChange={(e) => item.setter(e.target.checked)} className="w-4 h-4 rounded border-line dark:border-white/30" />
                <span className="text-sm text-gray-700 dark:text-white/80">{item.label}</span>
              </label>
            ))}
          </div>
        </form>

        {/* Footer */ }
        <div className="p-6 border-t border-line dark:border-white/10 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-6 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">Отмена</button>
          <button onClick={handleSubmit} disabled={loading} className="px-6 py-2.5 rounded-lg text-sm font-medium bg-blue-500 hover:bg-blue-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
            {loading ? (<><div className="w-4 h-4 border-2 border-line dark:border-white/30 border-t-white rounded-full animate-spin" />Сохранение...</>) : (isEdit ? "Сохранить изменения" : "Создать плашку")}
          </button>
        </div>
            </div>
    </div>
  );
}