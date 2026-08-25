"use client";
import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";
import { Post } from "./Post";
import { onFeedRefresh } from "@/lib/events";
import { useI18n } from "@/lib/i18n/LanguageProvider";


export function FeedTabs() {
  const [tab, setTab] = useState<"all" | "following">("all");
  const [posts, setPosts] = useState<any[]>([]);
  const { t } = useI18n();

  async function loadPosts() {
    const url = tab === "all"
      ? `${process.env.NEXT_PUBLIC_API_URL}/api/posts`
      : `${process.env.NEXT_PUBLIC_API_URL}/api/posts/following`;

    const headers: Record<string, string> = {};
    const token = getToken();
    if (token && tab === "following") {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(url, { headers, cache: "no-store" });
    setPosts(await res.json());
  }

  useEffect(() => {
    loadPosts();
  }, [tab]);

  useEffect(() => {
    const cleanup = onFeedRefresh(() => {
      loadPosts();
    });
    return cleanup;
  }, [tab]);

  return (
    <>
      <div className="flex border-b border-gray-200 dark:border-white/10 sticky top-0 bg-gray-50 dark:bg-[#171717]/80 backdrop-blur-md z-10">
        <button
          onClick={() => setTab("all")}
          className={`flex-1 py-3 font-bold transition-colors ${
            tab === "all" ? "text-gray-900 dark:text-white border-b-2 border-purple-600 dark:border-purple-400" : "text-gray-600 dark:text-white/50 hover:text-gray-800 dark:hover:text-white/80"
          }`}
        >
          {t("feed.all")}
        </button>
        <button
          onClick={() => setTab("following")}
          className={`flex-1 py-3 font-bold transition-colors ${
            tab === "following" ? "text-gray-900 dark:text-white border-b-2 border-purple-600 dark:border-purple-400" : "text-gray-600 dark:text-white/50 hover:text-gray-800 dark:hover:text-white/80"
          }`}
        >
          {t("feed.following")}
        </button>
      </div>

      {posts.map((post) => (
        <Post key={post.id} {...post} />
      ))}

      {tab === "following" && posts.length === 0 && (
        <p className="p-8 text-center text-gray-600 dark:text-white/50">
          {t("feed.followingEmpty")}
        </p>
      )}
    </>
  );
}