"use client";

import { useState, useEffect, useCallback } from "react";
import { ShoppingBag, Crown, CreditCard, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { Button } from "@/components/ui/Button";

interface ShopUsername {
  id: number;
  username: string;
  price: number | null;
  currency: string;
  category: string | null;
}

/**
 * ShopSettings — магазин премиум-юзернеймов в настройках.
 * Показывается ТОЛЬКО если глобальный магазин включён (switch в STAT):
 * при выключенном магазине компонент рендерит null.
 */
export function ShopSettings() {
  const { t } = useI18n();
  const [items, setItems] = useState<ShopUsername[]>([]);
  const [shopEnabled, setShopEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [buyingId, setBuyingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, listRes] = await Promise.all([
        apiFetch("/api/premium/shop-status"),
        apiFetch("/api/premium-usernames"),
      ]);
      if (statusRes.ok) {
        const d = await statusRes.json();
        setShopEnabled(!!d.enabled);
      }
      if (listRes.ok) {
        const d = await listRes.json();
        setItems((d.items ?? []) as ShopUsername[]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // При выключенном магазине ничего не показываем
  if (!shopEnabled) return null;

  const buy = async (item: ShopUsername) => {
    if (buyingId !== null) return;
    setBuyingId(item.id);
    setError("");
    setNotice("");
    try {
      const res = await apiFetch(`/api/premium-usernames/${item.id}/purchase`, {
        method: "POST",
      });
      if (res.ok) {
        const d = await res.json().catch(() => ({}));
        setNotice(`Готово! Ваш ник теперь @${(d as any).new_username ?? item.username}`);
        load();
      } else {
        const d = await res.json().catch(() => ({}));
        setError((d as any).detail || "Не удалось купить");
      }
    } finally {
      setBuyingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ShoppingBag size={18} />
          {t("settings.shop")}
        </h2>
        <p className="text-sm text-[#B9B8BD] dark:text-white/60">
          Покупайте уникальные юзернеймы и улучшайте свой аккаунт
        </p>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {notice && <p className="text-sm text-green-600">{notice}</p>}

      {loading ? (
        <p className="text-sm text-[#B9B8BD]">{t("common.loading")}</p>
      ) : items.length === 0 ? (
        <div className="text-center py-10 border border-line dark:border-white/10 rounded-xl bg-gray-100 dark:bg-white/5">
          <Crown size={36} className="text-gray-500 dark:text-white/30 mb-3" />
          <p className="text-gray-600 dark:text-white/50">Сейчас в продаже нет премиум-юзернеймов</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="bg-gray-100 dark:bg-[#1E1E23] border border-line dark:border-white/10 rounded-xl p-5"
            >
              <div className="flex items-center gap-2 mb-1">
                <Sparkles size={16} className="text-[#8b5cf6]" />
                <p className="font-mono text-base font-semibold text-gray-900 dark:text-white">
                  @{item.username}
                </p>
              </div>
              {item.category && (
                <p className="text-xs text-[#a78bfa]">{item.category}</p>
              )}
              <div className="flex items-center justify-between mt-3">
                <span className="text-lg font-bold text-gray-900 dark:text-white">
                  {item.price ?? 0} {item.currency}
                </span>
                <Button
                  size="sm"
                  disabled={buyingId !== null}
                  onClick={() => buy(item)}
                >
                  {buyingId === item.id ? t("common.loading") : t("payment.buy")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-[#B9B8BD] flex items-center gap-1.5">
        <CreditCard size={12} />
        Покупка меняет ваш @username на выбранный премиум-ник
      </div>
    </div>
  );
}