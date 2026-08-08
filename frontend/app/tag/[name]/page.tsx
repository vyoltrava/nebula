"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Post } from "@/components/Post";

export default function TagPage() {
  const pathname = usePathname();
  const tagName = decodeURIComponent(pathname.split("/").pop() || "");
  const [posts, setPosts] = useState<any[]>([]);

  useEffect(() => {
    fetch(`http://localhost:8000/api/tags/${tagName}/posts`)
      .then((r) => r.json())
      .then(setPosts);
  }, [tagName]);

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />

      <div className="w-px shrink-0 bg-white/10 my-3" />

      <main className="flex-1 overflow-y-auto border-x border-white/10">
        <h1 className="text-2xl font-black p-4 border-b border-white/10 sticky top-0 bg-[#0f0c29]/80 backdrop-blur-md text-purple-400">
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