"use client";
// 🎨 StickerBotModal — модалка стикер-бота: команды-кнопки, формы загрузки
// стикеров, управление паками (создание/приватность/удаление) — как в BotFather.
import { useEffect, useRef, useState } from "react";
import { getToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { Bot, X, Plus, Trash2, Upload, Loader2, Globe, Lock, RefreshCw } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

type Pack = {
  id: number; name: string; banned: boolean; is_public?: boolean;
  owner_username?: string | null; stickers: { id: number; type: string; content: string }[];
};

export function StickerBotModal({ onClose, onOpenChat }: { onClose: () => void; onOpenChat?: () => void }) {
  const { t } = useI18n();
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/sticker-packs/mine`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) setPacks(await res.json());
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function createPack() {
    const n = newName.trim();
    if (!n || busy) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`${API_URL}/api/sticker-packs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ name: n, emojis: ["✨"] }),
      });
      if (res.ok) { setNewName(""); load(); }
      else { const d = await res.json().catch(() => null); setError(d?.detail || "Ошибка"); }
    } finally { setBusy(false); }
  }

  async function uploadSticker(packId: number, file: File) {
    setBusy(true); setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_URL}/api/sticker-packs/${packId}/upload`, {
        method: "POST", headers: { Authorization: `Bearer ${getToken()}` }, body: fd,
      });
      if (res.ok) load();
      else { const d = await res.json().catch(() => null); setError(d?.detail || "Ошибка загрузки"); }
    } finally { setBusy(false); }
  }

  async function toggleVisibility(p: Pack) {
    await fetch(`${API_URL}/api/sticker-packs/${p.id}/visibility`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ is_public: !p.is_public }),
    });
    load();
  }

  async function deletePack(p: Pack) {
    if (!confirm(`Удалить пак «${p.name}» со всеми стикерами?`)) return;
    await fetch(`${API_URL}/api/sticker-packs/${p.id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${getToken()}` },
    });
    load();
  }

return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[300] flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-2xl shadow-2xl pointer-events-auto max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Шапка */}
        <div className="p-4 border-b border-line dark:border-white/10 flex items-center gap-3 sticky top-0 bg-ivory dark:bg-[#1f1f23] z-10">
          <img src="/stickerbot.png" alt="StickerBot" className="w-9 h-9 rounded-full object-cover bg-[#8b5cf6]/20 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 dark:text-white">StickerBot</p>
            <p className="text-[11px] text-gray-500 dark:text-white/40">@stickerbot · твои стикеры</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Команды-кнопки */}
          <div className="flex flex-wrap gap-1.5">
            {onOpenChat && ["/mypacks", "/addsticker", "/help"].map((c) => (
              <button key={c} onClick={onOpenChat}
                className="px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-white/70 text-[11px] font-mono font-bold hover:bg-[#8b5cf6]/15 hover:text-[#8b5cf6] transition-colors">
                {c}
              </button>
            ))}
          </div>

          {/* Создать пак */}
          <div className="flex gap-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createPack(); }}
              maxLength={60} placeholder="Название нового пака…"
              className="flex-1 px-3 py-2 rounded-xl border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-[#8b5cf6]" />
            <button onClick={createPack} disabled={busy || !newName.trim()}
              className="shrink-0 px-3 py-2 rounded-xl bg-[#8b5cf6] text-white text-xs font-bold hover:bg-[#7c3aed] disabled:opacity-40 flex items-center gap-1.5">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Создать
            </button>
          </div>

          {error && <p className="text-red-600 dark:text-red-400 text-xs font-bold">{error}</p>}

          {/* Список паков */}
          {loading && <p className="text-center text-gray-500 dark:text-white/40 text-sm py-6"><Loader2 size={16} className="inline animate-spin" /> Загрузка…</p>}
          {!loading && packs.length === 0 && (
            <div className="text-center py-8">
              <Bot size={36} className="mx-auto text-gray-400 dark:text-white/20 mb-2" />
              <p className="text-gray-600 dark:text-white/50 text-sm">Паков пока нет — создай выше или через /newpack</p>
            </div>
          )}
          {packs.map((p) => (
            <PackCard key={p.id} p={p} busy={busy}
              onUpload={(f) => uploadSticker(p.id, f)}
              onToggle={() => toggleVisibility(p)}
              onDelete={() => deletePack(p)} />
          ))}

          <p className="text-[10px] text-gray-500 dark:text-white/30 flex items-center gap-1">
            <RefreshCw size={10} /> Команды: /newpack /mypacks /addsticker /rename /privacy /delpack
          </p>
        </div>
      </div>
    </div>
  );
}

function PackCard({ p, busy, onUpload, onToggle, onDelete }: {
  p: Pack; busy: boolean;
  onUpload: (f: File) => void; onToggle: () => void; onDelete: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className={`border rounded-2xl overflow-hidden ${p.banned ? "border-red-500/40 bg-red-500/5 opacity-60" : "border-line dark:border-white/10 bg-gray-100 dark:bg-white/5"}`}>
      <div className="p-3 flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-[#8b5cf6]/15 text-[#8b5cf6] flex items-center justify-center shrink-0"><Bot size={17} /></div>
        <div className="flex-1 min-w-0">
          <p className="font-bold truncate text-gray-900 dark:text-white text-sm">{p.name}
            {p.banned && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-red-500/15 text-red-600 dark:text-red-400 text-[10px] font-black uppercase">забанен</span>}
          </p>
          <p className="text-[10px] text-gray-500 dark:text-white/40">{p.stickers.length} стикеров</p>
        </div>
        <button onClick={onToggle} disabled={busy}
          title={p.is_public === false ? "Приватный" : "Публичный"}
          className={`p-1.5 shrink-0 ${p.is_public === false ? "text-amber-500" : "text-emerald-500"} hover:opacity-70`}>
          {p.is_public === false ? <Lock size={15} /> : <Globe size={15} />}
        </button>
        <button onClick={onDelete} disabled={busy} title="Удалить пак"
          className="p-1.5 shrink-0 text-gray-500 dark:text-white/40 hover:text-red-600"><Trash2 size={15} /></button>
      </div>
      <div className="grid grid-cols-6 gap-1.5 px-2 pb-2">
        {p.stickers.map((s) => (
          s.type === "image"
            ? <img key={s.id} src={s.content} alt="" className="w-14 h-14 object-contain rounded-lg" />
            : <span key={s.id} className="text-2xl w-14 h-14 flex items-center justify-center">{s.content}</span>
        ))}
      </div>
      <div className="px-3 pb-3">
        <label className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gray-200 dark:bg-white/10 text-gray-700 dark:text-white/70 text-xs font-bold cursor-pointer hover:bg-purple-500/20 hover:text-purple-600 dark:hover:text-purple-300 transition-all">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Загрузить стикеры
          <input ref={(el) => { fileRef.current = el; }} type="file" accept="image/*" multiple hidden
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              e.target.value = "";
              for (const f of files) onUpload(f);
            }} />
        </label>
      </div>
    </div>
  );
}

