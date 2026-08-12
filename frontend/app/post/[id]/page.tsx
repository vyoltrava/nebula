"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Post } from "@/components/Post";
import { Sidebar } from "@/components/Sidebar";
import { RightPanel } from "@/components/RightPanel";

const getPlural = (n: number) => {
  if (n % 10 === 1 && n % 100 !== 11) return "ответ";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return "ответа";
  return "ответов";
};

export default function PostPage() {
  const { id } = useParams();
  const router = useRouter();
  const [post, setPost] = useState<any>(null);
  const [replies, setReplies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!id) return;

    const load = async () => {
      try {
        const [postRes, repliesRes] = await Promise.all([
          apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/posts/${id}`),
          apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/posts/${id}/replies`),
        ]);

        if (!postRes.ok || !repliesRes.ok) throw new Error("Failed to fetch");

        setPost(await postRes.json());
        setReplies(await repliesRes.json());
      } catch (e) {
        console.error("Ошибка загрузки поста:", e);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id]);

  if (loading) {
    return (
      <div className="h-screen flex overflow-hidden bg-[#171717] text-white">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center border-x border-white/10">
          <div className="w-8 h-8 border-2 border-[#8b5cf6] border-t-transparent rounded-full animate-spin" />
        </main>
        <RightPanel />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="h-screen flex overflow-hidden bg-[#171717] text-white">
        <Sidebar />
        <main className="flex-1 flex flex-col items-center justify-center gap-4 border-x border-white/10">
          <p className="text-white/60">Пост не найден или был удалён</p>
          <button
            onClick={() => router.push("/")}
            className="px-4 py-2 bg-[#8b5cf6] rounded-lg text-white hover:opacity-90 transition"
          >
            На главную
          </button>
        </main>
        <RightPanel />
      </div>
    );
  }

  // Убираем replies из пропсов, чтобы Post не рендерил их внутри себя
  const { replies: _postReplies, ...postWithoutReplies } = post;

  return (
    <div className="h-screen flex overflow-hidden bg-[#171717] text-white">
      <Sidebar />
      
      <main className="flex-1 overflow-y-auto border-x border-white/10 min-w-0">
        <div className="w-full">
          
          <button
            onClick={() => router.back()}
            className="sticky top-0 z-10 w-full px-4 py-3 bg-[#171717]/90 backdrop-blur-md border-b border-white/10 flex items-center gap-2 text-white/60 hover:text-white transition-colors font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Назад
          </button>

          {/* Главный пост — без вложенных replies */}
          <div className="border-b border-white/10">
            <Post {...postWithoutReplies} isMainPost={true} />
          </div>

          {/* Ответы рендерим только здесь */}
          {replies.length > 0 && (
            <div>
              <div className="px-4 py-3 border-b border-white/10 flex items-center gap-4">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-white/40 text-sm font-medium whitespace-nowrap">
                  {replies.length} {getPlural(replies.length)}
                </span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <div>
                {replies.map((reply) => (
                  <div key={reply.id} className="border-b border-white/10">
                    <Post {...reply} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {replies.length === 0 && (
            <p className="text-center text-white/30 py-12 text-sm">Пока нет ответов. Будьте первым!</p>
          )}
        </div>
      </main>

      <RightPanel />
    </div>
  );
}