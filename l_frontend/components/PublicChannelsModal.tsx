"use client";
// 🌐 Окно «Все каналы» — полный список публичных каналов с живым поиском
// по названию и @slug. Показывает число подписчиков, плашку/префикс канала
// и статус моей подписки. Открывается кнопкой рядом с «+» в списке чатов.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, ArrowLeft, Users, Lock, CheckCircle } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { getToken } from "@/lib/auth";

const API = process.env.NEXT_PUBLIC_API_URL;

export function ChannelBadge({ badge, size }: { badge: any; size?: "sm" | "md" }) {
  if (!badge) return null;
  const cls = size === "sm" ? "text-[10px] px-2 py-0.5 gap-1" : "text-xs px-2.5 py-1 gap-1.5";
  const iconSize = size === "sm" ? 10 : 13;
  return (
    <span
      className={`inline-flex items-center rounded-full font-bold shadow-sm ${cls}`}
      style={{ backgroundColor: badge.bg_color || "#8b5cf6", color: badge.color || "#fff" }}
    >
      {!!badge.emoji && <span style={{ fontSize: iconSize }}>{badge.emoji}</span>}
      {!!badge.text && <span>{badge.text}</span>}
    </span>
  );
}

export default function PublicChannelsModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    const q = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
    setLoading(true);
    fetch(`${API}/api/channels/discover${q}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setChannels(d || []))
      .catch(() => setChannels([]))
      .finally(() => setLoading(false));
  }, [query]);

  const openChannel = (slug: string) => {
    onClose();
    router.push(`/channels/${slug}`);
  };
return (
    <div className="fixed inset-0 z-[300] bg-ivory dark:bg-[#171717] flex flex-col">
      {/* Шапка: назад + поиск */}
      <div className="sticky top-0 shrink-0 border-b border-line dark:border-white/10 bg-ivory dark:bg-[#171717]/95 backdrop-blur-md">
        <div className="flex items-center gap-2 p-3">
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-600 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            title="Назад"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по названию или @ссылке"
              className="w-full pl-9 pr-8 py-2 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 text-gray-900 dark:text-white text-sm focus:border-[#8b5cf6] outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-white"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Заголовок */}
      <div className="px-4 pt-3 pb-1 shrink-0">
        <h2 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
          <Users size={18} className="text-[#8b5cf6]" /> Все каналы
        </h2>
        <p className="text-xs text-gray-500 dark:text-white/40 mt-0.5">
          Публичные каналы · {channels.length} показано
        </p>
      </div>

      {/* Список */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <p className="text-center text-gray-500 dark:text-white/40 text-sm py-10">Загрузка…</p>
        ) : channels.length === 0 ? (
          <p className="text-center text-gray-500 dark:text-white/40 text-sm py-10">
            {query ? "Ничего не найдено" : "Публичных каналов пока нет"}
          </p>
        ) : (
          <div className="space-y-1">
            {channels.map((ch) => {
              const mine = !!ch.my_role;
              return (
                <button
                  key={ch.id}
                  onClick={() => openChannel(ch.custom_slug)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
                >
                  <Avatar src={ch.avatar_url} name={ch.title} id={ch.id} size={44} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-gray-900 dark:text-white truncate">{ch.title}</p>
                      <ChannelBadge badge={ch.badge} size="sm" />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-white/50 truncate">@{ch.custom_slug}</p>
                    {ch.description && (
                      <p className="text-xs text-gray-500 dark:text-white/40 truncate mt-0.5">{ch.description}</p>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    <span className="text-xs text-gray-500 dark:text-white/40 flex items-center gap-1">
                      <Users size={12} /> {ch.subscribers_count || 0}
                    </span>
                    {mine ? (
                      <span className="px-2 py-0.5 rounded-full bg-[#8b5cf6]/15 text-[#8b5cf6] text-[10px] font-bold inline-flex items-center gap-1">
                        <CheckCircle size={10} /> Подписан
                      </span>
                    ) : (
                      !ch.is_public && (
                        <span className="text-[10px] text-gray-400 inline-flex items-center gap-1">
                          <Lock size={10} /> Приватный
                        </span>
                      )
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}