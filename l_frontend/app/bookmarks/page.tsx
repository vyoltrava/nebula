"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Post } from "@/components/Post";
import { Bookmark } from "lucide-react";
import { getToken } from "@/lib/auth";
import { PostSkeleton } from "@/components/Skeletons"; // 🆕 импорт
import { useI18n } from "@/lib/i18n/LanguageProvider";

export default function BookmarksPage() {
  const { t } = useI18n();
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
      <div className="w-px shrink-0 bg-gray-100 dark:bg-white/10 my-3" />
      <main className="flex-1 overflow-y-auto border-x border-gray-200 dark:border-white/10">
        {/* Шапка — остаётся всегда видимой */}
        <div className="p-4 md:p-6 border-b border-gray-200 dark:border-white/10 sticky top-0 bg-paper dark:bg-[#171717]/95 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <Bookmark size={24} className="text-[#8b5cf6]" fill="currentColor" />
            <h1 className="text-xl md:text-2xl font-black text-gray-900 dark:text-white">{t("nav.bookmarks")}</h1>
            {/* 🆕 Скелетон счётчика при загрузке, реальное число после */}
            {loading ? (
              <div className="h-4 w-8 bg-gray-100 dark:bg-white/10 rounded animate-pulse" />
            ) : (
              <span className="text-gray-500 dark:text-white/40 text-sm">{posts.length}</span>
            )}
          </div>
        </div>

        {/* 🆕 СКЕЛЕТОНЫ при загрузке — вместо текста "Загрузка..." */}
        {loading && (
          <>
            <PostSkeleton />
            <PostSkeleton />
            <PostSkeleton />
            <PostSkeleton />
            <PostSkeleton />
          </>
        )}

        {/* Пустое состояние — когда загрузка завершена, но постов нет */}
        {!loading && posts.length === 0 && (
          <div className="p-12 text-center">
            <Bookmark size={48} className="text-gray-500 dark:text-white/20 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-white/60 text-lg">{t("bookmarks.empty")}</p>
            <p className="text-gray-500 dark:text-white/40 text-sm mt-2">
              {t("bookmarks.hint")}
            </p>
          </div>
        )}

        {/* Реальные посты */}
        {!loading && posts.map((post) => <Post key={post.id} {...post} />)}
      </main>
    </div>
  );
}