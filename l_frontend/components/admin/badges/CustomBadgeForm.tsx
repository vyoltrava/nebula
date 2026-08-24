"use client";
import { useState, useRef } from "react";
import { getToken } from "@/lib/auth";
import { X, Upload, Trash2, Check, Sparkles, Palette, Type, Layers, Wand2, Settings } from "lucide-react";

interface BadgeFormProps {
  badge?: any;
  onClose: () => void;
  onSuccess?: (badge: any) => void;
}

const PRESETS = [
  { name: "Золотая VIP", bg_color: "#fbbf24", border_color: "#d97706", glow: true },
  { name: "Алмазный синий", bg_color: "#3b82f6", border_color: "#1d4ed8", glow: true },
  { name: "Пурпурный", bg_color: "#8b5cf6", border_color: "#6b21a8", glow: false },
  { name: "Красный", bg_color: "#ef4444", border_color: "#b91c1c", glow: true },
  { name: "Зеленый", bg_color: "#22c55e", border_color: "#15803d", glow: false },
];

const ANIM_OPTIONS = [
  { value: "perimeter_wave", label: "Вращение обводки" },
  { value: "pulse_glow", label: "Пульсация свечения" },
  { value: "shimmer", label: "Перелив градиента" },
  { value: "blink", label: "Мерцание" },
  { value: "rotate_icon", label: "Вращение иконки" },
  { value: "float", label: "Парящий эффект" },
];

const SPEED_OPTIONS = [
  { value: "slow", label: "Медленно" },
  { value: "normal", label: "Нормально" },
  { value: "fast", label: "Быстро" },
];

const SUB_TABS = [
  { id: "base", label: "Базовые", icon: <Type size={16} /> },
  { id: "visual", label: "Визуал", icon: <Palette size={16} /> },
  { id: "border", label: "Обводка", icon: <Layers size={16} /> },
  { id: "animations", label: "Анимации", icon: <Wand2 size={16} /> },
  { id: "effects", label: "Эффекты", icon: <Sparkles size={16} /> },
  { id: "extras", label: "Доп.", icon: <Settings size={16} /> },
];

const GRADIENT_PRESETS = [
  "linear-gradient(135deg,#3b82f6,#8b5cf6)",
  "linear-gradient(135deg,#fbbf24,#f59e0b,#d97706)",
  "linear-gradient(90deg,#a8ed60,#fedcb2)",
  "linear-gradient(135deg,#667eea,#764ba2)",
];

