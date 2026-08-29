"use client";

/**
 * 🌌 Страница профиля пользователя в режиме Nebula.
 * Отличается от обычной версии — адаптирована под мессенджер:
 *  - Крупный аватар по центру
 *  - Кнопка "Написать" вместо кнопки подписки
 *  - Минимум социальной информации, максимум мессенджер-функции
 *  - Нет постов, нет ленты — только профиль для общения
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, MessageCircle, UserPlus, UserCheck, Shield, MoreVertical } from "lucide-react";
import { useNebulaMode } from "@/lib/useNebula";
import { getToken } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";

type UserProfile = {
  id: number;
  username: string;
  display_name: string;
  avatar_url?: string | null;
  bio?: string;
  followers_count?: number;
  following_count?: number;
  posts_count?: number;
  is_admin?: boolean;
  is_moderator?: boolean;
};

export default function NebulaUserPage({ params }: { params: { username: string } }) {
  const router = useRouter();
  const { isNebula } = useNebulaMode();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => setReady(true), []);

  useEffect(() => {
    if (ready && isNebula === false) router.replace("/messages");
  }, [ready, isNebula, router]);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    const username = params.username;
    if (!username) return;

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/${username}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { setUser(data); setLoading(false); })
      .catch(() => setLoading(false));

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/${username}/is-following`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : { following: false }))
      .then((data) => setIsFollowing(data.following))
      .catch(() => {});
  }, [params.username, router]);

  const startChat = () => {
    router.push(`/messages?user=${params.username}`);
  };

  const toggleFollow = async () => {
    const token = getToken();
    if (!token) return;
    const method = isFollowing ? "DELETE" : "POST";
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/${params.username}/follow`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setIsFollowing(!isFollowing);
    } catch {}
  }

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-paper dark:bg-[#17171b]">
      <div className="sticky top-0 z-30 bg-paper/95 dark:bg-[#17171b]/95 backdrop-blur-md border-b border-line dark:border-white/10">
        <div className="max-w-lg mx-auto flex items-center justify-between px-4 h-14">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 rounded-lg text-gray-600 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Профиль</span>
          <button className="p-2 -mr-2 rounded-lg text-gray-600 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
            <MoreVertical size={20} />
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-10 h-10 border-2 border-[#8b5cf6] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500 dark:text-white/40">Загрузка профиля...</p>
          </div>
        ) : !user ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <p className="text-sm text-gray-500 dark:text-white/40">Пользователь не найден</p>
            <button onClick={() => router.push("/messages")} className="text-sm text-[#8b5cf6] font-semibold">
              К чатам
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center mb-6">
              <div className="relative mb-4">
                <Avatar src={user.avatar_url} name={user.display_name} id={user.id} size={96} />
                {(user.is_admin || user.is_moderator) && (
                  <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[#8b5cf6] flex items-center justify-center border-2 border-paper dark:border-[#17171b]">
                    <Shield size={14} className="text-white" />
                  </div>
                )}
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white text-center">
                {user.display_name}
              </h1>
              <p className="text-sm text-gray-500 dark:text-white/40">@{user.username}</p>
            </div>

            {user.bio && (
              <div className="mb-6 rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 p-4">
                <p className="text-sm text-gray-700 dark:text-white/80 text-center">{user.bio}</p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 p-3 text-center">
                <p className="text-lg font-bold text-gray-900 dark:text-white">{user.posts_count ?? 0}</p>
                <p className="text-xs text-gray-500 dark:text-white/40">Постов</p>
              </div>
              <div className="rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 p-3 text-center">
                <p className="text-lg font-bold text-gray-900 dark:text-white">{user.followers_count ?? 0}</p>
                <p className="text-xs text-gray-500 dark:text-white/40">Подписчиков</p>
              </div>
              <div className="rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 p-3 text-center">
                <p className="text-lg font-bold text-gray-900 dark:text-white">{user.following_count ?? 0}</p>
                <p className="text-xs text-gray-500 dark:text-white/40">Подписок</p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={startChat}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#8b5cf6] hover:bg-purple-600 text-white text-sm font-medium py-3 transition-colors"
              >
                <MessageCircle size={18} />
                Написать сообщение
              </button>

              <button
                onClick={toggleFollow}
                className={`w-full flex items-center justify-center gap-2 rounded-xl text-sm font-medium py-3 transition-colors border ${
                  isFollowing
                    ? "border-line dark:border-white/10 text-gray-700 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/5"
                    : "border-[#8b5cf6] text-[#8b5cf6] hover:bg-[#8b5cf6]/10"
                }`}
              >
                {isFollowing ? <UserCheck size={18} /> : <UserPlus size={18} />}
                {isFollowing ? "Отписаться" : "Подписаться"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
