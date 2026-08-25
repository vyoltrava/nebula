"use client";
import { useEffect, useState } from "react";
import { Shield, X } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";


export function RulesModal({ onClose }: { onClose: () => void }) {
  const [rules, setRules] = useState<any>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/rules`)
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
        <div className="w-full max-w-3xl border border-gray-200 dark:border-white/20 rounded-2xl bg-ivory dark:bg-[#1f1f23]/95 backdrop-blur-md shadow-2xl pointer-events-auto max-h-[85vh] flex flex-col">
          <div className="sticky top-0 bg-ivory dark:bg-[#1f1f23]/95 backdrop-blur-md border-b border-gray-200 dark:border-white/10 p-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Shield size={20} className="text-[#8b5cf6]" />
              <h2 className="font-black text-gray-900 dark:text-white text-lg">
                {rules?.title || "Правила"}
              </h2>
            </div>
            <IconButton icon={X} size="iconSm" onClick={onClose} />
          </div>

          <div className="overflow-y-auto flex-1 p-4 space-y-4">
            {!rules && (
              <p className="text-center text-gray-600 dark:text-white/50 py-8">Загрузка правил...</p>
            )}

            {rules?.subtitle && (
              <p className="text-sm text-gray-600 dark:text-white/60 leading-relaxed mb-4">
                {rules.subtitle}
              </p>
            )}

            {rules?.sections.map((section: any, i: number) => (
              <div
                key={section.id || i}
                className="border border-gray-200 dark:border-white/15 rounded-xl p-4 bg-gray-100 dark:bg-white/5"
              >
                <h3 className="font-black text-gray-900 dark:text-white mb-3 text-base">
                  {section.heading}
                </h3>

                {section.items && (
                  <div className="space-y-2">
                    {section.items.map((item: string, j: number) => (
                      <p
                        key={j}
                        className="text-sm text-gray-800 dark:text-white/70 leading-relaxed pl-3 border-l-2 border-purple-400/30"
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
                        <tr className="border-b border-gray-200 dark:border-white/20">
                          <th className="text-left p-2 text-gray-600 dark:text-white/60 font-bold">№</th>
                          <th className="text-left p-2 text-gray-600 dark:text-white/60 font-bold">Мера</th>
                          <th className="text-left p-2 text-gray-600 dark:text-white/60 font-bold">Описание</th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.table.map((row: any, j: number) => (
                          <tr key={j} className="border-b border-gray-200 dark:border-white/10">
                            <td className="p-2 text-gray-800 dark:text-white/70 font-bold">{row.num}</td>
                            <td className="p-2 text-gray-900 dark:text-white font-semibold">{row.measure}</td>
                            <td className="p-2 text-gray-800 dark:text-white/70">{row.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {section.note && (
                  <p className="mt-3 text-xs text-gray-600 dark:text-white/50 italic">
                    {section.note}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="border-t border-gray-200 dark:border-white/10 p-4 shrink-0">
            <Button variant="primary" className="w-full" onClick={onClose}>
              Понятно
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}