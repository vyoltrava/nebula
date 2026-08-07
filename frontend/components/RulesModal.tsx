"use client";
import { useEffect, useState } from "react";
import { Shield, X } from "lucide-react";
import { API_URL } from "@/lib/api";

export function RulesModal({ onClose }: { onClose: () => void }) {
  const [rules, setRules] = useState<any>(null);

  useEffect(() => {
    fetch('http://${API_URL}/api/rules')
      .then((r) => r.json())
      .then(setRules);
  }, []);

  return (
    <>
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200]"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
        <div className="w-full max-w-3xl border border-white/20 rounded-2xl bg-[#1f1f23]/95 backdrop-blur-md shadow-2xl pointer-events-auto max-h-[85vh] flex flex-col">
          <div className="sticky top-0 bg-[#1f1f23]/95 backdrop-blur-md border-b border-white/10 p-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Shield size={20} className="text-[#8b5cf6]" />
              <h2 className="font-black text-white text-lg">
                {rules?.title || "Правила"}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
            >
              <X size={20} />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 p-4 space-y-4">
            {!rules && (
              <p className="text-center text-white/50 py-8">Загрузка правил...</p>
            )}

            {rules?.subtitle && (
              <p className="text-sm text-white/60 leading-relaxed mb-4">
                {rules.subtitle}
              </p>
            )}

            {rules?.sections.map((section: any, i: number) => (
              <div
                key={section.id || i}
                className="border border-white/15 rounded-xl p-4 bg-white/5"
              >
                <h3 className="font-black text-white mb-3 text-base">
                  {section.heading}
                </h3>

                {section.items && (
                  <div className="space-y-2">
                    {section.items.map((item: string, j: number) => (
                      <p
                        key={j}
                        className="text-sm text-white/70 leading-relaxed pl-3 border-l-2 border-purple-400/30"
                      >
                        {item}
                      </p>
                    ))}
                  </div>
                )}

                {section.table && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-white/20">
                          <th className="text-left p-2 text-white/60 font-bold">№</th>
                          <th className="text-left p-2 text-white/60 font-bold">Мера</th>
                          <th className="text-left p-2 text-white/60 font-bold">Описание</th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.table.map((row: any, j: number) => (
                          <tr key={j} className="border-b border-white/10">
                            <td className="p-2 text-white/70 font-bold">{row.num}</td>
                            <td className="p-2 text-white font-semibold">{row.measure}</td>
                            <td className="p-2 text-white/70">{row.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {section.note && (
                  <p className="mt-3 text-xs text-white/50 italic">
                    {section.note}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="border-t border-white/10 p-4 shrink-0">
            <button
              onClick={onClose}
              className="w-full border border-[#8b5cf6] bg-[#8b5cf6] text-white font-bold rounded-lg py-2  transition-all"
            >
              Понятно
            </button>
          </div>
        </div>
      </div>
    </>
  );
}