"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { RightPanel } from "@/components/RightPanel";
import { Post } from "@/components/Post";
import { Avatar } from "@/components/Avatar";
import { Search as SearchIcon, X, Users, FileText } from "lucide-react";
import { getToken } from "@/lib/auth";

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center text-white/50">Загрузка...</div>}>
      <SearchContent />
    </Suspense>
  );
}

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialQuery = searchParams.get("q") || "";

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<{ users: any[]; posts: any[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "users" | "posts">("all");
  const inputRef = useRef<HTMLInputElement>(null);

  async function doSearch(q: string) {
    if (!q.trim()) {
      setResults(null);
      return;
    }
    setLoading(true);
    try {
      const token = getToken();
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/search?q=${encodeURIComponent(q)}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (response.ok) {
        setResults(await response.json());
      }
    } catch (error) {
      console.error("Ошибка поиска:", error);
    } finally {
      setLoading(false);
    }
  }

  // Автофокус при загрузке
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounce поиск по мере ввода
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(null);
      return;
    }
    const t = setTimeout(() => doSearch(trimmed), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Обновляем URL при изменении запроса (без перезагрузки)
  useEffect(() => {
    const trimmed = query.trim();
    const current = searchParams.get("q") || "";
    if (trimmed !== current) {
      const params = new URLSearchParams();
      if (trimmed) params.set("q", trimmed);
      router.replace(trimmed ? `/search?${params}` : "/search", { scroll: false });
    }
  }, [query, searchParams, router]);

  // Поиск при первом заходе с ?q=...
  useEffect(() => {
    if (initialQuery) doSearch(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  const filteredUsers = results?.users ?? [];
  const filteredPosts = results?.posts ?? [];
  const totalCount = filteredUsers.length + filteredPosts.length;

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />
      <div className="w-px shrink-0 bg-white/10 my-3 hidden md:block" />
      <main className="flex-1 overflow-y-auto border-x border-white/10">
        {/* Шапка поиска */}
        <div className="p-4 border-b border-white/10 sticky top-0 bg-[#171717]/95 backdrop-blur-md z-10">
          <div className="flex gap-2 mb-3">
            <div className="flex-1 flex items-center gap-2 border border-white/15 rounded-full px-4 py-2.5 bg-white/5 focus-within:border-[#8b5cf6] transition-all">
              <SearchIcon size={18} className="text-white/50 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск людей, постов, тегов..."
                className="w-full bg-transparent focus:outline-none text-white placeholder-white/40 text-sm"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="text-white/40 hover:text-white transition-colors shrink-0"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Вкладки */}
          {results && totalCount > 0 && (
            <div className="flex gap-1 overflow-x-auto scrollbar-hide -mx-1 px-1">
              {[
                { key: "all", label: "Все", count: totalCount, icon: SearchIcon },
                { key: "users", label: "Люди", count: filteredUsers.length, icon: Users },
                { key: "posts", label: "Посты", count: filteredPosts.length, icon: FileText },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as any)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
                    activeTab === tab.key
                      ? "bg-[#8b5cf6] text-white"
                      : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <tab.icon size={12} />
                  {tab.label}
                  <span className={`text-[10px] ${activeTab === tab.key ? "text-white/80" : "text-white/40"}`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Состояния загрузки */}
        {loading && (
          <div className="p-12 text-center">
            <div className="inline-block w-6 h-6 border-2 border-[#8b5cf6] border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-white/50 text-sm">Ищем «{query}»...</p>
          </div>
        )}

        {/* Результаты */}
        {!loading && results && (
          <>
            {/* Люди */}
            {(activeTab === "all" || activeTab === "users") && filteredUsers.length > 0 && (
              <section className="p-4 border-b border-white/10">
                <h2 className="font-black mb-3 text-white flex items-center gap-2">
                  <Users size={16} className="text-[#8b5cf6]" />
                  Люди
                  <span className="text-xs text-white/40 font-normal">({filteredUsers.length})</span>
                </h2>
                <div className="space-y-1">
                  {filteredUsers.map((u) => (
                    <Link
                      key={u.id}
                      href={`/${u.username}`}
                      className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors group"
                    >
                      <Avatar src={u.avatar_url} name={u.display_name} id={u.id} size={44} />
                      <div className="flex-1 min-w-0 leading-tight">
                        <p className="font-bold text-sm text-white group-hover:text-[#8b5cf6] transition-colors truncate">
                          {u.display_name}
                        </p>
                        <p className="text-xs text-white/50 truncate">@{u.username}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Посты */}
            {(activeTab === "all" || activeTab === "posts") && filteredPosts.length > 0 && (
              <section>
                <h2 className="font-black p-4 pb-0 text-white flex items-center gap-2">
                  <FileText size={16} className="text-[#8b5cf6]" />
                  Посты
                  <span className="text-xs text-white/40 font-normal">({filteredPosts.length})</span>
                </h2>
                {filteredPosts.map((post) => (
                  <Post key={post.id} {...post} showFullReplies={false} />
                ))}
              </section>
            )}

            {/* Ничего не найдено */}
            {totalCount === 0 && (
              <div className="p-12 text-center">
                <SearchIcon size={48} className="text-white/20 mx-auto mb-3" />
                <p className="text-white/60 font-bold mb-1">Ничего не нашли по запросу «{query}»</p>
                <p className="text-white/40 text-sm">Попробуй другие ключевые слова</p>
              </div>
            )}
          </>
        )}

        {/* Пустое состояние */}
        {!loading && !results && (
          <div className="p-12 text-center">
            <SearchIcon size={48} className="text-white/20 mx-auto mb-3" />
            <p className="text-white/50 text-sm">Начни вводить запрос для поиска</p>
          </div>
        )}
      </main>
      <RightPanel />
    </div>
  );
}