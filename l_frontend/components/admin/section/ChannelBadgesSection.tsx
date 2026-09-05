"use client";
// 🏷️ ПЛАШКИ/ПРЕФИКСЫ КАНАЛОВ (admin): создание плашек (иконка+текст+цвет),
// список всех каналов с поиском и массовая выдача плашки выбранным каналам.
import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { Search, Plus, Trash2, Pencil, Check, X, Save, Megaphone, Loader2 } from "lucide-react";
import { ChannelBadge } from "@/components/PublicChannelsModal";

const API = process.env.NEXT_PUBLIC_API_URL;

const ICONS: Record<string, string> = {
  check: "✓", music: "♪", star: "★", crown: "♛", bolt: "⚡", fire: "🔥",
  heart: "♥", mic: "🎤", rocket: "🚀", flag: "🚩", spark: "✦", gem: "💎",
  shield: "🛡", leaf: "🍃", tag: "🏷", dollar: "$",
};

export function ChannelBadgesSection({ me }: { me: any }) {
  const [badges, setBadges] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [loadingB, setLoadingB] = useState(true);
  const [loadingC, setLoadingC] = useState(true);

  const [editId, setEditId] = useState<number | null>(null);
  const [icon, setIcon] = useState("check");
  const [text, setText] = useState("");
  const [color, setColor] = useState("#ffffff");
  const [bgColor, setBgColor] = useState("#8b5cf6");
  const [saving, setSaving] = useState(false);

  const [selectedBadge, setSelectedBadge] = useState<number | "remove" | "">("");
  const [selectedChannels, setSelectedChannels] = useState<Set<number>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [allChecked, setAllChecked] = useState(false);

  const auth = (opts: any = {}) => {
    const t = getToken();
    return { ...opts, headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json", ...(opts.headers || {}) } };
  };

  async function loadBadges() {
    setLoadingB(true);
    const r = await fetch(`${API}/api/admin/channel-badges`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (r.ok) setBadges(await r.json());
    setLoadingB(false);
  }
  async function loadChannels() {
    setLoadingC(true);
    const r = await fetch(`${API}/api/admin/channels/all?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (r.ok) setChannels(await r.json());
    setLoadingC(false);
  }

  useEffect(() => { loadBadges(); loadChannels(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { const t = setTimeout(loadChannels, 300); return () => clearTimeout(t); }, [q]);

  function resetForm() {
    setEditId(null); setIcon("check"); setText(""); setColor("#ffffff"); setBgColor("#8b5cf6");
  }

  async function saveBadge() {
    setSaving(true);
    const body = JSON.stringify({ icon, text, color, bg_color: bgColor });
    const url = editId ? `${API}/api/admin/channel-badges/${editId}` : `${API}/api/admin/channel-badges`;
    const r = await fetch(url, auth({ method: editId ? "PATCH" : "POST", body }));
    setSaving(false);
    if (r.ok) { resetForm(); loadBadges(); }
    else { const d = await r.json().catch(() => null); alert(d?.detail || "Ошибка сохранения"); }
  }

  async function removeBadge(id: number) {
    if (!confirm("Удалить плашку? Назначения на каналы будут сняты.")) return;
    const r = await fetch(`${API}/api/admin/channel-badges/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${getToken()}` } });
    if (r.ok) { loadBadges(); loadChannels(); }
  }

  function editBadge(b: any) {
    setEditId(b.id); setIcon(b.icon || "check"); setText(b.text || ""); setColor(b.color || "#ffffff"); setBgColor(b.bg_color || "#8b5cf6");
  }

  function toggleAll() {
    if (allChecked) setSelectedChannels(new Set());
    else setSelectedChannels(new Set(channels.map((c) => c.id)));
    setAllChecked(!allChecked);
  }
  function toggleChannel(id: number) {
    setSelectedChannels((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function assign() {
    if (selectedChannels.size === 0) return alert("Выберите хотя бы один канал");
    if (selectedBadge === "") return alert("Выберите плашку (или «Снять плашку» для удаления)");
    setAssigning(true);
    const body = JSON.stringify({ badge_id: selectedBadge === "remove" ? null : Number(selectedBadge), channel_ids: Array.from(selectedChannels) });
    const r = await fetch(`${API}/api/admin/channels/badge`, auth({ method: "POST", body }));
    setAssigning(false);
    if (r.ok) {
      alert(`Готово: ${(await r.json()).assigned ?? selectedChannels.size} каналов обновлено`);
      setSelectedChannels(new Set()); setAllChecked(false);
      loadChannels();
    } else { const d = await r.json().catch(() => null); alert(d?.detail || "Ошибка выдачи"); }
  }

  const preview = { icon, emoji: ICONS[icon] || "", text, color, bg_color: bgColor };
return (
    <div className="space-y-6">
      {/* Создание/редактирование плашки */}
      <div className="rounded-2xl border border-line dark:border-white/10 bg-white dark:bg-white/5 p-4">
        <h3 className="font-black text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <Plus size={16} className="text-[#8b5cf6]" />
          {editId ? "Редактировать плашку" : "Создать плашку канала"}
        </h3>
        <div className="mb-3">
          <p className="text-xs font-bold text-gray-600 dark:text-white/60 mb-1.5">Иконка (заложенный набор)</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(ICONS).map(([k, emo]) => (
              <button key={k} onClick={() => setIcon(k)}
                className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-all ${icon === k ? "bg-[#8b5cf6] text-white ring-2 ring-[#8b5cf6]/40" : "bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15"}`}>
                {emo}
              </button>
            ))}
          </div>
        </div>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Текст плашки (можно пусто — только иконка)"
          className="w-full mb-3 px-3 py-2 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 text-gray-900 dark:text-white text-sm focus:border-[#8b5cf6] outline-none" />
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs text-gray-600 dark:text-white/60 mb-1">Цвет текста</label>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-full h-9 rounded cursor-pointer" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-white/60 mb-1">Цвет плашки</label>
            <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="w-full h-9 rounded cursor-pointer" />
          </div>
        </div>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-xs text-gray-500 dark:text-white/50">Превью:</span>
          <ChannelBadge badge={preview} />
        </div>
        <div className="flex gap-2">
          <button onClick={saveBadge} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#8b5cf6] text-white text-sm font-bold hover:bg-[#7c3aed] disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {editId ? "Сохранить" : "Создать"}
          </button>
          {editId && (
            <button onClick={resetForm} className="px-4 py-2 rounded-lg border border-line dark:border-white/15 text-sm hover:bg-gray-100 dark:hover:bg-white/10">
              <X size={14} /> Отмена
            </button>
          )}
        </div>

        {/* Существующие плашки */}
        <div className="mt-5 pt-4 border-t border-line dark:border-white/10">
          <p className="text-xs font-bold text-gray-500 dark:text-white/50 mb-2">Сохранённые плашки ({badges.length})</p>
          {loadingB ? <p className="text-xs text-gray-400">Загрузка…</p> : badges.length === 0 ? (
            <p className="text-xs text-gray-400">Плашек пока нет — создайте первую выше.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {badges.map((b) => (
                <div key={b.id} className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-full border border-line dark:border-white/10">
                  <ChannelBadge badge={b} />
                  <button onClick={() => editBadge(b)} className="p-1 rounded-full text-gray-400 hover:text-[#8b5cf6]"><Pencil size={12} /></button>
                  <button onClick={() => removeBadge(b.id)} className="p-1 rounded-full text-gray-400 hover:text-red-500"><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
{/* Список каналов + массовая выдача */}
      <div className="rounded-2xl border border-line dark:border-white/10 bg-white dark:bg-white/5 p-4">
        <h3 className="font-black text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <Megaphone size={16} className="text-[#8b5cf6]" /> Массовая выдача плашки
        </h3>

        <div className="flex flex-wrap items-center gap-3 mb-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск каналов по названию или @slug"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 text-sm text-gray-900 dark:text-white focus:border-[#8b5cf6] outline-none" />
          </div>
          <select value={selectedBadge} onChange={(e) => setSelectedBadge(e.target.value as any)}
            className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 text-sm">
            <option value="">— выбрать плашку —</option>
            {badges.map((b) => <option key={b.id} value={b.id}>{(ICONS[b.icon] || "") + (b.text ? " " + b.text : "")}</option>)}
            <option value="remove">🗑 Снять плашку</option>
          </select>
          <button onClick={assign} disabled={assigning || selectedChannels.size === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#8b5cf6] text-white text-sm font-bold hover:bg-[#7c3aed] disabled:opacity-50">
            {assigning ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Выдать ({selectedChannels.size})
          </button>
        </div>

        <label className="flex items-center gap-2 mb-2 text-xs text-gray-600 dark:text-white/60 cursor-pointer">
          <input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-[#8b5cf6]" />
          Выбрать все показанные
        </label>

        <div className="max-h-[420px] overflow-y-auto border border-line dark:border-white/10 rounded-xl divide-y divide-line dark:divide-white/5">
          {loadingC ? (
            <p className="text-center text-gray-400 text-sm py-8">Загрузка…</p>
          ) : channels.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">Каналов не найдено</p>
          ) : channels.map((c) => (
            <label key={c.id} className="flex items-center gap-3 p-2.5 hover:bg-gray-100 dark:hover:bg-white/5 cursor-pointer">
              <input type="checkbox" checked={selectedChannels.has(c.id)} onChange={() => toggleChannel(c.id)} className="accent-[#8b5cf6]" />
              <Avatar src={c.avatar_url} name={c.title} id={c.id} size={36} />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 dark:text-white text-sm truncate">{c.title}</p>
                <p className="text-[11px] text-gray-500 dark:text-white/40 truncate">@{c.custom_slug} · {c.subscribers_count || 0} подписчиков{c.is_blocked ? " · 🚫 заблокирован" : ""}</p>
              </div>
              {c.badge ? <ChannelBadge badge={c.badge} size="sm" /> : <span className="text-[10px] text-gray-400">нет</span>}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}