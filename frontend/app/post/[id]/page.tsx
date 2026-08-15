"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Post } from "@/components/Post";
import { Sidebar } from "@/components/Sidebar";
import { RightPanel } from "@/components/RightPanel";
import { MainPostSkeleton } from "@/components/Skeletons";
import { useLastReadPost } from "@/src/hooks/useLastReadPost";

export default function PostPage() {
  const { id } = useParams();
  const router = useRouter();
  const [post, setPost] = useState<any>(null);
  const [replies, setReplies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const postId = id ? parseInt(id as string) : 0;
  const { save, clear } = useLastReadPost();

  // 🎯 Сохраняем в БД и СРАЗУ чистим запись
  // (пользователь УЖЕ на этом посте, плашка "Продолжить" должна исчезнуть)
  useEffect(() => {
    if (!postId || postId <= 0) return;

    save(postId).then(() => clear());
    window.dispatchEvent(new CustomEvent("last-read-saved"));
  }, [postId, save, clear]);

  // 📦 Загрузка самого поста и ответов
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
        <main className="flex-1 overflow-y-auto border-x border-white/10 min-w-0">
          <MainPostSkeleton />
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

  const { replies: _replies, ...postWithoutReplies } = post;

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

          <div className="border-b border-white/10">
            <Post
              {...postWithoutReplies}
              isMainPost={true}
              externalReplies={replies}
            />
          </div>
        </div>
      </main>
      <RightPanel />
    </div>
  );
}