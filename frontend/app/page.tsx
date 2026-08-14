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

const FEED_MEMORY_KEY = "trelod_feed_memory";

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<"all" | "following">("all");
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [highlightedPostId, setHighlightedPostId] = useState<number | null>(null);
  
  const mainRef = useRef<HTMLElement>(null);
  const hasRestoredRef = useRef(false);

  async function loadMore(reset = false) {
    if (loading && !reset) return;
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
    setPosts([]);
    setNextCursor(null);
    setHasMore(true);
    hasRestoredRef.current = false; // Сбрасываем флаг при смене вкладки
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
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail.id;
      setPosts((prev) => prev.filter((p) => p.id !== id));
    };
    window.addEventListener("post-deleted", handler);
    return () => window.removeEventListener("post-deleted", handler);
  }, []);

  useEffect(() => {
    const cleanup = onFeedRefresh(() => {
      loadMore(true);
    });
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, nextCursor]);

  // ════════════════════════════════════════════════════════════════
  // 🧠 ПАМЯТЬ ЛЕНТЫ: Сохранение и Восстановление
  // ════════════════════════════════════════════════════════════════
  const savePosition = useCallback(() => {
    if (!mainRef.current) return;
    const scrollTop = mainRef.current.scrollTop;
    
    // Если находимся в самом верху — очищаем память (дочитал)
    if (scrollTop < 100) {
      localStorage.removeItem(FEED_MEMORY_KEY);
      window.dispatchEvent(new CustomEvent("feed-memory-clear"));
      return;
    }
    
    const postElements = document.querySelectorAll("[data-post-id]");
    let targetPostId: number | null = null;
    const mainRect = mainRef.current.getBoundingClientRect();
    const viewportTrigger = mainRect.top + 150; 
    
    for (const el of postElements) {
      const rect = el.getBoundingClientRect();
      if (rect.top >= viewportTrigger - 50 && rect.top <= viewportTrigger + 300) {
        targetPostId = Number(el.getAttribute("data-post-id"));
        break;
      }
    }
    
    if (!targetPostId) {
       for (const el of postElements) {
         const rect = el.getBoundingClientRect();
         if (rect.top >= mainRect.top + 100) {
           targetPostId = Number(el.getAttribute("data-post-id"));
           break;
         }
       }
    }
    
    if (targetPostId) {
      localStorage.setItem(FEED_MEMORY_KEY, JSON.stringify({ postId: targetPostId, timestamp: Date.now() }));
      window.dispatchEvent(new CustomEvent("feed-memory-save"));
    }
  }, []);

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          savePosition();
          ticking = false;
        });
        ticking = true;
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    
    const onUnload = () => savePosition();
    window.addEventListener("beforeunload", onUnload);
    
    const onVisibility = () => {
      if (document.visibilityState === "hidden") savePosition();
    };
    document.addEventListener("visibilitychange", onVisibility);
    
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [savePosition]);

  const restorePosition = useCallback(() => {
    const memStr = localStorage.getItem(FEED_MEMORY_KEY);
    if (!memStr || !mainRef.current) return;
    try {
      const mem = JSON.parse(memStr);
      const el = document.querySelector(`[data-post-id="${mem.postId}"]`);
      if (el) {
        const mainRect = mainRef.current.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const offset = elRect.top - mainRect.top + mainRef.current.scrollTop - 80;
        mainRef.current.scrollTo({ top: offset, behavior: "smooth" });
        setHighlightedPostId(mem.postId);
        setTimeout(() => setHighlightedPostId(null), 3000);
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (posts.length > 0 && !loading && !hasRestoredRef.current) {
      const memStr = localStorage.getItem(FEED_MEMORY_KEY);
      if (memStr) {
        const timer = setTimeout(() => {
          restorePosition();
          hasRestoredRef.current = true;
        }, 400);
        return () => clearTimeout(timer);
      }
    }
  }, [posts.length, loading, restorePosition]);

  useEffect(() => {
    const handler = () => {
       restorePosition();
    };
    window.addEventListener("restore-feed-position", handler);
    return () => window.removeEventListener("restore-feed-position", handler);
  }, [restorePosition]);

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
                className={`transition-all duration-500 rounded-2xl ${
                  highlightedPostId === post.id 
                    ? "ring-2 ring-[#8b5cf6] ring-offset-4 ring-offset-[#171717] bg-[#8b5cf6]/5 shadow-[0_0_30px_rgba(139,92,246,0.3)]" 
                    : ""
                }`}
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
              ? "Подпишись на кого-нибудь, чтобы видеть их посты здесь"
              : "Пока нет постов"}
          </p>
        )}

        {hasMore && posts.length > 0 && !loading && (
          <button
            onClick={() => loadMore()}
            className="w-full p-4 text-center text-[#8b5cf6] font-semibold hover:bg-white/5 transition-all"
          >
            Загрузить ещё
          </button>
        )}
      </main>

      <RightPanel />
    </div>
  );
}