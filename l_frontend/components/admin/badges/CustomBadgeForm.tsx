"use client";
import { useState, useRef } from "react";
import { getToken } from "@/lib/auth";
import { X, Upload, Trash2 } from "lucide-react";

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
  { id: "base", label: "Базовые параметры" },
  { id: "visual", label: "Визуальные настройки" },
  { id: "border", label: "Обводка и свечение" },
  { id: "animations", label: "Анимации" },
  { id: "effects", label: "Эффекты" },
  { id: "extras", label: "Дополнительно" },
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
  const [customRoleId, setCustomRoleId] = useState(badge?.custom_role_id || null);
  const [customRoleName, setCustomRoleName] = useState(badge?.custom_role_data?.name || "");
  const [customRolePermissions, setCustomRolePermissions] = useState(badge?.custom_role_data?.permissions || "{}");
  const [customRoleCategory, setCustomRoleCategory] = useState(badge?.custom_role_data?.category || "");
    const [customRoleDescription, setCustomRoleDescription] = useState(badge?.custom_role_data?.description || "");

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

      if (iconPreview && !iconPreview.startsWith("data:")) {
        payload.icon_url = iconPreview;
      }
      if (bgImagePreview && !bgImagePreview.startsWith("data:")) {
        payload.bg_image_url = bgImagePreview;
        payload.bg_image_mode = bgImageMode;
      }

      const headers: any = {
        "Content-Type": "application/json",
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      let result: any;
      if (isEdit) {
        const res = await fetch(`/api/custom-badges/${badge.id}`, {
          method: "PUT",
          headers,
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Ошибка: ${res.status}`);
        result = await res.json();
      } else {
        const res = await fetch("/api/custom-badges", {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Ошибка: ${res.status}`);
        result = await res.json();
      }

      // Handle base64 icon uploads
      if (iconPreview && iconPreview.startsWith("data:")) {
        const formData = new FormData();
        formData.append("icon_base64", iconPreview);
        await fetch(`/api/badges/${result.id}/upload-icon`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });
      }
      if (bgImagePreview && bgImagePreview.startsWith("data:")) {
        const formData = new FormData();
        formData.append("bg_image_base64", bgImagePreview);
        await fetch(`/api/badges/${result.id}/upload-bg-image`, {
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
