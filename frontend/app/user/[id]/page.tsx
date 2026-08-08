"use client";
import { Shield, ShieldCheck, Ban, X, MessageSquare, Flag, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Post } from "@/components/Post";
import { Avatar } from "@/components/Avatar";
import { getToken } from "@/lib/auth";
import { ReportModal } from "@/components/ReportModal";
import { SystemName } from "@/components/SystemName";
import { ensureKeyPair } from "@/lib/crypto";
import { isOnline } from "@/lib/online";
import { getCachedUser } from "@/lib/authCache";
import { ProfileSkeleton, PostSkeleton } from "@/components/Skeletons"; // 🆕


export default function UserProfilePage() {
  const params = useParams();
  const userId = params?.id as string;
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [modalType, setModalType] = useState<"followers" | "following" | null>(null);
  const [modalUsers, setModalUsers] = useState<any[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(() => getCachedUser());

  function getGlowColor(user: any): string | null {
    if (user?.is_admin) return "#fff";
    if (user?.is_moderator) return "#3b82f6";
    if (user?.role?.color) return user.role.color;
    return null;
  }

  function glowStyle(user: any): React.CSSProperties | undefined {
    const c = getGlowColor(user);
    if (!c) return undefined;
    return {
      color: c,
      textShadow: `0 0 6px ${c}B3, 0 0 14px ${c}66`,
    };
  }

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
  }, []);

  async function startChat() {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats?other_user_id=${userId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      router.push(`/messages/${data.chat_id}`);
    }
  }

  async function loadMorePosts(reset = false) {
    if (postsLoading) return;
    setPostsLoading(true);

    const cursor = reset ? null : nextCursor;
    const url = cursor
      ? `${process.env.NEXT_PUBLIC_API_URL}/api/users/${userId}/posts?cursor=${cursor}&limit=20`
      : `${process.env.NEXT_PUBLIC_API_URL}/api/users/${userId}/posts?limit=20`;

    try {
      const postsRes = await fetch(url);
      if (postsRes.ok) {
        const data = await postsRes.json();
        setPosts((prev) => (reset ? data.posts : [...prev, ...data.posts]));
        setHasMore(data.has_more);
        setNextCursor(data.next_cursor);
      }
    } catch (err) {
      console.error("Failed to load posts:", err);
    } finally {
      setPostsLoading(false);
    }
  }

  useEffect(() => {
    if (!userId) return;
    async function loadData() {
      setLoading(true);
      try {
        const profileRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/${userId}`);
        if (profileRes.ok) setProfile(await profileRes.json());

        await loadMorePosts(true);

        const token = getToken();
        if (token) {
          const followRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/${userId}/is-following`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (followRes.ok) {
            const data = await followRes.json();
            setFollowing(data.following);
          }
        }
      } catch (err) {
        console.error("Failed to load profile:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [userId]);

  async function toggleFollow() {
    const token = getToken();
    if (!token) return;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/${userId}/follow`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setFollowing(data.following);
      const p = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/${userId}`).then((r) => r.json());
      setProfile(p);
    }
  }

  async function toggleBan() {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    if (!profile) return;
    
    const action = profile.is_banned ? "разбанить" : "забанить";
    if (!confirm(`Вы уверены, что хотите ${action} пользователя @${profile.username}?`)) return;

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users/${profile.id}/ban`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const p = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/${profile.id}`).then((r) => r.json());
      setProfile(p);
    } else {
      const data = await res.json().catch(() => null);
      alert(data?.detail || "Недостаточно прав");
    }
  }

  async function openModal(type: "followers" | "following") {
    setModalType(type);
    setModalLoading(true);
    setModalUsers([]);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/${userId}/${type}`);
      if (res.ok) setModalUsers(await res.json());
    } catch (err) {
      console.error("Failed to load users:", err);
    } finally {
      setModalLoading(false);
    }
  }

  if (loading || !profile) {
    return (
      <div className="h-screen flex overflow-hidden">
        <Sidebar />
        <div className="w-px shrink-0 bg-white/10 my-3" />
        <main className="flex-1 overflow-y-auto border-x border-white/10">
          <ProfileSkeleton />
          <PostSkeleton />
          <PostSkeleton />
          <PostSkeleton />
        </main>
      </div>
    );
  }

  const canBan = 
    currentUser?.permissions?.includes("ban_users") &&
    currentUser.id !== Number(userId) &&
    !profile.is_admin &&
    (profile.level ?? 1) < (currentUser.level ?? 1);

  const isOwnProfile = currentUser?.id === Number(userId);

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />
      <div className="w-px shrink-0 bg-white/10 my-3 hidden md:block" />
      <main className="flex-1 overflow-y-auto border-x border-white/10">
        {/* Шапка профиля — АДАПТИВНО */}
        <div className="p-4 md:p-6 border-b border-white/10">
          {/* Мобильная вёрстка (до md) */}
          <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-5">
            {/* Аватарка */}
            <div className="flex justify-center md:justify-start">
            <Avatar 
              src={profile.avatar_url} 
              name={profile.display_name} 
              id={profile.id} 
              size={80}
              className="md:w-24 md:h-24"
              online={isOnline(profile.last_seen)}
            />
            </div>

            {/* Контент */}
            <div className="flex-1 min-w-0">
              {/* Имя и бейджи */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="min-w-0 text-center md:text-left">
                  <div className="flex items-center gap-2 md:gap-3 flex-wrap justify-center md:justify-start">
                    {profile.username === "System" ? (
                      <h1 className="text-xl md:text-2xl font-black">
                        <SystemName name={profile.display_name} />
                      </h1>
                    ) : (
                      <h1
                        className={`text-xl md:text-2xl font-black break-words ${glowStyle(profile) ? "" : "text-white"}`}
                        style={glowStyle(profile)}
                      >
                        {profile.display_name}
                      </h1>
                    )}
                    {profile.is_admin && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white text-black text-[8px] font-black uppercase tracking-widest shrink-0 border border-white shadow-[0_0_8px_rgba(255,255,255,0.6)]">
                        <Shield size={8} />
                        Founder
                      </span>
                    )}
                    {profile.is_moderator && !profile.is_admin && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 md:px-2.5 md:py-1 rounded-md bg-[#3b82f6] text-white text-[9px] md:text-[10px] font-black uppercase tracking-widest border border-blue-400/50">
                        <ShieldCheck size={9} />
                        Developer
                      </span>
                    )}
                    {profile.role && !profile.is_admin && !profile.is_moderator && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 md:px-2.5 md:py-1 rounded-md text-white text-[9px] md:text-[10px] font-black uppercase tracking-widest shadow-lg border"
                        style={{
                          backgroundColor: profile.role.color,
                          borderColor: `${profile.role.color}80`,
                          boxShadow: `0 4px 14px 0 ${profile.role.color}40`,
                        }}
                      >
                        {profile.role.name}
                      </span>
                    )}
                    {profile.is_banned && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/20 text-red-400 text-[9px] md:text-[10px] font-black uppercase border border-red-500/30">
                        <Ban size={9} />
                        BANNED
                      </span>
                    )}
                  </div>
                  <p className="text-white/50 mt-1 text-sm">@{profile.username}</p>
                  {profile.bio && (
  <p className="text-white/80 mt-2 text-sm whitespace-pre-wrap">{profile.bio}</p>
)}
                </div>

                {/* Кнопки действий */}
                <div className="flex gap-2 shrink-0 w-full md:w-auto justify-center md:justify-end">
                  <button
                    onClick={toggleFollow}
                    className={`flex-1 md:flex-none px-4 md:px-5 py-2 rounded-full border font-bold text-sm transition-all ${
                      following
                        ? "border-[#8b5cf6] bg-[#8b5cf6] text-white"
                        : "border-white/20 text-white/80 hover:bg-white/10 hover:border-white/40 hover:text-white"
                    }`}
                  >
                    {following ? "Читаю" : "Читать"}
                  </button>
                  <button
                    onClick={startChat}
                    className="flex items-center justify-center gap-1 flex-1 md:flex-none px-3 md:px-4 py-2 rounded-full border border-white/20 text-white/80 font-bold text-sm hover:bg-white/10 hover:border-white/40 hover:text-white transition-all"
                  >
                    <MessageSquare size={14} className="md:hidden" />
                    <MessageSquare size={16} className="hidden md:block" />
                    <span className="hidden sm:inline">Написать</span>
                  </button>

                  <button
                    onClick={async () => {
                      const token = getToken();
                      if (!token) {
                        router.push("/login");
                        return;
                      }
                      if (!profile) return;

                      try {
                        await ensureKeyPair(token, process.env.NEXT_PUBLIC_API_URL!);

                        const res = await fetch(
                          `${process.env.NEXT_PUBLIC_API_URL}/api/chats/secret?other_user_id=${profile.id}`,
                          {
                            method: "POST",
                            headers: { Authorization: `Bearer ${token}` },
                          }
                        );

                        if (res.ok) {
                          const data = await res.json();
                          router.push(`/messages/${data.chat_id}`);
                        } else {
                          const err = await res.json().catch(() => null);
                          const detail = err?.detail;
                          const msg = typeof detail === "string" ? detail : JSON.stringify(detail);
                          alert(msg || "Не удалось создать секретный чат");
                        }
                      } catch (e) {
                        console.error("Secret chat error:", e);
                        alert("Ошибка сети");
                      }
                    }}
                    className="flex items-center gap-1 px-3 md:px-4 py-2 rounded-full border border-emerald-500/40 text-emerald-400 font-bold text-sm hover:bg-emerald-500/10 transition-all"
                  >
                    <Lock size={14} />
                    <span className="hidden sm:inline">Секретный чат</span>
                  </button>


                  {canBan && (
                    <button
                      onClick={toggleBan}
                      className={`flex items-center justify-center px-3 md:px-4 py-2 rounded-full border font-bold transition-all ${
                        profile.is_banned
                          ? "border-green-400/40 text-green-400 hover:bg-green-500/10"
                          : "border-red-400/40 text-red-400 hover:bg-red-500/10"
                      }`}
                      title={profile.is_banned ? "Разбанить" : "Забанить"}
                    >
                      <Ban size={16} />
                    </button>
                  )}

                  {!isOwnProfile && (
                    <button
                      onClick={() => setShowReport(true)}
                      className="p-2 rounded-full border border-white/20 text-white/60 hover:bg-red-500/10 hover:border-red-400/50 hover:text-red-400 transition-all"
                      title="Пожаловаться на пользователя"
                    >
                      <Flag size={16} />
                    </button>
                  )}
                </div>
              </div>

              {/* Статистика */}
              <div className="flex gap-4 md:gap-6 mt-4 text-xs md:text-sm font-semibold text-white/70 justify-center md:justify-start">
                <span>{profile.posts_count} <span className="hidden sm:inline">постов</span><span className="sm:hidden">п.</span></span>
                <button
                  onClick={() => openModal("followers")}
                  className="hover:text-[#8b5cf6] transition-colors cursor-pointer"
                >
                  <span className="text-white font-bold">{profile.followers_count}</span> <span className="hidden sm:inline">подписчиков</span><span className="sm:hidden">подп.</span>
                </button>
                <button
                  onClick={() => openModal("following")}
                  className="hover:text-[#8b5cf6] transition-colors cursor-pointer"
                >
                  <span className="text-white font-bold">{profile.following_count}</span> <span className="hidden sm:inline">читает</span><span className="sm:hidden">чит.</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Посты */}
        {posts.map((post) => (
          <Post key={post.id} {...post} />
        ))}

        {posts.length === 0 && !postsLoading && (
          <p className="p-8 text-center text-white/50">Пока нет постов</p>
        )}

          {hasMore && posts.length > 0 && !postsLoading && (
            <button
              onClick={() => loadMorePosts()}
              className="w-full p-4 text-center text-[#8b5cf6] font-semibold hover:bg-white/5 transition-all"
            >
              Загрузить ещё
            </button>
          )}

        {/* 🆕 Скелетоны при первой загрузке постов */}
        {postsLoading && posts.length === 0 && (
          <>
            <PostSkeleton />
            <PostSkeleton />
            <PostSkeleton />
          </>
        )}

        {/* 🆕 Скелетоны внизу при догрузке "ещё" */}
        {postsLoading && posts.length > 0 && (
          <>
            <PostSkeleton />
            <PostSkeleton />
          </>
        )}
      </main>

      {/* Модальное окно подписчиков/подписок */}
      {modalType && (
        <>
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200]"
            onClick={() => setModalType(null)}
          />
          <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
            <div className="w-full max-w-md border border-white/20 rounded-2xl bg-[#1f1f23]/95 backdrop-blur-md shadow-2xl pointer-events-auto max-h-[80vh] md:max-h-[70vh] flex flex-col">
              <div className="sticky top-0 bg-[#1f1f23]/95 backdrop-blur-md border-b border-white/10 p-4 flex items-center justify-between shrink-0">
                <h2 className="font-black text-white text-lg">
                  {modalType === "followers" ? "Подписчики" : "Читает"}
                </h2>
                <button
                  onClick={() => setModalType(null)}
                  className="text-white/60 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="overflow-y-auto flex-1 p-2">
                {modalLoading && (
                  <p className="p-8 text-center text-white/50">Загрузка...</p>
                )}
                {!modalLoading && modalUsers.length === 0 && (
                  <p className="p-8 text-center text-white/50">
                    {modalType === "followers"
                      ? "Пока нет подписчиков"
                      : "Пока ни на кого не подписан"}
                  </p>
                )}
                {!modalLoading &&
                  modalUsers.map((u) => (
                    <Link
                      key={u.id}
                      href={`/user/${u.id}`}
                      onClick={() => setModalType(null)}
                      className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors"
                    >
                      {/* ✅ ИСПРАВЛЕНО: используем u, а не profile */}
                      <div className="shrink-0">
                        <Avatar 
                          src={u.avatar_url} 
                          name={u.display_name} 
                          id={u.id} 
                          size={48} 
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p
                            className={`font-bold text-sm md:text-base truncate ${glowStyle(u) ? "" : "text-white"}`}
                            style={glowStyle(u)}
                          >
                            {u.display_name}
                          </p>
                          {u.is_admin && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white text-black text-[9px] md:text-[10px] font-black uppercase tracking-widest border border-white shadow-[0_0_12px_rgba(255,255,255,0.6)]">
                              <Shield size={9} />
                              Founder
                            </span>
                          )}
                          {u.is_moderator && !u.is_admin && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#3b82f6] text-white text-[8px] md:text-[9px] font-black uppercase tracking-widest shrink-0">
                              <ShieldCheck size={8} />
                              Developer
                            </span>
                          )}
                          {u.role && !u.is_admin && !u.is_moderator && (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-white text-[8px] md:text-[9px] font-black uppercase tracking-widest shrink-0 border"
                              style={{
                                backgroundColor: u.role.color,
                                borderColor: `${u.role.color}80`,
                              }}
                            >
                              {u.role.name}
                            </span>
                          )}
                          {u.is_banned && (
                            <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[8px] md:text-[9px] font-black uppercase border border-red-500/30 shrink-0">
                              BANNED
                            </span>
                          )}
                        </div>
                        <p className="text-xs md:text-sm text-white/50 truncate">@{u.username}</p>
                      </div>
                    </Link>
                  ))}
              </div>
            </div>
          </div>
        </>
      )}

      {showReport && profile && (
        <ReportModal
          targetType="user"
          targetId={profile.id}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}