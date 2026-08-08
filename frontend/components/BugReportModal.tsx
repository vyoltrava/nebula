"use client";
import { useState } from "react";
import { X, Bug, Send, Lightbulb, AlertTriangle } from "lucide-react";
import { getToken } from "@/lib/auth";

const PRIORITY_OPTIONS = [
  { value: "low", label: "Идея", icon: Lightbulb, color: "text-green-400", borderColor: "border-green-400", bg: "bg-green-500/10" },
  { value: "medium", label: "Баг", icon: Bug, color: "text-yellow-400", borderColor: "border-yellow-400", bg: "bg-yellow-500/10" },
  { value: "high", label: "Важно", icon: AlertTriangle, color: "text-orange-400", borderColor: "border-orange-400", bg: "bg-orange-500/10" },
  { value: "critical", label: "Критично", icon: AlertTriangle, color: "text-red-400", borderColor: "border-red-400", bg: "bg-red-500/10" },
];

export function BugReportModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    
    if (title.trim().length < 5) {
      setError("Заголовок должен быть не менее 5 символов");
      return;
    }
    if (description.trim().length < 20) {
      setError("Описание должно быть не менее 20 символов");
      return;
    }

    setLoading(true);
    const token = getToken();
    if (!token) {
      setError("Необходимо войти в аккаунт");
      setLoading(false);
      return;
    }

    const form = new FormData();
    form.append("title", title);
    form.append("description", description);
    form.append("priority", priority);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/bugs`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (res.ok) {
        setSuccess(true);
        setTimeout(onClose, 2000);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.detail || "Ошибка отправки");
      }
    } catch (err) {
      setError("Ошибка соединения");
    } finally {
      setLoading(false);
    }
  }

  const selectedPriority = PRIORITY_OPTIONS.find(p => p.value === priority);

  return (
    <>
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
        <div className="w-full max-w-lg border border-white/20 rounded-2xl bg-[#1f1f23]/95 backdrop-blur-md shadow-2xl p-5 sm:p-6 pointer-events-auto animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center shrink-0">
                <Bug size={18} className="text-orange-400" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-black text-white truncate">
                  Обратная связь
                </h2>
                <p className="text-xs text-white/50 hidden sm:block">
                  Баг, идея или предложение
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10 shrink-0"
            >
              <X size={20} />
            </button>
          </div>

          {success ? (
            <div className="py-8 text-center">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <Send size={32} className="text-green-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Отправлено!</h3>
              <p className="text-white/60 text-sm">
                Спасибо! Мы рассмотрим ваше сообщение в ближайшее время.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Описание назначения */}
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <p className="text-xs text-white/70 leading-relaxed">
                  <span className="font-bold text-white">Что можно отправить:</span>{" "}
                  ошибки в работе платформы, идеи для новых функций, предложения по улучшению 
                  интерфейса или жалобы на поведение пользователей.
                </p>
              </div>

              {/* Заголовок */}
              <div>
                <label className="block text-sm font-bold text-white/80 mb-2">
                  Заголовок
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Например: Кнопка «Читать» на своём посте"
                  maxLength={200}
                  className="w-full border border-white/15 rounded-lg px-3 py-2.5 bg-white/5 text-white placeholder-white/40 focus:outline-none focus:border-orange-400 transition-all text-sm"
                />
                <p className="text-xs text-white/40 mt-1 text-right">{title.length}/200</p>
              </div>

              {/* Приоритет — АДАПТИВНАЯ СЕТКА */}
              <div>
                <label className="block text-sm font-bold text-white/80 mb-2">
                  Тип обращения
                </label>
                {/* На мобильных: 2×2, на десктопе: 4×1 */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PRIORITY_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const isActive = priority === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setPriority(opt.value)}
                        className={`
                          flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5
                          px-2 py-2.5 sm:py-2 rounded-lg border text-xs font-bold 
                          transition-all active:scale-95
                          ${isActive
                            ? `${opt.borderColor} ${opt.bg} ${opt.color}`
                            : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80"
                          }
                        `}
                      >
                        <Icon size={14} className="shrink-0" />
                        <span className="whitespace-nowrap">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
                {/* Подсказка под выбранным типом */}
                {selectedPriority && (
                  <p className="text-xs text-white/50 mt-2 flex items-center gap-1.5">
                    <selectedPriority.icon size={12} className={selectedPriority.color} />
                    <span>
                      {priority === "low" && "Предложение по улучшению или новая идея"}
                      {priority === "medium" && "Обычный баг, не блокирующий работу"}
                      {priority === "high" && "Заметная проблема, влияет на удобство"}
                      {priority === "critical" && "Платформа не работает или данные теряются"}
                    </span>
                  </p>
                )}
              </div>

              {/* Описание */}
              <div>
                <label className="block text-sm font-bold text-white/80 mb-2">
                  Описание
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    priority === "low"
                      ? "Опишите вашу идею: что вы хотите видеть, как это должно работать, и зачем это нужно..."
                      : priority === "critical"
                      ? "Что именно не работает? Что вы делали? На каком устройстве и браузере?..."
                      : "Опишите подробно: что произошло, что вы делали, и что ожидали увидеть..."
                  }
                  rows={5}
                  maxLength={2000}
                  className="w-full border border-white/15 rounded-lg px-3 py-2.5 bg-white/5 text-white placeholder-white/40 focus:outline-none focus:border-orange-400 transition-all resize-none text-sm"
                />
                <p className="text-xs text-white/40 mt-1 text-right">{description.length}/2000</p>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* Кнопки */}
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 border border-orange-400 bg-orange-500 text-white font-bold rounded-lg py-2.5 transition-all hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  <Send size={16} />
                  {loading ? "Отправка..." : "Отправить"}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 border border-white/20 rounded-lg py-2.5 font-bold text-white/80 hover:bg-white/10 transition-all text-sm"
                >
                  Отмена
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}