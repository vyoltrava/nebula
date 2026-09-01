"use client";
import { useState, useRef } from "react";
import { getToken } from "@/lib/auth";
import { X, Upload, Trash2, Check, Sparkles, Palette, Type, Layers, Wand2, Settings } from "lucide-react";

interface BilletFormProps {
  billet?: any;
  onClose: () => void;
  onSuccess?: (billet: any) => void;
}

const PRESETS = [
  { name: "Р—РѕР»РѕС‚Р°СЏ VIP", bg_color: "#fbbf24", border_color: "#d97706", glow: true },
  { name: "РђР»РјР°Р·РЅС‹Р№ СЃРёРЅРёР№", bg_color: "#3b82f6", border_color: "#1d4ed8", glow: true },
  { name: "РџСѓСЂРїСѓСЂРЅС‹Р№", bg_color: "#8b5cf6", border_color: "#6b21a8", glow: false },
  { name: "РљСЂР°СЃРЅС‹Р№", bg_color: "#ef4444", border_color: "#b91c1c", glow: true },
  { name: "Р—РµР»РµРЅС‹Р№", bg_color: "#22c55e", border_color: "#15803d", glow: false },
];

const ANIM_OPTIONS = [
  { value: "perimeter_wave", label: "Р’СЂР°С‰РµРЅРёРµ РѕР±РІРѕРґРєРё" },
  { value: "pulse_glow", label: "РџСѓР»СЊСЃР°С†РёСЏ СЃРІРµС‡РµРЅРёСЏ" },
  { value: "shimmer", label: "РџРµСЂРµР»РёРІ РіСЂР°РґРёРµРЅС‚Р°" },
  { value: "blink", label: "РњРµСЂС†Р°РЅРёРµ" },
  { value: "rotate_icon", label: "Р’СЂР°С‰РµРЅРёРµ РёРєРѕРЅРєРё" },
  { value: "float", label: "РџР°СЂСЏС‰РёР№ СЌС„С„РµРєС‚" },
];

const SPEED_OPTIONS = [
  { value: "slow", label: "РњРµРґР»РµРЅРЅРѕ" },
  { value: "normal", label: "РќРѕСЂРјР°Р»СЊРЅРѕ" },
  { value: "fast", label: "Р‘С‹СЃС‚СЂРѕ" },
];

const SUB_TABS = [
  { id: "base", label: "Р‘Р°Р·РѕРІС‹Рµ", icon: <Type size={16} /> },
  { id: "visual", label: "Р’РёР·СѓР°Р»", icon: <Palette size={16} /> },
  { id: "border", label: "РћР±РІРѕРґРєР°", icon: <Layers size={16} /> },
  { id: "animations", label: "РђРЅРёРјР°С†РёРё", icon: <Wand2 size={16} /> },
  { id: "effects", label: "Р­С„С„РµРєС‚С‹", icon: <Sparkles size={16} /> },
  { id: "extras", label: "Р”РѕРї.", icon: <Settings size={16} /> },
];

const GRADIENT_PRESETS = [
  "linear-gradient(135deg,#3b82f6,#8b5cf6)",
  "linear-gradient(135deg,#fbbf24,#f59e0b,#d97706)",
  "linear-gradient(90deg,#a8ed60,#fedcb2)",
  "linear-gradient(135deg,#667eea,#764ba2)",
];

