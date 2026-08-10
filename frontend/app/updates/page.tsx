"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { getToken } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import Link from "next/link";
import {
  Megaphone, Flame, Sparkles, Wrench, X, Plus, Trash2, Clock, ArrowLeft,
  CheckCheck, ChevronDown,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const IMPORTANCE: Record<string, any> = {
  major: {
    label: "ВАЖНО",
    color: "#ef4444",
    icon: Flame,
    glow: "0 0 24px rgba(239,68,68,0.25)",
    border: "border-red-500/50",
    bg: "bg-red-500/10",
  },
  minor: {
    label: "ОБНОВЛЕНИЕ",
    color: "#8b5cf6",
    icon: Sparkles,
    glow: "0 0 18px rgba(139,92,246,0.2)",
    border: "border-[#8b5cf6]/40",
    bg: "bg-[#8b5cf6]/10",
  },
  patch: {
    label: "ФИКС",
    color: "#10b981",
    icon: Wrench,
    glow: "0 0 12px rgba(16,185,129,0.15)",
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/10",
  },
};

export default function UpdatesPage() {
  const [updates, setUpdates] = useState<any[]>([]);
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [importance, setImportance] = useState("minor");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // 🆕 Прочитанные посты
  const [readIds, setReadIds] = useState<Set<number>>(new Set());
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const postsRef = useRef<HTMLDivElement>(null);

  const canWrite = (me?.level ?? 0) >= 10;

  useEffect(() => {
    load();
    const token = getToken();
    if (token) {
      fetch(`${API_URL}/api/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then(setMe)
        .catch(() => {});
    }
  }, []);

  async function load() {
    try {
      const token = getToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/updates`, { headers });
      if (res.ok) {
        const data = await res.json();
        setUpdates(data);
        // Если бэкенд возвращает is_read — собираем прочитанные
        const read = new Set<number>(
          data.filter((u: any) => u.is_read).map((u: any) => u.id)
        );
        setReadIds(read);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const isRead = useCallback((id: number) => readIds.has(id), [readIds]);

  async function markRead(id: number) {
    if (isRead(id)) return;
    const token = getToken();
    if (!token) return;

    // Оптимистично
    setReadIds((prev) => new Set(prev).add(id));

    try {
      await fetch(`${API_URL}/api/updates/${id}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (e) {
      console.error("Failed to mark read:", e);
    }
  }

  async function markAllRead() {
    const token = getToken();
    if (!token) return;
    const unread = updates.filter((u) => !isRead(u.id));
    if (unread.length === 0) return;

    setReadIds(new Set(updates.map((u) => u.id)));

    try {
      await fetch(`${API_URL}/api/updates/read-all`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (e) {
      console.error(e);
    }
  }

  function toggleExpand(id: number) {
    if (expandedId === id) {
      // Сворачиваем → отмечаем прочитанным
      setExpandedId(null);
      markRead(id);
    } else {
      setExpandedId(id);
    }
  }

  // 🆕 Клик вне поста — сворачиваем и отмечаем прочитанным
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (postsRef.current && !postsRef.current.contains(e.target as Node)) {
        if (expandedId !== null) {
          markRead(expandedId);
          setExpandedId(null);
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [expandedId]);

  async function createUpdate() {
    const token = getToken();
    if (!token) return;
    setSaving(true);
    setError("");

    const form = new FormData();
    form.append("title", title);
    form.append("content", content);
    form.append("importance", importance);

    try {
      const res = await fetch(`${API_URL}/api/updates`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError(d?.detail ?? "Ошибка создания");
        setSaving(false);
        return;
      }
      setTitle("");
      setContent("");
      setImportance("minor");
      setShowForm(false);
      load();
    } catch {
      setError("Ошибка сети");
    } finally {
      setSaving(false);
    }
  }

  async function deleteUpdate(id: number) {
    if (!confirm("Удалить это обновление?")) return;
    const token = getToken();
    if (!token) return;
    const res = await fetch(`${API_URL}/api/updates/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) load();
  }

  const unreadCount = updates.filter((u) => !isRead(u.id)).length;

  return (
    <div className="min-h-screen bg-[#171717]">
      <div className="max-w-3xl mx-auto px-4 py-10">
        {/* Кнопка возврата */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 mb-8 px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-white/70 hover:text-white hover:bg-[#8b5cf6]/10 hover:border-[#8b5cf6]/40 transition-all group"
        >
          <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
          <span className="font-semibold text-sm">Вернуться на главную</span>
        </Link>

        {/* Шапка */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#8b5cf6]/20 border border-[#8b5cf6]/40 mb-4 shadow-[0_0_30px_rgba(139,92,246,0.3)]">
            <Megaphone size={28} className="text-[#8b5cf6]" />
          </div>
          <h1 className="text-4xl font-black text-white mb-2">Блог обновлений</h1>
          <p className="text-white/50">
            Все изменения trelod — от важных релизов до мелких фиксов
          </p>
          <p className="text-white/30 text-xs mt-2 font-mono">
            {updates.length} обновлений
          </p>

          <div className="flex items-center justify-center gap-3 mt-6">
            {canWrite && (
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#8b5cf6] text-white font-bold hover:bg-[#7c3aed] transition-all shadow-lg shadow-[#8b5cf6]/30"
              >
                <Plus size={18} /> Написать обновление
              </button>
            )}
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#8b5cf6]/40 text-[#8b5cf6] font-semibold hover:bg-[#8b5cf6]/10 transition-all text-sm"
              >
                <CheckCheck size={16} />
                Прочитать все ({unreadCount})
              </button>
            )}
          </div>
        </div>

        {loading && <p className="text-center text-white/50 animate-pulse">Загрузка...</p>}

        {!loading && updates.length === 0 && (
          <div className="text-center p-12 border border-white/10 rounded-2xl bg-white/5">
            <Megaphone size={48} className="mx-auto text-white/20 mb-4" />
            <p className="text-white/50">Обновлений пока нет</p>
          </div>
        )}

        {/* Таймлайн */}
        <div className="relative pl-10" ref={postsRef}>
          <div className="absolute left-[13px] top-2 bottom-0 w-px bg-gradient-to-b from-[#8b5cf6]/60 via-white/10 to-transparent" />

          {updates.map((u) => {
            const cfg = IMPORTANCE[u.importance] ?? IMPORTANCE.minor;
            const Icon = cfg.icon;
            const isMajor = u.importance === "major";
            const expanded = expandedId === u.id;
            const read = isRead(u.id);

            return (
              <div key={u.id} className="relative mb-8">
                {/* Точка на таймлайне */}
                <span
                  className="absolute -left-10 top-5 w-7 h-7 rounded-full border-2 bg-[#171717] flex items-center justify-center z-10"
                  style={{
                    borderColor: read ? "rgba(255,255,255,0.15)" : cfg.color,
                    boxShadow: read ? "none" : cfg.glow,
                  }}
                >
                  <Icon size={13} style={{ color: read ? "rgba(255,255,255,0.3)" : cfg.color }} />
                </span>

                {/* Карточка */}
                <article
                  onClick={() => toggleExpand(u.id)}
                  className={`border rounded-2xl p-5 backdrop-blur-sm transition-all cursor-pointer select-none relative overflow-hidden ${
                    read
                      ? "bg-white/5 border-white/10 hover:bg-white/[0.07]"
                      : "bg-[#8b5cf6]/[0.03] border-[#8b5cf6]/20 hover:bg-[#8b5cf6]/[0.06]"
                  }`}
                  style={isMajor && !read ? { boxShadow: cfg.glow } : undefined}
                >
                  {/* Полоса непрочитанного */}
                  {!read && (
                    <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full bg-[#8b5cf6]" />
                  )}

                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${cfg.bg}`}
                          style={{ color: cfg.color }}
                        >
                          <Icon size={10} />
                          {cfg.label}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs text-white/40">
                          <Clock size={11} />
                          {new Date(u.created_at).toLocaleString("ru-RU", {
                            day: "2-digit", month: "long", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </span>

                        {/* Индикатор непрочитанного */}
                        {!read && (
                          <span className="ml-auto w-2 h-2 rounded-full bg-[#8b5cf6] shadow-[0_0_6px_rgba(139,92,246,0.6)]" />
                        )}
                      </div>

                      <h2 className={`font-black text-white mb-3 ${isMajor ? "text-2xl" : "text-lg"}`}>
                        {u.title}
                      </h2>

                      {/* Контент с обрезкой */}
                      <div className="relative">
                        <p
                          className={`text-white/70 text-sm leading-relaxed whitespace-pre-wrap transition-all ${
                            expanded ? "" : "line-clamp-3"
                          }`}
                        >
                          {u.content}
                        </p>

                        {/* Градиент "читать дальше" */}
                        {!expanded && u.content.length > 120 && (
                          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#171717]/90 to-transparent pointer-events-none" />
                        )}
                      </div>

                      {/* Подсказка развернуть */}
                      {!expanded && u.content.length > 120 && (
                        <div className="flex items-center gap-1 mt-2 text-[#8b5cf6] text-xs font-semibold opacity-60 group-hover:opacity-100">
                          <ChevronDown size={14} />
                          Нажмите, чтобы развернуть
                        </div>
                      )}

                      {u.author && (
                        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/5">
                          <Avatar src={u.author.avatar_url} name={u.author.display_name} id={u.author.id} size={24} />
                          <span className="text-xs text-white/50">
                            {u.author.display_name}
                          </span>
                          {u.author.level >= 11 && (
                            <span className="text-[9px] font-black uppercase tracking-widest text-[#00ff41]">System</span>
                          )}
                          {u.author.level === 10 && (
                            <span className="text-[9px] font-black uppercase tracking-widest text-white">Founder</span>
                          )}
                        </div>
                      )}
                    </div>

                    {canWrite && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteUpdate(u.id);
                        }}
                        className="p-2 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0"
                        title="Удалить"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </article>
              </div>
            );
          })}
        </div>
      </div>

      {/* Модалка создания */}
      {showForm && (
        <>
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200]" onClick={() => setShowForm(false)} />
          <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
            <div className="w-full max-w-xl border border-white/20 rounded-2xl bg-[#1f1f23]/95 backdrop-blur-md shadow-2xl p-6 pointer-events-auto max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-black text-white">Новое обновление</h2>
                <button onClick={() => setShowForm(false)} className="text-white/60 hover:text-white p-1.5 rounded-lg hover:bg-white/10">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-white/70 mb-1">Заголовок</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full border border-white/10 rounded-lg px-3 py-2 bg-white/5 text-white focus:outline-none focus:border-[#8b5cf6]"
                    placeholder="Например: Добавлены личные сообщения"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-white/70 mb-2">Важность</label>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(IMPORTANCE).map(([key, cfg]: [string, any]) => {
                      const Icon = cfg.icon;
                      return (
                        <button
                          key={key}
                          onClick={() => setImportance(key)}
                          className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold transition-all ${
                            importance === key
                              ? `${cfg.border} ${cfg.bg}`
                              : "border-white/10 text-white/50 hover:bg-white/5"
                          }`}
                          style={importance === key ? { color: cfg.color } : undefined}
                        >
                          <Icon size={13} />
                          {cfg.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-white/70 mb-1">Текст обновления</label>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={6}
                    className="w-full border border-white/10 rounded-lg px-3 py-2 bg-white/5 text-white focus:outline-none focus:border-[#8b5cf6] resize-none"
                    placeholder="Опиши, что изменилось..."
                  />
                </div>

                {error && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold">
                    {error}
                  </div>
                )}

                <button
                  onClick={createUpdate}
                  disabled={saving}
                  className="w-full bg-[#8b5cf6] text-white font-bold rounded-lg py-2.5 hover:bg-[#7c3aed] transition-all disabled:opacity-40"
                >
                  {saving ? "Публикация..." : "Опубликовать"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}