"use client";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Post } from "@/components/Post";
import { CreatePost } from "@/components/CreatePost";
import { RightPanel } from "@/components/RightPanel";
import { getToken } from "@/lib/auth";
import { onFeedRefresh } from "@/lib/events";
import { API_URL } from "@/lib/api";

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<"all" | "following">("all");
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState<number | null>(null);

  async function loadMore(reset = false) {
    if (loading) return;
    setLoading(true);

    const token = getToken();
    const cursor = reset ? null : nextCursor;

    let url = "";
    if (activeTab === "all") {
      url = cursor
        ? `http://${API_URL}/api/posts?cursor=${cursor}&limit=20`
        : `http://${API_URL}/api/posts?limit=20`;
    } else {
      url = cursor
        ? `http://${API_URL}/api/posts/following?cursor=${cursor}&limit=20`
        : `http://${API_URL}/api/posts/following?limit=20`;
    }

    const headers: Record<string, string> = {};
    if (activeTab === "following" && token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        setPosts((prev) => (reset ? data.posts : [...prev, ...data.posts]));
        setHasMore(data.has_more);
        setNextCursor(data.next_cursor);
      }
    } catch (err) {
      console.error("Failed to load posts:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMore(true);
  }, [activeTab]);

  useEffect(() => {
    const cleanup = onFeedRefresh(() => {
      loadMore(true);
    });
    return cleanup;
  }, [activeTab, nextCursor]);

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />
      <div className="w-px shrink-0 bg-white/10 my-3" />

      <main className="flex-1 overflow-y-auto border-x border-white/10">
        {/* Вкладки */}
        <div className="flex border-b border-white/10 sticky top-0 bg-[#171717]/80 backdrop-blur-md z-10">
          <button
            onClick={() => setActiveTab("all")}
            className={`flex-1 py-3 font-bold text-center transition-all ${
              activeTab === "all"
                ? "text-white border-b-2 border-purple-400"
                : "text-white/50 hover:text-white/80"
            }`}
          >
            Для вас
          </button>
          <button
            onClick={() => setActiveTab("following")}
            className={`flex-1 py-3 font-bold text-center transition-all ${
              activeTab === "following"
                ? "text-white border-b-2 border-purple-400"
                : "text-white/50 hover:text-white/80"
            }`}
          >
            Читаемые
          </button>
        </div>

        {/* Форма создания поста — только на вкладке "Для вас" */}
        {activeTab === "all" && <CreatePost />}

        {/* Посты */}
        {posts.map((post) => (
          <Post key={post.id} {...post} />
        ))}

        {posts.length === 0 && !loading && (
          <p className="p-8 text-center text-white/50">
            {activeTab === "following"
              ? "Подпишись на кого-нибудь, чтобы видеть их посты здесь"
              : "Пока нет постов"}
          </p>
        )}

        {hasMore && posts.length > 0 && (
          <button
            onClick={() => loadMore()}
            disabled={loading}
            className="w-full p-4 text-center text-[#8b5cf6] hover:text-[#8b5cf6] font-semibold hover:bg-white/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Загрузка..." : "Загрузить ещё"}
          </button>
        )}

        {loading && posts.length === 0 && (
          <p className="p-8 text-center text-white/50">Загрузка постов...</p>
        )}
      </main>

      <RightPanel />
    </div>
  );
}