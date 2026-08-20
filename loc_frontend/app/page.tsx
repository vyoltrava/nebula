"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Post } from "@/components/Post";
import { CreatePost } from "@/components/CreatePost";
import { RightPanel } from "@/components/RightPanel";
import { PostSkeleton } from "@/components/Skeletons";
import { getToken } from "@/lib/auth";
import { onFeedRefresh } from "@/lib/events";
import { useWebSocket } from "@/src/hooks/useWebSocket";
import { useI18n } from "@/lib/i18n/LanguageProvider";

export default function HomePage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<"all" | "following">("all");
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  
  const mainRef = useRef<HTMLElement>(null);
  const isLoadingRef = useRef(false);

  async function loadMore(reset = false) {
    if (isLoadingRef.current && !reset) return;
    isLoadingRef.current = true;
    setLoading(true);

    const token = getToken();
    const cursor = reset ? null : nextCursor;

    let url = "";
    if (activeTab === "all") {
      url = cursor
        ? `${process.env.NEXT_PUBLIC_API_URL}/api/posts?cursor=${cursor}&limit=20`
        : `${process.env.NEXT_PUBLIC_API_URL}/api/posts?limit=20`;
    } else {
      url = cursor
        ? `${process.env.NEXT_PUBLIC_API_URL}/api/posts/following?cursor=${cursor}&limit=20`
        : `${process.env.NEXT_PUBLIC_API_URL}/api/posts/following?limit=20`;
    }

    const headers: Record<string, string> = {};
    if (token) {
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
      isLoadingRef.current = false;
    }
  }

  useEffect(() => {
    setPosts([]);
    setNextCursor(null);
    setHasMore(true);
    loadMore(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleNewPost = useCallback((data: any) => {
    setPosts((prev) => (prev.some((p) => p.id === data.id) ? prev : [data, ...prev]));
  }, []);

  const handlePostDeleted = useCallback((data: any) => {
    setPosts((prev) => prev.filter((p) => p.id !== data.post_id));
  }, []);

  const handlePostLiked = useCallback((data: any) => {
    window.dispatchEvent(new CustomEvent("like-sync", { detail: data }));
  }, []);

  useWebSocket("new_post", handleNewPost);
  useWebSocket("post_deleted", handlePostDeleted);
  useWebSocket("post_liked", handlePostLiked);

  useEffect(() => {
    const cleanup = onFeedRefresh(() => {
      loadMore(true);
    });
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />
      <div className="w-px shrink-0 bg-white/10 my-3" />

      <main ref={mainRef} className="flex-1 overflow-y-auto border-x border-white/10">
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

        {activeTab === "all" && <CreatePost />}

        {loading && posts.length === 0 ? (
          <>
            <PostSkeleton />
            <PostSkeleton />
            <PostSkeleton />
            <PostSkeleton />
          </>
        ) : (
          <>
            {posts.map((post) => (
              <div 
                key={post.id} 
                data-post-id={post.id}
                className="transition-all duration-500 rounded-2xl"
              >
                <Post {...post} />
              </div>
            ))}

            {loading && posts.length > 0 && (
              <>
                <PostSkeleton />
                <PostSkeleton />
              </>
            )}
          </>
        )}

        {posts.length === 0 && !loading && (
          <p className="p-8 text-center text-white/50">
            {activeTab === "following"
              ? t("feed.emptyFollowing")
              : t("common.noPosts")}
          </p>
        )}

        {hasMore && posts.length > 0 && !loading && (
          <button
            onClick={() => loadMore()}
            className="w-full p-4 text-center text-[#8b5cf6] font-semibold hover:bg-white/5 transition-all"
          >
            {t("common.loadMore")}
          </button>
        )}
      </main>

      <RightPanel />
    </div>
  );
}