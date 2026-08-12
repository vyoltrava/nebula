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

  // 🔄 ЕДИНЫЙ СТИЛЬ КОНТЕЙНЕРА (как на главной)
  const containerClasses = "h-screen flex overflow-hidden bg-[#0a0a0a] text-white"; // Убедись, что bg-[#0a0a0a] совпадает с твоим основным фоном, или убери его, если фон задан глобально
  
  // Состояние загрузки
  if (loading) {
    return (
      <div className={containerClasses}>
        <Sidebar />
        <div className="w-px shrink-0 bg-white/10 my-3 hidden md:block" />
        <main className="flex-1 flex items-center justify-center border-x border-white/10">
          <div className="w-8 h-8 border-2 border-[#8b5cf6] border-t-transparent rounded-full animate-spin" />
        </main>
        <RightPanel />
      </div>
    );
  }

  // Состояние ошибки
  if (error || !post) {
    return (
      <div className={containerClasses}>
        <Sidebar />
        <div className="w-px shrink-0 bg-white/10 my-3 hidden md:block" />
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

  return (
    <div className={containerClasses}>
      {/* Левая панель */}
      <Sidebar />
      
      {/* Разделитель (добавил для консистентности с главной, скрыт на мобилках) */}
      <div className="w-px shrink-0 bg-white/10 my-3 hidden md:block" />

      {/* Центральная колонка - теперь flex-1 и скроллится внутри, как на главной */}
      <main className="flex-1 overflow-y-auto border-x border-white/10 min-w-0">
        <div className="px-4 py-4 md:py-6 max-w-2xl mx-auto w-full">
          
          {/* Кнопка Назад */}
          <button
            onClick={() => router.back()}
            className="mb-4 flex items-center gap-2 text-white/60 hover:text-white transition w-fit"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Назад
          </button>

          {/* 🌟 ГЛАВНЫЙ ПОСТ */}
          <div className="pb-6 border-b border-white/10 mb-6">
            <Post {...(post as any)} />
          </div>

          {/* 🌟 ОТВЕТЫ */}
          {replies.length > 0 && (
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-white/40 text-sm whitespace-nowrap">
                  {replies.length} {getPlural(replies.length)}
                </span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <div className="space-y-5">
                {replies.map((reply) => (
                  <div 
                    key={reply.id} 
                    className="pl-4 md:pl-6 ml-2 border-l-2 border-[#8b5cf6]/30"
                  >
                    <Post {...(reply as any)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {replies.length === 0 && (
            <p className="text-center text-white/30 mt-8 pb-8">Пока нет ответов</p>
          )}
        </div>
      </main>

      {/* Правая панель */}
      <RightPanel />
    </div>
  );
}