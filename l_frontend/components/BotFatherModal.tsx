"use client";
// 👨💻 BotFatherModal — модалка с кнопками ВНУТРИ чата с BotFather.
// «Создать бота» → пошаговый диалог (имя → ник → API-ключ один раз).
// «Мои боты» → список пользовательских ботов + сброс API-ключа.
// Пользовательские боты = Python-файлы с API-ключом (test_bot.py).
import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";
import { Bot, X, Copy, Check, RefreshCw, Loader2, KeyRound } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function ModalHeader({ onClose, subtitle }: { onClose: () => void; subtitle: string }) {
  return (
    <div className="p-4 border-b border-line dark:border-white/10 flex items-center gap-3 sticky top-0 bg-ivory dark:bg-[#1f1f23] z-10">
      <img src="/botfather.png" alt="BotFather" className="w-9 h-9 rounded-full object-cover bg-[#8b5cf6]/20 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-bold text-gray-900 dark:text-white">BotFather</p>
        <p className="text-[11px] text-gray-500 dark:text-white/40">{subtitle}</p>
      </div>
      <button onClick={onClose} className="p-2 rounded-lg text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white"><X size={18} /></button>
    </div>
  );
}

function TokenScreen({ issuedToken, apiUrl, onClose, copied, copyToken }: {
  issuedToken: string; apiUrl: string; onClose: () => void; copied: boolean; copyToken: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-green-600 dark:text-green-400 font-bold text-sm">
        <Check size={16} /> Готово!
      </div>
      <div className="p-3 rounded-xl border border-amber-500/40 bg-amber-500/10">
        <p className="text-[11px] text-amber-700 dark:text-amber-300 font-bold mb-2">
          ⚠️ API-ключ показывается только один раз. Вставь его в Python-файл бота.
          Потеряешь — сбрось через «Мои боты», старый перестанет работать.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs font-mono text-gray-900 dark:text-white break-all">{issuedToken}</code>
          <button onClick={copyToken} className="shrink-0 p-2 rounded-lg bg-gray-200 dark:bg-white/10 text-gray-700 dark:text-white/70 hover:text-[#8b5cf6]">
            {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
          </button>
        </div>
      </div>
      <div className="p-3 rounded-xl bg-gray-100 dark:bg-white/5 text-[11px] text-gray-600 dark:text-white/50 font-mono overflow-x-auto">
        <p className="font-bold text-gray-700 dark:text-white/70 mb-1">Шаблон бота (test_bot.py):</p>
        BOT_API = &quot;{apiUrl}&quot;<br />
        BOT_TOKEN = &quot;{issuedToken.slice(0, 8)}…&quot;<br />
        → python test_bot.py
      </div>
      <button onClick={onClose} className="w-full py-2 rounded-lg bg-[#8b5cf6] text-white text-sm font-bold hover:bg-[#7c3aed]">Готово</button>
    </div>
  );
}

function MyBots({ bots, loading, error, resettingId, onCreateFirst, resetToken, onEdit }: {
  bots: any[]; loading: boolean; error: string; resettingId: number | null;
  onCreateFirst: () => void; resetToken: (id: number) => void; onEdit: (b: any) => void;
}) {
  return (
    <div className="space-y-2">
      {loading && <p className="text-center text-gray-500 dark:text-white/40 text-sm py-6"><Loader2 size={16} className="inline animate-spin" /> Загрузка…</p>}
      {!loading && bots.length === 0 && (
        <div className="text-center py-8">
          <Bot size={36} className="mx-auto text-gray-400 dark:text-white/20 mb-2" />
          <p className="text-gray-600 dark:text-white/50 text-sm">У тебя пока нет ботов</p>
          <button onClick={onCreateFirst} className="mt-3 px-4 py-2 rounded-lg bg-[#8b5cf6] text-white text-xs font-bold hover:bg-[#7c3aed]">+ Создать первого</button>
        </div>
      )}
      {bots.map((b) => (
        <div key={b.id} className="flex items-center gap-2.5 p-3 rounded-xl border border-line dark:border-white/10 bg-gray-100 dark:bg-white/5">
          <div className="w-9 h-9 rounded-lg bg-[#8b5cf6]/15 text-[#8b5cf6] flex items-center justify-center shrink-0 overflow-hidden">
            {b.avatar_url
              ? <img src={b.avatar_url.startsWith("public:") ? b.avatar_url.slice(7) : b.avatar_url} alt="" className="w-full h-full object-cover" />
              : <Bot size={17} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{b.name}</p>
            <p className="text-[10px] text-gray-500 dark:text-white/40 truncate">@{b.username} · {b.active ? "активен" : "выключен"}{b.has_api_key ? " · ключ выдан" : ""}</p>
          </div>
          <button onClick={() => onEdit(b)} title="Настройки бота"
            className="shrink-0 p-2 rounded-lg bg-gray-200 dark:bg-white/10 text-gray-700 dark:text-white/70 hover:text-[#8b5cf6] text-xs font-bold">⚙️</button>
          <button onClick={() => resetToken(b.id)} disabled={resettingId === b.id}
            title="Сбросить API-ключ"
            className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[11px] font-bold hover:bg-amber-500/25 disabled:opacity-50">
            {resettingId === b.id ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />}
            Ключ
          </button>
        </div>
      ))}
      {error && <p className="text-red-600 dark:text-red-400 text-xs font-bold">{error}</p>}
      <p className="text-[10px] text-gray-500 dark:text-white/30 pt-1 flex items-center gap-1">
        <RefreshCw size={10} /> Сброс ключа аннулирует старый. Бот — это Python-файл с этим ключом.
      </p>
    </div>
  );
}

export function BotFatherModal({ mode, onClose }: { mode: "create" | "bots"; onClose: () => void; }) {
  const [step, setStep] = useState<"name" | "username" | "token">("name");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [issuedToken, setIssuedToken] = useState("");
  const [copied, setCopied] = useState(false);

  const [bots, setBots] = useState<any[]>([]);
  const [loadingBots, setLoadingBots] = useState(false);
  const [resettingId, setResettingId] = useState<number | null>(null);
  const [editBot, setEditBot] = useState<any | null>(null);

  useEffect(() => {
    if (mode === "bots") {
      setLoadingBots(true);
      fetch(`${API_URL}/api/botfather/my-bots`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
        .then(r => r.json())
        .then(d => setBots(Array.isArray(d) ? d : []))
        .catch(() => setBots([]))
        .finally(() => setLoadingBots(false));
    }
    return () => { setStep("name"); setName(""); setUsername(""); setError(""); setIssuedToken(""); setCopied(false); };
  }, [mode]);

  async function createBot() {
    setSaving(true); setError("");
    try {
      const res = await fetch(`${API_URL}/api/botfather/create-bot`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ name, username: username || undefined }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d?.detail || "Ошибка создания"); return; }
      setIssuedToken(d.token);
      setStep("token");
    } finally { setSaving(false); }
  }

  async function resetToken(botId: number) {
    if (!confirm("Сбросить API-ключ? Старый перестанет работать!")) return;
    setResettingId(botId);
    try {
      const res = await fetch(`${API_URL}/api/botfather/reset-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ bot_id: botId }),
      });
      const d = await res.json();
      if (res.ok) { setIssuedToken(d.token); setStep("token"); }
      else setError(d?.detail || "Ошибка сброса");
    } finally { setResettingId(null); }
  }

  function copyToken() {
    navigator.clipboard?.writeText(issuedToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[300] flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-2xl shadow-2xl pointer-events-auto max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <ModalHeader onClose={onClose} subtitle={mode === "create" ? "Создание бота" : "Мои боты"} />
        <div className="p-4 space-y-4">
          {mode === "create" && step === "name" && (
            <>
              <p className="text-sm text-gray-600 dark:text-white/60">Придумай имя для своего бота.</p>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60}
                autoFocus placeholder="Например: MyAwesomeBot"
                className="w-full border border-line dark:border-white/15 rounded-lg px-3 py-2.5 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:border-[#8b5cf6]" />
              {error && <p className="text-red-600 dark:text-red-400 text-xs font-bold">{error}</p>}
              <div className="flex gap-2">
                <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-gray-200 dark:bg-white/10 text-gray-700 dark:text-white/70 text-sm font-bold">Отмена</button>
                <button onClick={() => name.trim() ? setStep("username") : setError("Введите имя")}
                  className="flex-1 py-2 rounded-lg bg-[#8b5cf6] text-white text-sm font-bold hover:bg-[#7c3aed]">Далее</button>
              </div>
            </>
          )}
          {mode === "create" && step === "username" && (
            <>
              <p className="text-sm text-gray-600 dark:text-white/60">Ник: латиница/цифры/_, на конце <b>bot</b>.</p>
              <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={32}
                autoFocus placeholder="my_awesome_bot"
                className="w-full border border-line dark:border-white/15 rounded-lg px-3 py-2.5 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:border-[#8b5cf6]" />
              {error && <p className="text-red-600 dark:text-red-400 text-xs font-bold">{error}</p>}
              <div className="flex gap-2">
                <button onClick={() => setStep("name")} className="flex-1 py-2 rounded-lg bg-gray-200 dark:bg-white/10 text-gray-700 dark:text-white/70 text-sm font-bold">Назад</button>
                <button onClick={createBot} disabled={saving}
                  className="flex-1 py-2 rounded-lg bg-[#8b5cf6] text-white text-sm font-bold hover:bg-[#7c3aed] disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
                  {saving ? "Создаю…" : "Создать бота"}
                </button>
              </div>
            </>
          )}
          {issuedToken && step === "token" && (
            <TokenScreen issuedToken={issuedToken} apiUrl={API_URL || ""} onClose={onClose} copied={copied} copyToken={copyToken} />
          )}
          {mode === "bots" && (
            <MyBots bots={bots} loading={loadingBots} error={error}
              resettingId={resettingId}
              onCreateFirst={() => { setStep("name"); setIssuedToken(""); }}
              resetToken={resetToken} onEdit={(b) => setEditBot(b)} />
          )}
          {mode === "bots" && editBot && (
            <EditBotForm bot={editBot} onBack={() => setEditBot(null)} onSaved={() => { setEditBot(null); setLoadingBots(true); fetch(`${API_URL}/api/botfather/my-bots`, { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()).then(d => setBots(Array.isArray(d) ? d : [])).finally(() => setLoadingBots(false)); }} />
          )}
        </div>
      </div>
    </div>
  );
}

// ⚙️ Форма настройки бота: имя, описание, ссылка, аватарка
function EditBotForm({ bot, onBack, onSaved }: {
  bot: any; onBack: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(bot.name || "");
  const [description, setDescription] = useState(bot.description || "");
  const [link, setLink] = useState(bot.link || "");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    bot.avatar_url ? (bot.avatar_url.startsWith("public:") ? bot.avatar_url.slice(7) : bot.avatar_url) : null);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [okMsg, setOkMsg] = useState("");
  const [error, setError] = useState("");

  async function save() {
    setSaving(true); setError(""); setOkMsg("");
    try {
      const res = await fetch(`${API_URL}/api/botfather/edit-bot`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ bot_id: bot.id, name, description, link }),
      });
      if (!res.ok) { const d = await res.json().catch(() => null); setError(d?.detail || "Ошибка сохранения"); return; }
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        const ar = await fetch(`${API_URL}/api/botfather/${bot.id}/avatar`, {
          method: "POST", headers: { Authorization: `Bearer ${getToken()}` }, body: fd,
        });
        if (!ar.ok) { const d = await ar.json().catch(() => null); setError(d?.detail || "Ошибка аватарки"); return; }
      }
      setOkMsg("Сохранено ✓");
      onSaved();
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-xl bg-[#8b5cf6]/15 text-[#8b5cf6] flex items-center justify-center overflow-hidden shrink-0">
          {avatarPreview
            ? <img src={avatarPreview.startsWith("public:") ? avatarPreview.slice(7) : avatarPreview} alt="" className="w-full h-full object-cover" />
            : <Bot size={24} />}
        </div>
        <label className="px-3 py-2 rounded-lg bg-gray-200 dark:bg-white/10 text-gray-700 dark:text-white/70 text-xs font-bold cursor-pointer hover:text-[#8b5cf6]">
          Сменить аватарку
          <input type="file" accept="image/*" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setAvatarPreview(URL.createObjectURL(f)); } e.target.value = ""; }} />
        </label>
      </div>
      <div>
        <label className="block text-xs font-bold text-gray-600 dark:text-white/50 mb-1">Имя</label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60}
          className="w-full border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-[#8b5cf6]" />
      </div>
      <div>
        <label className="block text-xs font-bold text-gray-600 dark:text-white/50 mb-1">Описание (до 300 симв.)</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={2}
          placeholder="Чем занимается бот"
          className="w-full border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm resize-none focus:outline-none focus:border-[#8b5cf6]" />
      </div>
      <div>
        <label className="block text-xs font-bold text-gray-600 dark:text-white/50 mb-1">Ссылка (сайт / профиль)</label>
        <input value={link} onChange={(e) => setLink(e.target.value)} maxLength={300}
          placeholder="https://…"
          className="w-full border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-[#8b5cf6]" />
      </div>
      <p className="text-[10px] text-gray-500 dark:text-white/40">Ник @{bot.username} изменить нельзя.</p>
      {okMsg && <p className="text-green-600 dark:text-green-400 text-xs font-bold">{okMsg}</p>}
      {error && <p className="text-red-600 dark:text-red-400 text-xs font-bold">{error}</p>}
      <div className="flex gap-2">
        <button onClick={onBack} className="flex-1 py-2 rounded-lg bg-gray-200 dark:bg-white/10 text-gray-700 dark:text-white/70 text-sm font-bold">Назад</button>
        <button onClick={save} disabled={saving}
          className="flex-1 py-2 rounded-lg bg-[#8b5cf6] text-white text-sm font-bold hover:bg-[#7c3aed] disabled:opacity-50 flex items-center justify-center gap-2">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {saving ? "Сохраняю…" : "Сохранить"}
        </button>
      </div>
    </div>
  );
}
