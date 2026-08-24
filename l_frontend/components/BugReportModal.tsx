"use client";

import { useState } from "react";
import { X, Bug, Send, Lightbulb, AlertTriangle } from "lucide-react";
import { getToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { Button, IconButton } from "@/components/ui/Button";

const PRIORITY_OPTIONS = [
  { 
    value: "low", 
    labelKey: "bugs.idea" as const, 
    hintKey: "bugs.ideaHint" as const, 
    icon: Lightbulb, 
    color: "text-green-400", 
    borderColor: "border-green-400", 
    bg: "bg-green-500/10" 
  },
  { 
    value: "medium", 
    labelKey: "bugs.bug" as const, 
    hintKey: "bugs.bugHint" as const, 
    icon: Bug, 
    color: "text-yellow-400", 
    borderColor: "border-yellow-400", 
    bg: "bg-yellow-500/10" 
  },
  { 
    value: "high", 
    labelKey: "bugs.important" as const, 
    hintKey: "bugs.highHint" as const, 
    icon: AlertTriangle, 
    color: "text-orange-400", 
    borderColor: "border-orange-400", 
    bg: "bg-orange-500/10" 
  },
  { 
    value: "critical", 
    labelKey: "bugs.critical" as const, 
    hintKey: "bugs.critHint" as const, 
    icon: AlertTriangle, 
    color: "text-red-400", 
    borderColor: "border-red-400", 
    bg: "bg-red-500/10" 
  },
];

export function BugReportModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
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
      setError(t("bugs.titleMin"));
      return;
    }
    if (description.trim().length < 20) {
      setError(t("bugs.descMin"));
      return;
    }

    setLoading(true);
    const token = getToken();
    if (!token) {
      setError(t("bugs.needLogin"));
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
        setError(data?.detail || t("bugs.sendError"));
      }
    } catch (err) {
      setError(t("bugs.connError"));
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
                  {t("bugs.feedback")}
                </h2>
                <p className="text-xs text-white/50 hidden sm:block">
                  {t("bugs.feedbackHint")}
                </p>
              </div>
            </div>
            <IconButton
              icon={X}
              size="iconSm"
              onClick={onClose}
              className="shrink-0"
              aria-label={t("common.close")}
            />
          </div>

          {success ? (
            <div className="py-8 text-center">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <Send size={32} className="text-green-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">{t("bugs.sent")}</h3>
              <p className="text-white/60 text-sm">
                {t("bugs.thanks")}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Описание назначения */}
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <p className="text-xs text-white/70 leading-relaxed">
                  <span className="font-bold text-white">{t("bugs.canSend")}</span>{" "}
                  {t("bugs.canSendBody")}
                </p>
              </div>

              {/* Заголовок */}
              <div>
                <label className="block text-sm font-bold text-white/80 mb-2">
                  {t("bugs.titleLabel")}
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("bugs.titlePh")}
                  maxLength={200}
                  className="w-full border border-white/15 rounded-lg px-3 py-2.5 bg-white/5 text-white placeholder-white/40 focus:outline-none focus:border-orange-400 transition-all text-sm"
                />
                <p className="text-xs text-white/40 mt-1 text-right">{title.length}/200</p>
              </div>

              {/* Приоритет — АДАПТИВНАЯ СЕТКА */}
              <div>
                <label className="block text-sm font-bold text-white/80 mb-2">
                  {t("bugs.typeLabel")}
                </label>
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
                        <span className="whitespace-nowrap">{t(opt.labelKey)}</span>
                      </button>
                    );
                  })}
                </div>
                {/* Подсказка под выбранным типом */}
                {selectedPriority && (
                  <p className="text-xs text-white/50 mt-2 flex items-center gap-1.5">
                    <selectedPriority.icon size={12} className={selectedPriority.color} />
                    <span>{t(selectedPriority.hintKey)}</span>
                  </p>
                )}
              </div>

              {/* Описание */}
              <div>
                <label className="block text-sm font-bold text-white/80 mb-2">
                  {t("bugs.descLabel")}
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    priority === "low"
                      ? t("bugs.ideaPh")
                      : priority === "critical"
                      ? t("bugs.critPh")
                      : t("bugs.otherPh")
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
                <Button
                  type="submit"
                  icon={Send}
                  loading={loading}
                  disabled={loading}
                  className="flex-1"
                >
                  {loading ? t("common.sending") : t("common.send")}
                </Button>
                <Button variant="secondary" type="button" onClick={onClose} className="flex-1">
                  {t("common.cancel")}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}