"use client";
// 🪐 StickerPackAddModal — «магазин» пользовательских стикерпаков (как в Telegram).
// Открывается кнопкой «+» рядом с любым пикером стикеров:
//   - сверху горизонтальная лента паков (превью);
//   - ниже БЕСКОНЕЧНЫЙ общий список: все паки подряд, у каждого заголовок + стикеры;
//   - клик по паку в ленте → плавный скролл к его секции в общем списке;
//   - у каждого пака кнопка «Добавить себе» / «Убрать» (POST/DELETE /api/sticker-packs/{id}/add).
import { useEffect, useRef, useState, useCallback } from "react";
import { X, Plus, Check, Loader2 } from "lucide-react";
import { getToken } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";

const API = process.env.NEXT_PUBLIC_API_URL || "";

type St = { id: number; type: string; content: string; order?: number };
type Pack = {
  id: number; name: string; is_user?: boolean; banned?: boolean; is_public?: boolean;
  owner_username?: string | null; stickers?: St[]; added?: boolean;
};

export function StickerPackAddModal({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  /** Вызывается после добавления/удаления пака, чтобы хост-пикер перезагрузил свои паки. */
  onChanged?: () => void;
}) {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = getToken();
    try {
      const res = await fetch(`${API}/api/sticker-packs/public`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      setPacks(Array.isArray(data) ? data : []);
    } catch {
      setError("Не удалось загрузить стикерпаки");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const scrollToPack = (id: number) => {
    const el = sectionRefs.current.get(id);
    if (el && listRef.current) {
      listRef.current.scrollTo({ top: el.offsetTop - listRef.current.offsetTop - 8, behavior: "smooth" });
    }
  };

  const toggleAdd = async (p: Pack) => {
    const token = getToken();
    if (!token) return;
    setBusyId(p.id);
    try {
      if (p.added) {
        await fetch(`${API}/api/sticker-packs/${p.id}/add`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      } else {
        await fetch(`${API}/api/sticker-packs/${p.id}/add`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      }
      setPacks((prev) => prev.map((x) => (x.id === p.id ? { ...x, added: !p.added } : x)));
      onChanged?.();
    } catch {
      /* ignore */
    } finally {
      setBusyId(null);
    }
  };
return (
    <div className="fixed inset-0 z-[280] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[85vh] bg-white dark:bg-[#1e1e22] border border-line dark:border-white/15 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Шапка */}
        <div className="shrink-0 p-3 pb-2 border-b border-line dark:border-white/10 flex items-center justify-between">
          <p className="text-sm font-bold text-gray-900 dark:text-white">Добавить стикерпаки</p>
          <button onClick={onClose} className="text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white p-1">
            <X size={16} />
          </button>
        </div>

        {/* Лента паков (превью) — как в Telegram */}
        {!loading && packs.length > 0 && (
          <div className="shrink-0 flex gap-2 px-3 py-2 border-b border-line dark:border-white/10 overflow-x-auto scrollbar-hide">
            {packs.map((p) => (
              <button
                key={p.id}
                onClick={() => scrollToPack(p.id)}
                className="shrink-0 flex flex-col items-center gap-1 w-16"
              >
                <div className="w-11 h-11 rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 flex items-center justify-center overflow-hidden">
                  {p.stickers?.find((s) => s.type === "image") ? (
                    <img src={mediaUrl(p.stickers.find((s) => s.type === "image")!.content)} alt="" className="w-9 h-9 object-contain" />
                  ) : (
                    <span className="text-xl">{p.stickers?.[0]?.content || "🖼️"}</span>
                  )}
                </div>
                <span className="text-[9px] text-gray-500 dark:text-white/40 text-center leading-tight line-clamp-2">{p.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Бесконечный список: все паки подряд */}
        <div ref={listRef} className="flex-1 overflow-y-auto min-h-0">
          {loading && (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-violet-500" /></div>
          )}
          {error && <p className="py-8 text-center text-sm text-gray-500 dark:text-white/50">{error}</p>}
          {!loading && !error && packs.length === 0 && (
            <p className="py-10 text-center text-sm text-gray-500 dark:text-white/50">Открытых стикерпаков пока нет</p>
          )}
          {!loading && !error && packs.map((p) => (
            <div
              key={p.id}
              ref={(el) => { if (el) sectionRefs.current.set(p.id, el); else sectionRefs.current.delete(p.id); }}
              className="px-3 py-3 border-b border-line dark:border-white/5"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 flex items-center justify-center overflow-hidden">
                  {p.stickers?.find((s) => s.type === "image") ? (
                    <img src={mediaUrl(p.stickers.find((s) => s.type === "image")!.content)} alt="" className="w-7 h-7 object-contain" />
                  ) : (
                    <span className="text-lg">{p.stickers?.[0]?.content || "🖼️"}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold truncate text-sm text-gray-900 dark:text-white">{p.name}</p>
                  <p className="text-[10px] text-gray-500 dark:text-white/40 truncate">
                    {p.stickers?.length || 0} стикеров{p.owner_username ? ` · @${p.owner_username}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => toggleAdd(p)}
                  disabled={busyId === p.id}
                  className={`shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50 ${
                    p.added
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                      : "bg-[#8b5cf6] text-white hover:bg-[#7c3aed]"
                  }`}
                >
                  {busyId === p.id ? <Loader2 size={12} className="animate-spin" /> : p.added ? <Check size={12} /> : <Plus size={12} />}
                  {p.added ? "Добавлен" : "Добавить"}
                </button>
              </div>
              <div className="grid grid-cols-6 gap-1.5">
                {(p.stickers || []).slice(0, 24).map((s) =>
                  s.type === "image" ? (
                    <div key={s.id} className="aspect-square flex items-center justify-center">
                      <img src={mediaUrl(s.content)} alt="" className="w-9 h-9 object-contain" />
                    </div>
                  ) : (
                    <div key={s.id} className="aspect-square flex items-center justify-center text-xl">{s.content}</div>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
