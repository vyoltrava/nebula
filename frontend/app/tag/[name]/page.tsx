"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation"; // useParams удобнее, чем usePathname
import { Sidebar } from "@/components/Sidebar";
import { Post } from "@/components/Post";

export default function TagPage() {
  const params = useParams();
  // В Next.js App Router params.name приходит как string | string[]
  const tagName = decodeURIComponent((params.name as string) || "");
  const [posts, setPosts] = useState<any[]>([]);

  useEffect(() => {
    if (!tagName) return;
    
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/tags/${tagName}/posts`)
      .then((r) => {
        if (r.ok) return r.json();
        throw new Error("Не удалось загрузить посты");
      })
      .then(setPosts)
      .catch(console.error);
  }, [tagName]);

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />

      <div className="w-px shrink-0 bg-white/10 my-3" />

      <main className="flex-1 overflow-y-auto border-x border-white/10">
        <h1 className="text-2xl font-black p-4 border-b border-white/10 sticky top-0 bg-[#171717]/80 backdrop-blur-md text-[#8b5cf6]">
          #{tagName}
        </h1>
        {posts.map((post) => (
          <Post key={post.id} {...post} />
        ))}
        {posts.length === 0 && (
          <p className="p-8 text-center text-white/50">Пока нет постов с этим тегом</p>
        )}
      </main>
    </div>
  );
}