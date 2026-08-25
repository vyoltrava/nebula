"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { getToken } from "@/lib/auth";
import { STICKERS } from "@/lib/stickers";
import {
  SmilePlus, Plus, Edit3, Trash2, ArrowLeft, Lock, Globe, X,
  Image as ImageIcon, Upload, Loader2, Search, Check,
} from "lucide-react";

// Группировка STICKERS по категориям
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

export default function AdminStickersPage() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [packs, setPacks] = useState<any[]>([]);
  const [showPackEditor, setShowPackEditor] = useState(false);
  const [editingPack, setEditingPack] = useState<any>(null);
  const [uploadingPackId, setUploadingPackId] = useState<number | null>(null);
  const [emojiInputs, setEmojiInputs] = useState<Record<number, string>>({});
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // 🆕 Состояния для нового редактора пака
  const [selectedEmojis, setSelectedEmojis] = useState<string[]>([]);
  const [emojiSearch, setEmojiSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("emotions");
  const [savingPack, setSavingPack] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.push("/login"); return; }
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then(data => {
      if (!data.is_admin && !data.permissions?.includes("manage_stickers")) {
        router.push("/admin");
        return;
      }
      setMe(data);
      loadPacks();
    });
  }, []);

  async function loadPacks() {
    const token = getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/sticker-packs`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setPacks(await res.json());
  }

  async function savePack() {
    if (!editingPack) return;
    if (!editingPack.name?.trim()) { alert("Введи название пака"); return; }
    const token = getToken();
    const form = new FormData();
    form.append("name", editingPack.name);
    form.append("min_level", String(editingPack.min_level));
    if (editingPack.id) form.append("is_active", String(editingPack.is_active));

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
        const data = await res.json();
        const packId = editingPack.id || data.id;

        // 🆕 Если выбраны эмодзи — добавляем их в пак
        if (selectedEmojis.length > 0 && packId) {
          const emojiForm = new FormData();
          emojiForm.append("emojis", JSON.stringify(selectedEmojis));
          await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/sticker-packs/${packId}/stickers`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: emojiForm,
          });
        }

        setShowPackEditor(false);
        setEditingPack(null);
        setSelectedEmojis([]);
        loadPacks();
      } else {
        const err = await res.json().catch(() => null);
        alert(err?.detail || "Ошибка сохранения");
      }
    } finally {
      setSavingPack(false);
    }
  }

  async function deletePack(id: number) {
    if (!confirm("Удалить пак со всеми стикерами?")) return;
    const token = getToken();
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/sticker-packs/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    loadPacks();
  }

  async function toggleActive(pack: any) {
    const token = getToken();
    const form = new FormData();
    form.append("name", pack.name);
    form.append("min_level", String(pack.min_level));
    form.append("is_active", String(!pack.is_active));
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/sticker-packs/${pack.id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    loadPacks();
  }

  async function uploadImages(packId: number, files: FileList | null) {
    if (!files || files.length === 0) return;
    const token = getToken();
    setUploadingPackId(packId);
    const form = new FormData();
    Array.from(files).forEach(f => form.append("files", f));
    form.append("emojis", "[]");

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/sticker-packs/${packId}/stickers`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.ok) loadPacks();
      else alert("Ошибка загрузки");
    } finally {
      setUploadingPackId(null);
      if (fileRefs.current[packId]) fileRefs.current[packId]!.value = "";
    }
  }

  async function addEmoji(packId: number) {
    const val = (emojiInputs[packId] || "").trim();
    if (!val) return;
    const token = getToken();
    const form = new FormData();
    form.append("emojis", JSON.stringify(val.split(/\s+/)));

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/sticker-packs/${packId}/stickers`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (res.ok) {
      setEmojiInputs(prev => ({ ...prev, [packId]: "" }));
      loadPacks();
    }
  }

  async function deleteSticker(stickerId: number) {
    if (!confirm("Удалить стикер?")) return;
    const token = getToken();
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/stickers/${stickerId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    loadPacks();
  }

  // 🆕 Фильтрация эмодзи
  const filteredStickers = emojiSearch.trim()
    ? STICKERS.filter(s =>
        s.emoji.includes(emojiSearch) ||
        s.label.toLowerCase().includes(emojiSearch.toLowerCase()) ||
        s.code.toLowerCase().includes(emojiSearch.toLowerCase())
      )
    : STICKERS.slice(
        CATEGORIES.find(c => c.key === activeCategory)?.range[0] || 0,
        CATEGORIES.find(c => c.key === activeCategory)?.range[1] || STICKERS.length
      );

  function toggleEmoji(emoji: string) {
    setSelectedEmojis(prev =>
      prev.includes(emoji) ? prev.filter(e => e !== emoji) : [...prev, emoji]
    );
  }

  if (!me) return <div className="p-8 text-gray-600 dark:text-white/60">Загрузка...</div>;

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />
      <div className="w-px shrink-0 bg-gray-100 dark:bg-white/10 my-3" />
      <main className="flex-1 overflow-y-auto border-x border-line dark:border-white/10">
        {/* Шапка */}
        <div className="p-4 sm:p-6 border-b border-line dark:border-white/10 sticky top-0 bg-paper dark:bg-[#171717]/80 backdrop-blur-md z-10">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push("/admin")} className="p-2 rounded-lg text-gray-600 dark:text-white/60 hover:text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10">
                <ArrowLeft size={20} />
              </button>
              <SmilePlus size={24} className="text-yellow-600 dark:text-yellow-400" />
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">Стикер-паки</h1>
                <p className="text-[11px] sm:text-xs text-gray-500 dark:text-white/40">Реакции и стикеры для чатов</p>
              </div>
            </div>
            <button
              onClick={() => {
                setEditingPack({ id: null, name: "", min_level: 1, is_active: true });
                setSelectedEmojis([]);
                setEmojiSearch("");
                setActiveCategory("emotions");
                setShowPackEditor(true);
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-500 text-black text-sm font-bold hover:bg-yellow-600 dark:hover:bg-yellow-400 transition-all"
            >
              <Plus size={16} /> Новый пак
            </button>
          </div>
        </div>

        {/* Список паков */}
        <div className="p-4 space-y-4 max-w-4xl mx-auto">
          {packs.map(pack => (
            <div key={pack.id} className={`border rounded-2xl p-4 ${pack.is_active ? "border-line dark:border-white/15 bg-gray-100 dark:bg-white/5" : "border-line dark:border-white/5 bg-white/[0.02] opacity-60"}`}>
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-gray-900 dark:text-white">{pack.name}</h3>
                  <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                    pack.min_level <= 1 ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400"
                  }`}>
                    {pack.min_level <= 1 ? <Globe size={10} /> : <Lock size={10} />}
                    {pack.min_level <= 1 ? "Все" : `Lvl ${pack.min_level}+`}
                  </span>
                  <span className="text-[10px] text-gray-500 dark:text-white/30">{pack.stickers.length} стикеров</span>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => toggleActive(pack)} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border ${pack.is_active ? "border-green-400/30 text-green-600 dark:text-green-400" : "border-line dark:border-white/15 text-gray-500 dark:text-white/40"}`}>
                    {pack.is_active ? "Активен" : "Выключен"}
                  </button>
                  <button onClick={() => { setEditingPack({ ...pack }); setSelectedEmojis([]); setShowPackEditor(true); }} className="p-1.5 rounded-lg text-gray-600 dark:text-white/50 hover:text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10">
                    <Edit3 size={14} />
                  </button>
                  <button onClick={() => deletePack(pack.id)} className="p-1.5 rounded-lg text-red-400/60 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                {pack.stickers.map((s: any) => (
                  <div key={s.id} className="relative group">
                    <div className="w-14 h-14 flex items-center justify-center bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 rounded-xl">
                      {s.type === "emoji" ? (
                        <span className="text-2xl">{s.content}</span>
                      ) : (
                        <img src={s.content} alt="" className="w-full h-full object-contain p-1" />
                      )}
                    </div>
                    <button
                      onClick={() => deleteSticker(s.id)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {pack.stickers.length === 0 && (
                  <p className="text-[11px] text-gray-500 dark:text-white/30">Пак пуст — добавь стикеры ниже ↓</p>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-3 border-t border-line dark:border-white/10">
                <input
                  ref={(el) => { fileRefs.current[pack.id] = el; }}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => uploadImages(pack.id, e.target.files)}
                />
                <button
                  onClick={() => fileRefs.current[pack.id]?.click()}
                  disabled={uploadingPackId === pack.id}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/15 text-gray-800 dark:text-white/70 text-xs font-bold hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-50"
                >
                  {uploadingPackId === pack.id ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  Загрузить картинки
                </button>

                <div className="flex-1 flex gap-2">
                  <input
                    value={emojiInputs[pack.id] || ""}
                    onChange={(e) => setEmojiInputs(prev => ({ ...prev, [pack.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") addEmoji(pack.id); }}
                    placeholder="Вставь эмодзи: 💀 🗿 🔥 (можно несколько через пробел)"
                    className="flex-1 px-3 py-2 rounded-lg border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-xs placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:border-yellow-600 dark:focus:border-yellow-400"
                  />
                  <button onClick={() => addEmoji(pack.id)} className="px-3 py-2 rounded-lg bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 text-xs font-bold hover:bg-yellow-500/30">
                    + Эмодзи
                  </button>
                </div>
              </div>
            </div>
          ))}

          {packs.length === 0 && (
            <p className="text-center text-gray-500 dark:text-white/40 py-16">Паков пока нет — создай первый!</p>
          )}
        </div>

        {/* 🆕 УЛУЧШЕННЫЙ РЕДАКТОР ПАКА */}
        {showPackEditor && editingPack && (
          <>
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[300]" onClick={() => !savingPack && setShowPackEditor(false)} />
            <div className="fixed inset-0 z-[301] flex items-center justify-center p-4 pointer-events-none overflow-y-auto">
              <div className="w-full max-w-2xl bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-2xl shadow-2xl p-5 pointer-events-auto my-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-black text-gray-900 dark:text-white text-lg">{editingPack.id ? "Редактировать пак" : "Новый пак"}</h2>
                  <button onClick={() => !savingPack && setShowPackEditor(false)} className="text-gray-600 dark:text-white/60 hover:text-gray-900 dark:text-white p-1"><X size={18} /></button>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-1.5">Название</label>
                      <input
                        value={editingPack.name}
                        onChange={e => setEditingPack({ ...editingPack, name: e.target.value })}
                        placeholder="Например: Мемы, Вайб, VIP..."
                        className="w-full px-3 py-2 rounded-lg border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-yellow-600 dark:focus:border-yellow-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-1.5">Доступ</label>
                      <select
                        value={editingPack.min_level}
                        onChange={e => setEditingPack({ ...editingPack, min_level: Number(e.target.value) })}
                        className="w-full px-3 py-2 rounded-lg border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:border-yellow-600 dark:focus:border-yellow-400"
                      >
                        <option value={1} className="bg-gray-900">Все пользователи (lvl 1+)</option>
                        <option value={2} className="bg-gray-900">Эксклюзив (lvl 2+)</option>
                        <option value={3} className="bg-gray-900">Спонсоры (lvl 3+)</option>
                        <option value={9} className="bg-gray-900">Команда (lvl 9+)</option>
                      </select>
                    </div>
                  </div>

                  {/* 🆕 ВЫБОР ЭМОДЗИ ИЗ БИБЛИОТЕКИ */}
                  <div className="border border-line dark:border-white/10 rounded-xl p-3 bg-white/[0.02]">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold text-gray-600 dark:text-white/60">
                        Выбрать эмодзи из библиотеки ({selectedEmojis.length} выбрано)
                      </label>
                      {selectedEmojis.length > 0 && (
                        <button
                          onClick={() => setSelectedEmojis([])}
                          className="text-[10px] text-red-600 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300"
                        >
                          Сбросить
                        </button>
                      )}
                    </div>

                    {/* Выбранные эмодзи */}
                    {selectedEmojis.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                        {selectedEmojis.map((emoji, i) => (
                          <button
                            key={i}
                            onClick={() => toggleEmoji(emoji)}
                            className="w-8 h-8 flex items-center justify-center bg-gray-100 dark:bg-white/10 rounded-lg text-lg hover:bg-red-500/20 transition-colors"
                            title="Убрать"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Поиск */}
                    <div className="relative mb-2">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-white/40" />
                      <input
                        value={emojiSearch}
                        onChange={e => setEmojiSearch(e.target.value)}
                        placeholder="Поиск эмодзи..."
                        className="w-full pl-9 pr-3 py-2 rounded-lg border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-xs placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:border-yellow-600 dark:focus:border-yellow-400"
                      />
                    </div>

                    {/* Категории */}
                    {!emojiSearch && (
                      <div className="flex gap-1 mb-2 overflow-x-auto scrollbar-hide pb-1">
                        {CATEGORIES.map(cat => (
                          <button
                            key={cat.key}
                            onClick={() => setActiveCategory(cat.key)}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap shrink-0 transition-all ${
                              activeCategory === cat.key
                                ? "bg-yellow-500 text-black"
                                : "bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/50 hover:bg-gray-100 dark:hover:bg-white/10"
                            }`}
                          >
                            {cat.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Сетка эмодзи */}
                    <div className="grid grid-cols-8 sm:grid-cols-10 gap-1 max-h-48 overflow-y-auto p-1">
                      {filteredStickers.map((s) => {
                        const isSelected = selectedEmojis.includes(s.emoji);
                        return (
                          <button
                            key={s.code}
                            onClick={() => toggleEmoji(s.emoji)}
                            className={`aspect-square flex items-center justify-center rounded-lg text-xl transition-all ${
                              isSelected
                                ? "bg-yellow-500/30 border-2 border-yellow-600 dark:border-yellow-400 scale-110"
                                : "bg-gray-100 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 border border-transparent"
                            }`}
                            title={s.label}
                          >
                            {s.emoji}
                          </button>
                        );
                      })}
                      {filteredStickers.length === 0 && (
                        <p className="col-span-full text-center text-gray-500 dark:text-white/30 text-xs py-4">Ничего не найдено</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 mt-5">
                  <button
                    onClick={() => !savingPack && setShowPackEditor(false)}
                    disabled={savingPack}
                    className="flex-1 py-2.5 rounded-lg border border-line dark:border-white/15 text-gray-800 dark:text-white/80 font-bold hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-50"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={savePack}
                    disabled={savingPack || !editingPack.name?.trim()}
                    className="flex-1 py-2.5 rounded-lg bg-yellow-500 text-black font-bold hover:bg-yellow-600 dark:hover:bg-yellow-400 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {savingPack ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    {savingPack ? "Сохранение..." : "Сохранить"}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}