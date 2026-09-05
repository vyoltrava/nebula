"use client";
// 🏷️ Префиксы ПОЛЬЗОВАТЕЛЕЙ (adminnew → Префиксы → Пользователи):
// создание/редактирование/удаление многоугольных иконок-префиксов (без текста).
// Выдача префиксов пользователям — в UsersSection.
import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";
import { Plus, Trash2, Pencil, Check, X, Save, Loader2, Hexagon } from "lucide-react";
import { PREFIX_ICONS } from "@/components/prefixIcons";

const API = process.env.NEXT_PUBLIC_API_URL;

// превью многоугольной плашки
function HexBadge({ p, size = 22 }: { p: { icon: string; color: string; bg_color: string }; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center shrink-0"
      style={{
        width: size, height: size * 0.9, backgroundColor: p.bg_color, color: p.color,
        clipPath: "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)",
        fontSize: size * 0.55, lineHeight: 1,
      }}
    >
      <span style={{ transform: "translateY(-1px)" }}>{PREFIX_ICONS[p.icon] || "★"}</span>
    </span>
  );
}

export function UserPrefixesSection({ me }: { me: any }) {
  const [prefixes, setPrefixes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [editId, setEditId] = useState<number | null>(null);
  const [icon, setIcon] = useState("star");
  const [color, setColor] = useState("#ffffff");
  const [bgColor, setBgColor] = useState("#8b5cf6");
  const [saving, setSaving] = useState(false);

  const auth = (opts: any = {}) => {
    const t = getToken();
    return { ...opts, headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json", ...(opts.headers || {}) } };
  };

  async function load() {
    setLoading(true);
    const r = await fetch(`${API}/api/admin/user-prefixes`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (r.ok) setPrefixes(await r.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function resetForm() {
    setEditId(null); setIcon("star"); setColor("#ffffff"); setBgColor("#8b5cf6");
  }

  function editPrefix(p: any) {
    setEditId(p.id); setIcon(p.icon); setColor(p.color); setBgColor(p.bg_color);
  }

  async function save() {
    setSaving(true);
    const body = JSON.stringify({ icon, color, bg_color: bgColor });
    const url = editId ? `${API}/api/admin/user-prefixes/${editId}` : `${API}/api/admin/user-prefixes`;
    const r = await fetch(url, auth({ method: editId ? "PATCH" : "POST", body }));
    setSaving(false);
    if (r.ok) { resetForm(); load(); }
    else { const d = await r.json().catch(() => null); alert(d?.detail || "Ошибка сохранения"); }
  }

  async function remove(id: number) {
    if (!confirm("Удалить префикс? Он будет снят со всех пользователей.")) return;
    const r = await fetch(`${API}/api/admin/user-prefixes/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${getToken()}` } });
    if (r.ok) load();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Форма создания/редактирования */}
      <div className="rounded-2xl border border-line dark:border-white/10 bg-white dark:bg-white/5 p-4">
        <h3 className="font-black text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <Hexagon size={16} className="text-[#a855f7]" />
          {editId ? "Редактировать префикс" : "Новый префикс пользователя"}
        </h3>

        {/* Превью — многоугольная иконка без текста */}
        <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-gray-100 dark:bg-white/5">
          <span className="text-xs text-gray-500 dark:text-white/40">Превью:</span>
          <HexBadge p={{ icon, color, bg_color: bgColor }} />
        </div>

        {/* Выбор иконки */}
        <p className="text-xs font-bold text-gray-600 dark:text-white/60 mb-1.5">Иконка</p>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {Object.entries(PREFIX_ICONS).map(([key, sym]) => (
            <button key={key} onClick={() => setIcon(key)}
              className={`w-9 h-9 rounded-lg border text-base flex items-center justify-center transition-all ${
                icon === key ? "border-[#a855f7] bg-[#a855f7]/20" : "border-line dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/10"
              }`}>
              {sym}
            </button>
          ))}
        </div>

        {/* Цвета */}
        <div className="flex flex-wrap gap-4 mb-4">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-white/70">
            Иконка
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-9 h-9 rounded-lg cursor-pointer bg-transparent" />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-white/70">
            Плашка
            <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="w-9 h-9 rounded-lg cursor-pointer bg-transparent" />
          </label>
        </div>

        <div className="flex gap-2">
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#a855f7] text-white text-sm font-bold hover:bg-[#9333ea] disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : editId ? <Save size={14} /> : <Plus size={14} />}
            {editId ? "Сохранить" : "Создать"}
          </button>
          {editId && (
            <button onClick={resetForm}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-line dark:border-white/10 text-gray-600 dark:text-white/60 text-sm font-bold hover:bg-gray-100 dark:hover:bg-white/10">
              <X size={14} /> Отмена
            </button>
          )}
        </div>
      </div>

      {/* Список префиксов */}
      <div className="rounded-2xl border border-line dark:border-white/10 bg-white dark:bg-white/5 p-4">
        <h3 className="font-black text-gray-900 dark:text-white mb-3">Созданные префиксы ({prefixes.length})</h3>
        {loading ? (
          <p className="text-center text-gray-400 text-sm py-8">Загрузка…</p>
        ) : prefixes.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">Префиксов пока нет</p>
        ) : (
          <div className="space-y-2">
            {prefixes.map((p) => (
              <div key={p.id} className={`flex items-center gap-3 p-2.5 rounded-xl border ${editId === p.id ? "border-[#a855f7] bg-[#a855f7]/10" : "border-line dark:border-white/10 bg-gray-100 dark:bg-white/5"}`}>
                <HexBadge p={p} />
                <span className="text-xs text-gray-500 dark:text-white/40 font-mono flex-1">
                  #{p.id} · {p.icon} · {p.bg_color}
                </span>
                <button onClick={() => editPrefix(p)} className="p-1 rounded-full text-gray-400 hover:text-blue-500"><Pencil size={12} /></button>
                <button onClick={() => remove(p.id)} className="p-1 rounded-full text-gray-400 hover:text-red-500"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-gray-500 dark:text-white/40 mt-3 flex items-center gap-1">
          <Check size={11} /> Выдача префиксов пользователям — вкладка «Пользователи»
        </p>
      </div>
    </div>
  );
}
