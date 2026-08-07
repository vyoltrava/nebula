"use client";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Shield } from "lucide-react";


export default function RulesPage() {
  const [rules, setRules] = useState<any>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/rules`)
      .then((r) => r.json())
      .then(setRules);
  }, []);

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />
      <div className="w-px shrink-0 bg-white/10 my-3" />
      <main className="flex-1 overflow-y-auto border-x border-white/10">
        <div className="p-6 border-b border-white/10 sticky top-0 bg-[#171717]/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <Shield size={24} className="text-[#8b5cf6]" />
            <h1 className="text-2xl font-black text-white">
              {rules?.title || "Правила"}
            </h1>
          </div>
          {rules?.subtitle && (
            <p className="text-white/60 text-sm mt-2 leading-relaxed">
              {rules.subtitle}
            </p>
          )}
        </div>

        {!rules && (
          <p className="p-8 text-center text-white/50">Загрузка правил...</p>
        )}

        {rules && (
          <div className="p-6 space-y-6 max-w-4xl mx-auto">
            {rules.sections.map((section: any, i: number) => (
              <div
                key={section.id || i}
                className="border border-white/15 rounded-xl p-5 bg-white/5"
              >
                <h2 className="text-xl font-black text-white mb-4">
                  {section.heading}
                </h2>

                {/* Обычный список пунктов */}
                {section.items && (
                  <div className="space-y-3">
                    {section.items.map((item: string, j: number) => (
                      <p
                        key={j}
                        className="text-white/80 leading-relaxed pl-4 border-l-2 border-purple-400/30"
                      >
                        {item}
                      </p>
                    ))}
                  </div>
                )}

                {/* Таблица мер наказаний */}
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

                {/* Примечание */}
                {section.note && (
                  <p className="mt-4 text-sm text-white/60 italic">
                    {section.note}
                  </p>
                )}
              </div>
            ))}

            {/* Футер */}
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