"use client";

import { useCallback, useEffect, useState } from "react";
import { getToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { CreditCard, Loader2, X, Check, AlertTriangle, ShieldCheck } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface ShopRole {
  id: number; roleId: number; roleName: string;
  price: number; currency: string; period: string; trialDays: number;
  description: string | null; features: string[];
  isRecurring: boolean; paymentProvider: string;
}

export function PaymentShop({ onPurchased }: { onPurchased?: () => void }) {
  const { t } = useI18n();
  const [state, setState] = useState<{ loading: boolean; enabled: boolean; roles: ShopRole[] }>(
    { loading: true, enabled: true, roles: [] },
  );
  const [selected, setSelected] = useState<ShopRole | null>(null);
  const [pending, setPending] = useState(false);

  const periodLabel = useCallback(
    (p: string) =>
      p === "once" ? t("payment.periodOnce") : p === "monthly" ? t("payment.periodMonthly") : p === "yearly" ? t("payment.periodYearly") : p,
    [t],
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/payments/available`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setState({ loading: false, enabled: data.isEnabled, roles: data.roles || [] });
      } else {
        setState(s => ({ ...s, loading: false }));
      }
    } catch {
      setState(s => ({ ...s, loading: false }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (state.loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-violet-500" /></div>;
  }
  if (!state.enabled) {
    return (
      <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.04] p-6 text-center">
        <CreditCard className="w-8 h-8 text-gray-400 dark:text-white/30 mx-auto mb-2" />
        <p className="text-sm text-gray-500 dark:text-white/50">Магазин ролей временно закрыт</p>
      </div>
    );
  }
  if (state.roles.length === 0) {
    return (
      <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.04] p-6 text-center">
        <CreditCard className="w-8 h-8 text-gray-400 dark:text-white/30 mx-auto mb-2" />
        <p className="text-sm text-gray-500 dark:text-white/50">Сейчас нет ролей в продаже</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-3">
        <CreditCard className="w-5 h-5 text-violet-500" /> {t("payment.title")}
      </h3>
      {pending && (
        <div className="mb-3 flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {t("payment.manualPending")}
        </div>
      )}
      <div className="space-y-3">
        {state.roles.map(role => (
          <div key={role.roleId} role="button" tabIndex={0}
            onClick={() => setSelected(role)}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setSelected(role); }}
            className="group cursor-pointer rounded-2xl bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4 hover:border-violet-400/60 dark:hover:border-violet-400/40 hover:bg-violet-500/[0.03] dark:hover:bg-violet-500/[0.06] transition">
            {/* Название + описание */}
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 flex-wrap">
                {role.roleName}
                {role.isRecurring && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold uppercase tracking-wide">
                    {t("payment.autoRenew")}
                  </span>
                )}
                {role.trialDays > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 font-bold">
                    {t("payment.trialFree").replace("{n}", String(role.trialDays))}
                  </span>
                )}
              </div>
              {role.description && (
                <p className="text-sm text-gray-500 dark:text-white/50 mt-0.5 line-clamp-1">{role.description}</p>
              )}
              {/* Превью: первые 3 пункта в строку */}
              {(role.features || []).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {role.features.slice(0, 3).map((f, i) => (
                    <span key={i} className="text-xs text-gray-600 dark:text-white/60 flex items-center gap-1">
                      <Check className="w-3.5 h-3.5 text-green-500 shrink-0" /> <span className="line-clamp-1">{f}</span>
                    </span>
                  ))}
                  {(role.features?.length || 0) > 3 && (
                    <span className="text-xs text-violet-500 font-medium group-hover:underline">
                      +{(role.features?.length || 0) - 3} ещё · подробнее
                    </span>
                  )}
                </div>
              )}
            </div>
            {/* Цена + кнопка */}
            <div className="flex items-center gap-4 shrink-0 sm:pl-4 sm:border-l border-black/5 dark:border-white/10">
              <div className="text-right">
                <div className="text-xl font-extrabold text-violet-500 whitespace-nowrap">{role.price} {role.currency}</div>
                <div className="text-[11px] text-gray-500 dark:text-white/40">/ {periodLabel(role.period)}</div>
              </div>
              <button onClick={e => { e.stopPropagation(); setSelected(role); }}
                className="px-5 py-2 rounded-xl bg-violet-500 text-white text-sm font-semibold hover:bg-violet-600 transition whitespace-nowrap">
                {t("payment.buy")}
              </button>
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <PaymentModal role={selected} periodLabel={periodLabel}
          onClose={() => setSelected(null)}
          onSuccess={() => { setSelected(null); load(); onPurchased?.(); }}
          onManualPending={() => setPending(true)} />
      )}
    </div>
  );
}

function PaymentModal({ role, periodLabel, onClose, onSuccess, onManualPending }: {
  role: ShopRole;
  periodLabel: (p: string) => string;
  onClose: () => void; onSuccess: () => void; onManualPending: () => void;
}) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/payments/create`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: role.roleId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.detail || t("payment.payError"));
        return;
      }
      if (data.url) {
        // Stripe Checkout / другой провайдер с redirect-платежом
        window.location.href = data.url;
        return;
      }
      if (data.provider === "manual" || (!data.url && !data.clientSecret)) {
        // Ручной режим — платёж ждёт подтверждения админа
        onManualPending();
        onSuccess();
      }
    } catch {
      setError(t("payment.networkError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={loading ? undefined : onClose}>
      <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#1e1e22] p-6 relative max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <button onClick={onClose} disabled={loading}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-white">
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t("payment.purchaseTitle")}</h2>

        {/* Шапка: имя, описание, цена в одну строку */}
        <div className="mt-4 rounded-2xl bg-black/5 dark:bg-white/5 px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="font-semibold text-gray-900 dark:text-white">{role.roleName}</div>
            {role.description && (
              <p className="text-sm text-gray-500 dark:text-white/60 mt-0.5">{role.description}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="text-xl font-extrabold text-violet-500 whitespace-nowrap">{role.price} {role.currency}</div>
            <div className="text-[11px] text-gray-500 dark:text-white/40">/ {periodLabel(role.period)}</div>
            {role.isRecurring && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">{t("payment.autoRenew")}</p>
            )}
          </div>
        </div>

        {/* Полный список привилегий — 2 столбца */}
        {(role.features || []).length > 0 && (
          <div className="mt-4">
            <div className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-white/40 mb-2">Что входит</div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              {role.features.map((f, i) => (
                <li key={i} className="text-sm text-gray-700 dark:text-white/80 flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 shrink-0 mt-0.5" /> {f}
                </li>
              ))}
            </ul>
          </div>
        )}

        {role.trialDays > 0 && (
          <div className="mt-3 text-sm text-green-600 dark:text-green-400 flex items-center gap-1.5">
            <Check className="w-4 h-4" /> {t("payment.trialFree").replace("{n}", String(role.trialDays))}
          </div>
        )}

        {error && (
          <div className="mt-3 flex items-start gap-2 p-3 rounded-xl bg-red-500/10 text-red-500 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
          </div>
        )}

        <button onClick={pay} disabled={loading}
          className="mt-5 w-full py-3 rounded-xl bg-violet-500 text-white font-semibold hover:bg-violet-600 disabled:opacity-50 flex items-center justify-center gap-2 transition">
          {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> {t("payment.processing")}</> : t("payment.pay")}
        </button>

        <p className="mt-3 text-xs text-gray-400 dark:text-white/40 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          {t("payment.secureVia")} {role.paymentProvider === "manual" ? t("payment.manualAdmin") : role.paymentProvider}
        </p>
      </div>
    </div>
  );
}
