"use client";
import { useState } from "react";
import { Flag, X } from "lucide-react";
import { getToken } from "@/lib/auth";


const REASONS = [
  { id: "spam", label: "Спам или реклама", icon: "📢" },
  { id: "insult", label: "Оскорбление или травля", icon: "😡" },
  { id: "nsfw", label: "Контент 18+", icon: "🔞" },
  { id: "rules_violation", label: "Нарушение правил", icon: "⚠️" },
  { id: "other", label: "Другое", icon: "❓" },
];

export function ReportModal({
  targetType,
  targetId,
  onClose,
}: {
  targetType: "post" | "user";
  targetId: number;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function submit() {
    if (!reason) {
      setError("Выберите причину жалобы");
      return;
    }
    setLoading(true);
    setError("");

    const token = getToken();
    if (!token) {
      onClose();
      return;
    }

    const form = new FormData();
    form.append("target_type", targetType);
    form.append("target_id", String(targetId));
    form.append("reason", reason);
    if (comment.trim()) form.append("comment", comment.trim());

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/reports`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.detail ?? "Ошибка при отправке жалобы");
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => onClose(), 2000);
    } catch (err) {
      setError("Ошибка при отправке жалобы");
      setLoading(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200]"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
        <div className="w-full max-w-md border border-white/20 rounded-2xl bg-[#1f1f23]/95 backdrop-blur-md shadow-2xl pointer-events-auto p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Flag size={20} className="text-red-400" />
              <h2 className="text-xl font-black text-white">
                {targetType === "post" ? "Пожаловаться на пост" : "Пожаловаться на пользователя"}
              </h2>
            </div>
            <button onClick={onClose} className="text-white/60 hover:text-white">
              <X size={20} />
            </button>
          </div>

          {success ? (
            <div className="text-center py-8">
              <div className="text-5xl mb-3">✅</div>
              <p className="text-white font-bold">Жалоба отправлена!</p>
              <p className="text-white/60 text-sm mt-1">
                Модераторы рассмотрят её в ближайшее время.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Причины */}
              <div>
                <label className="block text-sm font-bold text-white/80 mb-2">
                  Причина жалобы
                </label>
                <div className="space-y-2">
                  {REASONS.map((r) => (
                    <label
                      key={r.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        reason === r.id
                          ? "border-red-400/50 bg-red-500/10"
                          : "border-white/10 bg-white/5 hover:bg-white/10"
                      }`}
                    >
                      <input
                        type="radio"
                        checked={reason === r.id}
                        onChange={() => setReason(r.id)}
                        className="w-4 h-4 text-red-500 focus:ring-red-500"
                      />
                      <span className="text-lg">{r.icon}</span>
                      <span className="text-sm text-white/90 font-semibold">{r.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Комментарий */}
              <div>
                <label className="block text-sm font-bold text-white/80 mb-2">
                  Комментарий (необязательно)
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Опишите подробнее, что не так..."
                  rows={3}
                  className="w-full border border-white/15 rounded-lg px-3 py-2 bg-white/5 text-white placeholder-white/40 focus:outline-none focus:border-red-400/50 resize-none"
                />
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={submit}
                  disabled={loading || !reason}
                  className="flex-1 border border-red-400/50 bg-[#ef4444] text-white font-bold rounded-lg py-2 hover:shadow-lg hover:shadow-red-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loading ? "Отправка..." : "Отправить жалобу"}
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 border border-white/20 rounded-lg py-2 font-bold text-white/80 hover:bg-white/10 transition-all"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}