"use client";

import { useCallback, useEffect, useState } from "react";
import { getToken } from "@/lib/auth";
import { CreditCard, Loader2, X, Check, AlertTriangle, ShieldCheck } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface ShopRole {
  id: number; roleId: number; roleName: string;
  price: number; currency: string; period: string; trialDays: number;
  description: string | null; features: string[];
  isRecurring: boolean; paymentProvider: string;
}

const PERIOD_LABEL: Record<string, string> = {
  once: "навсегда", monthly: "в месяц", yearly: "в год",
};

export function PaymentShop({ onPurchased }: { onPurchased?: () => void }) {
  const [state, setState] = useState<{ loading: boolean; enabled: boolean; roles: ShopRole[] }>(
    { loading: true, enabled: true, roles: [] },
  );
  const [selected, setSelected] = useState<ShopRole | null>(null);

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
  if (!state.enabled) return null; // система выключена — блок не показываем
  if (state.roles.length === 0) return null;

  return (
    <div>
      <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-3">
        <CreditCard className="w-5 h-5 text-violet-500" /> Доступные плашки
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {state.roles.map(role => (
          <div key={role.roleId}
            className="rounded-2xl bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 p-4 flex flex-col">
            <div className="font-semibold text-gray-900 dark:text-white">{role.roleName}</div>
            <div className="mt-1">
              <span className="text-2xl font-extrabold text-violet-500">{role.price} {role.currency}</span>
              <span className="text-xs text-gray-500 dark:text-white/50 ml-1">
                / {PERIOD_LABEL[role.period] || role.period}
              </span>
            </div>
            {role.description && (
              <p className="text-sm text-gray-500 dark:text-white/60 mt-1">{role.description}</p>
            )}
            <ul className="mt-2 space-y-1 flex-1">
              {(role.features || []).map((f, i) => (
                <li key={i} className="text-sm text-gray-700 dark:text-white/80 flex items-start gap-1.5">
                  <Check className="w-4 h-4 text-green-500 shrink-0 mt-0.5" /> {f}
                </li>
              ))}
            </ul>
            {role.trialDays > 0 && (
              <div className="text-xs text-green-600 dark:text-green-400 mt-2">
                🎁 {role.trialDays} дней бесплатно
              </div>
            )}
            <button onClick={() => setSelected(role)}
              className="mt-3 w-full py-2 rounded-xl bg-violet-500 text-white font-semibold hover:bg-violet-600 transition">
              💳 Купить
            </button>
          </div>
        ))}
      </div>

      {selected && (
        <PaymentModal role={selected}
          onClose={() => setSelected(null)}
          onSuccess={() => { setSelected(null); load(); onPurchased?.(); }} />
      )}
    </div>
  );
}

function PaymentModal({ role, onClose, onSuccess }: {
  role: ShopRole; onClose: () => void; onSuccess: () => void;
}) {
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
        setError(data.detail || "Не удалось создать платеж");
        return;
      }
      if (data.url) {
        // Stripe Checkout / другой провайдер с redirect-платежом
        window.location.href = data.url;
        return;
      }
      if (data.provider === "manual" || (!data.url && !data.clientSecret)) {
        // Ручной режим — платеж ждет подтверждения админа
        onSuccess();
      }
    } catch {
      setError("Ошибка сети. Попробуйте позже.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={loading ? undefined : onClose}>
      <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#1e1e22] p-6 relative"
        onClick={e => e.stopPropagation()}>
        <button onClick={onClose} disabled={loading}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-white">
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Покупка плашки</h2>

        <div className="mt-4 rounded-2xl bg-black/5 dark:bg-white/5 p-4">
          <div className="font-semibold text-gray-900 dark:text-white">{role.roleName}</div>
          {role.description && (
            <p className="text-sm text-gray-500 dark:text-white/60 mt-0.5">{role.description}</p>
          )}
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-extrabold text-violet-500">{role.price} {role.currency}</span>
            <span className="text-xs text-gray-500">
              / {PERIOD_LABEL[role.period] || role.period}
            </span>
          </div>
          {role.isRecurring && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              🔄 Автопродление — подписка
            </p>
          )}
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 p-3 rounded-xl bg-red-500/10 text-red-500 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
          </div>
        )}

        <button onClick={pay} disabled={loading}
          className="mt-4 w-full py-3 rounded-xl bg-violet-500 text-white font-semibold hover:bg-violet-600 disabled:opacity-50 flex items-center justify-center gap-2 transition">
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "💳 Оплатить"}
        </button>

        <p className="mt-3 text-xs text-gray-400 dark:text-white/40 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          Безопасный платеж через {role.paymentProvider === "manual" ? "администрацию" : role.paymentProvider}
        </p>
      </div>
    </div>
  );
}

