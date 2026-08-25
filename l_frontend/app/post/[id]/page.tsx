"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Post } from "@/components/Post";
import { Sidebar } from "@/components/Sidebar";
import { RightPanel } from "@/components/RightPanel";
import { MainPostSkeleton } from "@/components/Skeletons";
import { useLastReadPost } from "@/src/hooks/useLastReadPost";
import { getToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n/LanguageProvider";

export default function PostPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const router = useRouter();
  const [post, setPost] = useState<any>(null);
  const [replies, setReplies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const postId = id ? parseInt(id as string) : 0;
  const { save, clear } = useLastReadPost();

// 🎯 ЛОГИКА "ПРОДОЛЖИТЬ ЧТЕНИЕ"
// - Сохраняем пост как последний читаемый (чтобы кнопка появилась в Sidebar)
// - Чистим ТОЛЬКО если пришли по кнопке "Продолжить" (?continue=1)
useEffect(() => {
  if (!postId || postId <= 0) return;

  const url = new URL(window.location.href);
  const cameFromContinue = url.searchParams.get('continue') === '1';

  if (cameFromContinue) {
    // Пришли по кнопке "Продолжить" — чистим запись и убираем параметр из URL
    clear();
    url.searchParams.delete('continue');
    window.history.replaceState({}, '', url.toString());
  } else {
    // Обычное открытие поста — сохраняем его как "последний читаемый"
    save(postId);
  }
}, [postId, save, clear]);


  // 📦 Загрузка самого поста и ответов
  useEffect(() => {
    if (!id) return;

    const load = async () => {
      try {
          const token = getToken();
          const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

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
      <div className="h-screen flex overflow-hidden bg-paper dark:bg-[#171717] text-gray-900 dark:text-white">
        <Sidebar />
        <main className="flex-1 overflow-y-auto border-x border-gray-200 dark:border-white/10 min-w-0">
          <MainPostSkeleton />
        </main>
        <RightPanel />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="h-screen flex overflow-hidden bg-paper dark:bg-[#171717] text-gray-900 dark:text-white">
        <Sidebar />
        <main className="flex-1 flex flex-col items-center justify-center gap-4 border-x border-gray-200 dark:border-white/10">
          <p className="text-gray-600 dark:text-white/60">{t("post.notFound")}</p>
          <button
            onClick={() => router.push("/")}
            className="px-4 py-2 bg-[#8b5cf6] rounded-lg text-white hover:opacity-90 transition"
          >
            {t("nav.home")}
          </button>
        </main>
        <RightPanel />
      </div>
    );
  }

  const { replies: _replies, ...postWithoutReplies } = post;

  return (
    <div className="h-screen flex overflow-hidden bg-paper dark:bg-[#171717] text-gray-900 dark:text-white">
      <Sidebar />
      <main className="flex-1 overflow-y-auto border-x border-gray-200 dark:border-white/10 min-w-0">
        <div className="w-full">
          <button
            onClick={() => router.back()}
            className="sticky top-0 z-10 w-full px-4 py-3 bg-paper dark:bg-[#171717]/90 backdrop-blur-md border-b border-gray-200 dark:border-white/10 flex items-center gap-2 text-gray-600 dark:text-white/60 hover:text-gray-900 dark:text-white transition-colors font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Назад
          </button>

          <div className="border-b border-gray-200 dark:border-white/10">
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