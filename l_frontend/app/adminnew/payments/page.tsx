"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";
import { CreditCard, Save, Trash2, Plus, X, Eye, Loader2, BarChart3, ArrowLeft, Info } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface SysRole { id: number; name: string; color: string; show_in_payments?: boolean; }
interface PaymentRole {
  id: number; roleId: number; roleName: string; isActive: boolean;
  price: number; currency: string; period: string; trialDays: number;
  description: string | null; features: string[]; isRecurring: boolean;
  paymentProvider: string;
}
interface FormState {
  price: string; currency: string; period: string; trialDays: string;
  description: string; features: string[]; paymentProvider: string;
}

const CURRENCIES = ["USD", "EUR", "RUB", "UAH"];
const PERIODS = [
  { value: "once", label: "Разово" },
  { value: "monthly", label: "Ежемесячно" },
  { value: "yearly", label: "Ежегодно" },
];

function emptyForm(): FormState {
  return { price: "", currency: "USD", period: "once", trialDays: "0",
           description: "", features: [], paymentProvider: "stripe" };
}
function formFrom(pr: PaymentRole): FormState {
  return {
    price: String(pr.price), currency: pr.currency, period: pr.period,
    trialDays: String(pr.trialDays || 0), description: pr.description || "",
    features: pr.features || [], paymentProvider: pr.paymentProvider || "stripe",
  };
}

