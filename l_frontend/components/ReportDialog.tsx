"use client";

import { useState } from "react";
import { X, Flag } from "lucide-react";
import { getToken } from "@/lib/auth";

const REASONS: { value: string; label: string }[] = [
  { value: "spam", label: "📢 Спам" },
  { value: "insult", label: "😡 Оскорбление" },
  { value: "nsfw", label: "🔞 Контент 18+" },
  { value: "rules_violation", label: "⚠️ Нарушение правил" },
  { value: "other", label: "❓ Другое" },
];

export type ReportTargetType = "user" | "post" | "chat" | "chat_message" | "dm_user";

export function ReportDialog({
  targetType,
  targetId,
  contextLabel,
  onClose,
}: {
  targetType: ReportTargetType;
  targetId: number;
  contextLabel?: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("spam");
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit() {
    setSending(true);
    setError("");
    const token = getToken();
    const form = new FormData();
    form.append("target_type", targetType);
    form.append("target_id", String(targetId));
    form.append("reason", reason);
    if (comment.trim()) form.append("comment", comment.trim());
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/reports`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    setSending(false);
    if (res.ok) {
      setDone(true);
      setTimeout(onClose, 1500);
    } else {
      const d = await res.json().catch(() => null);
      setError(d?.detail || "Не удалось отправить жалобу");
    }
  }

  const titleByType: Record<string, string> = {
    user: "Жалоба на пользователя",
    dm_user: "Жалоба на пользователя",
    chat: "Жалоба на канал/группу",
    chat_message: "Жалоба на сообщение",
    post: "Жалоба на пост",
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-2xl shadow-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 mx-auto rounded-full bg-green-500/15 flex items-center justify-center mb-3">
              <Flag size={22} className="text-green-600 dark:text-green-400" />
            </div>
            <p className="font-bold text-gray-900 dark:text-white">Жалоба отправлена</p>
            <p className="text-xs text-gray-500 dark:text-white/40 mt-1">Модераторы рассмотрят её в ближайшее время</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-gray-900 dark:text-white">{titleByType[targetType] || "Жалоба"}</h3>
              <button onClick={onClose} className="p-1 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10">
                <X size={16} />
              </button>
            </div>
            {contextLabel && (
              <p className="text-xs text-gray-500 dark:text-white/40 mb-3 truncate">{contextLabel}</p>
            )}
            <div className="space-y-1.5 mb-3">
              {REASONS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setReason(r.value)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-all border ${
                    reason === r.value
                      ? "border-[#8b5cf6] bg-[#8b5cf6]/10 text-gray-900 dark:text-white font-semibold"
                      : "border-line dark:border-white/10 text-gray-700 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/5"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Комментарий (необязательно)"
              rows={2}
              maxLength={500}
              className="w-full text-sm px-3 py-2 rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 text-gray-900 dark:text-white placeholder:text-gray-400 resize-none outline-none focus:border-[#8b5cf6] mb-3"
            />
            {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
            <button
              onClick={submit}
              disabled={sending}
              className="w-full py-2.5 rounded-xl bg-[#ef4444] text-white text-sm font-bold hover:bg-red-600 disabled:opacity-50 transition-all"
            >
              {sending ? "Отправка..." : "Отправить жалобу"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