export function BilletForm({ billet, onClose, onSuccess }: BilletFormProps) {
  const isEdit = !!billet;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState("base");

  // Base fields
  const [name, setName] = useState(billet?.name || "");
  const [description, setDescription] = useState(billet?.description || "");
  const [textContent, setTextContent] = useState(billet?.text_content || "");
  const [iconPreview, setIconPreview] = useState(billet?.icon_url || null);
  const iconInputRef = useRef<HTMLInputElement>(null);


  const [textColor, setTextColor] = useState(billet?.text_color || "#ffffff");

  // Visual fields
  const [bgType, setBgType] = useState(billet?.bg_type || "solid");
  const [bgColor, setBgColor] = useState(billet?.bg_color || "#3b82f6");
  const [bgGradient, setBgGradient] = useState(billet?.bg_gradient || "linear-gradient(135deg,#3b82f6,#8b5cf6)");
  const [bgGradientAngle, setBgGradientAngle] = useState(billet?.bg_gradient_angle ?? 135);
  const [bgImagePreview, setBgImagePreview] = useState(billet?.bg_image_url || null);
  const [bgImageMode, setBgImageMode] = useState(billet?.bg_image_mode || "cover");
  const bgImageInputRef = useRef<HTMLInputElement>(null);

  // Border fields
  const [borderColor, setBorderColor] = useState(billet?.border_color || "#ffffff");
  const [borderWidth, setBorderWidth] = useState(billet?.border_width ?? 2);
  const [borderStyle, setBorderStyle] = useState(billet?.border_style || "solid");
  const [borderGlow, setBorderGlow] = useState(billet?.border_glow ?? false);
  const [borderGlowIntensity, setBorderGlowIntensity] = useState(billet?.border_glow_intensity ?? 50);

  // Animations
  const [animationFlags, setAnimationFlags] = useState<string[]>(
    billet?.animation_flags ? JSON.parse(billet.animation_flags) : []
  );
  const [animationSpeed, setAnimationSpeed] = useState(billet?.animation_speed || "normal");

  // Effects
  const [shadowEnabled, setShadowEnabled] = useState(billet?.shadow_enabled ?? true);
  const [shadowBlur, setShadowBlur] = useState(billet?.shadow_blur ?? 5);
  const [shadowOffsetX, setShadowOffsetX] = useState(billet?.shadow_offset_x ?? 0);
  const [shadowOffsetY, setShadowOffsetY] = useState(billet?.shadow_offset_y ?? 2);
  const [shadowColor, setShadowColor] = useState(billet?.shadow_color || "rgba(0,0,0,0.3)");
  const [innerGlowEnabled, setInnerGlowEnabled] = useState(billet?.inner_glow_enabled ?? false);
  const [specularEnabled, setSpecularEnabled] = useState(billet?.specular_enabled ?? false);
  const [metallicEnabled, setMetallicEnabled] = useState(billet?.metallic_enabled ?? false);

  // Extras
  const [priority, setPriority] = useState(billet?.priority ?? 0);
  const [isActive, setIsActive] = useState(billet?.is_active ?? true);

  // рџ†• РђРІС‚Рѕ-РїРѕРґР±РѕСЂ СЌС„С„РµРєС‚РѕРІ РїРѕРґ РІС‹Р±СЂР°РЅРЅС‹Р№ С†РІРµС‚ С„РѕРЅР°
  const [autoSync, setAutoSync] = useState(true);

  const syncEffectsToColor = (color: string) => {
    if (!autoSync) return;
    setBorderColor(color);
    setBorderGlow(true);
    setBorderGlowIntensity((v: number | null) => (v && v > 0 ? v : 70));
    setShadowEnabled(true);
    setInnerGlowEnabled(true);
  };

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
      setError("Р’РІРµРґРёС‚Рµ РЅР°Р·РІР°РЅРёРµ РїР»Р°С€РєРё");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = getToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || ""; // <-- Р”РћР‘РђР’Р›Р•РќРћ
      
      const payload: any = {
        name,
        description: description || null,
        text_content: textContent || null,
        text_color: textColor, // рџ†• Р”РћР‘РђР’Р›Р•РќРћ
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
        // <-- РРЎРџР РђР’Р›Р•РќРћ: РґРѕР±Р°РІР»РµРЅ apiUrl
        const res = await fetch(`${apiUrl}/api/billets/${billet.id}`, {
          method: "PUT",
          headers,
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`РћС€РёР±РєР°: ${res.status}`);
        result = await res.json();
      } else {
        // <-- РРЎРџР РђР’Р›Р•РќРћ: РґРѕР±Р°РІР»РµРЅ apiUrl
        const res = await fetch(`${apiUrl}/api/billets`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`РћС€РёР±РєР°: ${res.status}`);
        result = await res.json();
      }

      // Handle base64 icon uploads separately
      if (iconPreview && iconPreview.startsWith("data:")) {
        const formData = new FormData();
        formData.append("icon_base64", iconPreview);
        // <-- РРЎРџР РђР’Р›Р•РќРћ: РґРѕР±Р°РІР»РµРЅ apiUrl
        await fetch(`${apiUrl}/api/billets/${result.id}/upload-icon`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });
      }
      if (bgImagePreview && bgImagePreview.startsWith("data:")) {
        const formData = new FormData();
        formData.append("bg_image_base64", bgImagePreview);
        // <-- РРЎРџР РђР’Р›Р•РќРћ: РґРѕР±Р°РІР»РµРЅ apiUrl
        await fetch(`${apiUrl}/api/billets/${result.id}/upload-bg-image`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });
      }

      onSuccess?.(result);
      onClose();
    } catch (err: any) {
      setError(err.message || "РџСЂРѕРёР·РѕС€Р»Р° РѕС€РёР±РєР°");
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

  // Live preview billet style
  // Live preview billet style
  const getPreviewStyle = () => {
    const style: React.CSSProperties = {};
    
    // 1. Р¤РѕРЅ
    if (bgType === "gradient") {
      style.backgroundImage = bgGradient;
    } else if (bgType === "image" && bgImagePreview) {
      style.backgroundImage = `url('${bgImagePreview}')`;
      style.backgroundSize = bgImageMode;
      style.backgroundPosition = "center";
      style.backgroundRepeat = bgImageMode === "tile" ? "repeat" : "no-repeat";
      style.backgroundColor = bgColor || "#3b82f6"; // Fallback
    } else {
      style.backgroundColor = bgColor || "#3b82f6";
    }

    // 2. РњРµС‚Р°Р»Р»РёС‡РµСЃРєРёР№ СЌС„С„РµРєС‚ (Р‘Р•Р—РћРџРђРЎРќРђРЇ РєРѕРЅРєР°С‚РµРЅР°С†РёСЏ)
    if (metallicEnabled) {
      const metallicGradient = "linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 50%, rgba(255,255,255,0.1) 100%)";
      if (style.backgroundImage) {
        style.backgroundImage = `${style.backgroundImage}, ${metallicGradient}`;
      } else {
        style.backgroundImage = metallicGradient;
      }
    }

    // 3. РћР±РІРѕРґРєР°
    if (borderWidth > 0) {
      style.border = `${borderWidth}px ${borderStyle} ${borderColor}`;
    }

    // 4. РўРµРЅРё (РЎР±РѕСЂРєР° РІ РјР°СЃСЃРёРІ)
    const shadows: string[] = [];
    if (shadowEnabled) {
      shadows.push(`${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px ${shadowColor}`);
    }
    if (innerGlowEnabled) {
      shadows.push(`inset 0 0 15px rgba(255, 255, 255, 0.4)`);
    }
    if (specularEnabled) {
      shadows.push(`inset 0 4px 6px rgba(255, 255, 255, 0.6)`);
    }
    if (shadows.length > 0) {
      style.boxShadow = shadows.join(", ");
    }

    // 5. РЎРІРµС‡РµРЅРёРµ РѕР±РІРѕРґРєРё
    if (borderGlow) {
      style.filter = `drop-shadow(0 0 ${borderGlowIntensity}px ${borderColor})`;
    }

    // 6. Р¦РІРµС‚ С‚РµРєСЃС‚Р° (РґР»СЏ РјРіРЅРѕРІРµРЅРЅРѕРіРѕ РѕС‚РѕР±СЂР°Р¶РµРЅРёСЏ РІ РїСЂРµРІСЊСЋ)
    style.color = textColor;

    return style;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-paper dark:bg-[#171717] border border-line dark:border-white/10 rounded-xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-line dark:border-white/10">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            {isEdit ? "Р РµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ РїР»Р°С€РєРё" : "РЎРѕР·РґР°РЅРёРµ РЅРѕРІРѕР№ РїР»Р°С€РєРё"}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-gray-900 dark:hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Tabs */}
          <div className="w-64 border-r border-line dark:border-white/10 flex flex-col bg-gray-50 dark:bg-[#121212]">
            <div className="p-4 space-y-1">
              {SUB_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveSubTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                    activeSubTab === tab.id
                      ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                      : "text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-200"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
            
            {/* Mini Preview in Sidebar */}
            <div className="mt-auto p-6 border-t border-line dark:border-white/10 flex flex-col items-center gap-4">
              <span className="text-xs text-gray-500 uppercase tracking-wider">РџСЂРµРґРїСЂРѕСЃРјРѕС‚СЂ</span>
              <div 
                className="relative flex items-center justify-center px-4 py-2 rounded-lg min-w-[120px] min-h-[40px]"
                style={getPreviewStyle()}
              >
                {iconPreview && (
                  <img src={iconPreview} alt="" className="w-5 h-5 mr-2 object-contain" />
                )}
                {/* РЈР±СЂР°Р»Рё text-gray-900 dark:text-white, С†РІРµС‚ С‚РµРїРµСЂСЊ Р±РµСЂРµС‚СЃСЏ РёР· getPreviewStyle().color */}
                <span className="text-sm font-bold drop-shadow-md whitespace-nowrap">
                  {textContent || name || "РџР»Р°С€РєР°"}
                </span>
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            <form onSubmit={handleSubmit} className="space-y-8 max-w-3xl">
              
              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-600 dark:text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* TAB: BASE */}
              {activeSubTab === "base" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="space-y-4">
                    <label className="block">
                      <span className="text-sm font-medium text-gray-300 mb-1 block">РќР°Р·РІР°РЅРёРµ *</span>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-ivory dark:bg-[#1a1a1a] border border-line dark:border-white/10 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                        placeholder="РќР°РїСЂРёРјРµСЂ: VIP Gold"
                      />
                    </label>
                    
                    <label className="block">
                      <span className="text-sm font-medium text-gray-300 mb-1 block">РћРїРёСЃР°РЅРёРµ</span>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full bg-ivory dark:bg-[#1a1a1a] border border-line dark:border-white/10 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:border-blue-500/50 transition-colors h-24 resize-none"
                        placeholder="РљСЂР°С‚РєРѕРµ РѕРїРёСЃР°РЅРёРµ РЅР°Р·РЅР°С‡РµРЅРёСЏ РїР»Р°С€РєРё..."
                      />
                    </label>

                    <label className="block">
                      <span className="text-sm font-medium text-gray-300 mb-1 block">РўРµРєСЃС‚ РЅР° РїР»Р°С€РєРµ</span>
                      <input
                        type="text"
                        value={textContent}
                        onChange={(e) => setTextContent(e.target.value)}
                        className="w-full bg-ivory dark:bg-[#1a1a1a] border border-line dark:border-white/10 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                        placeholder="РўРµРєСЃС‚, РєРѕС‚РѕСЂС‹Р№ Р±СѓРґРµС‚ РІРёРґРµРЅ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏРј"
                        maxLength={40}
                      />
                      <span className="text-xs text-gray-500 mt-1 block">{textContent.length}/40 СЃРёРјРІРѕР»РѕРІ</span>
                    </label>
                  </div>

                  <div className="pt-6 border-t border-line dark:border-white/10">
                    <span className="text-sm font-medium text-gray-300 mb-3 block">РРєРѕРЅРєР° / Р›РѕРіРѕС‚РёРї</span>
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-ivory dark:bg-[#1a1a1a] border border-line dark:border-white/10 rounded-lg flex items-center justify-center overflow-hidden relative group">
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
                            <Trash2 size={20} className="text-red-600 dark:text-red-400" />
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
                        <p className="text-xs text-gray-500 mt-1">PNG, JPG РёР»Рё WebP. РњР°РєСЃРёРјСѓРј 2MB.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: VISUAL */}
              {activeSubTab === "visual" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div>
                    <span className="text-sm font-medium text-gray-300 mb-3 block">РўРёРї С„РѕРЅР°</span>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { id: "solid", label: "РЎРїР»РѕС€РЅРѕР№" },
                        { id: "gradient", label: "Р“СЂР°РґРёРµРЅС‚" },
                        { id: "image", label: "РР·РѕР±СЂР°Р¶РµРЅРёРµ" },
                      ].map((type) => (
                        <button
                          key={type.id}
                          type="button"
                          onClick={() => setBgType(type.id)}
                          className={`py-2 px-3 rounded-lg text-sm border transition-all ${
                            bgType === type.id
                              ? "bg-blue-500/20 border-blue-500/50 text-blue-600 dark:text-blue-400"
                              : "bg-ivory dark:bg-[#1a1a1a] border-line dark:border-white/10 text-gray-400 hover:border-gray-200 dark:hover:border-white/20"
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
                        <span className="text-sm font-medium text-gray-300 mb-1 block">Р¦РІРµС‚ С„РѕРЅР°</span>
                        <div className="flex gap-2 flex-wrap">
                          <input
                            type="color"
                            value={bgColor}
                            onChange={(e) => { setBgColor(e.target.value); syncEffectsToColor(e.target.value); }}
                            className="h-10 w-10 rounded cursor-pointer bg-transparent border-0 p-0"
                          />
                          <input
                            type="text"
                            value={bgColor}
                            onChange={(e) => { setBgColor(e.target.value); syncEffectsToColor(e.target.value); }}
                            className="flex-1 bg-ivory dark:bg-[#1a1a1a] border border-line dark:border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-gray-900 dark:text-white"
                          />
                        </div>
                        {/* рџ†• РђРІС‚Рѕ-РїРѕРґР±РѕСЂ СЌС„С„РµРєС‚РѕРІ РїРѕРґ С†РІРµС‚ */}
                        <label className="flex items-center gap-2 mt-2 text-xs text-gray-500 cursor-pointer">
                          <input type="checkbox" checked={autoSync} onChange={(e) => setAutoSync(e.target.checked)} className="w-4 h-4 rounded accent-blue-500" />
                          РђРІС‚РѕРјР°С‚РёС‡РµСЃРєРё РїРѕРґР±РёСЂР°С‚СЊ РѕР±РІРѕРґРєСѓ, СЃРІРµС‡РµРЅРёРµ Рё С‚РµРЅРё РїРѕРґ СЌС‚РѕС‚ С†РІРµС‚
                        </label>
                      </label>
                      <div className="pt-2">
                        <span className="text-xs text-gray-500 mb-2 block">Р‘С‹СЃС‚СЂС‹Рµ РїСЂРµСЃРµС‚С‹:</span>
                        <div className="flex gap-2">
                          {PRESETS.map((p, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => resetToPreset(p)}
                              className="w-8 h-8 rounded-full border-2 border-line dark:border-white/10 hover:scale-110 transition-transform"
                              style={{ backgroundColor: p.bg_color }}
                              title={p.name}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Р”РѕР±Р°РІСЊ СЌС‚Рѕ РІРЅСѓС‚СЂРё РІРєР»Р°РґРєРё "visual", РЅР°РїСЂРёРјРµСЂ, РїРѕСЃР»Рµ Р±Р»РѕРєР° bgType === "solid" */}
<div className="pt-4 border-t border-line dark:border-white/10">
  <label className="block">
    <span className="text-sm font-medium text-gray-300 mb-1 block">Р¦РІРµС‚ С‚РµРєСЃС‚Р° РЅР° РїР»Р°С€РєРµ</span>
    <div className="flex gap-2 flex-wrap">
      <input
        type="color"
        value={textColor}
        onChange={(e) => setTextColor(e.target.value)}
        className="h-10 w-10 rounded cursor-pointer bg-transparent border-0 p-0"
      />
      <input
        type="text"
        value={textColor}
        onChange={(e) => setTextColor(e.target.value)}
        className="flex-1 bg-ivory dark:bg-[#1a1a1a] border border-line dark:border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-gray-900 dark:text-white"
      />
    </div>
  </label>
</div>

                  {bgType === "gradient" && (
                    <div className="space-y-4">
                      <label className="block">
                        <span className="text-sm font-medium text-gray-300 mb-1 block">CSS Р“СЂР°РґРёРµРЅС‚</span>
                        <input
                          type="text"
                          value={bgGradient}
                          onChange={(e) => setBgGradient(e.target.value)}
                          className="w-full bg-ivory dark:bg-[#1a1a1a] border border-line dark:border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-gray-900 dark:text-white"
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-4">
                         <label className="block">
                           <span className="text-xs text-gray-500 mb-1 block">РЈРіРѕР» (deg)</span>
                           <input
                             type="number"
                             value={bgGradientAngle}
                             onChange={(e) => setBgGradientAngle(Number(e.target.value))}
                             className="w-full bg-ivory dark:bg-[#1a1a1a] border border-line dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white"
                           />
                         </label>
                      </div>
                      <div className="pt-2">
                        <span className="text-xs text-gray-500 mb-2 block">РџСЂРµСЃРµС‚С‹ РіСЂР°РґРёРµРЅС‚РѕРІ:</span>
                        <div className="grid grid-cols-4 gap-2">
                          {GRADIENT_PRESETS.map((grad, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setBgGradient(grad)}
                              className="h-10 rounded-lg border border-line dark:border-white/10 hover:scale-105 transition-transform"
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
                        <span className="text-sm font-medium text-gray-300 mb-1 block">Р¤РѕРЅРѕРІРѕРµ РёР·РѕР±СЂР°Р¶РµРЅРёРµ</span>
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 bg-ivory dark:bg-[#1a1a1a] border border-line dark:border-white/10 rounded-lg flex items-center justify-center overflow-hidden relative group">
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
                                <Trash2 size={20} className="text-red-600 dark:text-red-400" />
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
                        <span className="text-sm font-medium text-gray-300 mb-1 block">Р РµР¶РёРј РѕС‚РѕР±СЂР°Р¶РµРЅРёСЏ</span>
                        <select
                          value={bgImageMode}
                          onChange={(e) => setBgImageMode(e.target.value)}
                          className="w-full bg-ivory dark:bg-[#1a1a1a] border border-line dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white"
                        >
                          <option value="cover">Cover (Р—Р°РїРѕР»РЅРёС‚СЊ)</option>
                          <option value="contain">Contain (Р’РјРµСЃС‚РёС‚СЊ)</option>
                          <option value="tile">Tile (Р—Р°РјРѕСЃС‚РёС‚СЊ)</option>
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
                      <span className="text-sm font-medium text-gray-300 mb-1 block">Р¦РІРµС‚ РѕР±РІРѕРґРєРё</span>
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
                          className="flex-1 bg-ivory dark:bg-[#1a1a1a] border border-line dark:border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-gray-900 dark:text-white"
                        />
                      </div>
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-gray-300 mb-1 block">РўРѕР»С‰РёРЅР° (px)</span>
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
                    <span className="text-sm font-medium text-gray-300 mb-1 block">РЎС‚РёР»СЊ Р»РёРЅРёРё</span>
                    <div className="grid grid-cols-3 gap-3">
                      {["solid", "dashed", "dotted"].map((style) => (
                        <button
                          key={style}
                          type="button"
                          onClick={() => setBorderStyle(style)}
                          className={`py-2 px-3 rounded-lg text-sm border transition-all capitalize ${
                            borderStyle === style
                              ? "bg-blue-500/20 border-blue-500/50 text-blue-600 dark:text-blue-400"
                              : "bg-ivory dark:bg-[#1a1a1a] border-line dark:border-white/10 text-gray-400 hover:border-gray-200 dark:hover:border-white/20"
                          }`}
                        >
                          {style}
                        </button>
                      ))}
                    </div>
                  </label>

                  <div className="pt-4 border-t border-line dark:border-white/10">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm font-medium text-gray-300">РЎРІРµС‡РµРЅРёРµ РѕР±РІРѕРґРєРё (Glow)</span>
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
                          <span className="text-xs text-gray-500 mb-1 block">РРЅС‚РµРЅСЃРёРІРЅРѕСЃС‚СЊ</span>
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
                    <span className="text-sm font-medium text-gray-300 mb-3 block">РђРєС‚РёРІРЅС‹Рµ Р°РЅРёРјР°С†РёРё</span>
                    <div className="grid grid-cols-2 gap-3">
                      {ANIM_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => toggleAnimation(opt.value)}
                          className={`flex items-center justify-between p-3 rounded-lg border text-left transition-all ${
                            animationFlags.includes(opt.value)
                              ? "bg-blue-500/10 border-blue-500/50 text-blue-600 dark:text-blue-400"
                              : "bg-ivory dark:bg-[#1a1a1a] border-line dark:border-white/10 text-gray-400 hover:border-gray-200 dark:hover:border-white/20"
                          }`}
                        >
                          <span className="text-sm">{opt.label}</span>
                          {animationFlags.includes(opt.value) && <Check size={16} />}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-line dark:border-white/10">
                    <span className="text-sm font-medium text-gray-300 mb-3 block">РЎРєРѕСЂРѕСЃС‚СЊ Р°РЅРёРјР°С†РёРё</span>
                    <div className="grid grid-cols-3 gap-3">
                      {SPEED_OPTIONS.map((speed) => (
                        <button
                          key={speed.value}
                          type="button"
                          onClick={() => setAnimationSpeed(speed.value)}
                          className={`py-2 px-3 rounded-lg text-sm border transition-all ${
                            animationSpeed === speed.value
                              ? "bg-blue-500/20 border-blue-500/50 text-blue-600 dark:text-blue-400"
                              : "bg-ivory dark:bg-[#1a1a1a] border-line dark:border-white/10 text-gray-400 hover:border-gray-200 dark:hover:border-white/20"
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
                  <div className="p-4 bg-ivory dark:bg-[#1a1a1a] rounded-xl border border-line dark:border-white/5 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-300">РўРµРЅСЊ (Drop Shadow)</span>
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
                          <span className="text-xs text-gray-500 mb-1 block">Р Р°Р·РјС‹С‚РёРµ</span>
                          <input
                            type="number"
                            value={shadowBlur}
                            onChange={(e) => setShadowBlur(Number(e.target.value))}
                            className="w-full bg-gray-50 dark:bg-[#121212] border border-line dark:border-white/10 rounded px-2 py-1 text-sm text-gray-900 dark:text-white"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs text-gray-500 mb-1 block">Р¦РІРµС‚</span>
                          <input
                            type="text"
                            value={shadowColor}
                            onChange={(e) => setShadowColor(e.target.value)}
                            className="w-full bg-gray-50 dark:bg-[#121212] border border-line dark:border-white/10 rounded px-2 py-1 text-sm text-gray-900 dark:text-white font-mono"
                          />
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Toggles */}
                  <div className="space-y-3">
                    {[
                      { label: "Р’РЅСѓС‚СЂРµРЅРЅРµРµ СЃРІРµС‡РµРЅРёРµ (Inner Glow)", state: innerGlowEnabled, setter: setInnerGlowEnabled },
                      { label: "Р‘Р»РёРєРё (Specular)", state: specularEnabled, setter: setSpecularEnabled },
                      { label: "РњРµС‚Р°Р»Р»РёС‡РµСЃРєРёР№ СЌС„С„РµРєС‚", state: metallicEnabled, setter: setMetallicEnabled },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-ivory dark:bg-[#1a1a1a] rounded-lg border border-line dark:border-white/5">
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
                      <span className="text-sm font-medium text-gray-300 mb-1 block">РџСЂРёРѕСЂРёС‚РµС‚</span>
                      <input
                        type="number"
                        value={priority}
                        onChange={(e) => setPriority(Number(e.target.value))}
                        className="w-full bg-ivory dark:bg-[#1a1a1a] border border-line dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white"
                        placeholder="0"
                      />
                      <span className="text-xs text-gray-500 mt-1 block">Р§РµРј РІС‹С€Рµ С‡РёСЃР»Рѕ, С‚РµРј РІС‹С€Рµ РїР»Р°С€РєР° РІ СЃРїРёСЃРєРµ.</span>
                    </label>
                    
                    <div className="flex items-center justify-end h-full pb-2">
                       <label className="flex items-center gap-3 cursor-pointer select-none">
                        <span className="text-sm text-gray-300">РђРєС‚РёРІРЅР°СЏ РїР»Р°С€РєР°</span>
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
        <div className="p-6 border-t border-line dark:border-white/10 bg-gray-50 dark:bg-[#121212] flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
          >
            РћС‚РјРµРЅР°
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-6 py-2.5 rounded-lg text-sm font-medium bg-blue-500 hover:bg-blue-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-line dark:border-white/30 border-t-white rounded-full animate-spin" />
                РЎРѕС…СЂР°РЅРµРЅРёРµ...
              </>
            ) : (
              <>
                <Check size={16} />
                {isEdit ? "РЎРѕС…СЂР°РЅРёС‚СЊ РёР·РјРµРЅРµРЅРёСЏ" : "РЎРѕР·РґР°С‚СЊ РїР»Р°С€РєСѓ"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}