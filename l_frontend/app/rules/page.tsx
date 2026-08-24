"use client";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Shield, Edit2, Save, X, Crown, Code2, Users, Plus, Trash2, ArrowUp, ArrowDown, Star } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import { getToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n/LanguageProvider";

export default function RulesPage() {
  const { t } = useI18n();
  const [rules, setRules] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [roles, setRoles] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/rules`)
      .then((r) => r.json())
      .then((data) => {
        setRules(data);
        const cleanSections = (data.sections || []).filter(
          (s: any) => s?.id !== "roles" && !String(s?.heading || "").toLowerCase().includes("команда")
        );
        setEditData({
          ...data,
          sections: cleanSections,
        });
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
    setSaving(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/rules`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: JSON.stringify(editData) }),
      });
      if (res.ok) {
        setRules(editData);
        setEditing(false);
        alert(t("rules.saved"));
      } else {
        const errorBody = await res.text();
        alert(t("rules.saveError", { status: res.status, body: errorBody }));
      }
    } catch (e) {
      alert(t("rules.saveFailed", { detail: (e as Error).message }));
    } finally {
      setSaving(false);
    }
  }

  const visibleSections = (rules?.sections || []).filter(
    (s: any) => s?.id !== "roles" && !String(s?.heading || "").toLowerCase().includes("команда")
  );

  const staffRoles = roles
    .filter((r) => r.is_staff)
    .sort((a, b) => {
      if (a.position !== b.position) return (a.position || 0) - (b.position || 0);
      return (b.level || 0) - (a.level || 0);
    });

  // Группировка ролей по уровням
  const roleGroups = [
    { title: t("rules.groupSpecial"), subtitle: t("rules.specialSub"), levels: [8], icon: Crown },
    { title: t("rules.groupHeadAdmin"), subtitle: t("rules.headAdminSub"), levels: [7], icon: Shield },
    { title: t("rules.groupDeptHeads"), subtitle: t("rules.deptHeadsSub"), levels: [6], icon: Star },
    { title: t("rules.groupDeputies"), subtitle: t("rules.deputiesSub"), levels: [5], icon: Shield },
    { title: t("rules.groupStaff"), subtitle: t("rules.staffSub"), levels: [4], icon: Users },
    { title: t("rules.groupJunior"), subtitle: t("rules.juniorSub"), levels: [3, 2, 1], icon: Users },
  ];

  const getRolesByLevels = (levels: number[]) => {
    return staffRoles.filter((r) => levels.includes(r.level || 0));
  };

  const specialRoles = [
    {
      id: "founder",
      name: t("rules.founders"), // Используем ключ из твоего словаря
      color: "#ffffff",
      textColor: "#000000",
      description: t("rules.founderDesc")
    },
    {
      id: "developer",
      name: "Developer", // Или добавь rules.developer в словарь
      color: "#3b82f6",
      textColor: "#ffffff",
      description: t("rules.developerDesc")
    }
  ];
  // Редактор: добавление секции
  function addSection() {
    setEditData({
      ...editData,
      sections: [
        ...(editData.sections || []),
        { id: `section_${Date.now()}`, heading: "Новый раздел", items: [] }
      ]
    });
  }

  // Редактор: удаление секции
  function removeSection(index: number) {
    const newSections = [...editData.sections];
    newSections.splice(index, 1);
    setEditData({ ...editData, sections: newSections });
  }

  // Редактор: перемещение секции
  function moveSection(index: number, direction: "up" | "down") {
    const newSections = [...editData.sections];
    if (direction === "up" && index > 0) {
      [newSections[index - 1], newSections[index]] = [newSections[index], newSections[index - 1]];
    } else if (direction === "down" && index < newSections.length - 1) {
      [newSections[index], newSections[index + 1]] = [newSections[index + 1], newSections[index]];
    }
    setEditData({ ...editData, sections: newSections });
  }

  // Редактор: добавление пункта в список
  function addItem(sectionIndex: number) {
    const newSections = [...editData.sections];
    if (!newSections[sectionIndex].items) newSections[sectionIndex].items = [];
    newSections[sectionIndex].items.push("");
    setEditData({ ...editData, sections: newSections });
  }

  // Редактор: удаление пункта
  function removeItem(sectionIndex: number, itemIndex: number) {
    const newSections = [...editData.sections];
    newSections[sectionIndex].items.splice(itemIndex, 1);
    setEditData({ ...editData, sections: newSections });
  }

  // Редактор: изменение пункта
  function updateItem(sectionIndex: number, itemIndex: number, value: string) {
    const newSections = [...editData.sections];
    newSections[sectionIndex].items[itemIndex] = value;
    setEditData({ ...editData, sections: newSections });
  }

  // Редактор: добавление строки в таблицу
  function addTableRow(sectionIndex: number) {
    const newSections = [...editData.sections];
    if (!newSections[sectionIndex].table) newSections[sectionIndex].table = [];
    newSections[sectionIndex].table.push({ num: "", measure: "", description: "", violations: "" });
    setEditData({ ...editData, sections: newSections });
  }

  // Редактор: удаление строки таблицы
  function removeTableRow(sectionIndex: number, rowIndex: number) {
    const newSections = [...editData.sections];
    newSections[sectionIndex].table.splice(rowIndex, 1);
    setEditData({ ...editData, sections: newSections });
  }

  // Редактор: изменение ячейки таблицы
  function updateTableCell(sectionIndex: number, rowIndex: number, field: string, value: string) {
    const newSections = [...editData.sections];
    newSections[sectionIndex].table[rowIndex][field] = value;
    setEditData({ ...editData, sections: newSections });
  }

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
                {rules?.title || t("rules.title")}
              </h1>
            </div>
            {isAdmin && (
              <Button
                variant="secondary"
                icon={editing ? X : Edit2}
                onClick={() => setEditing(!editing)}
              >
                {editing ? t("common.cancel") : t("common.edit")}
              </Button>
            )}
          </div>
          {rules?.subtitle && !editing && (
            <p className="text-white/60 text-sm mt-2 leading-relaxed">
              {rules.subtitle}
            </p>
          )}
        </div>

        {!rules && <p className="p-8 text-center text-white/50">{t("rules.loading")}</p>}

        {/* РЕДАКТОР */}
        {editing && editData && (
          <div className="p-6 max-w-4xl mx-auto space-y-6">
            {/* Заголовок и подзаголовок */}
            <div className="border border-white/15 rounded-xl p-5 bg-white/5 space-y-4">
              <h2 className="text-lg font-bold text-white">Общая информация</h2>
              <div>
                <label className="block text-sm font-semibold text-white/70 mb-1">Заголовок страницы</label>
                <input
                  value={editData.title || ""}
                  onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                  className="w-full border border-white/10 rounded-lg px-3 py-2 bg-white/5 text-white focus:outline-none focus:border-[#8b5cf6]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-white/70 mb-1">Подзаголовок</label>
                <input
                  value={editData.subtitle || ""}
                  onChange={(e) => setEditData({ ...editData, subtitle: e.target.value })}
                  className="w-full border border-white/10 rounded-lg px-3 py-2 bg-white/5 text-white focus:outline-none focus:border-[#8b5cf6]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-white/70 mb-1">Текст в футере</label>
                <input
                  value={editData.footer || ""}
                  onChange={(e) => setEditData({ ...editData, footer: e.target.value })}
                  className="w-full border border-white/10 rounded-lg px-3 py-2 bg-white/5 text-white focus:outline-none focus:border-[#8b5cf6]"
                />
              </div>
            </div>

            {/* Секции */}
            {(editData.sections || []).map((section: any, sectionIndex: number) => (
              <div key={sectionIndex} className="border border-white/15 rounded-xl p-5 bg-white/5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-white">Раздел #{sectionIndex + 1}</h2>
                  <div className="flex gap-2">
                    <IconButton icon={ArrowUp} size="iconSm" onClick={() => moveSection(sectionIndex, "up")} />
                    <IconButton icon={ArrowDown} size="iconSm" onClick={() => moveSection(sectionIndex, "down")} />
                    <IconButton icon={Trash2} variant="danger" size="iconSm" onClick={() => removeSection(sectionIndex)} />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-white/70 mb-1">Заголовок раздела</label>
                  <input
                    value={section.heading || ""}
                    onChange={(e) => {
                      const newSections = [...editData.sections];
                      newSections[sectionIndex].heading = e.target.value;
                      setEditData({ ...editData, sections: newSections });
                    }}
                    className="w-full border border-white/10 rounded-lg px-3 py-2 bg-white/5 text-white focus:outline-none focus:border-[#8b5cf6]"
                  />
                </div>

                {/* Список пунктов */}
                {section.items && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-semibold text-white/70">Пункты списка</label>
                      <Button variant="primary" size="sm" icon={Plus} onClick={() => addItem(sectionIndex)}>
                        Добавить пункт
                      </Button>
                    </div>
                    {section.items.map((item: string, itemIndex: number) => (
                      <div key={itemIndex} className="flex gap-2">
                        <input
                          value={item}
                          onChange={(e) => updateItem(sectionIndex, itemIndex, e.target.value)}
                          className="flex-1 border border-white/10 rounded-lg px-3 py-2 bg-white/5 text-white focus:outline-none focus:border-[#8b5cf6]"
                          placeholder={`Пункт ${itemIndex + 1}`}
                        />
                        <IconButton icon={Trash2} variant="danger" size="iconSm" onClick={() => removeItem(sectionIndex, itemIndex)} />
                      </div>
                    ))}
                  </div>
                )}

                {/* Таблица наказаний */}
                {section.table && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-semibold text-white/70">Таблица наказаний</label>
                      <Button variant="primary" size="sm" icon={Plus} onClick={() => addTableRow(sectionIndex)}>
                        Добавить строку
                      </Button>
                    </div>
                    {section.table.map((row: any, rowIndex: number) => (
                      <div key={rowIndex} className="border border-white/10 rounded-lg p-3 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            value={row.num || ""}
                            onChange={(e) => updateTableCell(sectionIndex, rowIndex, "num", e.target.value)}
                            className="border border-white/10 rounded-lg px-3 py-2 bg-white/5 text-white focus:outline-none focus:border-[#8b5cf6]"
                            placeholder="№"
                          />
                          <input
                            value={row.measure || ""}
                            onChange={(e) => updateTableCell(sectionIndex, rowIndex, "measure", e.target.value)}
                            className="border border-white/10 rounded-lg px-3 py-2 bg-white/5 text-white focus:outline-none focus:border-[#8b5cf6]"
                            placeholder="Мера наказания"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            value={row.description || ""}
                            onChange={(e) => updateTableCell(sectionIndex, rowIndex, "description", e.target.value)}
                            className="border border-white/10 rounded-lg px-3 py-2 bg-white/5 text-white focus:outline-none focus:border-[#8b5cf6]"
                            placeholder="Описание"
                          />
                          <input
                            value={row.violations || ""}
                            onChange={(e) => updateTableCell(sectionIndex, rowIndex, "violations", e.target.value)}
                            className="border border-white/10 rounded-lg px-3 py-2 bg-white/5 text-white focus:outline-none focus:border-[#8b5cf6]"
                            placeholder="Типичные нарушения"
                          />
                        </div>
                        <Button variant="danger" size="sm" icon={Trash2} onClick={() => removeTableRow(sectionIndex, rowIndex)}>
                          Удалить строку
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Заметка */}
                {section.note !== undefined && (
                  <div>
                    <label className="block text-sm font-semibold text-white/70 mb-1">Заметка (курсив внизу)</label>
                    <input
                      value={section.note || ""}
                      onChange={(e) => {
                        const newSections = [...editData.sections];
                        newSections[sectionIndex].note = e.target.value;
                        setEditData({ ...editData, sections: newSections });
                      }}
                      className="w-full border border-white/10 rounded-lg px-3 py-2 bg-white/5 text-white focus:outline-none focus:border-[#8b5cf6]"
                      placeholder="Текст заметки"
                    />
                  </div>
                )}
              </div>
            ))}

            <Button variant="primary" size="lg" icon={Plus} onClick={addSection} className="w-full">
              Добавить новый раздел
            </Button>

            <Button
              variant="primary"
              size="lg"
              icon={Save}
              loading={saving}
              onClick={saveRules}
              disabled={saving}
              className="w-full"
            >
              {saving ? "Сохранение..." : "Сохранить правила"}
            </Button>
          </div>
        )}

        {/* ПРОСМОТР ПРАВИЛ */}
        {rules && !editing && (
          <div className="p-6 space-y-6 max-w-4xl mx-auto">
            {visibleSections.map((section: any, i: number) => (
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
                          <th className="text-left p-3 text-white/60 font-bold">{t("rules.measure")}</th>
                          <th className="text-left p-3 text-white/60 font-bold">{t("rules.description")}</th>
                          <th className="text-left p-3 text-white/60 font-bold">{t("rules.violations")}</th>
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

            {/* БЛОК 1: ОСНОВАТЕЛИ И РАЗРАБОТКА */}
            <div className="border border-[#8b5cf6]/30 rounded-xl p-5 bg-[#8b5cf6]/5">
              <div className="flex items-center gap-2 mb-4">
                <Code2 size={20} className="text-[#8b5cf6]" />
                <h2 className="text-xl font-black text-white">{t("rules.founders")}</h2>
              </div>
              <p className="text-white/60 text-sm mb-5">
                {t("rules.foundersHint")}
              </p>
              <div className="space-y-3">
                {specialRoles.map((role) => (
                  <div
                    key={role.id}
                    className="flex items-start gap-4 p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span
                          className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest"
                          style={{ 
                            backgroundColor: role.color, 
                            color: role.textColor 
                          }}
                        >
                          {role.name}
                        </span>
                      </div>
                      <p className="text-white/70 text-sm leading-relaxed">
                        {role.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* БЛОК 2: АДМИНИСТРАЦИЯ И МОДЕРАЦИЯ — ПО УРОВНЯМ */}
            {staffRoles.length > 0 && (
              <div className="border border-white/15 rounded-xl p-5 bg-white/5">
                <div className="flex items-center gap-2 mb-4">
                  <Users size={20} className="text-[#8b5cf6]" />
                  <h2 className="text-xl font-black text-white">{t("rules.admin")}</h2>
                </div>
                <p className="text-white/60 text-sm mb-5">
                  {t("rules.adminHint")}
                </p>

                <div className="space-y-6">
                  {roleGroups.map((group) => {
                    const groupRoles = getRolesByLevels(group.levels);
                    if (groupRoles.length === 0) return null;

                    const Icon = group.icon;

                    return (
                      <div key={group.title} className="border border-white/10 rounded-xl p-4 bg-white/[0.02]">
                        <div className="flex items-center gap-2 mb-1">
                          <Icon size={16} className="text-[#8b5cf6]/70" />
                          <h3 className="text-base font-bold text-white">{group.title}</h3>
                        </div>
                        <p className="text-white/40 text-xs mb-3">{group.subtitle}</p>

                        <div className="space-y-2">
                          {groupRoles.map((role) => (
                            <div
                              key={role.id}
                              className="flex items-start gap-4 p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span
                                    className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest text-white"
                                    style={{ backgroundColor: role.color }}
                                  >
                                    {role.name}
                                  </span>
                                  <span className="text-white/30 text-xs">LVL {role.level}</span>
                                </div>
                                <p className="text-white/70 text-sm leading-relaxed">
                                  {role.description || t("rules.noDesc")}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
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