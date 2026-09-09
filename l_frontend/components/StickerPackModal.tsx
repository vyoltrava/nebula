"use client";
import { useEffect, useState } from "react";
import { X, Loader2, Lock } from "lucide-react";
import { getToken } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Модалка «все стикеры пака».
 * Принимает URL стикера (content из сообщения/поста) и резолвит полный пак.
 */
export function StickerPackModal({
  content,
  onClose,
}: {
  content: string | null;
  onClose: () => void;
}) {
  const [pack, setPack] = useState<{ id: number; name: string; min_level: number; locked: boolean } | null>(null);
  const [stickers, setStickers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!content) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const token = getToken();
    fetch(`${API}/api/stickers/by-content?content=${encodeURIComponent(content)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
      .then((data) => {
        if (cancelled) return;
        if (data?.pack) {
          setPack(data.pack);
          setStickers(data.stickers || []);
        } else {
          setError("Не удалось найти пак со стикером");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Ошибка загрузки пака");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [content]);

  if (!content) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}>
      <div className="w-full max-w-sm max-h-[80vh] bg-white dark:bg-[#1e1e22] border border-line dark:border-white/15 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        {/* Шапка */}
        <div className="shrink-0 p-3 pb-2 border-b border-line dark:border-white/10 flex items-center justify-between">
          <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
            {pack ? `Пак «${pack.name}»` : "Стикеры"}
          </p>
          <button onClick={onClose} className="text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white p-1">
            <X size={16} />
          </button>
        </div>

        {/* Контент */}
        <div className="flex-1 overflow-y-auto p-3 min-h-0">
          {loading && (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
            </div>
          )}
          {error && <p className="py-6 text-center text-sm text-gray-500 dark:text-white/50">{error}</p>}
          {!loading && !error && pack?.locked && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center">
                <Lock size={18} className="text-yellow-600 dark:text-yellow-400" />
              </div>
              <p className="text-sm font-bold text-gray-900 dark:text-white">Пак заблокирован</p>
              <p className="text-[11px] text-gray-500 dark:text-white/40 max-w-[220px]">
                Доступен с уровня {pack.min_level}.
              </p>
            </div>
          )}
          {!loading && !error && !pack?.locked && stickers.length > 0 && (
            <div className="grid grid-cols-5 gap-2">
              {stickers.map((s: any) => (
                <div
                  key={s.id}
                  className="aspect-square flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                >
                  {s.type === "emoji" ? (
                    <span className="text-3xl">{s.content}</span>
                  ) : (
                    <img src={mediaUrl(s.content)} alt="" className="w-12 h-12 object-contain" />
                  )}
                </div>
              ))}
            </div>
          )}
          {!loading && !error && !pack?.locked && stickers.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-500 dark:text-white/50">Пак пуст</p>
          )}
        </div>
      </div>
    </div>
  );
}