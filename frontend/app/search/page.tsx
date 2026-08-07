"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Post } from "@/components/Post";
import { Avatar } from "@/components/Avatar";
import { Search as SearchIcon } from "lucide-react";

// 1. Оборачиваем в Suspense, чтобы Next.js не ругался при сборке
export default function SearchPage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center text-white">Загрузка...</div>}>
      <SearchContent />
    </Suspense>
  );
}

function SearchContent() {
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
    try {
      // 2. Передаём параметр поиска q на бэкенд (encodeURIComponent защитит от спецсимволов)
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users?q=${encodeURIComponent(q)}`);
      
      // 3. Исправлено: response.ok вместо res.ok
      if (response.ok) {
        setResults(await response.json());
      }
    } catch (error) {
      console.error("Ошибка поиска:", error);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    doSearch(query);
  }

  // 4. Исправлено: useEffect вместо useState для автозапуска поиска
  useEffect(() => {
    if (initialQuery) {
      doSearch(initialQuery);
    }
  }, [initialQuery]);

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />
      <div className="w-px shrink-0 bg-white/10 my-3" />
      <main className="flex-1 overflow-y-auto border-x border-white/10">
        <form onSubmit={handleSubmit} className="p-4 border-b border-white/10 sticky top-0 bg-[#171717]/80 backdrop-blur-md z-10">
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 border border-white/15 rounded-full px-4 py-2 bg-white/5 focus-within:border-[#8b5cf6] transition-all">
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
              className="border border-[#8b5cf6] bg-[#8b5cf6] text-white font-bold rounded-full px-5 transition-all"
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
                      <Avatar src={u.avatar_url} name={u.display_name} id={u.id} />
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