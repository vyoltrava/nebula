"use client";
import { useEffect, useState, useRef } from "react";
import { getToken } from "@/lib/auth";
import { STICKERS } from "@/lib/stickers";
import { UserSearchField } from "@/components/UserSearchField";
import { 
  SmilePlus, Plus, Edit3, Trash2, X, Globe, Lock, Loader2, 
  FolderOpen, Upload, Image as ImageIcon, Sparkles, Palette 
} from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";


const CATEGORIES = [
  { key: "emotions", label: "Эмоции", range: [0, 25] },
  { key: "gestures", label: "Жесты", range: [25, 41] },
  { key: "animals", label: "Животные", range: [41, 65] },
  { key: "food", label: "Еда", range: [65, 89] },
  { key: "objects", label: "Объекты", range: [89, 131] },
  { key: "nature", label: "Природа", range: [131, 156] },
  { key: "transport", label: "Транспорт", range: [156, 176] },
  { key: "activities", label: "Активности", range: [176, 214] },
  { key: "symbols", label: "Символы", range: [214, 264] },
  { key: "flags", label: "Флаги", range: [264, 292] },
];

export function StickersSection({ me, roles }: { me: any; roles: any[] }) {
  const [activeTab, setActiveTab] = useState<"stickers" | "badges">("stickers");
  
  // === СТИКЕРЫ ===
  const [packs, setPacks] = useState<any[]>([]);
  const [showEditor, setShowEditor] = useState(false);
  const [editingPack, setEditingPack] = useState<any>(null);
  const [uploadingPackId, setUploadingPackId] = useState<number | null>(null);
  const [emojiInputs, setEmojiInputs] = useState<Record<number, string>>({});
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const folderRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [selectedEmojis, setSelectedEmojis] = useState<string[]>([]);
  const [emojiSearch, setEmojiSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("emotions");
  const [savingPack, setSavingPack] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingFileUrls, setPendingFileUrls] = useState<string[]>([]);
  const modalFileRef = useRef<HTMLInputElement | null>(null);
  const modalFolderRef = useRef<HTMLInputElement | null>(null);

  // === ЗНАЧКИ (BADGES) ===
  const [badges, setBadges] = useState<any[]>([]);
  const [showBadgeEditor, setShowBadgeEditor] = useState(false);
  const [editingBadge, setEditingBadge] = useState<any>(null);
  const [badgeFile, setBadgeFile] = useState<File | null>(null);
  const [badgeFileUrl, setBadgeFileUrl] = useState<string>("");
  const [savingBadge, setSavingBadge] = useState(false);
  const badgeFileRef = useRef<HTMLInputElement | null>(null);
    // === СТОКОВЫЕ ЗНАЧКИ ===
  const [showStockUploader, setShowStockUploader] = useState(false);
  const [stockFiles, setStockFiles] = useState<File[]>([]);
  const [stockBadgeName, setStockBadgeName] = useState("");
  const [stockBadgeColor, setStockBadgeColor] = useState("#8b5cf6");
  const [stockBadgeEffect, setStockBadgeEffect] = useState("none");
  const [stockMinLevel, setStockMinLevel] = useState(1);
  const [uploadingStock, setUploadingStock] = useState(false);

  async function loadData() {
    const token = getToken();
    const [packsRes, badgesRes] = await Promise.all([
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/sticker-packs`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/badges`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (packsRes.ok) setPacks(await packsRes.json());
    if (badgesRes.ok) setBadges(await badgesRes.json());
  }

  async function uploadStockBadges() {
    if (!stockBadgeName.trim()) return alert("Введи название пака");
    if (stockFiles.length === 0) return alert("Выбери файлы");
    
    const token = getToken();
    const form = new FormData();
    form.append("name", stockBadgeName);
    form.append("glow_color", stockBadgeColor);
    form.append("effect_type", stockBadgeEffect);
    form.append("min_level", String(stockMinLevel));
    form.append("is_selectable", "true");
    
    stockFiles.forEach(file => form.append("files", file));
    
    setUploadingStock(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/stock-badges`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      
      if (res.ok) {
        setShowStockUploader(false);
        setStockFiles([]);
        setStockBadgeName("");
        loadData(); // Перезагрузить бейджи
      } else {
        const err = await res.json().catch(() => null);
        alert(err?.detail || "Ошибка загрузки");
      }
    } catch (e) {
      alert("Ошибка сети");
    } finally {
      setUploadingStock(false);
    }
  }


  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    return () => { pendingFileUrls.forEach(url => URL.revokeObjectURL(url)); };
  }, [pendingFileUrls]);

  function handleFilesSelected(files: FileList | null) {
    if (!files) return;
    const imageFiles = Array.from(files).filter(f => f.type.startsWith("image/"));
    setPendingFiles(prev => [...prev, ...imageFiles].slice(0, 200));
    const urls = imageFiles.map(f => URL.createObjectURL(f));
    setPendingFileUrls(prev => [...prev, ...urls]);
  }

  function removePendingFile(index: number) {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
    URL.revokeObjectURL(pendingFileUrls[index]);
    setPendingFileUrls(prev => prev.filter((_, i) => i !== index));
  }

  async function savePack() {
    if (!editingPack || !editingPack.name?.trim()) return alert("Введи название пака");
    const token = getToken();
    const form = new FormData();
    form.append("name", editingPack.name);
    form.append("min_level", String(editingPack.min_level));
    form.append("is_active", String(editingPack.is_active ?? true));
    form.append("emojis", JSON.stringify(selectedEmojis));
    pendingFiles.forEach(file => form.append("files", file));
    
    const url = editingPack.id
      ? `${process.env.NEXT_PUBLIC_API_URL}/api/admin/sticker-packs/${editingPack.id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/api/admin/sticker-packs`;
    
    setSavingPack(true);
    try {
      const res = await fetch(url, {
        method: editingPack.id ? "PUT" : "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.ok) {
        setShowEditor(false); setEditingPack(null); setSelectedEmojis([]);
        setPendingFiles([]); setPendingFileUrls([]);
        loadData();
      } else {
        const err = await res.json().catch(() => null);
        alert(err?.detail || "Ошибка сохранения");
      }
    } catch (e) {
      alert("Ошибка сети: " + (e as Error).message);
    } finally {
      setSavingPack(false);
    }
  }

  async function deletePack(id: number) {
    if (!confirm("Удалить пак со всеми стикерами?")) return;
    const token = getToken();
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/sticker-packs/${id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    loadData();
  }

  async function toggleActive(pack: any) {
    const token = getToken();
    const form = new FormData();
    form.append("name", pack.name);
    form.append("min_level", String(pack.min_level));
    form.append("is_active", String(!pack.is_active));
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/sticker-packs/${pack.id}`, {
      method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: form,
    });
    loadData();
  }

  async function uploadImages(packId: number, files: FileList | null) {
    if (!files || files.length === 0) return;
    const imageFiles = Array.from(files).filter(f => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return alert("Выбранные файлы не являются изображениями");
    
    const token = getToken();
    setUploadingPackId(packId);
    const form = new FormData();
    imageFiles.forEach(f => form.append("files", f));
    form.append("emojis", "[]");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/sticker-packs/${packId}/stickers`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
      });
      if (res.ok) loadData();
      else alert("Ошибка загрузки");
    } finally {
      setUploadingPackId(null);
      if (fileRefs.current[packId]) fileRefs.current[packId]!.value = "";
      if (folderRefs.current[packId]) folderRefs.current[packId]!.value = "";
    }
  }

  async function addEmoji(packId: number) {
    const val = (emojiInputs[packId] || "").trim();
    if (!val) return;
    const token = getToken();
    const form = new FormData();
    form.append("emojis", JSON.stringify(val.split(/\s+/)));
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/sticker-packs/${packId}/stickers`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
    });
    if (res.ok) { setEmojiInputs((prev) => ({ ...prev, [packId]: "" })); loadData(); }
  }

  async function deleteSticker(stickerId: number) {
    if (!confirm("Удалить стикер?")) return;
    const token = getToken();
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/stickers/${stickerId}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    loadData();
  }

  // === ФУНКЦИИ ДЛЯ ЗНАЧКОВ ===
  function handleBadgeFileSelect(file: File | null) {
    if (!file) return;
    setBadgeFile(file);
    setBadgeFileUrl(URL.createObjectURL(file));
  }

   async function saveBadge() {
    if (!editingBadge || !editingBadge.name?.trim()) return alert("Введи название значка");
    if (!badgeFile && !editingBadge.id) return alert("Загрузи картинку для значка");
    
    const token = getToken();
    const form = new FormData();
    form.append("name", editingBadge.name);
    form.append("glow_color", editingBadge.glow_color || "");
    form.append("effect_type", editingBadge.effect_type || "none");
    form.append("role_id", editingBadge.role_id ? String(editingBadge.role_id) : "");
    form.append("user_id", editingBadge.user_id ? String(editingBadge.user_id) : "");
    form.append("is_selectable", String(editingBadge.is_selectable || false));
    form.append("enable_ring", String(editingBadge.enable_ring ?? true));
    form.append("enable_glow", String(editingBadge.enable_glow ?? true));
    if (badgeFile) form.append("file", badgeFile);
    
    setSavingBadge(true);
    try {
      // 🆕 Если редактируем - используем PUT, если создаем - POST
      const url = editingBadge.id
        ? `${process.env.NEXT_PUBLIC_API_URL}/api/badges/${editingBadge.id}`
        : `${process.env.NEXT_PUBLIC_API_URL}/api/badges`;
      
      const res = await fetch(url, {
        method: editingBadge.id ? "PUT" : "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.ok) {
        setShowBadgeEditor(false);
        setEditingBadge(null);
        setBadgeFile(null);
        setBadgeFileUrl("");
        loadData();
      } else {
        const err = await res.json().catch(() => null);
        alert(err?.detail || "Ошибка сохранения");
      }
    } catch (e) {
      alert("Ошибка сети");
    } finally {
      setSavingBadge(false);
    }
  }

  async function deleteBadge(id: number) {
    if (!confirm("Удалить этот значок?")) return;
    const token = getToken();
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/badges/${id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    loadData(); // 🆕 Обновляем список значков после удаления
  }

  const filteredStickers = emojiSearch.trim()
    ? STICKERS.filter((s) => s.emoji.includes(emojiSearch) || s.label.toLowerCase().includes(emojiSearch.toLowerCase()) || s.code.toLowerCase().includes(emojiSearch.toLowerCase()))
    : STICKERS.slice(CATEGORIES.find((c) => c.key === activeCategory)?.range[0] || 0, CATEGORIES.find((c) => c.key === activeCategory)?.range[1] || STICKERS.length);

  function toggleEmoji(emoji: string) {
    setSelectedEmojis((prev) => (prev.includes(emoji) ? prev.filter((e) => e !== emoji) : [...prev, emoji]));
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* ПЕРЕКЛЮЧАТЕЛЬ ВКЛАДОК */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-white/10 pb-2">
        <button 
          onClick={() => setActiveTab("stickers")} 
          className={`px-4 py-2 rounded-t-lg font-bold text-sm transition-colors ${activeTab === "stickers" ? "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-b-2 border-yellow-600 dark:border-yellow-400" : "text-gray-600 dark:text-white/50 hover:text-gray-900 dark:text-white"}`}
        >
          😂 Стикеры и Эмодзи
        </button>
        <button 
          onClick={() => setActiveTab("badges")} 
          className={`px-4 py-2 rounded-t-lg font-bold text-sm transition-colors flex items-center gap-1.5 ${activeTab === "badges" ? "bg-purple-500/20 text-purple-600 dark:text-purple-400 border-b-2 border-purple-600 dark:border-purple-400" : "text-white/50 hover:text-white"}`}
        >
          <Sparkles size={14} /> Значки (Badges)
        </button>
      </div>

      {/* ==================== ВКЛАДКА СТИКЕРОВ ==================== */}
      {activeTab === "stickers" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => {
              setEditingPack({ id: null, name: "", min_level: 1, is_active: true });
              setSelectedEmojis([]); setPendingFiles([]); setPendingFileUrls([]);
              setShowEditor(true);
            }} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-500 text-black text-sm font-bold hover:bg-yellow-600 dark:hover:bg-yellow-400">
              <Plus size={16} /> Новый пак
            </button>
          </div>

          {packs.map((pack) => (
            <div key={pack.id} className={`border rounded-2xl p-4 ${pack.is_active ? "border-gray-200 dark:border-white/15 bg-gray-100 dark:bg-white/5" : "border-gray-200 dark:border-white/5 bg-white/[0.02] opacity-60"}`}>
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-gray-900 dark:text-white">{pack.name}</h3>
                  <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${pack.min_level <= 1 ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400"}`}>
                    {pack.min_level <= 1 ? <Globe size={10} /> : <Lock size={10} />}
                    {pack.min_level <= 1 ? "Все" : `Lvl ${pack.min_level}+`}
                  </span>
                  <span className="text-[10px] text-gray-500 dark:text-white/30">{pack.stickers?.length || 0} стикеров</span>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => toggleActive(pack)} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border ${pack.is_active ? "border-green-400/30 text-green-600 dark:text-green-400" : "border-gray-200 dark:border-white/15 text-gray-500 dark:text-white/40"}`}>
                    {pack.is_active ? "Активен" : "Выключен"}
                  </button>
                  <IconButton icon={Edit3} size="iconSm" onClick={() => { setEditingPack({ ...pack }); setSelectedEmojis([]); setPendingFiles([]); setPendingFileUrls([]); setShowEditor(true); }} />
                  <IconButton icon={Trash2} variant="danger" size="iconSm" onClick={() => deletePack(pack.id)} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {pack.stickers?.map((s: any) => (
                  <div key={s.id} className="relative group">
                    <div className="w-14 h-14 flex items-center justify-center bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl">
                      {s.type === "emoji" ? <span className="text-2xl">{s.content}</span> : <img src={s.content} alt="" className="w-full h-full object-contain p-1" />}
                    </div>
                    <button onClick={() => deleteSticker(s.id)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                  </div>
                ))}
                {(!pack.stickers || pack.stickers.length === 0) && <p className="text-[11px] text-gray-500 dark:text-white/30">Пак пуст — добавь стикеры ниже ↓</p>}
              </div>
              <div className="flex flex-col sm:flex-row gap-2 pt-3 border-t border-gray-200 dark:border-white/10">
                <input ref={(el) => { fileRefs.current[pack.id] = el; }} type="file" accept="image/*" multiple className="hidden" onChange={(e) => uploadImages(pack.id, e.target.files)} />
                <input ref={(el) => { folderRefs.current[pack.id] = el; }} type="file" accept="image/*" multiple {...({ webkitdirectory: "", directory: "" } as any)} className="hidden" onChange={(e) => uploadImages(pack.id, e.target.files)} />
                <button onClick={() => fileRefs.current[pack.id]?.click()} disabled={uploadingPackId === pack.id} className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/15 text-gray-800 dark:text-white/70 text-xs font-bold hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-50">
                  {uploadingPackId === pack.id ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Файлы
                </button>
                <button onClick={() => folderRefs.current[pack.id]?.click()} disabled={uploadingPackId === pack.id} className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-600 dark:text-purple-300 text-xs font-bold hover:bg-purple-500/30 disabled:opacity-50">
                  <FolderOpen size={14} /> Папку
                </button>
                <div className="flex-1 flex gap-2">
                  <input value={emojiInputs[pack.id] || ""} onChange={(e) => setEmojiInputs((prev) => ({ ...prev, [pack.id]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") addEmoji(pack.id); }} placeholder="Вставь эмодзи: 💀 🗿 🔥" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-xs placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:border-yellow-600 dark:focus:border-yellow-400" />
                  <button onClick={() => addEmoji(pack.id)} className="px-3 py-2 rounded-lg bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 text-xs font-bold hover:bg-yellow-500/30">+ Эмодзи</button>
                </div>
              </div>
            </div>
          ))}
          {packs.length === 0 && <p className="text-center text-gray-500 dark:text-white/40 py-16">Паков пока нет — создай первый!</p>}
        </div>
      )}

      {/* ==================== ВКЛАДКА ЗНАЧКОВ (BADGES) ==================== */}
      {activeTab === "badges" && (
        <div className="space-y-4">
          <div className="flex justify-end">
                        {/* 🆕 КНОПКА ЗАГРУЗКИ СТОКОВ */}
            <Button icon={Upload} onClick={() => setShowStockUploader(true)}>
              Загрузить стоковые
            </Button>
            <Button icon={Plus} onClick={() => {
              setEditingBadge({ id: null, name: "", glow_color: null, effect_type: "none", role_id: null, user_id: null, is_selectable: false, enable_ring: true, enable_glow: true });
              setBadgeFile(null); setBadgeFileUrl("");
              setShowBadgeEditor(true);
            }}>
              Новый значок
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {badges.map((badge) => (
              <div key={badge.id} className="border border-gray-200 dark:border-white/15 bg-gray-100 dark:bg-white/5 rounded-2xl p-4 flex gap-4">
                <div className="shrink-0 relative">
                  <div className="w-16 h-16 rounded-full bg-gray-50 dark:bg-[#171717] flex items-center justify-center border-2 border-[#222]" style={{ filter: `drop-shadow(0 0 8px ${badge.glow_color || '#8b5cf6'}99)` }}>
                    <img src={badge.icon_url} alt={badge.name} className="w-10 h-10 object-contain" />
                  </div>
                  {badge.effect_type === "gold" && <div className="absolute inset-0 rounded-full border-2 border-yellow-400/50 animate-pulse pointer-events-none" />}
                  {badge.effect_type === "pulse" && <div className="absolute inset-0 rounded-full border-2 border-gray-300 dark:border-white/50 animate-ping pointer-events-none" />}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <h3 className="font-bold text-gray-900 dark:text-white truncate">{badge.name}</h3>
                    <div className="flex gap-1">
                      <button onClick={() => { setEditingBadge({...badge}); setBadgeFile(null); setBadgeFileUrl(""); setShowBadgeEditor(true); }} className="p-1.5 rounded-lg text-gray-600 dark:text-white/50 hover:text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10"><Edit3 size={14} /></button>
                      <button onClick={() => deleteBadge(badge.id)} className="p-1.5 rounded-lg text-red-400/60 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  
                  <div className="mt-2 space-y-1.5 text-[11px] text-gray-600 dark:text-white/60">
                    <div className="flex items-center gap-2">
                      <Palette size={12} style={{ color: badge.glow_color || '#8b5cf6' }} />
                      <span>Цвет: <span className="text-gray-900 dark:text-white font-mono">{badge.glow_color || "Авто (из роли)"}</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Sparkles size={12} className="text-purple-600 dark:text-purple-400" />
                      <span>Эффект: <span className="text-gray-900 dark:text-white capitalize">{badge.effect_type === "none" ? "Нет" : badge.effect_type === "gold" ? "Золотое свечение" : "Пульсация"}</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Globe size={12} />
                      <span>
                        {badge.user_id ? `Выдан пользователю ID: ${badge.user_id}` : (badge.role_id ? `Авто-выдача для роли ID: ${badge.role_id}` : "Не привязан")}
                        {badge.is_selectable && <span className="ml-2 text-green-600 dark:text-green-400 font-bold">(Доступен для выбора)</span>}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {badges.length === 0 && <p className="col-span-full text-center text-gray-500 dark:text-white/40 py-16">Значков пока нет. Создай первый для роли или спонсоров!</p>}
          </div>
        </div>
      )}

      {/* ==================== МОДАЛКА РЕДАКТИРОВАНИЯ ПАКА ==================== */}
      {showEditor && editingPack && (
        <>
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[300]" onClick={() => !savingPack && setShowEditor(false)} />
          <div className="fixed inset-0 z-[301] flex items-center justify-center p-4 pointer-events-none overflow-y-auto">
            <div className="w-full max-w-2xl bg-white dark:bg-[#1f1f23] border border-gray-200 dark:border-white/15 rounded-2xl shadow-2xl p-5 pointer-events-auto my-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-black text-gray-900 dark:text-white text-lg">{editingPack.id ? "Редактировать пак" : "Новый пак"}</h2>
                <IconButton icon={X} size="iconSm" onClick={() => !savingPack && setShowEditor(false)} />
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-1.5">Название</label>
                    <input value={editingPack.name} onChange={(e) => setEditingPack({ ...editingPack, name: e.target.value })} placeholder="Например: Мемы, Вайб, VIP..." className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-yellow-600 dark:focus:border-yellow-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-1.5">Доступ</label>
                    <select value={editingPack.min_level} onChange={(e) => setEditingPack({ ...editingPack, min_level: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:border-yellow-600 dark:focus:border-yellow-400">
                      <option value={1} className="bg-gray-900">Все пользователи (lvl 1+)</option>
                      <option value={2} className="bg-gray-900">Эксклюзив (lvl 2+)</option>
                      <option value={3} className="bg-gray-900">Спонсоры (lvl 3+)</option>
                      <option value={9} className="bg-gray-900">Команда (lvl 9+)</option>
                    </select>
                  </div>
                </div>

                <div className="border border-gray-200 dark:border-white/10 rounded-xl p-3 bg-white/[0.02]">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-gray-600 dark:text-white/60 flex items-center gap-1.5">
                      <ImageIcon size={14} /> Картинки стикеров ({pendingFiles.length} выбрано)
                    </label>
                    {pendingFiles.length > 0 && (
                      <button onClick={() => { pendingFileUrls.forEach(u => URL.revokeObjectURL(u)); setPendingFiles([]); setPendingFileUrls([]); }} className="text-[10px] text-red-600 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300">Очистить</button>
                    )}
                  </div>
                  <input ref={modalFileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFilesSelected(e.target.files)} />
                  <input ref={modalFolderRef} type="file" accept="image/*" multiple {...({ webkitdirectory: "", directory: "" } as any)} className="hidden" onChange={(e) => handleFilesSelected(e.target.files)} />
                  <div className="flex gap-2 mb-3">
                    <button onClick={() => modalFileRef.current?.click()} className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/15 text-gray-800 dark:text-white/80 text-xs font-bold hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                      <Upload size={14} /> Выбрать файлы
                    </button>
                    <button onClick={() => modalFolderRef.current?.click()} className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-600 dark:text-purple-300 text-xs font-bold hover:bg-purple-500/30 transition-colors">
                      <FolderOpen size={14} /> Выбрать папку
                    </button>
                  </div>
                  {pendingFileUrls.length > 0 && (
                    <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 max-h-40 overflow-y-auto p-1 bg-black/20 rounded-lg">
                      {pendingFileUrls.map((url, i) => (
                        <div key={i} className="relative group aspect-square">
                          <img src={url} alt="" className="w-full h-full object-contain bg-gray-100 dark:bg-white/5 rounded-lg p-1" />
                          <button onClick={() => removePendingFile(i)} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                          <p className="absolute bottom-0 left-0 right-0 text-[8px] text-gray-600 dark:text-white/60 bg-black/60 px-1 truncate">{pendingFiles[i]?.name}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {pendingFiles.length === 0 && <p className="text-center text-gray-500 dark:text-white/30 text-xs py-4">Можно оставить пустым и добавить стикеры позже</p>}
                </div>

                <div className="border border-gray-200 dark:border-white/10 rounded-xl p-3 bg-white/[0.02]">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-gray-600 dark:text-white/60">Выбрать эмодзи ({selectedEmojis.length} выбрано)</label>
                    {selectedEmojis.length > 0 && <button onClick={() => setSelectedEmojis([])} className="text-[10px] text-red-600 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300">Сбросить</button>}
                  </div>
                  {selectedEmojis.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                      {selectedEmojis.map((emoji, i) => (
                        <button key={i} onClick={() => toggleEmoji(emoji)} className="w-8 h-8 flex items-center justify-center bg-gray-100 dark:bg-white/10 rounded-lg text-lg hover:bg-red-500/20 transition-colors">{emoji}</button>
                      ))}
                    </div>
                  )}
                  <div className="relative mb-2">
                    <input value={emojiSearch} onChange={(e) => setEmojiSearch(e.target.value)} placeholder="Поиск эмодзи..." className="w-full pl-3 pr-3 py-2 rounded-lg border border-gray-200 dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-xs placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:border-yellow-600 dark:focus:border-yellow-400" />
                  </div>
                  {!emojiSearch && (
                    <div className="flex gap-1 mb-2 overflow-x-auto scrollbar-hide pb-1">
                      {CATEGORIES.map((cat) => (
                        <button key={cat.key} onClick={() => setActiveCategory(cat.key)} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap shrink-0 ${activeCategory === cat.key ? "bg-yellow-500 text-black" : "bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/50 hover:bg-gray-100 dark:hover:bg-white/10"}`}>
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-8 sm:grid-cols-10 gap-1 max-h-48 overflow-y-auto p-1">
                    {filteredStickers.map((s) => {
                      const isSelected = selectedEmojis.includes(s.emoji);
                      return (
                        <button key={s.code} onClick={() => toggleEmoji(s.emoji)} title={s.label} className={`aspect-square flex items-center justify-center rounded-lg text-xl transition-all ${isSelected ? "bg-yellow-500/30 border-2 border-yellow-600 dark:border-yellow-400 scale-110" : "bg-gray-100 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 border border-transparent"}`}>
                          {s.emoji}
                        </button>
                      );
                    })}
                    {filteredStickers.length === 0 && <p className="col-span-full text-center text-gray-500 dark:text-white/30 text-xs py-4">Ничего не найдено</p>}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <Button variant="secondary" onClick={() => !savingPack && setShowEditor(false)} disabled={savingPack} className="flex-1">Отмена</Button>
                <Button loading={savingPack} onClick={savePack} disabled={savingPack || !editingPack.name?.trim()} className="flex-1">
                  {savingPack ? "" : (editingPack.id ? "Сохранить" : "Создать пак")}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ==================== МОДАЛКА РЕДАКТИРОВАНИЯ ЗНАЧКА ==================== */}
      {showBadgeEditor && editingBadge && (
        <>
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[300]" onClick={() => !savingBadge && setShowBadgeEditor(false)} />
          <div className="fixed inset-0 z-[301] flex items-center justify-center p-4 pointer-events-none overflow-y-auto">
            <div className="w-full max-w-md bg-white dark:bg-[#1f1f23] border border-gray-200 dark:border-white/15 rounded-2xl shadow-2xl p-5 pointer-events-auto my-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-black text-gray-900 dark:text-white text-lg">{editingBadge.id ? "Редактировать значок" : "Новый значок"}</h2>
                <IconButton icon={X} size="iconSm" onClick={() => !savingBadge && setShowBadgeEditor(false)} />
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-1.5">Название</label>
                  <input value={editingBadge.name} onChange={(e) => setEditingBadge({ ...editingBadge, name: e.target.value })} placeholder="Например: Manager, VIP Gold..." className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-purple-600 dark:focus:border-purple-400" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-1.5">Иконка значка</label>
                  <input ref={badgeFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleBadgeFileSelect(e.target.files?.[0] || null)} />
                  <div className="flex gap-2">
                    <button onClick={() => badgeFileRef.current?.click()} className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/15 text-gray-800 dark:text-white/80 text-xs font-bold hover:bg-gray-100 dark:hover:bg-white/10">
                      <Upload size={14} /> {badgeFile ? "Заменить" : "Выбрать файл"}
                    </button>
                    {/* Показываем текущую иконку при редактировании */}
                    {(badgeFileUrl || editingBadge.icon_url) && (
                      <div className="w-12 h-12 rounded-lg bg-gray-50 dark:bg-[#171717] border border-gray-200 dark:border-white/10 flex items-center justify-center overflow-hidden">
                        <img src={badgeFileUrl || editingBadge.icon_url} alt="Preview" className="w-8 h-8 object-contain" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-gray-200 dark:border-white/10 pt-3 space-y-3">
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={editingBadge.enable_ring ?? true} onChange={(e) => setEditingBadge({ ...editingBadge, enable_ring: e.target.checked })} className="w-4 h-4 rounded border-gray-200 dark:border-white/20 bg-gray-100 dark:bg-white/5 text-purple-500 focus:ring-purple-500" />
                      <span className="text-xs text-gray-800 dark:text-white/70">Включить вращающееся кольцо</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={editingBadge.enable_glow ?? true} onChange={(e) => setEditingBadge({ ...editingBadge, enable_glow: e.target.checked })} className="w-4 h-4 rounded border-gray-200 dark:border-white/20 bg-gray-100 dark:bg-white/5 text-purple-500 focus:ring-purple-500" />
                      <span className="text-xs text-gray-800 dark:text-white/70">Включить пульсацию свечения</span>
                    </label>
                  </div>

                  <div className="flex items-center gap-2 p-2 rounded-lg bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10">
                    <input type="checkbox" checked={!editingBadge.glow_color} onChange={(e) => setEditingBadge({ ...editingBadge, glow_color: e.target.checked ? null : "#8b5cf6" })} className="w-4 h-4 rounded border-gray-200 dark:border-white/20 bg-gray-100 dark:bg-white/5 text-purple-500 focus:ring-purple-500" />
                    <span className="text-xs text-gray-800 dark:text-white/70">Использовать цвет роли автоматически</span>
                  </div>

                  {!editingBadge.glow_color && (
                    <p className="text-[10px] text-gray-500 dark:text-white/40 px-2">💡 Цвет будет взят из роли пользователя</p>
                  )}

                  {editingBadge.glow_color && (
                    <div>
                      <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-1.5">Свой цвет свечения</label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={editingBadge.glow_color} onChange={(e) => setEditingBadge({ ...editingBadge, glow_color: e.target.value })} className="w-8 h-8 rounded cursor-pointer bg-transparent border-0" />
                        <span className="text-xs text-gray-600 dark:text-white/50 font-mono">{editingBadge.glow_color}</span>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-1.5">Способ выдачи</label>
                    <div className="flex gap-2 mb-2">
                      <button onClick={() => setEditingBadge({ ...editingBadge, user_id: null })} className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${!editingBadge.user_id ? "bg-purple-500/20 border-purple-500 text-purple-600 dark:text-purple-300" : "bg-gray-100 dark:bg-white/5 border-gray-200 dark:border-white/10 text-white/50"}`}>
                        По роли
                      </button>
                      <button onClick={() => setEditingBadge({ ...editingBadge, role_id: null, user_id: 0 })} className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${editingBadge.user_id !== null && editingBadge.user_id !== undefined ? "bg-purple-500/20 border-purple-500 text-purple-600 dark:text-purple-300" : "bg-gray-100 dark:bg-white/5 border-gray-200 dark:border-white/10 text-white/50"}`}>
                        По пользователю
                      </button>
                    </div>

                    {!editingBadge.user_id && editingBadge.user_id !== 0 && (
                      <select value={editingBadge.role_id || ""} onChange={(e) => setEditingBadge({ ...editingBadge, role_id: e.target.value ? Number(e.target.value) : null })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-xs focus:outline-none focus:border-purple-600 dark:focus:border-purple-400">
                        <option value="">Не привязывать (выдавать вручную)</option>
                        {roles.map((r: any) => (
                          <option key={r.id} value={r.id} className="bg-gray-900">{r.name} (ID: {r.id})</option>
                        ))}
                      </select>
                    )}

                    {editingBadge.user_id !== null && editingBadge.user_id !== undefined && (
                      <UserSearchField
                        selectedUserId={editingBadge.user_id || null}
                        onSelect={(userId) => setEditingBadge({ ...editingBadge, user_id: userId })}
                        onClear={() => setEditingBadge({ ...editingBadge, user_id: null })}
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-1.5">Эффект</label>
                    <select value={editingBadge.effect_type || "none"} onChange={(e) => setEditingBadge({ ...editingBadge, effect_type: e.target.value })} className="w-full px-2 py-2 rounded-lg border border-gray-200 dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-xs focus:outline-none focus:border-purple-600 dark:focus:border-purple-400">
                      <option value="none" className="bg-gray-900">Без эффекта</option>
                      <option value="gold" className="bg-gray-900">🥇 Золотое свечение</option>
                      <option value="pulse" className="bg-gray-900">💫 Пульсация</option>
                    </select>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer pt-2 border-t border-gray-200 dark:border-white/10">
                    <input type="checkbox" checked={editingBadge.is_selectable || false} onChange={(e) => setEditingBadge({ ...editingBadge, is_selectable: e.target.checked })} className="w-4 h-4 rounded border-gray-200 dark:border-white/20 bg-gray-100 dark:bg-white/5 text-purple-500 focus:ring-purple-500" />
                    <span className="text-xs text-gray-800 dark:text-white/70">Разрешить пользователям выбирать этот значок самостоятельно</span>
                  </label>
                </div>
              </div>

              <div className="flex gap-2 mt-5">
                <Button variant="secondary" onClick={() => !savingBadge && setShowBadgeEditor(false)} disabled={savingBadge} className="flex-1">Отмена</Button>
                <Button loading={savingBadge} onClick={saveBadge} disabled={savingBadge || !editingBadge.name?.trim() || (!editingBadge.id && !badgeFile)} className="flex-1">
                  {savingBadge ? "" : (editingBadge.id ? "Сохранить" : "Создать значок")}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ====================  ЗАГРУЗКА СТОКОВЫХ ЗНАЧКОВ ==================== */}
      {showStockUploader && (
        <>
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[300]" onClick={() => !uploadingStock && setShowStockUploader(false)} />
          <div className="fixed inset-0 z-[301] flex items-center justify-center p-4 pointer-events-none overflow-y-auto">
            <div className="w-full max-w-md bg-white dark:bg-[#1f1f23] border border-gray-200 dark:border-white/15 rounded-2xl shadow-2xl p-5 pointer-events-auto my-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-black text-gray-900 dark:text-white text-lg">Загрузить стоковые значки</h2>
                <IconButton icon={X} size="iconSm" onClick={() => !uploadingStock && setShowStockUploader(false)} />
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-1.5">Название пака</label>
                  <input value={stockBadgeName} onChange={(e) => setStockBadgeName(e.target.value)} placeholder="Например: Premium, VIP, Спонсор..." className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-purple-600 dark:focus:border-purple-400" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-1.5">Цвет свечения</label>
                    <input type="color" value={stockBadgeColor} onChange={(e) => setStockBadgeColor(e.target.value)} className="w-full h-10 rounded-lg cursor-pointer" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-1.5">Эффект</label>
                    <select value={stockBadgeEffect} onChange={(e) => setStockBadgeEffect(e.target.value)} className="w-full px-2 py-2 rounded-lg border border-gray-200 dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-xs">
                      <option value="none">Без эффекта</option>
                      <option value="gold">🥇 Золотое</option>
                      <option value="pulse">💫 Пульсация</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-1.5">Мин. уровень</label>
                  <input type="number" value={stockMinLevel} onChange={(e) => setStockMinLevel(Number(e.target.value))} min="1" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white" />
                </div>

                <div className="border border-gray-200 dark:border-white/10 rounded-xl p-3 bg-white/[0.02]">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-gray-600 dark:text-white/60 flex items-center gap-1.5">
                      <ImageIcon size={14} /> Файлы значков ({stockFiles.length})
                    </label>
                    {stockFiles.length > 0 && (
                      <button onClick={() => setStockFiles([])} className="text-[10px] text-red-600 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300">Очистить</button>
                    )}
                  </div>
                  
                  <input 
                    type="file" 
                    accept="image/*" 
                    multiple 
                    className="hidden" 
                    id="stock-badge-files"
                    onChange={(e) => setStockFiles(Array.from(e.target.files || []))} 
                  />
                  
                  <label htmlFor="stock-badge-files" className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/15 text-gray-800 dark:text-white/80 text-xs font-bold hover:bg-gray-100 dark:hover:bg-white/10 transition-colors cursor-pointer">
                    <Upload size={14} /> Выбрать файлы
                  </label>
                  
                  {stockFiles.length > 0 && (
                    <div className="grid grid-cols-6 gap-1.5 mt-3 max-h-40 overflow-y-auto p-1 bg-black/20 rounded-lg">
                      {stockFiles.map((file, i) => (
                        <div key={i} className="relative group aspect-square">
                          <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-contain bg-gray-100 dark:bg-white/5 rounded-lg p-1" />
                          <button onClick={() => setStockFiles(stockFiles.filter((_, j) => j !== i))} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2 mt-5">
                <Button variant="secondary" onClick={() => setShowStockUploader(false)} disabled={uploadingStock} className="flex-1">Отмена</Button>
                <Button loading={uploadingStock} onClick={uploadStockBadges} disabled={uploadingStock || !stockBadgeName.trim() || stockFiles.length === 0} className="flex-1">
                  {uploadingStock ? "" : "Загрузить"}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
}