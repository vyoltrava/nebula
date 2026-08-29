"use client";

/**
 * Nebula: страница профиля пользователя — баннер, аватар с анимированной
 * рамкой (AvatarFrame), бейджи и плашка роли как в классике. Полная ширина.
 */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ArrowLeft, MessageCircle, UserPlus, UserCheck, MoreVertical,
  Copy, Settings as SettingsIcon, User as UserIcon,
} from "lucide-react";
import { useNebulaMode } from "@/lib/useNebula";
import { getToken, getActiveAccount } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import { resolveNickColor } from "@/lib/nickGlow";
import { Avatar } from "@/components/Avatar";
import { AvatarFrame } from "@/components/AvatarFrame";
import { RoleBadge } from "@/components/RoleBadge";
import { SmartImage } from "@/components/SmartImage";
import { useI18n } from "@/lib/i18n/LanguageProvider";

type UserProfile = {
  id: number;
  username: string;
  display_name: string;
  avatar_url?: string | null;
  cover_url?: string | null;
  bio?: string;
  followers_count?: number;
  following_count?: number;
  posts_count?: number;
  is_admin?: boolean;
  is_moderator?: boolean;
  level?: number;
  role?: { id?: number; color?: string; level?: number } | null;
  selected_badge_id?: number | null;
  custom_badge_url?: string | null;
  last_seen?: string;
};

