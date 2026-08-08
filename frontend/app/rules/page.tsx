"use client";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Shield, Edit2, Save, X, Crown } from "lucide-react";
import { getToken } from "@/lib/auth";

export default function RulesPage() {
  const [rules, setRules] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [roles, setRoles] = useState<any[]>([]);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/rules`)
      .then((r) => r.json())
      .then((data) => {
        setRules(data);
        setEditContent(JSON.stringify(data, null, 2));
      });

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/roles`)
      .then((r) => r.json())
      .then(setRoles);

    const token = getToken();
    if (token) {
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((user) => setIsAdmin(user.is_admin));
    }
  }, []);

  async function saveRules() {
    const token = getToken();
    if (!token) return;
    try {
      const parsed = JSON.parse(editContent);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/rules`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: editContent }),
      });
      if (res.ok) {
        setRules(parsed);
        setEditing(false);
        alert("✅ Правила сохранены!");
      } else {
        const errorBody = await res.text();
        alert(`❌ Ошибка ${res.status}: ${errorBody}`);
      }
    } catch (e) {
      alert("⚠️ Невалидный JSON: " + (e as Error).message);
    }
  }

  // Фильтруем только staff-роли и сортируем: старшие (меньше position) сверху,
  // если position = 0 у всех — сортируем по level DESC
  const staffRoles = roles
    .filter((r) => r.is_staff)
    .sort((a, b) => {
      if (a.position !== b.position) return (a.position || 0) - (b.position || 0);
      return (b.level || 0) - (a.level || 0);
    });

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />
      <div className="w-px shrink-0 bg-white/10 my-3" />
      <main className="flex-1 overflow-y-auto border-x border-white/10">
        <div className="p-6 border-b border-white/10 sticky top-0 bg-[#171717]/80 backdrop-blur-md z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield size={24} className="text-[#8b5cf6]" />
              <h1 className="text-2xl font-black text-white">
                {rules?.title || "Правила"}
              </h1>
            </div>
            {isAdmin && (
              <button
                onClick={() => setEditing(!editing)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/20 text-white/80 hover:bg-white/10 transition-all"
              >
                {editing ? <X size={18} /> : <Edit2 size={18} />}
                {editing ? "Отмена" : "Редактировать"}
              </button>
            )}
          </div>
          {rules?.subtitle && !editing && (
            <p className="text-white/60 text-sm mt-2 leading-relaxed">
              {rules.subtitle}
            </p>
          )}
        </div>

        {!rules && <p className="p-8 text-center text-white/50">Загрузка правил...</p>}

        {editing && (
          <div className="p-6 max-w-4xl mx-auto">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full h-[70vh] p-4 rounded-xl border border-white/20 bg-white/5 text-white font-mono text-sm focus:outline-none focus:border-[#8b5cf6]"
              placeholder="JSON с правилами..."
            />
            <button
              onClick={saveRules}
              className="mt-4 flex items-center gap-2 px-6 py-3 rounded-lg bg-[#8b5cf6] text-white font-bold hover:bg-[#7c3aed] transition-all"
            >
              <Save size={18} />
              Сохранить правила
            </button>
          </div>
        )}

        {rules && !editing && (
          <div className="p-6 space-y-6 max-w-4xl mx-auto">
            {rules.sections.map((section: any, i: number) => (
              <div key={section.id || i} className="border border-white/15 rounded-xl p-5 bg-white/5">
                <h2 className="text-xl font-black text-white mb-4">{section.heading}</h2>

                {section.items && (
                  <div className="space-y-3">
                    {section.items.map((item: string, j: number) => (
                      <p key={j} className="text-white/80 leading-relaxed pl-4 border-l-2 border-purple-400/30">
                        {item}
                      </p>
                    ))}
                  </div>
                )}

                {section.table && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-white/20">
                          <th className="text-left p-3 text-white/60 font-bold">№</th>
                          <th className="text-left p-3 text-white/60 font-bold">Мера наказания</th>
                          <th className="text-left p-3 text-white/60 font-bold">Описание</th>
                          <th className="text-left p-3 text-white/60 font-bold">Типичные нарушения</th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.table.map((row: any, j: number) => (
                          <tr key={j} className="border-b border-white/10 hover:bg-white/5 transition-colors">
                            <td className="p-3 text-white/70 font-bold">{row.num}</td>
                            <td className="p-3 text-white font-semibold">{row.measure}</td>
                            <td className="p-3 text-white/70">{row.description}</td>
                            <td className="p-3 text-white/70">{row.violations}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {section.note && <p className="mt-4 text-sm text-white/60 italic">{section.note}</p>}
              </div>
            ))}

            {/* СЕКЦИЯ С РОЛЯМИ — только staff, с описанием, старшие сверху */}
            {staffRoles.length > 0 && (
              <div className="border border-white/15 rounded-xl p-5 bg-white/5">
                <div className="flex items-center gap-2 mb-4">
                  <Crown size={20} className="text-[#8b5cf6]" />
                  <h2 className="text-xl font-black text-white">Команда NEBULA</h2>
                </div>
                <p className="text-white/60 text-sm mb-5">
                  Люди, которые следят за платформой и помогают сообществу.
                </p>
                <div className="space-y-3">
                  {staffRoles.map((role, idx) => (
                    <div
                      key={role.id}
                      className="flex items-start gap-4 p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all"
                    >
                      <div
                        className="shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-white font-black text-lg"
                        style={{ backgroundColor: role.color }}
                      >
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="font-black text-white text-lg">{role.name}</p>
                          <span
                            className="px-2 py-0.5 rounded-full text-xs font-bold text-white"
                            style={{ backgroundColor: role.color }}
                          >
                            Уровень {role.level}
                          </span>
                        </div>
                        <p className="text-white/70 text-sm leading-relaxed">
                          {role.description || "Описание отсутствует"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {rules.footer && (
              <div className="border border-purple-400/30 rounded-xl p-5 bg-purple-500/10 text-center">
                <p className="text-white/80 font-semibold">{rules.footer}</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}