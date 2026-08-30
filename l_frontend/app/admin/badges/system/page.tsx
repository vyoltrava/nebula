"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { getToken } from "@/lib/auth";
import { Trash2, Edit2, X, Crown, ShieldCheck, Info, Sparkles, Plus } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";

// Дополнительные плашки создаются ТОЛЬКО на уровнях 9-11.
// Системные плашки (Developer/Founder/System) редактируются отдельно и здесь не трогаются.
const LEVELS = [9, 10, 11] as const;
const LEVEL_META: Record<number, { label: string; color: string }> = {
  9: { label: "Developer", color: "#3b82f6" },
  10: { label: "Founder", color: "#fbbf24" },
  11: { label: "System", color: "#8b5cf6" },
};

interface BadgeData {
  id: number;
  name: string;
  description?: string | null;
  icon_url?: string | null;
  text_content?: string | null;
  text_color?: string | null;
  bg_color?: string | null;
  bg_gradient?: string | null;
  bg_type?: string | null;
  border_color?: string | null;
  border_width?: number | null;
  priority?: number | null;
  is_active?: boolean;
}

export default function SystemBadgeAdminPage() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [badges, setBadges] = useState<BadgeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Форма создания/редактирования
  const [showForm, setShowForm] = useState(false);
  const [editingBadge, setEditingBadge] = useState<BadgeData | null>(null);
  const [name, setName] = useState("");
  const [textContent, setTextContent] = useState("");
  const [color, setColor] = useState("#8b5cf6");
  const [textColor, setTextColor] = useState("#ffffff");
  const [level, setLevel] = useState<number>(9);

  const myLevel = me?.is_admin ? 11 : me?.is_moderator ? 9 : me?.role?.level || 1;

  async function load() {
    const token = getToken();
    if (!token) { router.push("/login"); return; }
    try {
      const meRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!meRes.ok) throw new Error("Auth failed");
      const meData = await meRes.json();
      setMe(meData);
      if (myLevelOf(meData) < 9) { router.push("/"); return; }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/custom-badges`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: BadgeData[] = await res.json();
        // только дополнительные плашки уровней 9-11
        setBadges(data.filter(b => LEVELS.includes((b.priority ?? 0) as 9 | 10 | 11)));
      }
    } catch {
      router.push("/");
    } finally {
      setLoading(false);
    }
  }

  function myLevelOf(u: any): number {
    return u?.is_admin ? 11 : u?.is_moderator ? 9 : u?.role?.level || 1;
  }

  useEffect(() => { load(); }, []);

  function openForm(badge?: BadgeData) {
    if (badge) {
      setEditingBadge(badge);
      setName(badge.name);
      setTextContent(badge.text_content || badge.name);
      setColor(badge.bg_color || "#8b5cf6");
      setTextColor(badge.text_color || "#ffffff");
      setLevel(badge.priority ?? 9);
    } else {
      setEditingBadge(null);
      setName("");
      setTextContent("");
      setColor("#8b5cf6");
      setTextColor("#ffffff");
      setLevel(9);
    }
    setShowForm(true);
  }

  async function saveBadge(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    if (level > myLevel) {
      alert(`Вы не можете создавать плашки уровня выше ${myLevel}.`);
      return;
    }
    setSaving(true);
    const payload = {
      name: name.trim(),
      text_content: textContent.trim() || name.trim(),
      text_color: textColor,
      bg_type: "solid",
      bg_color: color,
      border_color: color,
      border_width: 2,
      priority: level,   // уровень 9/10/11 хранится в priority
      is_active: true,
    };
    try {
      const res = await fetch(
        editingBadge
          ? `${process.env.NEXT_PUBLIC_API_URL}/api/custom-badges/${editingBadge.id}`
          : `${process.env.NEXT_PUBLIC_API_URL}/api/custom-badges`,
        {
          method: editingBadge ? "PUT" : "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.detail || "Ошибка сохранения");
        return;
      }
      setShowForm(false);
      load();
    } catch {
      alert("Ошибка сети");
    } finally {
      setSaving(false);
    }
  }

  async function deleteBadge(id: number) {
    if (!confirm("Удалить плашку? Она исчезнет у всех пользователей.")) return;
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/custom-badges/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.detail || "Ошибка удаления");
        return;
      }
      load();
    } catch {
      alert("Ошибка сети");
    }
  }

  const badgeStyle = (b: BadgeData): React.CSSProperties => ({
    backgroundColor: b.bg_type === "gradient" ? undefined : (b.bg_color || "#8b5cf6"),
    backgroundImage: b.bg_type === "gradient" ? b.bg_gradient || undefined : undefined,
    color: b.text_color || "#ffffff",
    border: `${b.border_width ?? 2}px solid ${b.border_color || b.bg_color || "#8b5cf6"}`,
  });

  // === Выдача плашки пользователю ===
  const [showAssign, setShowAssign] = useState(false);
  const [assignQuery, setAssignQuery] = useState("");
  const [assignResults, setAssignResults] = useState<any[]>([]);
  const [assignTarget, setAssignTarget] = useState<any>(null);
  const [assignBadgeId, setAssignBadgeId] = useState<number | null>(null);
  const [assignSaving, setAssignSaving] = useState(false);

  useEffect(() => {
    if (!assignQuery.trim()) { setAssignResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/search?q=${encodeURIComponent(assignQuery.trim())}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (res.ok) {
          const data = await res.json();
          setAssignResults((data.users || []).slice(0, 8));
        }
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [assignQuery]);

  async function assignBadgeToUser() {
    if (!assignTarget || !assignBadgeId) return;
    setAssignSaving(true);
    const token = getToken();
    const form = new FormData();
    form.append("user_id", String(assignTarget.id));
    form.append("badge_id", String(assignBadgeId));
    form.append("priority", String(badges.find(b => b.id === assignBadgeId)?.priority ?? 9));
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/custom-badge-assignments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.detail || "Ошибка выдачи");
        return;
      }
      setShowAssign(false);
      setAssignTarget(null);
      setAssignQuery("");
      setAssignBadgeId(null);
    } catch {
      alert("Ошибка сети");
    } finally {
      setAssignSaving(false);
    }
  }

  if (!me) return (
    <div className="h-screen flex items-center justify-center bg-ivory dark:bg-[#18181b]">
      <p className="text-gray-600 dark:text-white/60 animate-pulse">Загрузка...</p>
    </div>
  );

  return (
    <div className="h-screen flex overflow-hidden bg-ivory dark:bg-[#18181b]">
      <Sidebar />
      <div className="w-px shrink-0 bg-gray-100 dark:bg-white/10 my-3" />
      <main className="flex-1 overflow-y-auto border-x border-line dark:border-white/10">
        <div className="p-6 border-b border-line dark:border-white/10 sticky top-0 bg-paper dark:bg-[#171717]/80 backdrop-blur-md z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Crown size={24} className="text-[#fbbf24]" />
              <div>
                <h1 className="text-2xl font-black text-gray-900 dark:text-white">Дополнительные плашки</h1>
                <p className="text-xs text-gray-600 dark:text-white/50 mt-0.5">
                  Уровни 9–11 • Ваш уровень: <span className="font-bold">{myLevel}</span>
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button icon={Plus} onClick={() => openForm()}>Создать плашку</Button>
              <Button variant="secondary" icon={Sparkles} onClick={() => setShowAssign(true)}>Выдать</Button>
            </div>
          </div>
        </div>

        <div className="p-4 border-b border-line dark:border-white/5">
          <div className="bg-[#fbbf24]/10 border border-[#fbbf24]/30 rounded-xl p-4 flex gap-3">
            <Info size={20} className="text-[#fbbf24] shrink-0 mt-0.5" />
            <div className="text-sm text-gray-800 dark:text-white/80 space-y-1">
              <p className="font-bold text-gray-900 dark:text-white">Дополнительные плашки уровней 9–11</p>
              <p>Это не системные плашки (Developer / Founder / System) — они настраиваются отдельно. Здесь создаются доп. плашки, например «Младший разработчик» с уровнем 9, которые визуально отличаются и выдаются конкретным пользователям.</p>
              <div className="flex flex-wrap gap-2 mt-2 text-xs">
                {LEVELS.map(l => (
                  <span key={l} className="px-2 py-0.5 rounded border" style={{ color: LEVEL_META[l].color, borderColor: `${LEVEL_META[l].color}40`, background: `${LEVEL_META[l].color}15` }}>
                    {LEVEL_META[l].label}: {l}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {loading && <p className="text-center text-gray-500 dark:text-white/40 py-8 animate-pulse">Загрузка...</p>}
          {!loading && badges.length === 0 && (
            <div className="text-center py-12">
              <Crown size={48} className="mx-auto text-gray-300 dark:text-white/10 mb-3" />
              <p className="text-gray-500 dark:text-white/40 text-sm">Дополнительных плашек пока нет. Нажмите «Создать плашку».</p>
            </div>
          )}
          {badges.map(b => {
            const lvl = b.priority ?? 9;
            const meta = LEVEL_META[lvl] || LEVEL_META[9];
            return (
              <div key={b.id} className="bg-paper dark:bg-[#171717] border border-line dark:border-white/10 rounded-xl p-4 hover:bg-white/[0.07] transition-colors">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-wrap flex-1">
                    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-white text-sm font-black uppercase tracking-widest shadow-lg border" style={badgeStyle(b)}>
                      {b.text_content || b.name}
                      <span className="border-l border-white/30 pl-2 text-[10px] font-mono opacity-90">Lvl {lvl}</span>
                    </span>
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-bold border" style={{ color: meta.color, borderColor: `${meta.color}40`, backgroundColor: `${meta.color}10` }}>
                      <ShieldCheck size={12} /> уровень {lvl}
                    </div>
                    {b.description && <p className="text-xs text-gray-600 dark:text-white/60 italic hidden md:block">"{b.description}"</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <IconButton icon={Edit2} variant="secondary" size="iconSm" onClick={() => openForm(b)} title="Редактировать" />
                    <IconButton icon={Trash2} variant="danger" size="iconSm" onClick={() => deleteBadge(b.id)} title="Удалить" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* МОДАЛКА СОЗДАНИЯ/РЕДАКТИРОВАНИЯ ПЛАШКИ — как «Создать роль» */}
        {showForm && (
          <>
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] animate-in fade-in duration-200" onClick={() => !saving && setShowForm(false)} />
            <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
              <div className="w-full max-w-lg border border-line dark:border-white/20 rounded-2xl bg-ivory dark:bg-[#1f1f23]/95 backdrop-blur-md shadow-2xl p-6 pointer-events-auto max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-black text-gray-900 dark:text-white">
                    {editingBadge ? "Редактировать плашку" : "Создать плашку"}
                  </h2>
                  <IconButton icon={X} size="iconSm" onClick={() => !saving && setShowForm(false)} />
                </div>
                <form onSubmit={saveBadge} className="space-y-5">
                  <div>
                    <label className="block text-sm font-bold text-gray-800 dark:text-white/80 mb-2">Название плашки</label>
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Младший разработчик, Chapter Lead, 2nd Founder" required
                      className="w-full border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-[#8b5cf6] transition-colors" />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-800 dark:text-white/80 mb-2">Текст на плашке</label>
                    <input value={textContent} onChange={(e) => setTextContent(e.target.value)} maxLength={40} placeholder="Что видно пользователям (по умолчанию — название)"
                      className="w-full border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-[#8b5cf6] transition-colors" />
                    <span className="text-xs text-gray-500 dark:text-white/40 mt-1 block">{textContent.length}/40</span>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-800 dark:text-white/80 mb-2">Цвет плашки</label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-16 h-10 rounded-lg border border-line dark:border-white/20 cursor-pointer bg-transparent" />
                      <input type="text" value={color} onChange={(e) => setColor(e.target.value)} className="flex-1 border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white font-mono text-sm focus:outline-none focus:border-[#8b5cf6]" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-800 dark:text-white/80 mb-2">Цвет текста</label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="w-16 h-10 rounded-lg border border-line dark:border-white/20 cursor-pointer bg-transparent" />
                      <input type="text" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="flex-1 border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white font-mono text-sm focus:outline-none focus:border-[#8b5cf6]" />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-bold text-gray-800 dark:text-white/80">Уровень иерархии</label>
                      <span className="text-xs font-mono px-2 py-0.5 rounded border" style={{ color: LEVEL_META[level]?.color, borderColor: `${LEVEL_META[level]?.color}40`, backgroundColor: `${LEVEL_META[level]?.color}10` }}>
                        {level} / 11
                      </span>
                    </div>
                    <input type="range" min={9} max={11} value={level} onChange={(e) => setLevel(Number(e.target.value))}
                      className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-[#8b5cf6] bg-gray-100 dark:bg-white/10" />
                    <div className="flex justify-between text-[10px] text-gray-500 dark:text-white/40 mt-1 font-mono">
                      <span>9 {LEVEL_META[9].label}</span>
                      <span>10 {LEVEL_META[10].label}</span>
                      <span>11 {LEVEL_META[11].label}</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-white/40 mt-2">
                      Плашка уровня <strong>{level}</strong> ({LEVEL_META[level]?.label}) — для сотрудников команды этого уровня.
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-600 dark:text-white/50 mb-2">Предпросмотр:</p>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10">
                      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-black uppercase tracking-widest shadow-lg border"
                        style={{ backgroundColor: color, color: textColor, border: `2px solid ${color}` }}>
                        {textContent || name || "Плашка"}
                        <span className="border-l border-white/30 pl-2 text-[10px] font-mono opacity-90">Lvl {level}</span>
                      </span>
                      <span className="text-xs text-gray-500 dark:text-white/40">Так плашку увидят пользователи</span>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button type="submit" loading={saving} disabled={saving} className="flex-1">
                      {saving ? "Сохранение..." : editingBadge ? "Сохранить" : "Создать"}
                    </Button>
                    <Button variant="secondary" onClick={() => !saving && setShowForm(false)} disabled={saving} className="flex-1">
                      Отмена
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </>
        )}

        {/* МОДАЛКА ВЫДАЧИ ПЛАШКИ ПОЛЬЗОВАТЕЛЮ */}
        {showAssign && (
          <>
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] animate-in fade-in duration-200" onClick={() => !assignSaving && setShowAssign(false)} />
            <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
              <div className="w-full max-w-md border border-line dark:border-white/20 rounded-2xl bg-ivory dark:bg-[#1f1f23]/95 backdrop-blur-md shadow-2xl p-6 pointer-events-auto max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                    <Crown size={18} className="text-[#fbbf24]" /> Выдать плашку
                  </h2>
                  <IconButton icon={X} size="iconSm" onClick={() => !assignSaving && setShowAssign(false)} />
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-800 dark:text-white/80 mb-2">Найти пользователя</label>
                    <input value={assignQuery} onChange={(e) => { setAssignQuery(e.target.value); setAssignTarget(null); }} placeholder="Введите username или имя..."
                      className="w-full border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-[#8b5cf6]" />
                  </div>

                  {!assignTarget && assignResults.length > 0 && (
                    <div className="border border-line dark:border-white/10 rounded-lg divide-y divide-gray-100 dark:divide-white/5 max-h-52 overflow-y-auto">
                      {assignResults.map(u => (
                        <button key={u.id} type="button" onClick={() => { setAssignTarget(u); setAssignQuery(""); }}
                          className="w-full flex items-center gap-3 p-2.5 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left">
                          {u.avatar_url ? <img src={u.avatar_url} className="w-8 h-8 rounded-full object-cover" /> : <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-white/10" />}
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{u.display_name || u.username}</p>
                            <p className="text-xs text-gray-500 dark:text-white/40">@{u.username}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {assignTarget && (
                    <div className="p-3 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 flex items-center gap-3">
                      {assignTarget.avatar_url ? <img src={assignTarget.avatar_url} className="w-10 h-10 rounded-full object-cover" /> : <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-white/10" />}
                      <div>
                        <p className="text-sm font-bold text-gray-900 dark:text-white">{assignTarget.display_name || assignTarget.username}</p>
                        <p className="text-xs text-gray-500 dark:text-white/40">@{assignTarget.username}</p>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-bold text-gray-800 dark:text-white/80 mb-2">Плашка</label>
                    <select value={assignBadgeId ?? ""} onChange={(e) => setAssignBadgeId(e.target.value ? Number(e.target.value) : null)}
                      className="w-full border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:border-[#8b5cf6]">
                      <option value="">— Выберите плашку —</option>
                      {badges.map(b => (
                        <option key={b.id} value={b.id}>{b.name} (lvl {b.priority ?? 9})</option>
                      ))}
                    </select>
                    {badges.length === 0 && (
                      <p className="text-xs text-amber-500 mt-1.5">Сначала создайте дополнительную плашку — кнопка «Создать плашку».</p>
                    )}
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button onClick={assignBadgeToUser} loading={assignSaving} disabled={!assignTarget || !assignBadgeId || assignSaving} className="flex-1">
                      Выдать
                    </Button>
                    <Button variant="secondary" onClick={() => !assignSaving && setShowAssign(false)} disabled={assignSaving} className="flex-1">
                      Отмена
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

      </main>
    </div>
  );
}