export function CustomBadgeForm({ badge, onClose, onSuccess }: BadgeFormProps) {
  const isEdit = !!badge;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState("base");

  // Base fields
  const [name, setName] = useState(badge?.name || "");
  const [description, setDescription] = useState(badge?.description || "");
  const [textContent, setTextContent] = useState(badge?.text_content || "");
  const [iconPreview, setIconPreview] = useState(badge?.icon_url || null);
  const iconInputRef = useRef<HTMLInputElement>(null);

  // Visual fields
  const [bgType, setBgType] = useState(badge?.bg_type || "solid");
  const [bgColor, setBgColor] = useState(badge?.bg_color || "#3b82f6");
  const [bgGradient, setBgGradient] = useState(badge?.bg_gradient || "linear-gradient(135deg,#3b82f6,#8b5cf6)");
  const [bgGradientAngle, setBgGradientAngle] = useState(badge?.bg_gradient_angle ?? 135);
  const [bgImagePreview, setBgImagePreview] = useState(badge?.bg_image_url || null);
  const [bgImageMode, setBgImageMode] = useState(badge?.bg_image_mode || "cover");
  const bgImageInputRef = useRef<HTMLInputElement>(null);

  // Border fields
  const [borderColor, setBorderColor] = useState(badge?.border_color || "#ffffff");
  const [borderWidth, setBorderWidth] = useState(badge?.border_width ?? 2);
  const [borderStyle, setBorderStyle] = useState(badge?.border_style || "solid");
  const [borderGlow, setBorderGlow] = useState(badge?.border_glow ?? false);
  const [borderGlowIntensity, setBorderGlowIntensity] = useState(badge?.border_glow_intensity ?? 50);

  // Animations
  const [animationFlags, setAnimationFlags] = useState<string[]>(
    badge?.animation_flags ? JSON.parse(badge.animation_flags) : []
  );
  const [animationSpeed, setAnimationSpeed] = useState(badge?.animation_speed || "normal");

  // Effects
  const [shadowEnabled, setShadowEnabled] = useState(badge?.shadow_enabled ?? true);
  const [shadowBlur, setShadowBlur] = useState(badge?.shadow_blur ?? 5);
  const [shadowOffsetX, setShadowOffsetX] = useState(badge?.shadow_offset_x ?? 0);
  const [shadowOffsetY, setShadowOffsetY] = useState(badge?.shadow_offset_y ?? 2);
  const [shadowColor, setShadowColor] = useState(badge?.shadow_color || "rgba(0,0,0,0.3)");
  const [innerGlowEnabled, setInnerGlowEnabled] = useState(badge?.inner_glow_enabled ?? false);
  const [specularEnabled, setSpecularEnabled] = useState(badge?.specular_enabled ?? false);
  const [metallicEnabled, setMetallicEnabled] = useState(badge?.metallic_enabled ?? false);

  // Extras
  const [priority, setPriority] = useState(badge?.priority ?? 0);
  const [isActive, setIsActive] = useState(badge?.is_active ?? true);

  const toggleAnimation = (flag: string) => {
    setAnimationFlags(prev =>
      prev.includes(flag) ? prev.filter(f => f !== flag) : [...prev, flag]
    );
  };

  const handleIconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target?.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setIconPreview((ev.target as FileReader).result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleBgImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target?.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setBgImagePreview((ev.target as FileReader).result as string);
      reader.readAsDataURL(file);
    }
  };

  const resetToPreset = (preset: any) => {
    setBgColor(preset.bg_color);
    setBorderColor(preset.border_color);
    setBorderGlow(preset.glow);
    setBgType("solid");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Введите название плашки");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = getToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || ""; // <-- ДОБАВЛЕНО
      
      const payload: any = {
        name,
        description: description || null,
        text_content: textContent || null,
        bg_type: bgType,
        bg_color: bgColor,
        bg_gradient: bgType === "gradient" ? bgGradient : null,
        bg_gradient_angle: bgType === "gradient" ? bgGradientAngle : null,
        border_color: borderColor,
        border_width: borderWidth,
        border_style: borderStyle,
        border_glow: borderGlow,
        border_glow_intensity: borderGlowIntensity,
        animation_flags: JSON.stringify(animationFlags),
        animation_speed: animationSpeed,
        shadow_enabled: shadowEnabled,
        shadow_blur: shadowBlur,
        shadow_offset_x: shadowOffsetX,
        shadow_offset_y: shadowOffsetY,
        shadow_color: shadowColor,
        inner_glow_enabled: innerGlowEnabled,
        specular_enabled: specularEnabled,
        metallic_enabled: metallicEnabled,
        priority,
        is_active: isActive,
      };

      const headers: any = {
        "Content-Type": "application/json",
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      let result: any;
      if (isEdit) {
        // <-- ИСПРАВЛЕНО: добавлен apiUrl
        const res = await fetch(`${apiUrl}/api/custom-badges/${badge.id}`, {
          method: "PUT",
          headers,
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Ошибка: ${res.status}`);
        result = await res.json();
      } else {
        // <-- ИСПРАВЛЕНО: добавлен apiUrl
        const res = await fetch(`${apiUrl}/api/custom-badges`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Ошибка: ${res.status}`);
        result = await res.json();
      }

      // Handle base64 icon uploads separately
      if (iconPreview && iconPreview.startsWith("data:")) {
        const formData = new FormData();
        formData.append("icon_base64", iconPreview);
        // <-- ИСПРАВЛЕНО: добавлен apiUrl
        await fetch(`${apiUrl}/api/badges/${result.id}/upload-icon`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });
      }
      if (bgImagePreview && bgImagePreview.startsWith("data:")) {
        const formData = new FormData();
        formData.append("bg_image_base64", bgImagePreview);
        // <-- ИСПРАВЛЕНО: добавлен apiUrl
        await fetch(`${apiUrl}/api/badges/${result.id}/upload-bg-image`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });
      }

      onSuccess?.(result);
      onClose();
    } catch (err: any) {
      setError(err.message || "Произошла ошибка");
    } finally {
      setLoading(false);
    }
  };

  const removeIcon = () => {
    setIconPreview(null);
    if (iconInputRef.current) iconInputRef.current.value = "";
  };

  const removeBgImage = () => {
    setBgImagePreview(null);
    if (bgImageInputRef.current) bgImageInputRef.current.value = "";
  };

  // Live preview badge style
  const getPreviewStyle = () => {
    const style: React.CSSProperties = {};
    if (bgType === "gradient") {
      style.background = bgGradient;
    } else if (bgType === "image" && bgImagePreview) {
      style.backgroundImage = `url(${bgImagePreview})`;
      style.backgroundSize = bgImageMode;
      style.backgroundPosition = "center";
      style.backgroundRepeat = bgImageMode === "tile" ? "repeat" : "no-repeat";
      style.backgroundColor = "#3b82f6";
    } else {
      style.backgroundColor = bgColor;
    }
    style.borderColor = borderColor;
    style.borderWidth = `${borderWidth}px`;
    style.borderStyle = borderStyle;
    if (shadowEnabled) {
      style.boxShadow = `${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px ${shadowColor}`;
    }
    if (borderGlow) {
      const glowColor = borderColor;
      style.filter = `drop-shadow(0 0 ${borderGlowIntensity}px ${glowColor})`;
    }
    return style;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#171717] border border-white/10 rounded-xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            {isEdit ? "Редактирование плашки" : "Создание новой плашки"}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Tabs */}
          <div className="w-64 border-r border-white/10 flex flex-col bg-[#121212]">
            <div className="p-4 space-y-1">
              {SUB_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveSubTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                    activeSubTab === tab.id
                      ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                      : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
            
            {/* Mini Preview in Sidebar */}
            <div className="mt-auto p-6 border-t border-white/10 flex flex-col items-center gap-4">
              <span className="text-xs text-gray-500 uppercase tracking-wider">Предпросмотр</span>
              <div 
                className="relative flex items-center justify-center px-4 py-2 rounded-lg min-w-[120px] min-h-[40px]"
                style={getPreviewStyle()}
              >
                {iconPreview && (
                  <img src={iconPreview} alt="" className="w-5 h-5 mr-2 object-contain" />
                )}
                <span className="text-sm font-bold text-white drop-shadow-md whitespace-nowrap">
                  {textContent || name || "Плашка"}
                </span>
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            <form onSubmit={handleSubmit} className="space-y-8 max-w-3xl">
              
              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* TAB: BASE */}
              {activeSubTab === "base" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="space-y-4">
                    <label className="block">
                      <span className="text-sm font-medium text-gray-300 mb-1 block">Название *</span>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                        placeholder="Например: VIP Gold"
                      />
                    </label>
                    
                    <label className="block">
                      <span className="text-sm font-medium text-gray-300 mb-1 block">Описание</span>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500/50 transition-colors h-24 resize-none"
                        placeholder="Краткое описание назначения плашки..."
                      />
                    </label>

                    <label className="block">
                      <span className="text-sm font-medium text-gray-300 mb-1 block">Текст на плашке</span>
                      <input
                        type="text"
                        value={textContent}
                        onChange={(e) => setTextContent(e.target.value)}
                        className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                        placeholder="Текст, который будет виден пользователям"
                        maxLength={40}
                      />
                      <span className="text-xs text-gray-500 mt-1 block">{textContent.length}/40 символов</span>
                    </label>
                  </div>

                  <div className="pt-6 border-t border-white/10">
                    <span className="text-sm font-medium text-gray-300 mb-3 block">Иконка / Логотип</span>
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-[#1a1a1a] border border-white/10 rounded-lg flex items-center justify-center overflow-hidden relative group">
                        {iconPreview ? (
                          <img src={iconPreview} alt="Icon" className="w-full h-full object-cover" />
                        ) : (
                          <Upload className="text-gray-600" size={24} />
                        )}
                        {iconPreview && (
                          <button
                            type="button"
                            onClick={removeIcon}
                            className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 size={20} className="text-red-400" />
                          </button>
                        )}
                      </div>
                      <div className="flex-1">
                        <input
                          ref={iconInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleIconUpload}
                          className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-500/10 file:text-blue-400 hover:file:bg-blue-500/20 cursor-pointer"
                        />
                        <p className="text-xs text-gray-500 mt-1">PNG, JPG или WebP. Максимум 2MB.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: VISUAL */}
              {activeSubTab === "visual" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div>
                    <span className="text-sm font-medium text-gray-300 mb-3 block">Тип фона</span>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { id: "solid", label: "Сплошной" },
                        { id: "gradient", label: "Градиент" },
                        { id: "image", label: "Изображение" },
                      ].map((type) => (
                        <button
                          key={type.id}
                          type="button"
                          onClick={() => setBgType(type.id)}
                          className={`py-2 px-3 rounded-lg text-sm border transition-all ${
                            bgType === type.id
                              ? "bg-blue-500/20 border-blue-500/50 text-blue-400"
                              : "bg-[#1a1a1a] border-white/10 text-gray-400 hover:border-white/20"
                          }`}
                        >
                          {type.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {bgType === "solid" && (
                    <div className="space-y-4">
                      <label className="block">
                        <span className="text-sm font-medium text-gray-300 mb-1 block">Цвет фона</span>
                        <div className="flex gap-2 flex-wrap">
                          <input
                            type="color"
                            value={bgColor}
                            onChange={(e) => setBgColor(e.target.value)}
                            className="h-10 w-10 rounded cursor-pointer bg-transparent border-0 p-0"
                          />
                          <input
                            type="text"
                            value={bgColor}
                            onChange={(e) => setBgColor(e.target.value)}
                            className="flex-1 bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white"
                          />
                        </div>
                      </label>
                      <div className="pt-2">
                        <span className="text-xs text-gray-500 mb-2 block">Быстрые пресеты:</span>
                        <div className="flex gap-2">
                          {PRESETS.map((p, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => resetToPreset(p)}
                              className="w-8 h-8 rounded-full border-2 border-white/10 hover:scale-110 transition-transform"
                              style={{ backgroundColor: p.bg_color }}
                              title={p.name}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {bgType === "gradient" && (
                    <div className="space-y-4">
                      <label className="block">
                        <span className="text-sm font-medium text-gray-300 mb-1 block">CSS Градиент</span>
                        <input
                          type="text"
                          value={bgGradient}
                          onChange={(e) => setBgGradient(e.target.value)}
                          className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white"
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-4">
                         <label className="block">
                           <span className="text-xs text-gray-500 mb-1 block">Угол (deg)</span>
                           <input
                             type="number"
                             value={bgGradientAngle}
                             onChange={(e) => setBgGradientAngle(Number(e.target.value))}
                             className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                           />
                         </label>
                      </div>
                      <div className="pt-2">
                        <span className="text-xs text-gray-500 mb-2 block">Пресеты градиентов:</span>
                        <div className="grid grid-cols-4 gap-2">
                          {GRADIENT_PRESETS.map((grad, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setBgGradient(grad)}
                              className="h-10 rounded-lg border border-white/10 hover:scale-105 transition-transform"
                              style={{ background: grad }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {bgType === "image" && (
                    <div className="space-y-4">
                       <label className="block">
                        <span className="text-sm font-medium text-gray-300 mb-1 block">Фоновое изображение</span>
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 bg-[#1a1a1a] border border-white/10 rounded-lg flex items-center justify-center overflow-hidden relative group">
                            {bgImagePreview ? (
                              <img src={bgImagePreview} alt="BG" className="w-full h-full object-cover" />
                            ) : (
                              <Upload className="text-gray-600" size={24} />
                            )}
                             {bgImagePreview && (
                              <button
                                type="button"
                                onClick={removeBgImage}
                                className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Trash2 size={20} className="text-red-400" />
                              </button>
                            )}
                          </div>
                          <input
                            ref={bgImageInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleBgImageUpload}
                            className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-500/10 file:text-blue-400 hover:file:bg-blue-500/20 cursor-pointer"
                          />
                        </div>
                      </label>
                      <label className="block">
                        <span className="text-sm font-medium text-gray-300 mb-1 block">Режим отображения</span>
                        <select
                          value={bgImageMode}
                          onChange={(e) => setBgImageMode(e.target.value)}
                          className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                        >
                          <option value="cover">Cover (Заполнить)</option>
                          <option value="contain">Contain (Вместить)</option>
                          <option value="tile">Tile (Замостить)</option>
                        </select>
                      </label>
                    </div>
                  )}
                </div>
              )}

              {/* TAB: BORDER */}
              {activeSubTab === "border" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="grid grid-cols-2 gap-6">
                    <label className="block">
                      <span className="text-sm font-medium text-gray-300 mb-1 block">Цвет обводки</span>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={borderColor}
                          onChange={(e) => setBorderColor(e.target.value)}
                          className="h-10 w-10 rounded cursor-pointer bg-transparent border-0 p-0"
                        />
                        <input
                          type="text"
                          value={borderColor}
                          onChange={(e) => setBorderColor(e.target.value)}
                          className="flex-1 bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white"
                        />
                      </div>
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-gray-300 mb-1 block">Толщина (px)</span>
                      <input
                        type="range"
                        min="0"
                        max="5"
                        step="1"
                        value={borderWidth}
                        onChange={(e) => setBorderWidth(Number(e.target.value))}
                        className="w-full accent-blue-500"
                      />
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>0px</span>
                        <span>{borderWidth}px</span>
                        <span>5px</span>
                      </div>
                    </label>
                  </div>

                  <label className="block">
                    <span className="text-sm font-medium text-gray-300 mb-1 block">Стиль линии</span>
                    <div className="grid grid-cols-3 gap-3">
                      {["solid", "dashed", "dotted"].map((style) => (
                        <button
                          key={style}
                          type="button"
                          onClick={() => setBorderStyle(style)}
                          className={`py-2 px-3 rounded-lg text-sm border transition-all capitalize ${
                            borderStyle === style
                              ? "bg-blue-500/20 border-blue-500/50 text-blue-400"
                              : "bg-[#1a1a1a] border-white/10 text-gray-400 hover:border-white/20"
                          }`}
                        >
                          {style}
                        </button>
                      ))}
                    </div>
                  </label>

                  <div className="pt-4 border-t border-white/10">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm font-medium text-gray-300">Свечение обводки (Glow)</span>
                      <button
                        type="button"
                        onClick={() => setBorderGlow(!borderGlow)}
                        className={`w-12 h-6 rounded-full transition-colors relative ${
                          borderGlow ? "bg-blue-500" : "bg-gray-700"
                        }`}
                      >
                        <span
                          className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                            borderGlow ? "translate-x-6" : ""
                          }`}
                        />
                      </button>
                    </div>
                    {borderGlow && (
                      <div className="space-y-2">
                         <label className="block">
                          <span className="text-xs text-gray-500 mb-1 block">Интенсивность</span>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={borderGlowIntensity}
                            onChange={(e) => setBorderGlowIntensity(Number(e.target.value))}
                            className="w-full accent-blue-500"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB: ANIMATIONS */}
              {activeSubTab === "animations" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div>
                    <span className="text-sm font-medium text-gray-300 mb-3 block">Активные анимации</span>
                    <div className="grid grid-cols-2 gap-3">
                      {ANIM_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => toggleAnimation(opt.value)}
                          className={`flex items-center justify-between p-3 rounded-lg border text-left transition-all ${
                            animationFlags.includes(opt.value)
                              ? "bg-blue-500/10 border-blue-500/50 text-blue-400"
                              : "bg-[#1a1a1a] border-white/10 text-gray-400 hover:border-white/20"
                          }`}
                        >
                          <span className="text-sm">{opt.label}</span>
                          {animationFlags.includes(opt.value) && <Check size={16} />}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-white/10">
                    <span className="text-sm font-medium text-gray-300 mb-3 block">Скорость анимации</span>
                    <div className="grid grid-cols-3 gap-3">
                      {SPEED_OPTIONS.map((speed) => (
                        <button
                          key={speed.value}
                          type="button"
                          onClick={() => setAnimationSpeed(speed.value)}
                          className={`py-2 px-3 rounded-lg text-sm border transition-all ${
                            animationSpeed === speed.value
                              ? "bg-blue-500/20 border-blue-500/50 text-blue-400"
                              : "bg-[#1a1a1a] border-white/10 text-gray-400 hover:border-white/20"
                          }`}
                        >
                          {speed.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: EFFECTS */}
              {activeSubTab === "effects" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  {/* Shadow */}
                  <div className="p-4 bg-[#1a1a1a] rounded-xl border border-white/5 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-300">Тень (Drop Shadow)</span>
                      <button
                        type="button"
                        onClick={() => setShadowEnabled(!shadowEnabled)}
                        className={`w-10 h-5 rounded-full transition-colors relative ${
                          shadowEnabled ? "bg-blue-500" : "bg-gray-700"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                            shadowEnabled ? "translate-x-5" : ""
                          }`}
                        />
                      </button>
                    </div>
                    {shadowEnabled && (
                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <label className="block">
                          <span className="text-xs text-gray-500 mb-1 block">Размытие</span>
                          <input
                            type="number"
                            value={shadowBlur}
                            onChange={(e) => setShadowBlur(Number(e.target.value))}
                            className="w-full bg-[#121212] border border-white/10 rounded px-2 py-1 text-sm text-white"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs text-gray-500 mb-1 block">Цвет</span>
                          <input
                            type="text"
                            value={shadowColor}
                            onChange={(e) => setShadowColor(e.target.value)}
                            className="w-full bg-[#121212] border border-white/10 rounded px-2 py-1 text-sm text-white font-mono"
                          />
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Toggles */}
                  <div className="space-y-3">
                    {[
                      { label: "Внутреннее свечение (Inner Glow)", state: innerGlowEnabled, setter: setInnerGlowEnabled },
                      { label: "Блики (Specular)", state: specularEnabled, setter: setSpecularEnabled },
                      { label: "Металлический эффект", state: metallicEnabled, setter: setMetallicEnabled },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-[#1a1a1a] rounded-lg border border-white/5">
                        <span className="text-sm text-gray-300">{item.label}</span>
                        <button
                          type="button"
                          onClick={() => item.setter(!item.state)}
                          className={`w-10 h-5 rounded-full transition-colors relative ${
                            item.state ? "bg-blue-500" : "bg-gray-700"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                              item.state ? "translate-x-5" : ""
                            }`}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB: EXTRAS */}
              {activeSubTab === "extras" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                   <div className="grid grid-cols-2 gap-6">
                    <label className="block">
                      <span className="text-sm font-medium text-gray-300 mb-1 block">Приоритет</span>
                      <input
                        type="number"
                        value={priority}
                        onChange={(e) => setPriority(Number(e.target.value))}
                        className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                        placeholder="0"
                      />
                      <span className="text-xs text-gray-500 mt-1 block">Чем выше число, тем выше плашка в списке.</span>
                    </label>
                    
                    <div className="flex items-center justify-end h-full pb-2">
                       <label className="flex items-center gap-3 cursor-pointer select-none">
                        <span className="text-sm text-gray-300">Активная плашка</span>
                        <button
                          type="button"
                          onClick={() => setIsActive(!isActive)}
                          className={`w-12 h-6 rounded-full transition-colors relative ${
                            isActive ? "bg-green-500" : "bg-gray-700"
                          }`}
                        >
                          <span
                            className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                              isActive ? "translate-x-6" : ""
                            }`}
                          />
                        </button>
                      </label>
                    </div>
                   </div>
                </div>
              )}

            </form>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-white/10 bg-[#121212] flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-6 py-2.5 rounded-lg text-sm font-medium bg-blue-500 hover:bg-blue-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Сохранение...
              </>
            ) : (
              <>
                <Check size={16} />
                {isEdit ? "Сохранить изменения" : "Создать плашку"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}