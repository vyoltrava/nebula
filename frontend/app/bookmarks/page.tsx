"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Post } from "@/components/Post";
import { Bookmark } from "lucide-react";
import { getToken } from "@/lib/auth";

export default function BookmarksPage() {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/bookmarks`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setPosts(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />
      <div className="w-px shrink-0 bg-white/10 my-3" />
      <main className="flex-1 overflow-y-auto border-x border-white/10">
        <div className="p-4 md:p-6 border-b border-white/10 sticky top-0 bg-[#171717]/95 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <Bookmark size={24} className="text-[#8b5cf6]" fill="currentColor" />
            <h1 className="text-xl md:text-2xl font-black text-white">Закладки</h1>
            <span className="text-white/40 text-sm">{posts.length}</span>
          </div>
        </div>

        {loading && <p className="p-8 text-center text-white/50">Загрузка...</p>}

        {!loading && posts.length === 0 && (
          <div className="p-12 text-center">
            <Bookmark size={48} className="text-white/20 mx-auto mb-4" />
            <p className="text-white/60 text-lg">Пока нет закладок</p>
            <p className="text-white/40 text-sm mt-2">
              Нажми на иконку закладки под постом, чтобы сохранить его сюда
            </p>
          </div>
        )}

        {!loading && posts.map((post) => <Post key={post.id} {...post} />)}
      </main>
    </div>
  );
}