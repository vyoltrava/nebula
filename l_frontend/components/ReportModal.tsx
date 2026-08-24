"use client";
import { useState } from "react";
import { Flag, X } from "lucide-react";
import { getToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import type { MessageKey } from "@/lib/i18n";
import { Button, IconButton } from "@/components/ui/Button";

const REASONS: { id: string; labelKey: MessageKey; icon: string }[] = [
  { id: "spam", labelKey: "report.spam", icon: "📢" },
  { id: "insult", labelKey: "report.insult", icon: "😡" },
  { id: "nsfw", labelKey: "report.nsfw", icon: "🔞" },
  { id: "rules_violation", labelKey: "report.rules", icon: "⚠️" },
  { id: "other", labelKey: "report.other", icon: "❓" },
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
  const { t } = useI18n();
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function submit() {
    if (!reason) {
      setError(t("report.pickReason"));
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
        setError(data?.detail ?? t("report.sendError"));
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => onClose(), 2000);
    } catch (err) {
      setError(t("report.sendError"));
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
                {targetType === "post" ? t("report.post") : t("report.user")}
              </h2>
            </div>
            <IconButton icon={X} onClick={onClose} />
          </div>

          {success ? (
            <div className="text-center py-8">
              <div className="text-5xl mb-3">✅</div>
              <p className="text-white font-bold">{t("report.success")}</p>
              <p className="text-white/60 text-sm mt-1">
                {t("report.successHint")}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Причины */}
              <div>
                <label className="block text-sm font-bold text-white/80 mb-2">
                  {t("report.reasonLabel")}
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
                      <span className="text-sm text-white/90 font-semibold">{t(r.labelKey)}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Комментарий */}
              <div>
                <label className="block text-sm font-bold text-white/80 mb-2">
                  {t("report.commentLabel")}
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={t("report.details")}
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
                <Button
                  variant="danger"
                  loading={loading}
                  onClick={submit}
                  disabled={loading || !reason}
                  className="flex-1"
                >
                  {loading ? t("common.sending") : t("report.submit")}
                </Button>
                <Button variant="secondary" onClick={onClose} className="flex-1">
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}