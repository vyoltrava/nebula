"use client";
import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { MessageSquare, Plus, ArrowLeft, Globe, Server, Archive, CheckCircle } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function SuggestionsPage() {
  const { t } = useI18n();
  const [categories, setCategories] = useState<any[]>([]);
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDesc, setNewCategoryDesc] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("#8b5cf6");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const token = getToken();
    // 🛠️ ИСПРАВЛЕНО: undefined вместо {}
    const authHeader = token ? { Authorization: `Bearer ${token}` } : undefined;
    
    try {
      const [meRes, catsRes] = await Promise.all([
        fetch(`${API_URL}/api/me`, { headers: authHeader }),
        fetch(`${API_URL}/api/suggestions/categories`, { headers: authHeader }),
      ]);
      
      if (meRes.ok) setMe(await meRes.json());
      if (catsRes.ok) setCategories(await catsRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function createCategory() {
    if (!newCategoryName.trim()) return alert("Введите название");
    const token = getToken();
    const form = new FormData();
    form.append("name", newCategoryName);
    form.append("description", newCategoryDesc);
    form.append("color", newCategoryColor);
    form.append("icon", "message-square");
    
    const res = await fetch(`${API_URL}/api/suggestions/categories`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    
    if (res.ok) {
      setShowCreateModal(false);
      setNewCategoryName("");
      setNewCategoryDesc("");
      loadData();
    }
  }

  if (loading) return <div className="p-8 text-center text-white/50">{t("common.loading")}</div>;

  const isAdmin = me?.is_admin;

  return (
    <div className="min-h-screen bg-[#171717]">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <Link href="/updates" className="inline-flex items-center gap-2 text-white/50 hover:text-white mb-6">
          <ArrowLeft size={16} /> {t("suggestions.backToUpdates")}
        </Link>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-white">{t("suggestions.title")}</h1>
            <p className="text-white/50 text-sm mt-1">{t("suggestions.subtitle")}</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white font-bold hover:bg-purple-400"
            >
              <Plus size={16} /> Создать раздел
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4">
          {categories.map((cat) => {
            const Icon = cat.icon === "globe" ? Globe : cat.icon === "server" ? Server : cat.is_archived ? Archive : MessageSquare;
            return (
              <Link
                key={cat.id}
                href={`/suggestions/category/${cat.id}`}
                className="border border-white/10 rounded-xl p-6 bg-white/5 hover:bg-white/10 transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ background: `${cat.color}20` }}>
                    <Icon size={28} style={{ color: cat.color }} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-white text-xl group-hover:text-[#8b5cf6] transition-colors">{cat.name}</h3>
                      {cat.is_archived && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-500/20 text-gray-400">Архив</span>
                      )}
                    </div>
                    {cat.description && (
                      <p className="text-white/50 text-sm">{cat.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-white/40">
                      <span>{cat.threads_count} тем</span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#1f1f23] border border-white/15 rounded-2xl p-6">
            <h3 className="text-xl font-black text-white mb-4">Создать раздел</h3>
            <input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Название раздела"
              className="w-full mb-3 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:border-[#8b5cf6] outline-none"
            />
            <textarea
              value={newCategoryDesc}
              onChange={(e) => setNewCategoryDesc(e.target.value)}
              placeholder="Описание"
              rows={3}
              className="w-full mb-3 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:border-[#8b5cf6] outline-none resize-none"
            />
            <div className="mb-4">
              <label className="block text-xs text-white/60 mb-2">Цвет</label>
              <input
                type="color"
                value={newCategoryColor}
                onChange={(e) => setNewCategoryColor(e.target.value)}
                className="w-full h-10 rounded-lg cursor-pointer"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={createCategory} className="flex-1 py-2.5 rounded-lg bg-[#8b5cf6] text-white font-bold hover:bg-[#7c3aed]">Создать</button>
              <button onClick={() => setShowCreateModal(false)} className="flex-1 py-2.5 rounded-lg border border-white/15 text-white/80 font-bold hover:bg-white/5">Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}