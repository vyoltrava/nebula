"use client";

import { useEffect, useState } from "react";

// Кэш на уровне модуля — не дёргаем API повторно при ре-рендерах
const cache = new Map<string, any>();

export function LinkPreview({ url }: { url: string }) {
  const [data, setData] = useState<any | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!url) return;
    if (cache.has(url)) { 
      setData(cache.get(url)); 
      return; 
    }

    let cancelled = false;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/link-preview?url=${encodeURIComponent(url)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad status"))))
      .then((d) => {
        if (cancelled) return;
        cache.set(url, d);
        setData(d);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
      
    return () => { cancelled = true; };
  }, [url]);

  // Нет ссылки, ошибка или нечего показывать — не рисуем ничего
  if (!url || failed || !data) return null;
  if (!data.title && !data.image && !data.description) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      onClick={(e) => e.stopPropagation()}
      className="block mt-3 rounded-2xl overflow-hidden border border-white/10 bg-[#1f1f23] hover:border-[#8b5cf6]/40 hover:bg-[#8b5cf6]/5 transition-all group"
    >
      {data.image && (
        <div className="w-full aspect-[2/1] overflow-hidden bg-black/30">
          <img
            src={data.image}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        </div>
      )}
      <div className="p-3.5">
        <div className="flex items-center gap-2 mb-1">
          {data.favicon && (
            <img
              src={data.favicon}
              alt=""
              loading="lazy"
              className="w-4 h-4 rounded-full"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
          <span className="text-[11px] text-white/40 truncate uppercase">
            {data.site_name || url.replace(/^https?:\/\//, "").split("/")[0]}
          </span>
        </div>
        {data.title && (
          <p className="text-sm font-semibold text-white/90 line-clamp-2 group-hover:text-[#a78bfa] transition-colors">
            {data.title}
          </p>
        )}
        {data.description && (
          <p className="text-[13px] text-white/50 line-clamp-2 mt-1">{data.description}</p>
        )}
        <p className="text-[11px] text-[#8b5cf6]/70 truncate mt-1.5">{url}</p>
      </div>
    </a>
  );
}