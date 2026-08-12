"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api"; // ✅ ИСПРАВЛЕНО: apiFetch вместо api
import { Post } from "@/components/Post";

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

        const postData = await postRes.json();
        const repliesData = await repliesRes.json();

        setPost(postData);
        setReplies(repliesData);
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#8b5cf6] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-white/60">Пост не найден или был удалён</p>
        <button
          onClick={() => router.push("/")}
          className="px-4 py-2 bg-[#8b5cf6] rounded-lg text-white hover:opacity-90 transition"
        >
          На главную
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button
        onClick={() => router.back()}
        className="mb-4 flex items-center gap-2 text-white/60 hover:text-white transition"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Назад
      </button>

      {/* ✅ ИСПРАВЛЕНО: используем spread + as any чтобы TS не ругался */}
      <Post {...(post as any)} />

      {replies.length > 0 && (
        <div className="mt-6 mb-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-white/40 text-sm">
            {replies.length} {getPlural(replies.length)}
          </span>
          <div className="h-px flex-1 bg-white/10" />
        </div>
      )}

      <div className="space-y-4">
        {replies.map((reply) => (
          <Post key={reply.id} {...(reply as any)} />
        ))}
      </div>

      {replies.length === 0 && (
        <p className="text-center text-white/30 mt-8">Пока нет ответов</p>
      )}
    </div>
  );
}