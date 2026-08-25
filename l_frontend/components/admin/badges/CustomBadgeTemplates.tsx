"use client";
import { useState, useEffect } from "react";
import { getToken } from "@/lib/auth";
import { X, Copy } from "lucide-react";

interface TemplateData {
  id: number;
  name: string;
  description: string | null;
  badge_config: string;
}

export function CustomBadgeTemplates() {
  const [templates, setTemplates] = useState<TemplateData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [templateName, setTemplateName] = useState("");

  useEffect(() => { fetchTemplates(); }, []);

  const fetchTemplates = async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/custom-badge-templates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { setTemplates(await res.json()); }
    } catch (e) { setError("Ошибка загрузки шаблонов"); console.error(e); }
    finally { setLoading(false); }
  };

  const deleteTemplate = async (id: number) => {
    if (!confirm("Удалить шаблон?")) return;
    const token = getToken();
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/custom-badge-templates/${id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setTemplates(templates.filter(t => t.id !== id));
    } catch (e) { console.error(e); }
  };

  const useAsBadge = (template: TemplateData) => {
    const config = JSON.parse(template.badge_config);
    const event = new CustomEvent("create-badge-from-template", {
      detail: { ...config, name: template.name, description: template.description },
    });
    window.dispatchEvent(event);
    setShowForm(false);
  };

  return (
    <div className="space-y-4">
      {error && (<div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-600 dark:text-red-300">{error}</div>)}

      <div className="flex justify-between items-center">
        <h3 className="font-medium">Готовые шаблоны</h3>
        <button onClick={() => setShowForm(true)} className="px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-600 dark:text-blue-400 rounded text-sm">
          Сохранить как шаблон
        </button>
      </div>

      {loading ? <div className="text-center py-8 text-gray-400">Загрузка...</div>
      : templates.length === 0 ? <div className="text-center py-8 text-gray-400">Нет шаблонов</div>
      : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map(t => (
            <div key={t.id} className="bg-gray-50 dark:bg-[#171717] border border-gray-200 dark:border-white/10 rounded-xl p-4">
              <div className="flex justify-between items-start mb-2">
                <h4 className="font-medium">{t.name}</h4>
                <div className="flex gap-1">
                  <button onClick={() => useAsBadge(t)} className="p-1 bg-gray-100 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 rounded"><Copy size={14} /></button>
                  <button onClick={() => deleteTemplate(t.id)} className="p-1 bg-red-500/20 hover:bg-red-500/30 text-red-600 dark:text-red-400 rounded">🗑️</button>
                </div>
              </div>
              {t.description && <p className="text-xs text-gray-400">{t.description}</p>}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-50 dark:bg-[#171717] border border-gray-200 dark:border-white/10 rounded-xl p-6 w-96 max-w-md">
            <h3 className="font-semibold mb-3">Сохранить текущие настройки как шаблон</h3>
            <input type="text" value={templateName} onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Название шаблона" className="w-full px-3 py-2 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded mb-4" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-3 py-1 text-sm hover:bg-gray-100 dark:hover:bg-white/5 rounded">Отмена</button>
              <button onClick={() => { /* save template logic */ setShowForm(false); }} className="px-3 py-1 text-sm bg-blue-500 hover:bg-blue-600 rounded">Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
