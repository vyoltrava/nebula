"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Edit, Trash2, DollarSign } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { usePermissions } from "@/hooks/usePermissions";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";

interface PremiumItem {
  id: number;
  username: string;
  price: number | null;
  currency: string;
  category: string | null;
  is_available: boolean;
  is_reserved: boolean;
  is_active: boolean;
  reserved_for: number | null;
  views_count: number;
  purchased_by: number | null;
}

const EMPTY_FORM = {
  username: "",
  price: "",
  currency: "USD",
  category: "",
  isReserved: false,
  reservedFor: "",
};

const inputCls =
  "w-full rounded-lg border border-line dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500/40";

export default function PremiumUsernamesTab() {
  const [items, setItems] = useState<PremiumItem[]>([]);
  const [shopEnabled, setShopEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PremiumItem | null>(null);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [error, setError] = useState("");

  const { hasPermission } = usePermissions();
  const canManage = hasPermission("manage_usernames");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, shopRes] = await Promise.all([
        apiFetch("/api/admin/premium-usernames"),
        apiFetch("/api/premium/shop-status"),
      ]);
      if (listRes.ok) setItems(await listRes.json());
      if (shopRes.ok) {
        const d = await shopRes.json();
        setShopEnabled(!!d.enabled);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canManage) load();
  }, [canManage, load]);

  const toggleShop = async (enabled: boolean) => {
    const res = await apiFetch(`/api/admin/premium/shop?enabled=${enabled}`, { method: "POST" });
    if (res.ok) setShopEnabled(enabled);
  };

  const handleSave = async () => {
    setError("");
    const payload = {
      username: formData.username.trim(),
      price: formData.price === "" ? null : Number(formData.price),
      currency: formData.currency,
      category: formData.category || null,
      is_reserved: formData.isReserved,
      reserved_for: formData.isReserved && formData.reservedFor ? Number(formData.reservedFor) : null,
    };
    const res = await apiFetch(
      editing ? `/api/admin/premium-usernames/${editing.id}` : "/api/admin/premium-usernames",
      {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    if (res.ok) {
      setModalOpen(false);
      setEditing(null);
      setFormData({ ...EMPTY_FORM });
      load();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.detail || "Ошибка сохранения");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Удалить этот юзернейм?")) return;
    await apiFetch(`/api/admin/premium-usernames/${id}`, { method: "DELETE" });
    load();
  };

  const openEdit = (item: PremiumItem) => {
    setEditing(item);
    setFormData({
      username: item.username,
      price: item.price != null ? String(item.price) : "",
      currency: item.currency || "USD",
      category: item.category || "",
      isReserved: !!item.is_reserved,
      reservedFor: item.reserved_for != null ? String(item.reserved_for) : "",
    });
    setModalOpen(true);
  };

  const statusBadge = (item: PremiumItem) => {
    if (!item.is_active) return <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-500">Отключён</span>;
    if (!item.is_available) return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-500/10 text-gray-500">Продан</span>;
    if (item.is_reserved) return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600">Зарезервирован</span>;
    return <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-600">Доступен</span>;
  };

  if (!canManage)
    return (
      <div className="p-6 text-sm text-gray-500 dark:text-white/40">
        Нет прав для управления премиум-юзернеймами.
      </div>
    );

  return (
    <div className="space-y-6">
      {/* Шапка с включением магазина */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold">Премиум юзернеймы (@)</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-500">{items.length} всего</span>
        </div>
        <div className="flex items-center gap-3">
          {/* КНОПКА ВКЛЮЧЕНИЯ МАГАЗИНА */}
          <label className="flex cursor-pointer select-none items-center gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={shopEnabled}
              onClick={() => toggleShop(!shopEnabled)}
              className={`relative h-6 w-10 rounded-full transition-colors ${shopEnabled ? "bg-green-500" : "bg-gray-300 dark:bg-white/20"}`}
            >
              <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${shopEnabled ? "translate-x-4" : ""}`} />
            </button>
            <span className="text-sm font-medium">Магазин {shopEnabled ? "включен" : "выключен"}</span>
          </label>

          <Button
            onClick={() => {
              setEditing(null);
              setFormData({ ...EMPTY_FORM });
              setModalOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Добавить @
          </Button>
        </div>
      </div>

      {/* Таблица */}
      <div className="overflow-hidden rounded-xl border border-line dark:border-white/10">
        {loading ? (
          <div className="p-6 text-sm text-gray-500">Загрузка…</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">Пока нет премиум-юзернеймов.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-gray-500 dark:border-white/10 dark:text-white/40">
                  <th className="px-4 py-3">@username</th>
                  <th className="px-4 py-3">Цена</th>
                  <th className="px-4 py-3">Категория</th>
                  <th className="px-4 py-3">Статус</th>
                  <th className="px-4 py-3">Просмотры</th>
                  <th className="px-4 py-3 text-right">Действия</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-line dark:border-white/5 last:border-0">
                    <td className="px-4 py-3 font-mono">@{item.username}</td>
                    <td className="px-4 py-3">
                      {item.price != null ? `${item.price} ${item.currency}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {item.category ? (
                        <span className="rounded-full bg-gray-500/10 px-2 py-0.5 text-xs text-gray-500 dark:text-white/60">
                          {item.category}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">{statusBadge(item)}</td>
                    <td className="px-4 py-3">{item.views_count || 0}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => openEdit(item)}
                          className="rounded-lg p-2 text-gray-500 hover:bg-gray-200 dark:text-white/60 dark:hover:bg-white/10"
                          title="Редактировать"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="rounded-lg p-2 text-red-500 hover:bg-red-500/10"
                          title="Удалить"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Модалка создания/редактирования */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <h3 className="mb-2 text-lg font-bold">{editing ? "Редактировать @" : "Добавить премиум @"}</h3>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-white/50">Юзернейм</label>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-gray-400">@</span>
                <input
                  className={inputCls}
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="username"
                  disabled={!!editing}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-white/50">Цена</label>
                <input
                  type="number"
                  className={`${inputCls} mt-1`}
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  placeholder="100"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-white/50">Валюта</label>
                <select
                  className={`${inputCls} mt-1`}
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="CREDITS">Кредиты</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-white/50">Категория</label>
              <input
                className={`${inputCls} mt-1`}
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="short, vip, branded…"
              />
            </div>

            <div className="flex items-center gap-4">
              <label className="flex cursor-pointer select-none items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={formData.isReserved}
                  onClick={() => setFormData({ ...formData, isReserved: !formData.isReserved })}
                  className={`relative h-6 w-10 rounded-full transition-colors ${formData.isReserved ? "bg-amber-500" : "bg-gray-300 dark:bg-white/20"}`}
                >
                  <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${formData.isReserved ? "translate-x-4" : ""}`} />
                </button>
                <span className="text-sm font-medium">Зарезервировать</span>
              </label>

              {formData.isReserved && (
                <input
                  className={`${inputCls} flex-1`}
                  value={formData.reservedFor}
                  onChange={(e) => setFormData({ ...formData, reservedFor: e.target.value })}
                  placeholder="ID пользователя"
                />
              )}
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleSave}>{editing ? "Сохранить" : "Добавить"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
