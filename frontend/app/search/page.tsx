"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Post } from "@/components/Post";
import { Search as SearchIcon } from "lucide-react";

export default function SearchPage() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<{ users: any[]; posts: any[] } | null>(null);
  const [loading, setLoading] = useState(false);

  async function doSearch(q: string) {
    if (!q.trim()) {
      setResults(null);
      return;
    }
    setLoading(true);
    const res = await fetch(`http://localhost:8000/api/search?q=${encodeURIComponent(q)}`);
    setResults(await res.json());
    setLoading(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    doSearch(query);
  }

  useState(() => {
    if (initialQuery) doSearch(initialQuery);
  });

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />

      <div className="w-px shrink-0 bg-white/10 my-3" />

      <main className="flex-1 overflow-y-auto border-x border-white/10">
        <form onSubmit={handleSubmit} className="p-4 border-b border-white/10 sticky top-0 bg-[#0f0c29]/80 backdrop-blur-md z-10">
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 border border-white/15 rounded-full px-4 py-2 bg-white/5 focus-within:border-purple-400/50 transition-all">
              <SearchIcon size={18} className="text-white/50" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск людей и постов..."
                className="w-full bg-transparent focus:outline-none text-white placeholder-white/40"
              />
            </div>
            <button
              type="submit"
              className="border border-purple-400/50 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-full px-5 hover:shadow-lg hover:shadow-purple-500/30 transition-all"
            >
              Найти
            </button>
          </div>
        </form>

        {loading && <p className="p-8 text-center text-white/50">Ищем...</p>}

        {!loading && results && (
          <>
            {results.users.length > 0 && (
              <section className="p-4 border-b border-white/10">
                <h2 className="font-black mb-3 text-white">Люди</h2>
                <div className="space-y-2">
                  {results.users.map((u) => (
                    <Link
                      key={u.id}
                      href={`/user/${u.id}`}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors"
                    >
                      {u.avatar_url ? (
                        <img
                          src={`http://localhost:8000${u.avatar_url}`}
                          alt=""
                          className="w-10 h-10 rounded-full border border-white/20 object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full border border-white/20 bg-white/5" />
                      )}
                      <div className="leading-tight">
                        <p className="font-bold text-sm text-white">{u.display_name}</p>
                        <p className="text-sm text-white/50">@{u.username}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {results.posts.length > 0 && (
              <section>
                <h2 className="font-black p-4 pb-0 text-white">Посты</h2>
                {results.posts.map((post) => (
                  <Post key={post.id} {...post} />
                ))}
              </section>
            )}

            {results.users.length === 0 && results.posts.length === 0 && (
              <p className="p-8 text-center text-white/50">Ничего не найдено</p>
            )}
          </>
        )}

        {!loading && !results && (
          <p className="p-8 text-center text-white/50">Введи запрос для поиска</p>
        )}
      </main>
    </div>
  );
}