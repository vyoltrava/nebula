"use client";
import { useState } from "react";
import { X, Bug, Send } from "lucide-react";
import { getToken } from "@/lib/auth";

const PRIORITY_OPTIONS = [
  { value: "low", label: "Низкий", color: "text-green-400" },
  { value: "medium", label: "Средний", color: "text-yellow-400" },
  { value: "high", label: "Высокий", color: "text-orange-400" },
  { value: "critical", label: "Критический", color: "text-red-400" },
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

  return (
    <>
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
        <div className="w-full max-w-lg border border-white/20 rounded-2xl bg-[#1f1f23]/95 backdrop-blur-md shadow-2xl p-6 pointer-events-auto animate-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Bug size={24} className="text-orange-400" />
              <h2 className="text-xl font-black text-white">Сообщить о проблеме</h2>
            </div>
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
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
              <p className="text-white/60">Спасибо! Мы рассмотрим вашу проблему в ближайшее время.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-white/80 mb-2">
                  Заголовок проблемы
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Например: Не загружается аватарка"
                  maxLength={200}
                  className="w-full border border-white/15 rounded-lg px-3 py-2 bg-white/5 text-white placeholder-white/40 focus:outline-none focus:border-orange-400 transition-all"
                />
                <p className="text-xs text-white/40 mt-1">{title.length}/200</p>
              </div>

              <div>
                <label className="block text-sm font-bold text-white/80 mb-2">
                  Приоритет
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {PRIORITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPriority(opt.value)}
                      className={`px-3 py-2 rounded-lg border text-xs font-bold transition-all ${
                        priority === opt.value
                          ? "border-orange-400 bg-orange-500/10"
                          : "border-white/10 bg-white/5 hover:bg-white/10"
                      } ${opt.color}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-white/80 mb-2">
                  Описание проблемы
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Опишите подробно, что произошло, что вы делали, и что ожидали увидеть..."
                  rows={5}
                  maxLength={2000}
                  className="w-full border border-white/15 rounded-lg px-3 py-2 bg-white/5 text-white placeholder-white/40 focus:outline-none focus:border-orange-400 transition-all resize-none"
                />
                <p className="text-xs text-white/40 mt-1">{description.length}/2000</p>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 border border-orange-400 bg-orange-500 text-white font-bold rounded-lg py-2.5 transition-all hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send size={16} />
                  {loading ? "Отправка..." : "Отправить"}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 border border-white/20 rounded-lg py-2.5 font-bold text-white/80 hover:bg-white/10 transition-all"
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