"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search } from "lucide-react";
import { getToken } from "@/lib/auth";
import { onFeedRefresh } from "@/lib/events";

export function RightPanel() {
  const [q, setQ] = useState("");
  const [tags, setTags] = useState<any[]>([]);
  const [authors, setAuthors] = useState<any[]>([]);
  const router = useRouter();

  async function load() {
    const tagsRes = await fetch("http://localhost:8000/api/tags/popular");
    if (tagsRes.ok) setTags(await tagsRes.json());

    const token = getToken();
    if (token) {
      const authRes = await fetch("http://localhost:8000/api/users/recommended", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (authRes.ok) setAuthors(await authRes.json());
    }
  }

  useEffect(() => {
    load();
    return onFeedRefresh(() => load());
  }, []);

  async function follow(userId: number) {
    const token = getToken();
    if (!token) return;
    await fetch(`http://localhost:8000/api/users/${userId}/follow`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    load();
  }

  return (
    <aside className="w-80 shrink-0 overflow-y-auto p-5 flex flex-col gap-4 backdrop-blur-sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) router.push(`/search?q=${encodeURIComponent(q)}`);
        }}
      >
        <label className="flex items-center gap-2 border border-white/15 rounded-full px-4 py-2 bg-white/5 focus-within:border-purple-400/50 transition-all">
          <Search size={16} className="text-white/50" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск"
            className="w-full bg-transparent focus:outline-none text-white placeholder-white/40"
          />
        </label>
      </form>

      <section className="border border-white/15 rounded-2xl p-4 bg-white/5 backdrop-blur-sm">
        <h2 className="font-black mb-3 text-white">Популярные теги</h2>
        {tags.length === 0 && <p className="text-sm text-white/50">Пока нет тегов</p>}
        <div className="space-y-2">
          {tags.map((t) => (
            <Link key={t.name} href={`/tag/${t.name}`} className="block hover:bg-white/5 rounded-lg p-2 -mx-2 transition-colors">
              <p className="font-bold text-sm text-purple-400">#{t.name}</p>
              <p className="text-xs text-white/50">{t.count} постов</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="border border-white/15 rounded-2xl p-4 bg-white/5 backdrop-blur-sm">
        <h2 className="font-black mb-3 text-white">Интересные авторы</h2>
        {authors.length === 0 && <p className="text-sm text-white/50">Нет рекомендаций</p>}
        <div className="space-y-3">
          {authors.map((a) => (
            <div key={a.id} className="flex items-center gap-3">
              {a.avatar_url ? (
                <img
                  src={`http://localhost:8000${a.avatar_url}`}
                  alt=""
                  className="w-9 h-9 rounded-full border border-white/20 object-cover"
                />
              ) : (
                <div className="w-9 h-9 rounded-full border border-white/20 bg-white/5" />
              )}
              <div className="flex-1 leading-tight">
                <Link href={`/user/${a.id}`} className="font-bold text-sm text-white hover:text-purple-400 transition-colors">
                  {a.display_name}
                </Link>
                <p className="text-xs text-white/50">{a.followers_count} подписчиков</p>
              </div>
              <button
                onClick={() => follow(a.id)}
                className="text-xs font-bold px-3 py-1 rounded-full border border-white/20 text-white/70 hover:bg-white/10 hover:border-white/40 hover:text-white transition-all"
              >
                Читать
              </button>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}