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
import { LoaderCircle } from "lucide-react";

export default function HomePage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<"all" | "following">("all");
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [pendingPost, setPendingPost] = useState<{
    text: string;
    mediaUrl: string | null;
    mediaType: string | null;
  } | null>(null);
  
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

  const handlePostDisliked = useCallback((data: any) => {
    window.dispatchEvent(new CustomEvent("dislike-sync", { detail: data }));
  }, []);

  useWebSocket("new_post", handleNewPost);
  useWebSocket("post_deleted", handlePostDeleted);
  useWebSocket("post_liked", handlePostLiked);
  useWebSocket("post_disliked", handlePostDisliked);

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
      <div className="w-px shrink-0 bg-gray-100 dark:bg-white/10 my-3" />

      <main ref={mainRef} className="flex-1 overflow-y-auto border-x border-line dark:border-white/10">
        {/* Вкладки */}
        <div className="flex border-b border-line dark:border-white/10 sticky top-0 bg-paper dark:bg-[#171717]/80 backdrop-blur-md z-10">
          <button
            onClick={() => setActiveTab("all")}
            className={`flex-1 py-3 font-bold text-center transition-all ${
              activeTab === "all"
                ? "text-gray-900 dark:text-white border-b-2 border-purple-600 dark:border-purple-400"
                : "text-gray-600 dark:text-white/50 hover:text-gray-800 dark:hover:text-white/80"
            }`}
          >
            {t("feed.all")}
          </button>
          <button
            onClick={() => setActiveTab("following")}
            className={`flex-1 py-3 font-bold text-center transition-all ${
              activeTab === "following"
                ? "text-gray-900 dark:text-white border-b-2 border-purple-600 dark:border-purple-400"
                : "text-gray-600 dark:text-white/50 hover:text-gray-800 dark:hover:text-white/80"
            }`}
          >
            {t("feed.following")}
          </button>
        </div>

        {activeTab === "all" && (
          <CreatePost
            onPendingPostChange={setPendingPost}
            onPostCreated={(post) => {
              setPosts((prev) => prev.some((item) => item.id === post.id) ? prev : [post, ...prev]);
            }}
          />
        )}

        {pendingPost && (
          <article className="p-4 border-b border-line dark:border-white/10 opacity-80">
            <div className="flex items-start gap-3">
              <LoaderCircle size={18} className="mt-1 shrink-0 animate-spin text-[#8b5cf6]" aria-label="Sending post" />
              <div className="min-w-0 flex-1">
                {pendingPost.text && <p className="whitespace-pre-wrap break-words text-gray-900 dark:text-white">{pendingPost.text}</p>}
                {pendingPost.mediaUrl && pendingPost.mediaType === "image" && (
                  <img src={pendingPost.mediaUrl} alt="" className="mt-2 max-h-72 rounded-xl object-contain" />
                )}
                {pendingPost.mediaUrl && pendingPost.mediaType === "video" && (
                  <video src={pendingPost.mediaUrl} controls className="mt-2 max-h-72 rounded-xl" />
                )}
                {pendingPost.mediaUrl && pendingPost.mediaType === "audio" && (
                  <audio src={pendingPost.mediaUrl} controls className="mt-2 w-full" />
                )}
              </div>
            </div>
          </article>
        )}

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
          <p className="p-8 text-center text-gray-600 dark:text-white/50">
            {activeTab === "following"
              ? t("feed.emptyFollowing")
              : t("common.noPosts")}
          </p>
        )}

        {hasMore && posts.length > 0 && !loading && (
          <button
            onClick={() => loadMore()}
            className="w-full p-4 text-center text-[#8b5cf6] font-semibold hover:bg-gray-100 dark:hover:bg-white/5 transition-all"
          >
            {t("common.loadMore")}
          </button>
        )}
      </main>

      <RightPanel />
    </div>
  );
}