export default function AdminPaymentsPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [sysRoles, setSysRoles] = useState<SysRole[]>([]);
  const [paymentRoles, setPaymentRoles] = useState<PaymentRole[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [newFeature, setNewFeature] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [systemEnabled, setSystemEnabled] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const authHeaders = () => ({ Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" });

  const load = useCallback(async () => {
    try {
      const [r1, r2, r3] = await Promise.all([
        fetch(`${API}/api/roles`, { headers: authHeaders() }),
        fetch(`${API}/api/payments/roles`, { headers: authHeaders() }),
        fetch(`${API}/api/payments/system/status`),
      ]);
      if (r1.ok) setSysRoles(await r1.json());
      if (r2.ok) setPaymentRoles(await r2.json());
      if (r3.ok) setSystemEnabled((await r3.json()).isEnabled);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.push("/login"); return; }
    fetch(`${API}/api/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(me => {
        if (!me.is_admin) { router.push("/"); return; }
        setAllowed(true);
        load();
      })
      .catch(() => router.push("/login"));
  }, [router, load]);

  const flash = (text: string) => { setMsg(text); setTimeout(() => setMsg(null), 2500); };

  const togglePayment = async (roleId: number) => {
    const cur = paymentRoles.find(p => p.roleId === roleId)?.isActive ?? false;
    const res = await fetch(`${API}/api/payments/roles/toggle`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ roleId, isActive: !cur }),
    });
    if (res.ok) { flash(!cur ? "Оплата включена" : "Оплата отключена"); load(); }
  };

  const toggleSystem = async () => {
    const res = await fetch(`${API}/api/payments/system/status`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ isEnabled: !systemEnabled }),
    });
    if (res.ok) setSystemEnabled(!systemEnabled);
  };

  const startEdit = (role: SysRole) => {
    const pr = paymentRoles.find(p => p.roleId === role.id);
    setEditing(role.id);
    setForm(pr ? formFrom(pr) : emptyForm());
    setShowPreview(false);
  };

  const save = async () => {
    if (!editing) return;
    const price = parseFloat(form.price.replace(",", "."));
    if (!price || price <= 0) { flash("⚠️ Укажите корректную цену"); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/payments/roles/save`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({
          roleId: editing, price,
          currency: form.currency, period: form.period,
          trialDays: parseInt(form.trialDays) || 0,
          description: form.description || null,
          features: form.features, isRecurring: form.period !== "once",
          paymentProvider: form.paymentProvider,
        }),
      });
      if (res.ok) { flash("✅ Настройки сохранены"); setEditing(null); load(); }
      else { const d = await res.json().catch(() => ({})); flash(`❌ ${d.detail || "Ошибка сохранения"}`); }
    } finally { setSaving(false); }
  };

  const addFeature = () => {
    const v = newFeature.trim();
    if (v && !form.features.includes(v)) setForm({ ...form, features: [...form.features, v] });
    setNewFeature("");
  };

  if (allowed === null || allowed === false) {
    return <div className="min-h-screen flex items-center justify-center bg-ivory dark:bg-[#18181b]">
      <p className="text-gray-500 dark:text-white/50 animate-pulse">Загрузка…</p></div>;
  }

  const editingRole = sysRoles.find(r => r.id === editing);
  const pr = editing ? paymentRoles.find(p => p.roleId === editing) : null;
  // Показываем только роли с флагом "Показывать в системе оплаты" (как is_staff → правила)
  const visibleRoles = sysRoles.filter(r => r.show_in_payments);

  return (
    <div className="min-h-screen bg-ivory dark:bg-[#18181b] p-4 md:p-8 max-w-4xl mx-auto">
      <button onClick={() => router.push("/adminnew")}
        className="mb-4 flex items-center gap-1.5 text-sm text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white transition-colors">
        <ArrowLeft size={16} /> Назад
      </button>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2 text-gray-900 dark:text-white">
          <CreditCard className="w-6 h-6 text-violet-500" /> Управление оплатой плашек
        </h1>
        <button onClick={toggleSystem}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${systemEnabled
            ? "bg-red-500/10 text-red-500 hover:bg-red-500/20"
            : "bg-green-500/10 text-green-500 hover:bg-green-500/20"}`}>
          {systemEnabled ? "Отключить систему" : "Включить систему"}
        </button>
      </div>

      {!systemEnabled && (
        <div className="mb-4 p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 text-sm">
          ⚠️ Платежная система отключена — пользователи не видят кнопки покупки.
        </div>
      )}
      {msg && <div className="mb-4 p-3 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300 text-sm">{msg}</div>}

      {visibleRoles.length === 0 && (
        <div className="mb-4 flex items-start gap-2 p-4 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-300 text-sm">
          <Info size={16} className="shrink-0 mt-0.5" />
          <span>
            Пока нет ролей для продажи. Откройте <b>Админка → Роли</b>, создайте или отредактируйте роль
            и включите флаг «Показывать в системе оплаты» — после этого роль появится здесь.
          </span>
        </div>
      )}

      <div className="space-y-2">
        {visibleRoles.map(role => {
          const p = paymentRoles.find(x => x.roleId === role.id);
          const active = p?.isActive ?? false;
          return (
            <div key={role.id}
              className="rounded-2xl bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: role.color }} />
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 dark:text-white truncate">{role.name}</div>
                    {p && active && (
                      <div className="text-xs text-gray-500 dark:text-white/50">
                        {p.price} {p.currency} · {PERIODS.find(x => x.value === p.period)?.label} · {p.paymentProvider}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => startEdit(role)}
                    className="px-3 py-1.5 rounded-lg text-sm bg-violet-500/10 text-violet-600 dark:text-violet-300 hover:bg-violet-500/20">
                    {active ? "Настроить" : "Подключить оплату"}
                  </button>
                  <label className="flex items-center cursor-pointer"
                    title={active ? "Отключить оплату" : "Включить оплату"}>
                    <input type="checkbox" className="sr-only" checked={active}
                      onChange={() => togglePayment(role.id)} />
                    <span className={`w-10 h-6 rounded-full p-0.5 transition ${active ? "bg-green-500" : "bg-gray-300 dark:bg-white/20"}`}>
                      <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${active ? "translate-x-4" : ""}`} />
                    </span>
                  </label>
                </div>
              </div>

              {/* Форма настройки */}
              {editing === role.id && (
                <div className="mt-4 pt-4 border-t border-black/5 dark:border-white/10 space-y-3">
{/* Поля формы */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <label className="text-sm">
                      <span className="text-gray-500 dark:text-white/50">Цена</span>
                      <input type="text" inputMode="decimal" value={form.price}
                        onChange={e => setForm({ ...form, price: e.target.value })} placeholder="9.99"
                        className="mt-1 w-full rounded-lg bg-black/5 dark:bg-white/10 px-3 py-2 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-violet-500" />
                    </label>
                    <label className="text-sm">
                      <span className="text-gray-500 dark:text-white/50">Валюта</span>
                      <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}
                        className="mt-1 w-full rounded-lg bg-black/5 dark:bg-white/10 px-3 py-2 text-gray-900 dark:text-white outline-none">
                        {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                    <label className="text-sm">
                      <span className="text-gray-500 dark:text-white/50">Тип оплаты</span>
                      <select value={form.period} onChange={e => setForm({ ...form, period: e.target.value })}
                        className="mt-1 w-full rounded-lg bg-black/5 dark:bg-white/10 px-3 py-2 text-gray-900 dark:text-white outline-none">
                        {PERIODS.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
                      </select>
                    </label>
                    {form.period !== "once" && (
                      <label className="text-sm">
                        <span className="text-gray-500 dark:text-white/50">Пробный период (дн.)</span>
                        <input type="number" min={0} value={form.trialDays}
                          onChange={e => setForm({ ...form, trialDays: e.target.value })}
                          className="mt-1 w-full rounded-lg bg-black/5 dark:bg-white/10 px-3 py-2 text-gray-900 dark:text-white outline-none" />
                      </label>
                    )}
                  </div>

                  <label className="block text-sm">
                    <span className="text-gray-500 dark:text-white/50">Описание</span>
                    <textarea rows={2} value={form.description}
                      onChange={e => setForm({ ...form, description: e.target.value })}
                      placeholder="Что получает пользователь после покупки?"
                      className="mt-1 w-full rounded-lg bg-black/5 dark:bg-white/10 px-3 py-2 text-gray-900 dark:text-white outline-none resize-none" />
                  </label>

{/* Фичи */}
                  <div className="text-sm">
                    <span className="text-gray-500 dark:text-white/50">Что дает плашка</span>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {form.features.map((f, i) => (
                        <span key={i}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-300 text-xs">
                          {f}
                          <button onClick={() => setForm({ ...form, features: form.features.filter((_, j) => j !== i) })}>
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-2">
                      <input value={newFeature} onChange={e => setNewFeature(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addFeature(); } }}
                        placeholder="Например: Доступ к эксклюзивному контенту"
                        className="flex-1 rounded-lg bg-black/5 dark:bg-white/10 px-3 py-2 text-gray-900 dark:text-white outline-none" />
                      <button onClick={addFeature}
                        className="px-3 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-300 hover:bg-violet-500/20 flex items-center gap-1 text-sm">
                        <Plus className="w-4 h-4" /> Добавить
                      </button>
                    </div>
                  </div>

{/* Провайдер */}
                  <label className="block text-sm">
                    <span className="text-gray-500 dark:text-white/50">Платежный провайдер</span>
                    <select value={form.paymentProvider}
                      onChange={e => setForm({ ...form, paymentProvider: e.target.value })}
                      className="mt-1 w-full md:w-64 rounded-lg bg-black/5 dark:bg-white/10 px-3 py-2 text-gray-900 dark:text-white outline-none">
                      <option value="stripe">Stripe</option>
                      <option value="manual">Ручная обработка (тест)</option>
                    </select>
                  </label>

                  {/* Превью карточки покупки */}
                  {showPreview && (
                    <div className="rounded-2xl border-2 border-violet-500/40 p-4 max-w-xs">
                      <div className="font-bold text-gray-900 dark:text-white">{editingRole?.name}</div>
                      <div className="text-2xl font-extrabold text-violet-500 mt-1">
                        {form.price || "0"} {form.currency}
                        {form.period !== "once" && (
                          <span className="text-sm font-normal text-gray-500"> / {form.period}</span>
                        )}
                      </div>
                      {form.description && (
                        <p className="text-sm text-gray-500 dark:text-white/60 mt-1">{form.description}</p>
                      )}
                      <ul className="mt-2 space-y-1">
                        {form.features.map((f, i) => (
                          <li key={i} className="text-sm text-gray-700 dark:text-white/80">✅ {f}</li>
                        ))}
                      </ul>
                      <button className="mt-3 w-full py-2 rounded-xl bg-violet-500 text-white font-semibold">
                        💳 Купить
                      </button>
                    </div>
                  )}

                  {/* Кнопки действий */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button onClick={save} disabled={saving}
                      className="px-4 py-2 rounded-xl bg-violet-500 text-white font-medium hover:bg-violet-600 disabled:opacity-50 flex items-center gap-2 text-sm">
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Сохранить настройки
                    </button>
                    <button onClick={() => setShowPreview(!showPreview)}
                      className="px-4 py-2 rounded-xl bg-black/5 dark:bg-white/10 text-gray-700 dark:text-white/80 flex items-center gap-2 text-sm">
                      <Eye className="w-4 h-4" /> {showPreview ? "Скрыть превью" : "Превью"}
                    </button>
                    {pr && pr.isActive && (
                      <button onClick={() => { togglePayment(role.id); setEditing(null); }}
                        className="px-4 py-2 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20 flex items-center gap-2 text-sm">
                        <Trash2 className="w-4 h-4" /> Отключить оплату
                      </button>
                    )}
                    <button onClick={() => setEditing(null)}
                      className="px-4 py-2 rounded-xl text-gray-500 hover:bg-black/5 dark:hover:bg-white/10 text-sm">
                      Отмена
                    </button>
                  </div>



                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-gray-400 dark:text-white/30 flex items-center gap-1.5">
        <BarChart3 className="w-3.5 h-3.5" />
        Статистика и подтверждение ручных платежей: GET /api/payments/stats · POST /api/payments/manual-confirm/&#123;id&#125;
      </p>
    </div>
  );
}
