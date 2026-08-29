"use client";

/**
 * Nebula: страница профиля пользователя — баннер, аватар с анимированной
 * рамкой (AvatarFrame), бейджи и плашка роли как в классике. Полная ширина.
 */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ArrowLeft, MessageCircle, UserPlus, UserCheck, Shield, MoreVertical,
  Copy, Settings as SettingsIcon, User as UserIcon,
} from "lucide-react";
import { useNebulaMode } from "@/lib/useNebula";
import { getToken, getActiveAccount } from "@/lib/auth";
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

  function glowStyle(u: UserProfile | null): React.CSSProperties | undefined {
    const c = resolveNickColor(u?.role?.color || null, resolvedTheme);
    if (!c) return undefined;
    return { color: c, textShadow: `0 0 10px ${c}55` };
  }

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
            <div className="w-full h-28 md:h-48 rounded-2xl bg-gray-200 dark:bg-white/10" />
            <div className="flex flex-col md:flex-row items-center gap-5 -mt-12 md:-mt-14 px-2">
              <div className="w-28 h-28 rounded-2xl bg-gray-200 dark:bg-white/10 shrink-0" />
              <div className="flex-1 space-y-2 w-full max-w-sm">
                <div className="h-5 w-52 rounded bg-gray-200 dark:bg-white/10" />
                <div className="h-3.5 w-32 rounded bg-gray-100 dark:bg-white/5" />
                <div className="h-3 w-72 max-w-full rounded bg-gray-100 dark:bg-white/5" />
              </div>
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


            {/* ── БАННЕР ── */}
            {user.cover_url ? (
              <div className="relative w-full aspect-[21/9] max-h-[220px] md:max-h-[320px] overflow-hidden rounded-2xl">
                <SmartImage src={user.cover_url} wrapperClassName="w-full h-full" alt="Cover" />
              </div>
            ) : (
              <div className="w-full h-16 md:h-20 rounded-2xl bg-white dark:bg-white/[0.03] border border-line dark:border-white/10" />
            )}

            {/* ── АВАТАР + ИНФА ── */}
            <div className={`flex flex-col items-center md:flex-row md:items-start gap-4 md:gap-6 ${user.cover_url ? "-mt-12 md:-mt-16 relative z-10" : "mt-6"}`}>
              <div className="relative shrink-0 w-32 h-32 rounded-xl">
                <AvatarFrame user={user} availableBadges={availableBadges} size={128}>
                  <Avatar src={user.avatar_url} name={user.display_name} id={user.id} size={128} />
                </AvatarFrame>
              </div>

              <div className="flex-1 min-w-0 w-full text-center md:text-left">
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 md:gap-3 leading-tight">
                  <h1
                    className={`text-xl md:text-2xl font-black break-words ${glowStyle(user) ? "" : "text-gray-900 dark:text-white"}`}
                    style={glowStyle(user)}
                  >
                    {user.display_name}
                  </h1>
                  <RoleBadge user={user} activeCustomBadgeAssignment={customAssignment} size="md" />
                </div>
                <p className="text-sm text-gray-500 dark:text-white/40 mt-1">@{user.username}</p>
                {user.bio && (
                  <div className="mt-3 rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 p-4">
                    <p className="text-sm text-gray-700 dark:text-white/80">{user.bio}</p>
                  </div>
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
