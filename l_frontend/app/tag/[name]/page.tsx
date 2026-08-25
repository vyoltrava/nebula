"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Post } from "@/components/Post";
import { useI18n } from "@/lib/i18n/LanguageProvider";

export default function TagPage() {
  const { t } = useI18n();
  const params = useParams();
  // В Next.js App Router params.name приходит как string | string[]
  const tagName = decodeURIComponent((params.name as string) || "");
  const [posts, setPosts] = useState<any[]>([]);

  useEffect(() => {
    if (!tagName) return;
    
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/tags/${tagName}/posts`)
      .then((r) => {
        if (r.ok) return r.json();
        throw new Error("Failed to load posts");
      })
      .then(setPosts)
      .catch(console.error);
  }, [tagName]);

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />

      <div className="w-px shrink-0 bg-gray-100 dark:bg-white/10 my-3" />

      <main className="flex-1 overflow-y-auto border-x border-line dark:border-white/10">
        <h1 className="text-2xl font-black p-4 border-b border-line dark:border-white/10 sticky top-0 bg-paper dark:bg-[#171717]/80 backdrop-blur-md text-[#8b5cf6]">
          #{tagName}
        </h1>
        {posts.map((post) => (
          <Post key={post.id} {...post} />
        ))}
        {posts.length === 0 && (
          <p className="p-8 text-center text-gray-600 dark:text-white/50">{t("tag.noPosts")}</p>
        )}
      </main>
    </div>
  );
}