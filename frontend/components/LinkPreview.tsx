"use client";

import { useEffect, useState } from "react";

// Адрес бэкенда. Открой frontend/.env.local — там переменная с адресом API
// (типа NEXT_PUBLIC_API_URL). Если название другое — поправь строку ниже.
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Preview = {
  url: string;
  site: string;
  title: string;
  description: string;
  image: string | null;
};

export default function LinkPreview({ url }: { url: string }) {
  const [data, setData] = useState<Preview | null>(null);
  const [imgOk, setImgOk] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`${API_BASE}/unfurl?url=${encodeURIComponent(url)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad"))))
      .then((d) => setData(d))
      .catch(() => {});
    return () => ctrl.abort();
  }, [url]);

  if (!data) return null;

  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
       className="mt-2 flex gap-3 rounded-lg border border-white/10 bg-white/5 p-3 transition-colors hover:bg-white/10">
      <div className="min-w-0 flex-1 border-l-2 border-pink-500 pl-3">
        <div className="truncate text-xs text-pink-400">{data.site}</div>
        <div className="mt-0.5 line-clamp-2 text-sm font-semibold">{data.title}</div>
        {data.description && (
          <div className="mt-0.5 line-clamp-2 text-xs text-zinc-400">{data.description}</div>
        )}
      </div>
      {data.image && imgOk && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.image} alt="" loading="lazy" onError={() => setImgOk(false)}
             className="h-16 w-16 shrink-0 rounded-md object-cover" />
      )}
    </a>
  );
}