export default function NebulaUserPage() {
  const params = useParams();
  const username = String(params?.username ?? "");
  const router = useRouter();
  const { isNebula } = useNebulaMode();
  const { t } = useI18n();
  const { resolvedTheme } = useTheme();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [availableBadges, setAvailableBadges] = useState<any[]>([]);
  const [customAssignment, setCustomAssignment] = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copiedName, setCopiedName] = useState(false);

  useEffect(() => setReady(true), []);

  useEffect(() => {
    if (ready && isNebula === false) router.replace("/messages");
  }, [ready, isNebula, router]);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
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

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/badges`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setAvailableBadges(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [username, router, ready]);

  // Кастомная плашка роли пользователя (как в классике)
  useEffect(() => {
    if (!user?.id) return;
    const token = getToken();
    if (!token) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/custom-badge-assignments?user_id=${user.id}&active_only=true`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setCustomAssignment(Array.isArray(d) && d.length ? d[0] : null))
      .catch(() => {});
  }, [user?.id]);

  const meAccount = getActiveAccount();
  const isMine = meAccount && meAccount.username === username;

  const startChat = () => { router.push(`/messages?user=${username}`); };

  const copyUsername = () => {
    try { navigator.clipboard.writeText(`@${username}`); } catch {}
    setCopiedName(true);
    setTimeout(() => setCopiedName(false), 1500);
    setMenuOpen(false);
  };

  const toggleFollow = async () => {
    const token = getToken();
    if (!token) return;
    const method = isFollowing ? "DELETE" : "POST";
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/${username}/follow`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setIsFollowing(!isFollowing);
    } catch {}
  };

  const glowStyle = (u: UserProfile | null): React.CSSProperties | undefined => {
    const c = resolveNickColor(u?.role?.color || null, resolvedTheme);
    if (!c) return undefined;
    return { color: c, textShadow: `0 0 10px ${c}55` };
  };

  const coverSrc = user?.cover_url
    ? user.cover_url.startsWith("http") ? user.cover_url : mediaUrl(user.cover_url)
    : null;
  const hasCover = !!coverSrc;

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-paper dark:bg-[#17171b]">
      <div className="sticky top-0 z-30 bg-paper/95 dark:bg-[#17171b]/95 backdrop-blur-md border-b border-line dark:border-white/10">
        <div className="flex items-center justify-between px-4 md:px-10 h-14">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 rounded-lg text-gray-600 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">{t("user.profileTitle")}</span>
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="p-2 -mr-2 rounded-lg text-gray-600 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
            >
              <MoreVertical size={20} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-xl shadow-2xl overflow-hidden">
                  <button
                    onClick={copyUsername}
                    className="w-full px-3 py-2.5 text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-2 transition-colors"
                  >
                    <Copy size={15} />
                    {copiedName ? t("user.copied") : t("user.copyUsername")}
                  </button>
                  {isMine ? (
                    <>
                      <button
                        onClick={() => { setMenuOpen(false); router.push("/nebula-profile"); }}
                        className="w-full px-3 py-2.5 text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-2 transition-colors"
                      >
                        <UserIcon size={15} /> {t("user.myProfile")}
                      </button>
                      <button
                        onClick={() => { setMenuOpen(false); router.push("/nebula-settings"); }}
                        className="w-full px-3 py-2.5 text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-2 transition-colors"
                      >
                        <SettingsIcon size={15} /> {t("user.settings")}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => { setMenuOpen(false); startChat(); }}
                      className="w-full px-3 py-2.5 text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-2 transition-colors"
                    >
                      <MessageCircle size={15} /> {t("user.sendMessage")}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="w-full px-4 md:px-10 py-6">
        {loading ? (
          <div className="animate-pulse max-w-2xl" aria-busy="true">
            <div className="rounded-2xl bg-white dark:bg-[#1e1e23] border border-line dark:border-white/10 overflow-hidden">
              <div className="h-28 md:h-48 bg-gray-200 dark:bg-white/10" />
              <div className="px-4 pb-6 flex flex-col items-center">
                <div className="w-32 h-32 rounded-2xl bg-gray-200 dark:bg-white/15 shrink-0 -mt-14 md:-mt-16 shadow-lg" />
                <div className="mt-3 h-6 w-44 rounded bg-gray-200 dark:bg-white/10" />
                <div className="mt-2 h-3.5 w-32 rounded bg-gray-100 dark:bg-white/5" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-6">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 p-4 space-y-2">
                  <div className="h-5 w-10 mx-auto rounded bg-gray-200 dark:bg-white/10" />
                  <div className="h-3 w-16 mx-auto rounded bg-gray-100 dark:bg-white/5" />
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-2xl bg-white dark:bg-[#1e1e23] border border-line dark:border-white/10 p-5 space-y-3">
              <div className="h-11 w-full rounded-xl bg-gray-200 dark:bg-white/10" />
              <div className="h-11 w-full rounded-xl bg-gray-100 dark:bg-white/5" />
            </div>
          </div>
        ) : !user ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <p className="text-sm text-gray-500 dark:text-white/40">{t("user.notFound")}</p>
            <button onClick={() => router.push("/messages")} className="text-sm text-[#8b5cf6] font-semibold">
              {t("user.toChats")}
            </button>
          </div>
        ) : (
          <>


            {/* ── ШАПКА: баннер фоном + аватар/имя/плашка по центру (без поля при отсутствии) ── */}
            <div className={`relative w-full overflow-hidden rounded-2xl border border-line dark:border-white/10 ${hasCover ? "" : "bg-white dark:bg-[#1e1e23]"}`}>
              {hasCover ? (
                <div className="absolute inset-0">
                  <SmartImage src={coverSrc} wrapperClassName="w-full h-full" alt="Cover" />
                  <div className="absolute inset-0 bg-black/40 pointer-events-none" />
                </div>
              ) : null}

              <div className={`relative z-10 flex flex-col items-center ${hasCover ? "pt-10 md:pt-14 pb-6" : "py-10"}`}>
                <div className="relative shrink-0 w-32 h-32 rounded-xl">
                  <AvatarFrame user={user} availableBadges={availableBadges} size={128}>
                    <Avatar src={user.avatar_url} name={user.display_name} id={user.id} size={128} />
                  </AvatarFrame>
                </div>
                <div className="mt-3 flex items-center gap-2 flex-wrap justify-center">
                  <h1
                    className={`text-2xl md:text-3xl font-black break-words ${glowStyle(user) ? "" : "text-gray-900 dark:text-white"}`}
                    style={glowStyle(user)}
                  >
                    {user.display_name}
                  </h1>
                  <RoleBadge user={user} activeCustomBadgeAssignment={customAssignment} size="md" />
                </div>
                <div className="mt-1 text-sm text-gray-500 dark:text-white/40">@{user.username}</div>
                {user.bio && (
                  <p className="mt-3 text-sm text-gray-600 dark:text-white/60 text-center max-w-md px-4">{user.bio}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-6 max-w-2xl">
              <div className="rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 p-3 text-center">
                <p className="text-lg font-bold text-gray-900 dark:text-white">{user.posts_count ?? 0}</p>
                <p className="text-xs text-gray-500 dark:text-white/40">{t("user.posts")}</p>
              </div>
              <div className="rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 p-3 text-center">
                <p className="text-lg font-bold text-gray-900 dark:text-white">{user.followers_count ?? 0}</p>
                <p className="text-xs text-gray-500 dark:text-white/40">{t("user.followers")}</p>
              </div>
              <div className="rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 p-3 text-center">
                <p className="text-lg font-bold text-gray-900 dark:text-white">{user.following_count ?? 0}</p>
                <p className="text-xs text-gray-500 dark:text-white/40">{t("user.following")}</p>
              </div>
            </div>

            <div className="mt-6 space-y-3 max-w-2xl">
              {!isMine && (
                <>
                  <button
                    onClick={startChat}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#8b5cf6] hover:bg-purple-600 text-white text-sm font-medium py-3 transition-colors"
                  >
                    <MessageCircle size={18} />
                    {t("user.sendMessage")}
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
                    {isFollowing ? t("user.unfollow") : t("user.follow")}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
