"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { getToken } from "@/lib/auth";
import { useTheme } from "@/components/ThemeProvider";
import { BUILTIN_THEMES, ThemeConfig, ThemeAnimationType } from "@/lib/themes";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import {
  Palette, Plus, Edit3, Trash2, Eye, EyeOff, Check, X,
  ArrowLeft, Sparkles, Users, Lock, Globe, Zap,
} from "lucide-react";

export default function AdminThemesPage() {
  const router = useRouter();
  const { themes: contextThemes, setTheme } = useTheme();
  const [me, setMe] = useState<any>(null);
  const [themes, setThemes] = useState<ThemeConfig[]>(BUILTIN_THEMES);
  const [editingTheme, setEditingTheme] = useState<ThemeConfig | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [globalEnabled, setGlobalEnabled] = useState(true);
  const [previewTheme, setPreviewTheme] = useState<ThemeConfig | null>(null);

  // Загрузка админа
  useEffect(() => {
    const token = getToken();
    if (!token) { router.push("/login"); return; }
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (!data.is_admin) { router.push("/admin"); return; }
        setMe(data);
      })
      .catch(() => router.push("/login"));
  }, [router]);

  // Загрузка тем с бэкенда (если есть) + localStorage
  useEffect(() => {
    loadThemes();
    // Грузим состояние с бэкенда
    const token = getToken();
    if (token) {
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/themes/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data) setGlobalEnabled(data.themes_enabled === true);
        })
        .catch(() => {});
    }
  }, []);

  async function loadThemes() {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/themes`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setThemes(data);
          return;
        }
      }
    } catch {}
    // Fallback: встроенные темы + сохранённые в localStorage
    const custom = localStorage.getItem("custom_themes");
    if (custom) {
      try {
        const parsed = JSON.parse(custom);
        setThemes([...BUILTIN_THEMES, ...parsed]);
      } catch {}
    }
  }

  function saveCustomThemes(list: ThemeConfig[]) {
    const custom = list.filter(t => typeof t.id === "string");
    localStorage.setItem("custom_themes", JSON.stringify(custom));
  }

  async function toggleGlobal() {
    const next = !globalEnabled;
    setGlobalEnabled(next);
    localStorage.setItem("themes_global_enabled", String(next));
    if (!next) setTheme(null);
    
    // Сохраняем на бэкенд
    const token = getToken();
    if (token) {
      try {
        const form = new FormData();
        form.append("enabled", String(next));
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/themes/settings`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
      } catch {}
    }
  }

  function openCreate() {
    setEditingTheme({
      id: `custom_${Date.now()}`,
      name: "",
      type: "aurora",
      colors: ["#8b5cf6", "#6366f1", "#0ea5e9"],
      speed: 24,
      intensity: 0.22,
      blur: 80,
    });
    setShowEditor(true);
  }

  function openEdit(t: ThemeConfig) {
    setEditingTheme({ ...t });
    setShowEditor(true);
  }

  function saveTheme() {
    if (!editingTheme || !editingTheme.name.trim()) {
      alert("Введите название темы");
      return;
    }

    const existing = themes.findIndex(t => t.id === editingTheme.id);
    const newList = [...themes];
    if (existing >= 0) {
      newList[existing] = editingTheme;
    } else {
      newList.push(editingTheme);
    }
    setThemes(newList);
    saveCustomThemes(newList);
    setShowEditor(false);
    setEditingTheme(null);

    // Попытка сохранить на бэк (если endpoint есть)
    saveToBackend(editingTheme).catch(() => {});
  }

  async function saveToBackend(t: ThemeConfig) {
    const token = getToken();
    if (!token) return;
    try {
      const form = new FormData();
      form.append("name", t.name);
      form.append("type", t.type);
      form.append("colors", JSON.stringify(t.colors));
      form.append("speed", String(t.speed));
      form.append("intensity", String(t.intensity));
      form.append("blur", String(t.blur));
      form.append("min_level", String((t as any).min_level ?? 0));
      form.append("is_default", String(!!t.is_default));
      
      const isExisting = typeof t.id === "number";
      const url = isExisting
        ? `${process.env.NEXT_PUBLIC_API_URL}/api/themes/${t.id}`
        : `${process.env.NEXT_PUBLIC_API_URL}/api/themes`;
      
      if (isExisting) {
        form.append("is_active", "true");
        await fetch(url, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
      } else {
        await fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
      }
    } catch (e) {
      console.error("Save to backend failed:", e);
    }
  }

  async function deleteTheme(t: ThemeConfig) {
    if (!confirm(`РЈРґалить тему "${t.name}"?`)) return;
    
    if (typeof t.id === "number") {
      const token = getToken();
      try {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/themes/${t.id}`, {
          method: "DELETE",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
      } catch {}
    }
    
    // Перезагружаем список
    await loadThemes();
    
    // Если удалили активную — сбрасываем
    if (previewTheme?.id === t.id) {
      setPreviewTheme(null);
      setTheme(null);
    }
  }

  function setAsDefault(t: ThemeConfig) {
    const newList = themes.map(x => ({ ...x, is_default: x.id === t.id }));
    setThemes(newList);
    saveCustomThemes(newList);
    setTheme(t);
  }

  function applyPreview(t: ThemeConfig) {
    setPreviewTheme(t);
    setTheme(t);
  }

  if (!me) return <div className="p-8 text-gray-600 dark:text-white/60">Загрузка...</div>;

  return (
    <div className="h-screen flex overflow-hidden relative">
      <AnimatedBackground />
      <Sidebar />
      <div className="w-px shrink-0 bg-gray-100 dark:bg-white/10 my-3" />
      <main className="flex-1 overflow-y-auto border-x border-line dark:border-white/10 relative">
        {/* РЁапка */}
        <div className="p-6 border-b border-line dark:border-white/10 sticky top-0 bg-paper dark:bg-[#171717]/80 backdrop-blur-md z-10">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push("/admin")}
                className="p-2 rounded-lg text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-all"
              >
                <ArrowLeft size={20} />
              </button>
              <Palette size={24} className="text-[#8b5cf6]" />
              <div>
                <h1 className="text-2xl font-black text-gray-900 dark:text-white">Конструктор тем</h1>
                <p className="text-xs text-gray-500 dark:text-white/40 mt-0.5">
                  Создавай анимированные фоны Рґля всего сайта
                </p>
              </div>
            </div>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-bold hover:shadow-lg hover:shadow-purple-500/30 transition-all"
            >
              <Plus size={16} />
              Новая тема
            </button>
          </div>

          {/* Глобальный тумблер */}
          <div className="mt-4 p-3 rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {globalEnabled ? <Globe size={18} className="text-emerald-600 dark:text-emerald-400" /> : <Globe size={18} className="text-gray-500 dark:text-white/40" />}
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">
                  Темы включены Рґля всех пользователей
                </p>
                <p className="text-[11px] text-gray-500 dark:text-white/40">
                  {globalEnabled ? "Анимированные фоны отображаются на сайте" : "Фон выключен Рґля всех — чистый чёрный"}
                </p>
              </div>
            </div>
            <button
              onClick={toggleGlobal}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                globalEnabled ? "bg-emerald-500" : "bg-gray-100 dark:bg-white/20"
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  globalEnabled ? "translate-x-6" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Сетка тем */}
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {themes.map(t => (
            <ThemeCard
              key={String(t.id)}
              theme={t}
              onEdit={() => openEdit(t)}
              onDelete={() => deleteTheme(t)}
              onPreview={() => applyPreview(t)}
              onSetDefault={() => setAsDefault(t)}
              isCurrent={previewTheme?.id === t.id}
            />
          ))}
        </div>
      </main>

      {/* Модалка редактора */}
      {showEditor && editingTheme && (
        <ThemeEditor
          theme={editingTheme}
          onChange={setEditingTheme}
          onSave={saveTheme}
          onClose={() => { setShowEditor(false); setEditingTheme(null); }}
        />
      )}
    </div>
  );
}

// ============ КАРТОЧКА ТЕМЫ ============
function ThemeCard({
  theme, onEdit, onDelete, onPreview, onSetDefault, isCurrent,
}: {
  theme: ThemeConfig;
  onEdit: () => void;
  onDelete: () => void;
  onPreview: () => void;
  onSetDefault: () => void;
  isCurrent: boolean;
}) {
  return (
    <div className={`rounded-2xl overflow-hidden border transition-all ${
      isCurrent ? "border-[#8b5cf6] ring-2 ring-[#8b5cf6]/50" : "border-line dark:border-white/10"
    } bg-ivory dark:bg-[#1f1f23]`}>
      {/* Превью */}
      <div className="relative h-40 overflow-hidden group">
        <ThemePreview theme={theme} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-3 gap-2">
          <button
            onClick={onPreview}
            className="p-2 rounded-lg bg-white/20 backdrop-blur text-gray-900 dark:text-white hover:bg-white/30 transition-all"
            title="Применить ко всему сайту"
          >
            <Eye size={16} />
          </button>
          <button
            onClick={onEdit}
            className="p-2 rounded-lg bg-white/20 backdrop-blur text-gray-900 dark:text-white hover:bg-white/30 transition-all"
            title="Редактировать"
          >
            <Edit3 size={16} />
          </button>
          <button
            onClick={onDelete}
            className="p-2 rounded-lg bg-red-500/30 backdrop-blur text-white hover:bg-red-500/50 transition-all"
            title="РЈРґалить"
          >
            <Trash2 size={16} />
          </button>
        </div>
        {theme.is_default && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-emerald-500 text-white text-[10px] font-black uppercase flex items-center gap-1">
            <Check size={10} /> Дефолтная
          </div>
        )}
        {isCurrent && (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-[#8b5cf6] text-white text-[10px] font-black uppercase">
            Активна
          </div>
        )}
      </div>

      {/* Инфо */}
      <div className="p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="font-bold text-gray-900 dark:text-white truncate">{theme.name || "Без названия"}</h3>
          <span className="text-[10px] uppercase font-black px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-white/60 shrink-0">
            {theme.type}
          </span>
        </div>

        <div className="flex items-center gap-1 mb-3">
          {theme.colors.map((c, i) => (
            <div
              key={i}
              className="w-5 h-5 rounded-full border border-line dark:border-white/20"
              style={{ background: c }}
              title={c}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-1 text-[10px] text-gray-500 dark:text-white/40 mb-3">
          <div className="flex flex-col items-center p-1 rounded bg-gray-100 dark:bg-white/5">
            <Zap size={10} />
            <span>{theme.speed}s</span>
          </div>
          <div className="flex flex-col items-center p-1 rounded bg-gray-100 dark:bg-white/5">
            <Sparkles size={10} />
            <span>{Math.round(theme.intensity * 100)}%</span>
          </div>
          <div className="flex flex-col items-center p-1 rounded bg-gray-100 dark:bg-white/5">
            <Eye size={10} />
            <span>{theme.blur}px</span>
          </div>
        </div>

        <button
          onClick={onSetDefault}
          disabled={theme.is_default}
          className={`w-full py-2 rounded-lg text-xs font-bold transition-all ${
            theme.is_default
              ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 cursor-default"
              : "bg-gray-100 dark:bg-white/5 text-white/70 hover:bg-[#8b5cf6]/20 hover:text-[#8b5cf6]"
          }`}
        >
          {theme.is_default ? "✓ По умолчанию" : "РЎРґелать по умолчанию"}
        </button>
      </div>
    </div>
  );
}

// ============ ПРЕВЬЮ ТЕМЫ (мини-рендер) ============
function ThemePreview({ theme }: { theme: ThemeConfig }) {
  const c1 = theme.colors[0] || "#8b5cf6";
  const c2 = theme.colors[1] || "#6366f1";
  const c3 = theme.colors[2] || "#0ea5e9";
  const c4 = theme.colors[3] || c1;

  const style = {
    "--theme-speed": `${Math.max(theme.speed / 4, 2)}s`, // ускоренно Рґля превью
    "--theme-intensity": String(theme.intensity),
    "--theme-blur": `${Math.max(theme.blur / 4, 10)}px`,
    "--c1": c1, "--c2": c2, "--c3": c3, "--c4": c4,
  } as React.CSSProperties;

  return (
    <div className={`animated-bg type-${theme.type} !relative !static inset-auto`} style={style}>
      {theme.type === "aurora" && (
        <>
          <div className="blob blob-1" style={{ background: `radial-gradient(circle at center, ${c1} 0%, transparent 70%)` }} />
          <div className="blob blob-2" style={{ background: `radial-gradient(circle at center, ${c2} 0%, transparent 70%)` }} />
          <div className="blob blob-3" style={{ background: `radial-gradient(circle at center, ${c3} 0%, transparent 70%)` }} />
        </>
      )}
      {theme.type === "liquid" && (
        <>
          <div className="wave wave-1" style={{ background: `radial-gradient(ellipse at center, ${c1} 0%, transparent 65%)` }} />
          <div className="wave wave-2" style={{ background: `radial-gradient(ellipse at center, ${c2} 0%, transparent 65%)` }} />
        </>
      )}
      {theme.type === "neon" && (
        <>
          <div className="neon-spot neon-1" style={{ background: c1 }} />
          <div className="neon-spot neon-2" style={{ background: c2 }} />
          <div className="neon-spot neon-3" style={{ background: c3 }} />
        </>
      )}
    </div>
  );
}

// ============ РЕДАКТОР ТЕМЫ ============
function ThemeEditor({
  theme, onChange, onSave, onClose,
}: {
  theme: ThemeConfig;
  onChange: (t: ThemeConfig) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const ANIMATION_TYPES: { value: ThemeAnimationType; label: string; icon: any; desc: string }[] = [
    { value: "aurora", label: "Аврора", icon: Sparkles, desc: "Плавающие размытые пятна" },
    { value: "gradient", label: "Перелив", icon: Palette, desc: "Поток перетекающих цветов" },
    { value: "liquid", label: "Жидкость", icon: Zap, desc: "Вращающиеся формы" },
    { value: "neon", label: "Неон", icon: Sparkles, desc: "Пульсирующие пятна" },
  ];

  function updateColor(i: number, v: string) {
    const next = [...theme.colors];
    next[i] = v;
    onChange({ ...theme, colors: next });
  }

  function addColor() {
    if (theme.colors.length >= 4) return;
    onChange({ ...theme, colors: [...theme.colors, "#ffffff"] });
  }

  function removeColor(i: number) {
    if (theme.colors.length <= 2) return;
    onChange({ ...theme, colors: theme.colors.filter((_, j) => j !== i) });
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[300]" onClick={onClose} />
      <div className="fixed inset-0 z-[301] flex items-center justify-center p-4 pointer-events-none">
        <div className="w-full max-w-2xl bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-2xl shadow-2xl pointer-events-auto max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-ivory dark:bg-[#1f1f23] p-4 border-b border-line dark:border-white/10 flex items-center justify-between z-10">
            <h2 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
              <Palette size={20} className="text-[#8b5cf6]" />
              Редактор темы
            </h2>
            <button onClick={onClose} className="p-2 text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-white/10">
              <X size={18} />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* Живое превью */}
            <div className="rounded-xl overflow-hidden border border-line dark:border-white/10 h-40 relative">
              <ThemePreview theme={theme} />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="text-gray-800 dark:text-white/80 font-bold text-lg drop-shadow-lg">
                  {theme.name || "Предпросмотр"}
                </p>
              </div>
            </div>

            {/* Название */}
            <div>
              <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-1.5">Название</label>
              <input
                value={theme.name}
                onChange={(e) => onChange({ ...theme, name: e.target.value })}
                placeholder="Например: Северное сияние"
                className="w-full px-3 py-2 rounded-lg border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-[#8b5cf6]"
              />
            </div>

            {/* Тип анимации */}
            <div>
              <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-1.5">Тип анимации</label>
              <div className="grid grid-cols-2 gap-2">
                {ANIMATION_TYPES.map(t => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.value}
                      onClick={() => onChange({ ...theme, type: t.value })}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        theme.type === t.value
                          ? "border-[#8b5cf6] bg-[#8b5cf6]/10"
                          : "border-line dark:border-white/15 hover:bg-gray-100 dark:hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon size={14} className="text-[#8b5cf6]" />
                        <span className="text-sm font-bold text-gray-900 dark:text-white">{t.label}</span>
                      </div>
                      <p className="text-[10px] text-gray-600 dark:text-white/50">{t.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Цвета */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-gray-600 dark:text-white/60">
                  Цвета ({theme.colors.length}/4)
                </label>
                {theme.colors.length < 4 && (
                  <button
                    onClick={addColor}
                    className="text-[11px] text-[#8b5cf6] font-bold hover:underline"
                  >
                    + Добавить
                  </button>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {theme.colors.map((c, i) => (
                  <div key={i} className="relative group">
                    <input
                      type="color"
                      value={c}
                      onChange={(e) => updateColor(i, e.target.value)}
                      className="w-full h-12 rounded-lg cursor-pointer border border-line dark:border-white/20 bg-transparent"
                    />
                    <div className="text-[10px] text-gray-500 dark:text-white/40 text-center mt-0.5 font-mono">
                      {c}
                    </div>
                    {theme.colors.length > 2 && (
                      <button
                        onClick={() => removeColor(i)}
                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Слайдеры */}
            <SliderRow
              label="Скорость анимации"
              value={theme.speed}
              min={4} max={60} step={1}
              unit="с"
              hint="Меньше = быстрее"
              onChange={(v) => onChange({ ...theme, speed: v })}
            />

            <SliderRow
              label="Яркость"
              value={theme.intensity}
              min={0.05} max={0.5} step={0.01}
              unit=""
              hint={`${Math.round(theme.intensity * 100)}%`}
              onChange={(v) => onChange({ ...theme, intensity: v })}
              format={(v) => Math.round(v * 100) + "%"}
            />

            <SliderRow
              label="Размытие"
              value={theme.blur}
              min={0} max={150} step={5}
              unit="px"
              hint="Больше = мягче"
              onChange={(v) => onChange({ ...theme, blur: v })}
            />

            {/* Уровень Рґоступа (на будущее) */}
            <div className="p-3 rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 flex items-center gap-3">
              <Lock size={16} className="text-gray-500 dark:text-white/40" />
              <div className="flex-1">
                <p className="text-xs font-bold text-gray-800 dark:text-white/80">Уровень Рґоступа</p>
                <p className="text-[10px] text-gray-500 dark:text-white/40">
                  Для всех = 0, Спонсоры = 3, Админы = 9
                </p>
              </div>
              <input
                type="number"
                min={0} max={10}
                value={(theme as any).min_level ?? 0}
                onChange={(e) => onChange({ ...theme, min_level: Number(e.target.value) } as any)}
                className="w-16 px-2 py-1 rounded border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm text-center focus:outline-none focus:border-[#8b5cf6]"
              />
            </div>
          </div>

          <div className="sticky bottom-0 bg-ivory dark:bg-[#1f1f23] p-4 border-t border-line dark:border-white/10 flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-line dark:border-white/15 text-gray-800 dark:text-white/80 font-bold hover:bg-gray-100 dark:hover:bg-white/5"
            >
              Отмена
            </button>
            <button
              onClick={onSave}
              className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold hover:shadow-lg hover:shadow-purple-500/30"
            >
              Сохранить
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ============ УНРВ?ВЕРСАЛЬНЫЙ СЛАЙДЕР ============
function SliderRow({
  label, value, min, max, step, unit, hint, onChange, format,
}: {
  label: string;
  value: number;
  min: number; max: number; step: number;
  unit: string; hint: string;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-bold text-gray-600 dark:text-white/60">{label}</label>
        <span className="text-xs text-[#8b5cf6] font-mono">
          {format ? format(value) : `${value}${unit}`}
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#8b5cf6]"
      />
      <p className="text-[10px] text-gray-500 dark:text-white/30 mt-0.5">{hint}</p>
    </div>
  );
}