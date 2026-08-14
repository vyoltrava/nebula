"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { getToken } from "@/lib/auth";
import { SmilePlus, Plus, Edit3, Trash2, ArrowLeft, Lock, Globe, X } from "lucide-react";

// 🎁 Быстрые наборы для удобного добавления
const QUICK_EMOJIS = ["❤️","🔥","","😮","😢","😡","👍","","🙏","💀","🗿","🤡","🫡","️","🌚","🦄","","🫠","🤌","✨","💅","🎯","🪩","","🫧","🍕","👽","","😈","","🥵","🤯","","🫶","","👀","🍀","⭐","🌈","💎"];

export default function AdminStickersPage() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [packs, setPacks] = useState<any[]>([]);
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.push("/login"); return; }
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then(data => {
      if (!data.is_admin) { router.push("/admin"); return; }
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

  function openCreate() {
    setEditing({ id: null, name: "", emojis: [], min_level: 1, is_active: true });
    setShowEditor(true);
  }

  async function savePack() {
    if (!editing) return;
    if (!editing.name.trim()) { alert("Введи название пака"); return; }
    if (editing.emojis.length === 0) { alert("Добавь хотя бы один эмодзи"); return; }

    const token = getToken();
    const form = new FormData();
    form.append("name", editing.name);
    form.append("emojis", JSON.stringify(editing.emojis));
    form.append("min_level", String(editing.min_level));
    if (editing.id) form.append("is_active", String(editing.is_active));

    const url = editing.id
      ? `${process.env.NEXT_PUBLIC_API_URL}/api/admin/sticker-packs/${editing.id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/api/admin/sticker-packs`;

    const res = await fetch(url, {
      method: editing.id ? "PUT" : "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (res.ok) {
      setShowEditor(false);
      setEditing(null);
      loadPacks();
    } else {
      const err = await res.json().catch(() => null);
      alert(err?.detail || "Ошибка сохранения");
    }
  }

  async function deletePack(id: number) {
    if (!confirm("Удалить пак? Реакции останутся на сообщениях, но поставить новые будет нельзя.")) return;
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
    form.append("emojis", JSON.stringify(pack.emojis));
    form.append("min_level", String(pack.min_level));
    form.append("is_active", String(!pack.is_active));
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/sticker-packs/${pack.id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    loadPacks();
  }

  if (!me) return <div className="p-8 text-white/60">Загрузка...</div>;

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />
      <div className="w-px shrink-0 bg-white/10 my-3" />
      <main className="flex-1 overflow-y-auto border-x border-white/10">
        {/* Шапка */}
        <div className="p-4 sm:p-6 border-b border-white/10 sticky top-0 bg-[#171717]/80 backdrop-blur-md z-10">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push("/admin")} className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10">
                <ArrowLeft size={20} />
              </button>
              <SmilePlus size={24} className="text-yellow-400" />
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-white">Паки реакций</h1>
                <p className="text-[11px] sm:text-xs text-white/40">Управляй наборами реакций и уровнями доступа</p>
              </div>
            </div>
            <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-500 text-black text-sm font-bold hover:bg-yellow-400 transition-all">
              <Plus size={16} /> Новый пак
            </button>
          </div>
        </div>

        {/* Список паков */}
        <div className="p-4 space-y-3 max-w-3xl mx-auto">
          {packs.map(pack => (
            <div key={pack.id} className={`border rounded-2xl p-4 transition-all ${pack.is_active ? "border-white/15 bg-white/5" : "border-white/5 bg-white/[0.02] opacity-60"}`}>
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-white">{pack.name}</h3>
                  <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                    pack.min_level <= 1 ? "bg-green-500/15 text-green-400" : "bg-yellow-500/15 text-yellow-400"
                  }`}>
                    {pack.min_level <= 1 ? <Globe size={10} /> : <Lock size={10} />}
                    {pack.min_level <= 1 ? "Все" : `Lvl ${pack.min_level}+`}
                  </span>
                  {pack.is_builtin && (
                    <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/40 text-[10px] font-black uppercase">Встроенный</span>
                  )}
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => toggleActive(pack)} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${pack.is_active ? "border-green-400/30 text-green-400 hover:bg-green-500/10" : "border-white/15 text-white/40 hover:bg-white/5"}`}>
                    {pack.is_active ? "Активен" : "Выключен"}
                  </button>
                  <button onClick={() => { setEditing({ ...pack }); setShowEditor(true); }} className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10">
                    <Edit3 size={14} />
                  </button>
                  <button onClick={() => deletePack(pack.id)} className="p-1.5 rounded-lg text-red-400/60 hover:text-red-400 hover:bg-red-500/10">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {pack.emojis.map((e: string, i: number) => (
                  <span key={i} className="w-9 h-9 flex items-center justify-center text-xl bg-white/5 border border-white/10 rounded-lg">{e}</span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Редактор пака */}
        {showEditor && editing && (
          <>
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[300]" onClick={() => setShowEditor(false)} />
            <div className="fixed inset-0 z-[301] flex items-center justify-center p-4 pointer-events-none">
              <div className="w-full max-w-md bg-[#1f1f23] border border-white/15 rounded-2xl shadow-2xl pointer-events-auto max-h-[90vh] overflow-y-auto">
                <div className="sticky top-0 bg-[#1f1f23] p-4 border-b border-white/10 flex items-center justify-between">
                  <h2 className="font-black text-white">{editing.id ? "Редактировать пак" : "Новый пак"}</h2>
                  <button onClick={() => setShowEditor(false)} className="text-white/60 hover:text-white p-1"><X size={18} /></button>
                </div>

                <div className="p-4 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-white/60 mb-1.5">Название</label>
                    <input
                      value={editing.name}
                      onChange={e => setEditing({ ...editing, name: e.target.value })}
                      placeholder="Например: Мемы, Вайб, VIP..."
                      className="w-full px-3 py-2 rounded-lg border border-white/15 bg-white/5 text-white placeholder-white/40 focus:outline-none focus:border-yellow-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-white/60 mb-1.5">Доступ</label>
                    <select
                      value={editing.min_level}
                      onChange={e => setEditing({ ...editing, min_level: Number(e.target.value) })}
                      className="w-full px-3 py-2 rounded-lg border border-white/15 bg-white/5 text-white focus:outline-none focus:border-yellow-400"
                    >
                      <option value={1} className="bg-gray-900">Все пользователи (lvl 1+)</option>
                      <option value={2} className="bg-gray-900">Эксклюзив (lvl 2+)</option>
                      <option value={3} className="bg-gray-900">Спонсоры (lvl 3+)</option>
                      <option value={9} className="bg-gray-900">Команда (lvl 9+)</option>
                    </select>
                  </div>

                  {/* Выбранные эмодзи */}
                  <div>
                    <label className="block text-xs font-bold text-white/60 mb-1.5">
                      В паке: {editing.emojis.length} эмодзи
                    </label>
                    <div className="flex flex-wrap gap-1.5 min-h-[50px] p-2 rounded-xl border border-white/15 bg-white/5">
                      {editing.emojis.length === 0 && (
                        <p className="text-[11px] text-white/30 p-1">Кликай по эмодзи ниже, чтобы добавить ↓</p>
                      )}
                      {editing.emojis.map((e: string, i: number) => (
                        <button
                          key={i}
                          onClick={() => setEditing({ ...editing, emojis: editing.emojis.filter((_: any, j: number) => j !== i) })}
                          className="w-9 h-9 flex items-center justify-center text-xl bg-yellow-500/15 border border-yellow-500/40 rounded-lg hover:bg-red-500/20 hover:border-red-500/40 transition-all"
                          title="Убрать"
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Быстрый набор */}
                  <div>
                    <label className="block text-xs font-bold text-white/60 mb-1.5">Быстрое добавление</label>
                    <div className="grid grid-cols-8 gap-1 max-h-40 overflow-y-auto p-1">
                      {QUICK_EMOJIS.map(e => (
                        <button
                          key={e}
                          onClick={() => {
                            if (!editing.emojis.includes(e)) {
                              setEditing({ ...editing, emojis: [...editing.emojis, e] });
                            }
                          }}
                          className={`aspect-square flex items-center justify-center text-xl rounded-lg transition-all ${
                            editing.emojis.includes(e) ? "opacity-30" : "hover:bg-white/10 active:scale-90"
                          }`}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Свои эмодзи */}
                  <CustomEmojiInput onAdd={(e) => {
                    if (e && !editing.emojis.includes(e)) {
                      setEditing({ ...editing, emojis: [...editing.emojis, e] });
                    }
                  }} />
                </div>

                <div className="sticky bottom-0 bg-[#1f1f23] p-4 border-t border-white/10 flex gap-2">
                  <button onClick={() => setShowEditor(false)} className="flex-1 py-2.5 rounded-lg border border-white/15 text-white/80 font-bold hover:bg-white/5">
                    Отмена
                  </button>
                  <button onClick={savePack} className="flex-1 py-2.5 rounded-lg bg-yellow-500 text-black font-bold hover:bg-yellow-400">
                    Сохранить
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

// Поле ввода своего эмодзи
function CustomEmojiInput({ onAdd }: { onAdd: (e: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="flex gap-2">
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Вставь свой эмодзи..."
        className="flex-1 px-3 py-2 rounded-lg border border-white/15 bg-white/5 text-white placeholder-white/40 focus:outline-none focus:border-yellow-400"
      />
      <button
        onClick={() => { onAdd(value.trim()); setValue(""); }}
        disabled={!value.trim()}
        className="px-4 py-2 rounded-lg bg-white/10 text-white font-bold hover:bg-white/20 disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}