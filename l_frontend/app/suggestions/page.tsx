"use client";
import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { Avatar } from "@/components/Avatar";
import { CommunityTabs } from "@/components/CommunityTabs";
import {
  MessageSquare, Plus, ArrowLeft, Globe, Server, Archive, CheckCircle,
  Tags, Pencil, Lock, Trash2, X, FolderPlus, Save,
} from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import { SuggestionsSkeleton } from "@/components/Skeletons";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const ICONS: Record<string, any> = {
  globe: Globe, server: Server, archive: Archive,
  "check-circle": CheckCircle, "message-square": MessageSquare,
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function SuggestionsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [categories, setCategories] = useState<any[]>([]);
  const [prefixes, setPrefixes] = useState<any[]>([]);
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [catModal, setCatModal] = useState<any | null>(null); // null | {} новая | категория
  const [showPrefixModal, setShowPrefixModal] = useState(false);

  const canManage = !!me && (me.is_admin || (me.permissions || []).includes("manage_suggestions"));

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const token = getToken();
    const h = token ? { Authorization: `Bearer ${token}` } : undefined;
    try {
      const [meRes, catsRes, prefRes] = await Promise.all([
        fetch(`${API_URL}/api/me`, { headers: h }),
        fetch(`${API_URL}/api/suggestions/categories`, { headers: h }),
        fetch(`${API_URL}/api/suggestions/prefixes`, { headers: h }),
      ]);
      if (meRes.ok) setMe(await meRes.json());
      if (catsRes.ok) setCategories(await catsRes.json());
      if (prefRes.ok) setPrefixes(await prefRes.json());
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }

  if (loading) return <SuggestionsSkeleton />;

  return (
    <div className="min-h-screen bg-paper dark:bg-[#171717]">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <CommunityTabs />


        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-black text-gray-900 dark:text-white">{t("suggestions.title")}</h1>
            <p className="text-gray-600 dark:text-white/50 text-sm mt-1">{t("suggestions.subtitle")}</p>
          </div>
          {canManage && (
            <div className="flex gap-2">
              <Button variant="secondary" icon={Tags} onClick={() => setShowPrefixModal(true)}>
                {t("suggestions.prefixes")}
              </Button>
              <Button icon={FolderPlus} onClick={() => setCatModal({})}>
                {t("suggestions.createCategory")}
              </Button>
            </div>
          )}
        </div>

        {/* Один блок со списком разделов — как в XenForo */}
        <div className="border border-line dark:border-white/10 rounded-2xl bg-gray-100 dark:bg-white/5 overflow-hidden">
          {categories.length === 0 && (
            <div className="text-center py-16">
              <MessageSquare size={48} className="mx-auto text-gray-500 dark:text-white/20 mb-4" />
              <p className="text-gray-600 dark:text-white/50">{t("suggestions.noCategories")}</p>
            </div>
          )}
          {categories.map((cat, i) => {
            const Icon = ICONS[cat.icon] || MessageSquare;
            const last = cat.last_activity;
            return (
              <div key={cat.id}
                className={`flex items-center gap-4 p-5 hover:bg-gray-100 dark:hover:bg-white/5 transition-all cursor-pointer ${i > 0 ? "border-t border-line dark:border-white/10" : ""}`}
                onClick={() => router.push(`/suggestions/category/${cat.id}`)}>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${cat.color}20` }}>
                  <Icon size={24} style={{ color: cat.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-gray-900 dark:text-white text-lg hover:text-[#8b5cf6] transition-colors">{cat.name}</h3>
                    {cat.is_archived && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-500/20 text-gray-400 flex items-center gap-1">
                        <Lock size={10} /> {t("suggestions.closedCategory")}
                      </span>
                    )}
                  </div>
                  {cat.description && <p className="text-gray-600 dark:text-white/50 text-sm truncate">{cat.description}</p>}
                  {last && (
                    <div className="flex items-center gap-2 mt-2 text-xs text-gray-500 dark:text-white/40 min-w-0">
                      <Avatar src={last.author?.avatar_url} name={last.author?.display_name} id={last.author?.id} size={18} />
                      <span className="truncate">{last.thread_title}</span>
                      <span className="shrink-0">· {fmtDate(last.created_at)} · {last.author?.display_name}</span>
                    </div>
                  )}
                </div>
                <div className="hidden sm:flex text-center text-xs text-gray-600 dark:text-white/50 gap-6 shrink-0">
                  <div><p className="font-black text-gray-900 dark:text-white text-base">{cat.threads_count}</p>{t("suggestions.threads")}</div>
                  <div><p className="font-black text-gray-900 dark:text-white text-base">{cat.comments_count}</p>{t("suggestions.messages")}</div>
                </div>
                {canManage && (
                  <IconButton icon={Pencil} onClick={(e) => { e.stopPropagation(); setCatModal(cat); }}
                    className="shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {catModal && (
        <CategoryModal
          initial={catModal.id ? catModal : null}
          onClose={() => setCatModal(null)}
          onSaved={loadData}
        />
      )}
      {showPrefixModal && (
        <PrefixModal prefixes={prefixes} onClose={() => setShowPrefixModal(false)} onSaved={loadData} />
      )}
    </div>
  );
}

/* ---------- Модалка раздела (создание/редактирование/закрытие) ---------- */
function CategoryModal({ initial, onClose, onSaved }: any) {
  const { t } = useI18n();
  const [name, setName] = useState(initial?.name || "");
  const [desc, setDesc] = useState(initial?.description || "");
  const [color, setColor] = useState(initial?.color || "#8b5cf6");
  const [icon, setIcon] = useState(initial?.icon || "message-square");
  const [archived, setArchived] = useState(!!initial?.is_archived);

  async function save() {
    if (!name.trim()) return alert(t("suggestions.fillFields"));
    const token = getToken();
    const form = new FormData();
    form.append("name", name); form.append("description", desc);
    form.append("color", color); form.append("icon", icon);
    if (initial) form.append("is_archived", String(archived));
    try {
      const res = await fetch(`${API_URL}/api/suggestions/categories${initial ? `/${initial.id}` : ""}`, {
        method: initial ? "PATCH" : "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.ok) { onClose(); onSaved(); }
      else {
        const d = await res.json().catch(() => ({}));
        alert(d.detail || t("common.error"));
      }
    } catch (e) {
      console.error(e);
      alert(t("common.error"));
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-black text-gray-900 dark:text-white">{initial ? t("suggestions.editCategory") : t("suggestions.createCategory")}</h3>
          <IconButton icon={X} onClick={onClose} />
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("suggestions.categoryName")}
          className="w-full mb-3 px-3 py-2 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 text-gray-900 dark:text-white focus:border-[#8b5cf6] outline-none" />
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t("suggestions.categoryDesc")} rows={2}
          className="w-full mb-3 px-3 py-2 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 text-gray-900 dark:text-white focus:border-[#8b5cf6] outline-none resize-none" />
        <div className="flex gap-3 mb-3">
          <div className="flex-1">
            <label className="block text-xs text-gray-600 dark:text-white/60 mb-1">{t("suggestions.categoryColor")}</label>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-full h-10 rounded-lg cursor-pointer" />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-600 dark:text-white/60 mb-1">{t("suggestions.categoryIcon")}</label>
            <select value={icon} onChange={(e) => setIcon(e.target.value)}
              className="w-full h-10 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 text-gray-900 dark:text-white px-2 outline-none">
              <option value="message-square">💬</option>
              <option value="globe">🌐</option>
              <option value="server">🖥️</option>
              <option value="archive">📦</option>
              <option value="check-circle">✅</option>
            </select>
          </div>
        </div>
        {initial && (
          <label className="flex items-center gap-2 mb-4 text-sm text-gray-800 dark:text-white/70 cursor-pointer">
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="accent-[#8b5cf6]" />
            {t("suggestions.closeCategory")}
          </label>
        )}
        <div className="flex gap-2">
          <Button onClick={save} className="flex-1">{t("suggestions.saveCategory")}</Button>
          <Button variant="secondary" onClick={onClose} className="flex-1">{t("common.cancel")}</Button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Модалка префиксов: список + создание + удаление ---------- */
function PrefixModal({ prefixes, onClose, onSaved }: any) {
  const { t } = useI18n();
  const [list, setList] = useState<any[]>(prefixes);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#ffffff");
  const [bg, setBg] = useState("#ef4444");

  async function create() {
    if (!name.trim()) return alert(t("suggestions.fillFields"));
    const token = getToken();
    const form = new FormData();
    form.append("name", name); form.append("color", color); form.append("bg_color", bg);
    try {
      const res = await fetch(`${API_URL}/api/admin/suggestion-prefixes`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
      });
      if (res.ok) { setName(""); const r = await fetch(`${API_URL}/api/suggestions/prefixes`).then(r => r.json()); setList(r); onSaved(); }
      else {
        const d = await res.json().catch(() => ({}));
        alert(d.detail || t("common.error"));
      }
    } catch (e) {
      console.error(e);
      alert(t("common.error"));
    }
  }

  async function remove(id: number) {
    if (!confirm(t("suggestions.deletePrefixConfirm"))) return;
    const token = getToken();
    const res = await fetch(`${API_URL}/api/admin/suggestion-prefixes/${id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) { setList(list.filter(p => p.id !== id)); onSaved(); }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-black text-gray-900 dark:text-white">{t("suggestions.prefixManager")}</h3>
          <IconButton icon={X} onClick={onClose} />
        </div>

        <div className="space-y-2 mb-5">
          {list.length === 0 && <p className="text-gray-500 dark:text-white/40 text-sm text-center py-4">{t("suggestions.noPrefixes")}</p>}
          {list.map((p) => (
            <div key={p.id} className="flex items-center gap-3 border border-line dark:border-white/10 rounded-lg p-2.5 bg-gray-100 dark:bg-white/5">
              <span className="px-2.5 py-1 rounded text-xs font-bold" style={{ color: p.color, background: p.bg_color }}>{p.name}</span>
              <div className="flex-1" />
              <IconButton icon={Trash2} variant="danger" size="iconSm" onClick={() => remove(p.id)} />
            </div>
          ))}
        </div>

        <div className="border-t border-line dark:border-white/10 pt-4">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("suggestions.prefixName")}
            className="w-full mb-3 px-3 py-2 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 text-gray-900 dark:text-white focus:border-[#8b5cf6] outline-none" />
          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-600 dark:text-white/60 mb-1">{t("suggestions.prefixColor")}</label>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-full h-9 rounded cursor-pointer" />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-600 dark:text-white/60 mb-1">{t("suggestions.prefixBg")}</label>
              <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="w-full h-9 rounded cursor-pointer" />
            </div>
            <div className="flex items-end pb-1">
              <span className="px-2.5 py-1 rounded text-xs font-bold" style={{ color, background: bg }}>{name || "Aa"}</span>
            </div>
          </div>
          <Button icon={Plus} onClick={create} className="w-full">
            {t("suggestions.createPrefix")}
          </Button>
        </div>
      </div>
    </div>
  );
}