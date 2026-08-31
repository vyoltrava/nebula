"use client";
import { useTheme } from "next-themes";
import { resolveNickColor } from "@/lib/nickGlow";
import { Upload , Check, Ban, X, MessageSquare, Flag, Lock, Camera, Image as ImageIcon, X as XIcon, AlertTriangle, Network } from "lucide-react";
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Post } from "@/components/Post";
import { Avatar } from "@/components/Avatar";
import { RoleBadge } from "@/components/RoleBadge";
import { AvatarFrame } from "@/components/AvatarFrame";
import { getToken } from "@/lib/auth";
import { ReportModal } from "@/components/ReportModal";
import { SystemName } from "@/components/SystemName";
import { ensureKeyPair } from "@/lib/crypto";
import { isOnline } from "@/lib/online";
import { getCachedUser } from "@/lib/authCache";
import { ProfileSkeleton, PostSkeleton } from "@/components/Skeletons";
import { useAvatarUploader } from "@/components/AvatarUploader";
import dynamic from "next/dynamic";
import { SmartImage } from "@/components/SmartImage";

// 🚀 Тяжёлые компоненты грузим только при необходимости
const AvatarCropper = dynamic(() => import("@/components/AvatarCropper").then(m => m.AvatarCropper), {
  ssr: false,
  loading: () => <div className="cropper-placeholder p-6 text-center text-sm opacity-60">✂️ Загрузка редактора…</div>,
});
import { validateUpload, uploadErrorText, UPLOAD_RULES } from "@/lib/uploadRules";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { useNebulaMode } from "@/lib/useNebula";
import { NebulaBlocked } from "@/components/NebulaBlocked";


export default function UserProfilePage() {
  const params = useParams();
  const userId = params?.id as string;
  const router = useRouter();
  const { t } = useI18n();
  const { isNebula } = useNebulaMode();
  
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
  const [availableBadges, setAvailableBadges] = useState<any[]>([]);
  const [activeCustomBadgeAssignment, setActiveCustomBadgeAssignment] = useState<any>(null); // 🆕 Активная кастомная плашка
  const {
    cropperImage,
    uploading,
    inputRef,
    openFilePicker,
    handleFileSelect,
    handleCropComplete,
    setCropperImage,
  } = useAvatarUploader((newUrl) => {
    setProfile((prev: any) => (prev ? { ...prev, avatar_url: newUrl } : prev));
  }, "/api/me/avatar");

  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [showCoverMenu, setShowCoverMenu] = useState(false);
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);
  const [showBadgeModal, setShowBadgeModal] = useState(false);

  // Проверяем, есть ли у пользователя право менять значок
  const canEditBadge = availableBadges.some(b => 
    b.role_id === currentUser?.role?.id || 
    b.user_id === currentUser?.id ||
    (b.is_selectable && (currentUser?.level ?? 1) >= 3)
  ) || (currentUser?.level ?? 1) >= 3;
  // Обёртка для аватарки с валидацией
  async function handleAvatarFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError(null);
    const err = await validateUpload(file, "avatar");
    if (err) { 
      setAvatarError(err); 
      e.target.value = ""; // сбрасываем инпут
      return; 
    }
    handleFileSelect(e); // передаём дальше в хук
  }

async function uploadCover(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file) return;
  setCoverError(null);
  
  // ✅ Валидация ДО отправки
  const localErr = await validateUpload(file, "banner");
  if (localErr) { 
    setCoverError(localErr); 
    e.target.value = "";
    return; 
  }
  
  const token = getToken();
  if (!token) return;
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me/cover`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (res.ok) {
    const data = await res.json();
    setProfile((prev: any) => (prev ? { ...prev, cover_url: data.cover_url } : prev));
    setCoverError(null);
  } else {
    // ✅ Человекочитаемая ошибка от сервера
    setCoverError(await uploadErrorText(res));
  }
  e.target.value = "";
}

  async function removeCover() {
    if (!confirm(t("profile.deleteCoverConfirm"))) return;
    const token = getToken();
    if (!token) return;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me/cover`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setProfile((prev: any) => (prev ? { ...prev, cover_url: null } : prev));
    }
  }

function getGlowColor(user: any): string | null {
if (user?.role?.color && (user?.role?.level ?? 0) >= 8) return user.role.color; // 🆕 роль 8-11 перекрывает флаги
if (user?.username === "trelod") return "#e4e4e7"; // Zinc-200
  if (user?.is_admin) return "#fff";
  if (user?.is_moderator) return "#3b82f6";
  if (user?.role?.color) return user.role.color;
  return null;
}

  function normalizeHex(hex: string): string {
    if (hex.length === 4) {
      return "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    }
    return hex;
  }

  const { resolvedTheme } = useTheme();
  function glowStyle(user: any): React.CSSProperties | undefined {
    const c = resolveNickColor(getGlowColor(user), resolvedTheme);
    if (!c) return undefined;
    const full = normalizeHex(c);
    return {
      color: c,
      textShadow: `0 0 6px ${full}B3, 0 0 14px ${full}66`,
    };
  }

  // 🆕 АВТО-СБРОС ЗНАЧКА, ЕСЛИ ОН БЫЛ УДАЛЕН АДМИНОМ
  useEffect(() => {
    if (profile?.selected_badge_id) {
      const badgeExists = availableBadges.some(b => b.id === profile.selected_badge_id);
      if (!badgeExists) {
        // Значок удален из базы, очищаем его у пользователя локально
        setProfile((prev: any) => prev ? { ...prev, selected_badge_id: null, custom_badge_url: null } : null);
        
        // И отправляем запрос на сервер, чтобы очистить там
        const token = getToken();
        if (token) {
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me/badge`, { 
            method: "POST", 
            headers: { Authorization: `Bearer ${token}` }, 
            body: new FormData() 
          }).catch(console.error);
        }
      }
    }
  }, [availableBadges, profile?.selected_badge_id]);


  // Функция загрузки бейджей
  const loadBadges = useCallback(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/badges`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setAvailableBadges(data))
      .catch(() => setAvailableBadges([]));
  }, []);


    // 🔄 Синхронизация лайков/дизлайков в реальном времени (если страница профиля не размонтирована)
  useEffect(() => {
    const handlePostSync = (e: Event) => {
      const d = (e as CustomEvent).detail;
      setPosts(prev => prev.map(p => 
        p.id === d.post_id ? { 
          ...p, 
          liked_by_me: d.liked ?? p.liked_by_me, 
          likes_count: d.likes_count ?? p.likes_count,
          disliked_by_me: d.disliked ?? p.disliked_by_me,
          dislikes_count: d.dislikes_count ?? p.dislikes_count
        } : p
      ));
    };
    window.addEventListener("like-sync", handlePostSync);
    window.addEventListener("dislike-sync", handlePostSync);
    
        return () => {
      window.removeEventListener("like-sync", handlePostSync);
      window.removeEventListener("dislike-sync", handlePostSync);
    };
  }, [userId]);

  useEffect(() => {
    loadBadges();
    const token = getToken();
    
    // Загружаем текущего пользователя
    if (token) {
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) setCurrentUser(data);
        });
    }

    // Загружаем бейджи
    loadBadges();
    

    // 🆕 Обновляем бейджи и посты при возврате на вкладку
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadBadges();
        
        // 🔄 Перезагружаем первую страницу постов, чтобы актуализировать счетчики лайков/дизлайков
        if (profile?.id) {
          const token = getToken();
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/${profile.id}/posts?limit=20`, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
              if (data) {
                setPosts(data.posts);
                setHasMore(data.has_more);
                setNextCursor(data.next_cursor);
              }
            });
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [loadBadges]);

  async function startChat() {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    const targetId = profile?.id;
    if (!targetId) {
      alert(t("profile.profileNotLoaded"));
      return;
    }
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/chats?other_user_id=${targetId}`,
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
        alert(err?.detail || t("profile.startChatFailed"));
      }
    } catch (e) {
      alert(t("common.networkError"));
    }
  }

  async function loadMorePosts(reset = false, targetId?: number) {
    if (postsLoading) return;
    setPostsLoading(true);
    
    const targetUserId = targetId ?? profile?.id;
    if (!targetUserId) {
      setPostsLoading(false);
      return;
    }
    
    const token = getToken(); // ← добавить
    const cursor = reset ? null : nextCursor;
    const url = cursor
      ? `${process.env.NEXT_PUBLIC_API_URL}/api/users/${targetUserId}/posts?cursor=${cursor}&limit=20`
      : `${process.env.NEXT_PUBLIC_API_URL}/api/users/${targetUserId}/posts?limit=20`;

    try {
      const postsRes = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined, // ← добавить
      });
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

  async function loadData() {
    setLoading(true);
    setPosts([]); // Сброс постов при смене пользователя
    setNextCursor(null);
    setHasMore(true);
    
    try {
      const token = getToken();
      
      // Параллельные запросы
      const [profileRes, followRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/${userId}`),
        token 
          ? fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/${userId}/is-following`, {
              headers: { Authorization: `Bearer ${token}` },
            })
          : Promise.resolve(null),
      ]);

      if (!profileRes.ok) {
        setLoading(false);
        return;
      }
      
      const profileData = await profileRes.json();
      setProfile(profileData);

      // 🔥 Редирект с числового ID на username
      if (profileData.username && /^\d+$/.test(userId)) {
        router.replace(`/${profileData.username}`);
      }

      // 🆕 ЗАГРУЗКА АКТИВНОЙ КАСТОМНОЙ ПЛАШКИ (после того, как узнали profileData.id)
      if (token && profileData.id) {
        try {
          const assignRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/custom-badge-assignments?user_id=${profileData.id}&active_only=true`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (assignRes.ok) {
            const assignments = await assignRes.json();
            // Берем первую активную плашку (обычно она одна из-за логики бэкенда)
            if (assignments && assignments.length > 0) {
              setActiveCustomBadgeAssignment(assignments[0]);
            } else {
              setActiveCustomBadgeAssignment(null);
            }
          }
        } catch (err) {
          console.error("Failed to load custom badge assignment:", err);
          setActiveCustomBadgeAssignment(null);
        }
      }
      // Подписка
      if (followRes && followRes.ok) {
        const data = await followRes.json();
        setFollowing(data.following);
      }

      // 🔥 Посты загружаем через profile.id (числовой), а не userId
      await loadMorePosts(true, profileData.id);
      
    } catch (err) {
      console.error("Failed to load profile:", err);
    } finally {
      setLoading(false);
    }
  }

  // 🔥 КРИТИЧНО: добавлен useEffect для загрузки данных при смене userId
  useEffect(() => {
    if (userId) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function toggleFollow() {
    const token = getToken();
    if (!token) return;
    // 🔥 Используем profile.id, а не userId
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/${profile.id}/follow`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setFollowing(data.following);
      const p = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/${profile.id}`).then((r) => r.json());
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
    
    if (!confirm(profile.is_banned ? t("profile.unbanConfirm", { user: profile.username }) : t("profile.banConfirm", { user: profile.username }))) return;

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users/${profile.id}/ban`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const p = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/${profile.id}`).then((r) => r.json());
      setProfile(p);
    } else {
      const data = await res.json().catch(() => null);
      alert(data?.detail || t("profile.insufficientRights"));
    }
  }




  async function openModal(type: "followers" | "following") {
    setModalType(type);
    setModalLoading(true);
    setModalUsers([]);
    try {
      // 🔥 Используем profile.id
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/${profile.id}/${type}`);
      if (res.ok) setModalUsers(await res.json());
    } catch (err) {
      console.error("Failed to load users:", err);
    } finally {
      setModalLoading(false);
    }
  }

  // Nebula: соцсеть заблокирована, показываем заглушку
  if (isNebula) return <NebulaBlocked />;

  if (loading || !profile) {
    return (
      <div className="h-screen flex overflow-hidden">
        <Sidebar />
        <div className="w-px shrink-0 bg-gray-100 dark:bg-white/10 my-3" />
        <main className="flex-1 overflow-y-auto border-x border-line dark:border-white/10">
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
    currentUser.id !== profile.id &&
    !profile.is_admin &&
    (profile.level ?? 1) < (currentUser.level ?? 1);

  const isOwnProfile = currentUser && profile && currentUser.id === profile.id;

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />
      <div className="w-px shrink-0 bg-gray-100 dark:bg-white/10 my-3 hidden md:block" />
      <main className="flex-1 overflow-y-auto border-x border-line dark:border-white/10">
        
        {/* ================= ШАПКА ПРОФИЛЯ ================= */}
        <div className="border-b border-line dark:border-white/10">
          
          {/* ОБЛОЖКА */}
{profile.cover_url ? (
  <div className="relative w-full aspect-[21/9] max-h-[280px] md:max-h-[360px] overflow-hidden group cursor-pointer"
    onClick={() => isOwnProfile && setShowCoverMenu(!showCoverMenu)}
  >
    <SmartImage 
      src={profile.cover_url} 
      wrapperClassName="w-full h-full"
      alt="Cover" 
    />
    {isOwnProfile && (
      <>
        {/* Затемнение при hover */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 pointer-events-none" />
        
        {/* Иконка камеры в центре при hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
          <div className="w-14 h-14 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
            <ImageIcon size={24} className="text-gray-900 dark:text-white" />
          </div>
        </div>

        {/* Меню обложки */}
        {showCoverMenu && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setShowCoverMenu(false)} />
            <div className="absolute top-4 right-4 z-40 bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-xl shadow-2xl overflow-hidden min-w-[160px]">
              <button
                onClick={(e) => { e.stopPropagation(); coverInputRef.current?.click(); setShowCoverMenu(false); }}
                className="w-full px-4 py-3 text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-2.5 transition-colors"
              >
                <ImageIcon size={16} className="text-[#8b5cf6]" />
                {t("profile.changeCover")}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); removeCover(); setShowCoverMenu(false); }}
                className="w-full px-4 py-3 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-500/10 flex items-center gap-2.5 transition-colors"
              >
                <XIcon size={16} />
                {t("profile.deleteCover")}
              </button>
            </div>
          </>
        )}
      </>
    )}
  </div>
) : (
  isOwnProfile && (
    <div
      className="relative w-full h-16 md:h-20 bg-white/[0.02] hover:bg-white/[0.06] transition-colors cursor-pointer flex items-center justify-center group"
      onClick={() => coverInputRef.current?.click()}
    >
      <span className="flex items-center gap-2 text-gray-500 dark:text-white/30 group-hover:text-gray-600 dark:group-hover:text-white/60 text-sm font-bold transition-colors">
        <ImageIcon size={18} />
        {t("profile.addCover")}
      </span>
    </div>
  )
)}

{/* ❌ Ошибка загрузки обложки */}
{coverError && (
  <div className="px-4 md:px-6 py-2.5 bg-red-500/10 border-b border-red-500/30 flex items-center gap-2">
    <AlertTriangle size={14} className="text-red-600 dark:text-red-400 shrink-0" />
    <p className="text-xs md:text-sm text-red-600 dark:text-red-300 font-semibold flex-1">{coverError}</p>
    <button onClick={() => setCoverError(null)} className="text-red-600 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 p-1 shrink-0">
      <X size={14} />
    </button>
  </div>
)}

<div className="px-4 md:px-6 pb-6">
  <div className={`flex flex-col md:flex-row items-center md:items-start gap-4 md:gap-6 ${profile.cover_url ? "" : "mt-6"}`}>
    
{/* АВАТАРКА */}
<div className={`flex flex-col items-center md:items-start ${profile.cover_url ? "mt-[-3.5rem] md:mt-[-5rem]" : ""} z-10`}>
<div 
  className="relative shrink-0 w-32 h-32 rounded-xl cursor-pointer group"
  onClick={() => isOwnProfile && setShowAvatarMenu(!showAvatarMenu)}
>
<AvatarFrame 
  user={profile} 
  availableBadges={availableBadges}
  canEditBadge={isOwnProfile && canEditBadge}
  onBadgeClick={() => setShowBadgeModal(true)}
>
  <Avatar 
    src={profile.avatar_url} 
    name={profile.display_name} 
    id={profile.id} 
    size={128}
    online={isOnline(profile.last_seen)}
  />
</AvatarFrame>
    {/* Overlay "загрузка" при uploading */}
    {uploading && (
      <div className="absolute inset-0 rounded-xl bg-black/50 backdrop-blur-sm flex items-center justify-center">
        <span className="block w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    )}

    {/* Затемнение при hover */}
    {isOwnProfile && !uploading && (
      <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex items-center justify-center">
        <Camera size={28} className="text-gray-900 dark:text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
      </div>
    )}

    {/* Меню аватарки */}
    {isOwnProfile && showAvatarMenu && !uploading && (
      <>
        <div className="fixed inset-0 z-30" onClick={() => setShowAvatarMenu(false)} />
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-40 bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-xl shadow-2xl overflow-hidden min-w-[160px]">
          <button
            onClick={(e) => { e.stopPropagation(); openFilePicker(); setShowAvatarMenu(false); }}
            className="w-full px-4 py-3 text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-2.5 transition-colors"
          >
            <Camera size={16} className="text-[#8b5cf6]" />
            {t("profile.changeAvatar")}
          </button>
          {profile.avatar_url && (
            <button
              onClick={(e) => { e.stopPropagation(); alert(t("profile.avatarDeleteUnavailable")); setShowAvatarMenu(false); }}
              className="w-full px-4 py-3 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-500/10 flex items-center gap-2.5 transition-colors"
            >
              <XIcon size={16} />
              {t("profile.deleteCover")}
            </button>
          )}
        </div>
      </>
    )}
  </div>
  
  {/* ❌ Ошибка загрузки аватарки */}
  {avatarError && isOwnProfile && (
    <div className="mt-2 flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-1.5 max-w-xs">
      <AlertTriangle size={12} className="text-red-600 dark:text-red-400 shrink-0" />
      <p className="text-[11px] text-red-600 dark:text-red-300 font-semibold flex-1 leading-tight">{avatarError}</p>
      <button onClick={() => setAvatarError(null)} className="text-red-600 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 p-0.5 shrink-0">
        <X size={12} />
      </button>
    </div>
  )}
</div>

                  {/* ИНФА */}
                  <div className="flex-1 min-w-0 w-full text-center md:text-left relative">
                
                {/* Верхняя часть: Имя + Бейджи + Кнопки (Десктоп) */}
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-y-1 gap-x-4">
                  
                  {/* Левая колонка: Имя и бейджи */}
<div className="flex items-center justify-center md:justify-start gap-2 md:gap-3 flex-wrap leading-tight">
      {profile.username === "trelod" ? (
    <h1 className={`text-xl md:text-2xl font-black break-words ${resolvedTheme === "light" ? "text-gray-900 [text-shadow:0_0_8px_rgba(0,0,0,0.3)]" : "text-[#e4e4e7] [text-shadow:0_0_10px_rgba(228,228,231,0.5)]"}`}>
      {profile.display_name}
    </h1>
  ) : (
    <h1 className={`text-xl md:text-2xl font-black break-words ${glowStyle(profile) ? "" : "text-gray-900 dark:text-white"}`} style={glowStyle(profile)}>
      {profile.display_name}
    </h1>
  )}
  
  {/* ✅ ДОБАВЬ activeCustomBadgeAssignment СЮДА */}
  <RoleBadge 
    user={profile} 
    activeCustomBadgeAssignment={activeCustomBadgeAssignment} 
    size="md" 
  />
</div>


                  {/* Кнопки действий — ДЕСКТОП */}
                  {!isOwnProfile && (
                    <div className="hidden md:flex items-center gap-2 shrink-0 pt-1">
                        <button onClick={toggleFollow} className={`px-4 py-2 rounded-full border font-bold text-sm transition-all ${following ? "border-[#8b5cf6] bg-[#8b5cf6] text-white" : "border-line dark:border-white/20 text-gray-800 dark:text-white/80 hover:bg-gray-100 dark:hover:bg-white/10 hover:border-gray-300 dark:hover:border-white/40 hover:text-gray-900 dark:hover:text-white"}`}>
    {following ? t("post.following") : t("post.follow")}
  </button>
                      <button onClick={startChat} className="flex items-center justify-center p-2 rounded-full border border-line dark:border-white/20 text-gray-800 dark:text-white/80 hover:bg-gray-100 dark:hover:bg-white/10 hover:border-gray-300 dark:hover:border-white/40 hover:text-gray-900 dark:hover:text-white transition-all" title={t("profile.write")}>
                        <MessageSquare size={18} />
                      </button>
                      <Link href={`/recommendations/${profile.id}`} className="flex items-center justify-center p-2 rounded-full border border-line dark:border-white/20 text-gray-800 dark:text-white/80 hover:bg-gray-100 dark:hover:bg-white/10 hover:border-gray-300 dark:hover:border-white/40 hover:text-gray-900 dark:hover:text-white transition-all" title={t("profile.similar")}>
                        <Network size={18} />
                      </Link>
                      <button
                        onClick={async () => {
                          const token = getToken();
                          if (!token) { router.push("/login"); return; }
                          try {
                            await ensureKeyPair(token, process.env.NEXT_PUBLIC_API_URL!);
                            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/secret?other_user_id=${profile.id}`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
                            if (res.ok) {
                              const data = await res.json();
                              router.push(`/messages/${data.chat_id}`);
                            } else {
                              const err = await res.json().catch(() => null);
                              alert(typeof err?.detail === "string" ? err.detail : t("profile.secretChatFailed"));
                            }
                          } catch (e) {
                            alert(t("common.networkError"));
                          }
                        }}
                        className="flex items-center justify-center p-2 rounded-full border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-all"
                        title={t("profile.secretChat")}
                      >
                        <Lock size={18} />
                      </button>
                      {canBan && (
                        <button onClick={toggleBan} className={`flex items-center justify-center p-2 rounded-full border transition-all ${profile.is_banned ? "border-green-400/40 text-green-600 dark:text-green-400 hover:bg-green-500/10" : "border-red-400/40 text-red-600 dark:text-red-400 hover:bg-red-500/10"}`} title={profile.is_banned ? t("profile.unban") : t("profile.ban")}>
                          <Ban size={18} />
                        </button>
                      )}
                      <button onClick={() => setShowReport(true)} className="p-2 rounded-full border border-line dark:border-white/20 text-gray-500 dark:text-white/60 hover:bg-red-500/10 hover:border-red-400/50 hover:text-red-600 dark:hover:text-red-400 transition-all" title={t("profile.report")}>
                        <Flag size={18} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Био */}
                  {profile.bio && (
                    <p className="text-gray-800 dark:text-white/80 mt-3 text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                      {profile.bio}
                    </p>
                  )}

                {/* Кнопки действий — МОБИЛЬНЫЕ */}
                {!isOwnProfile && (
                  <div className="flex md:hidden items-center justify-center gap-2 mt-4">
                    <button onClick={toggleFollow} className={`px-5 py-2.5 rounded-full border font-bold text-sm transition-all ${following ? "border-[#8b5cf6] bg-[#8b5cf6] text-white" : "border-line dark:border-white/20 text-white/80 hover:bg-gray-100 dark:hover:bg-white/10 hover:border-gray-300 dark:hover:border-white/40 hover:text-white"}`}>
                      {following ? t("post.following") : t("post.follow")}
                    </button>
                    <button onClick={startChat} className="p-2.5 rounded-full border border-line dark:border-white/20 text-gray-800 dark:text-white/80 hover:bg-gray-100 dark:hover:bg-white/10 hover:border-gray-300 dark:hover:border-white/40 hover:text-gray-900 dark:hover:text-white transition-all" title={t("profile.write")}>
                      <MessageSquare size={18} />
                    </button>
                    <Link href={`/recommendations/${profile.id}`} className="p-2.5 rounded-full border border-line dark:border-white/20 text-gray-800 dark:text-white/80 hover:bg-gray-100 dark:hover:bg-white/10 hover:border-gray-300 dark:hover:border-white/40 hover:text-gray-900 dark:hover:text-white transition-all" title={t("profile.similar")}>
                      <Network size={18} />
                    </Link>
                    <button
                      onClick={async () => {
                        const token = getToken();
                        if (!token) { router.push("/login"); return; }
                        try {
                          await ensureKeyPair(token, process.env.NEXT_PUBLIC_API_URL!);
                          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/secret?other_user_id=${profile.id}`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
                          if (res.ok) {
                            const data = await res.json();
                            router.push(`/messages/${data.chat_id}`);
                          } else {
                            const err = await res.json().catch(() => null);
                            alert(typeof err?.detail === "string" ? err.detail : t("profile.secretChatFailed"));
                          }
                        } catch (e) {
                          alert(t("common.networkError"));
                        }
                      }}
                      className="p-2.5 rounded-full border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-all"
                      title={t("profile.secretChat")}
                    >
                      <Lock size={18} />
                    </button>
                    {canBan && (
                      <button onClick={toggleBan} className={`p-2.5 rounded-full border transition-all ${profile.is_banned ? "border-green-400/40 text-green-600 dark:text-green-400 hover:bg-green-500/10" : "border-red-400/40 text-red-600 dark:text-red-400 hover:bg-red-500/10"}`} title={profile.is_banned ? t("profile.unban") : t("profile.ban")}>
                        <Ban size={18} />
                      </button>
                    )}
                    <button onClick={() => setShowReport(true)} className="p-2.5 rounded-full border border-line dark:border-white/20 text-gray-500 dark:text-white/60 hover:bg-red-500/10 hover:border-red-400/50 hover:text-red-600 dark:hover:text-red-400 transition-all" title={t("profile.report")}>
                      <Flag size={18} />
                    </button>
                  </div>
                )}

                {/* Статистика */}
                <div className="flex justify-center md:justify-start gap-4 md:gap-6 mt-4 text-xs md:text-sm font-semibold text-gray-800 dark:text-white/70">
                  <span>{profile.posts_count} <span className="hidden sm:inline">{t("profile.posts")}</span><span className="sm:hidden">{t("profile.postsShort")}</span></span>
                  <button onClick={() => openModal("followers")} className="hover:text-[#8b5cf6] transition-colors cursor-pointer">
                    <span className="text-gray-900 dark:text-white font-bold">{profile.followers_count}</span> <span className="hidden sm:inline">{t("profile.followers")}</span><span className="sm:hidden">{t("profile.followersShort")}</span>
                  </button>
                  <button onClick={() => openModal("following")} className="hover:text-[#8b5cf6] transition-colors cursor-pointer">
                    <span className="text-gray-900 dark:text-white font-bold">{profile.following_count}</span> <span className="hidden sm:inline">{t("profile.following")}</span><span className="sm:hidden">{t("profile.followingShort")}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

{/* ================= ПОСТЫ ================= */}
{posts.map((post) => (
  <Post 
    key={post.id} 
    {...post} 
    liked_by_me={post.liked_by_me ?? post.is_liked ?? false}
    disliked_by_me={post.disliked_by_me ?? post.is_disliked ?? false} // <-- ДОБАВЬ ЭТУ СТРОКУ
  />
))}
        {posts.length === 0 && !postsLoading && <p className="p-8 text-center text-gray-600 dark:text-white/50">{t("common.noPosts")}</p>}
        {hasMore && posts.length > 0 && !postsLoading && (
          <button onClick={() => loadMorePosts()} className="w-full p-4 text-center text-[#8b5cf6] font-semibold hover:bg-gray-100 dark:hover:bg-white/5 transition-all">
            {t("profile.loadMore")}
          </button>
        )}
        {postsLoading && posts.length === 0 && <><PostSkeleton /><PostSkeleton /><PostSkeleton /></>}
        {postsLoading && posts.length > 0 && <><PostSkeleton /><PostSkeleton /></>}

        {/* ================= МОДАЛКИ ================= */}
        
        <input 
          ref={inputRef} 
          type="file" 
          accept={UPLOAD_RULES.avatar.types.join(",")} 
          className="hidden" 
          onChange={handleAvatarFileSelect} 
        />
        {cropperImage && (
          <AvatarCropper imageSrc={cropperImage} onCropComplete={handleCropComplete} onClose={() => setCropperImage(null)} />
        )}
        {/* Подсказка лимитов для обложки */}
        {showCoverMenu && (
          <div className="absolute top-[calc(100%+8px)] right-4 z-30 text-[10px] text-gray-500 dark:text-white/40 bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/10 rounded-lg px-2.5 py-1.5 shadow-lg">
            {UPLOAD_RULES.banner.hint}
          </div>
        )}

        <input 
          ref={coverInputRef} 
          type="file" 
          accept={UPLOAD_RULES.banner.types.join(",")} 
          className="hidden" 
          onChange={uploadCover} 
        />
        {modalType && (
          <>
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200]" onClick={() => setModalType(null)} />
            <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
              <div className="w-full max-w-md border border-line dark:border-white/20 rounded-2xl bg-ivory dark:bg-[#1f1f23]/95 backdrop-blur-md shadow-2xl pointer-events-auto max-h-[80vh] md:max-h-[70vh] flex flex-col">
                <div className="sticky top-0 bg-ivory dark:bg-[#1f1f23]/95 backdrop-blur-md border-b border-line dark:border-white/10 p-4 flex items-center justify-between shrink-0">
                  <h2 className="font-black text-gray-900 dark:text-white text-lg">{modalType === "followers" ? t("profile.followersTitle") : t("profile.followingTitle")}</h2>
                  <button onClick={() => setModalType(null)} className="text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white transition-colors p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10"><X size={20} /></button>
                </div>
                <div className="overflow-y-auto flex-1 p-2">
                  {modalLoading && <p className="p-8 text-center text-gray-600 dark:text-white/50">{t("common.loading")}</p>}
                  {!modalLoading && modalUsers.length === 0 && <p className="p-8 text-center text-gray-600 dark:text-white/50">{modalType === "followers" ? t("profile.noFollowers") : t("profile.noFollowing")}</p>}
                  {!modalLoading && modalUsers.map((u) => (
                    <Link key={u.id} href={`/${u.username}`} onClick={() => setModalType(null)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
                      <div className="shrink-0"><Avatar src={u.avatar_url} name={u.display_name} id={u.id} size={48} /></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={`font-bold text-sm md:text-base truncate ${glowStyle(u) ? "" : "text-gray-900 dark:text-white"}`} style={glowStyle(u)}>{u.display_name}</p>
                          <RoleBadge user={u} activeCustomBadgeAssignment={u.active_custom_badge_assignment} size="sm" />                     </div>
                        <p className="text-xs md:text-sm text-gray-600 dark:text-white/50 truncate">@{u.username}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {showReport && profile && (
          <ReportModal targetType="user" targetId={profile.id} onClose={() => setShowReport(false)} />
        )}

        {/* 🆕 ИСПРАВЛЕННАЯ МОДАЛКА СМЕНЫ ЗНАЧКА */}
        {showBadgeModal && (
          <>
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[300]" onClick={() => setShowBadgeModal(false)} />
            <div className="fixed inset-0 z-[301] flex items-center justify-center p-4 pointer-events-none">
              <div className="w-full max-w-sm bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-2xl shadow-2xl p-4 pointer-events-auto animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-900 dark:text-white text-sm">Сменить значок</h3>
                  <button onClick={() => setShowBadgeModal(false)} className="text-gray-600 dark:text-white/50 hover:text-gray-900 dark:hover:text-white p-1"><X size={16} /></button>
                </div>
                
                <div className="space-y-4">
                  {/* 1. БЛОК ЗАГРУЗКИ СВОЕГО ЗНАЧКА */}
                  {canEditBadge && (
                    <div className="border-b border-line dark:border-white/10 pb-3">
                      <p className="text-xs text-gray-600 dark:text-white/60 mb-2">Загрузить свой значок:</p>
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        id="custom-badge-upload"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const token = getToken();
                          const form = new FormData();
                          form.append("file", file);
                          try {
                            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me/custom-badge`, {
                              method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form
                            });
                            if (res.ok) {
                              setShowBadgeModal(false);
                              const fresh = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/${userId}`).then(r => r.json());
                              setProfile(fresh);
                            } else {
                              const err = await res.json().catch(() => null);
                              alert(err?.detail || "Ошибка загрузки");
                            }
                          } catch {
                            alert("Ошибка сети");
                          }
                        }}
                      />
                      <div className="flex gap-2">
                        <label htmlFor="custom-badge-upload" className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#8b5cf6]/20 border border-[#8b5cf6]/30 text-[#8b5cf6] text-xs font-bold hover:bg-[#8b5cf6]/30 cursor-pointer transition-colors">
                          <Upload size={14} /> {profile?.custom_badge_url ? "Заменить" : "Загрузить"}
                        </label>
                        {profile?.custom_badge_url && (
                          <button 
                            onClick={async () => {
                              if (!confirm("Удалить свой значок?")) return;
                              const token = getToken();
                              await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me/custom-badge`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
                              setShowBadgeModal(false);
                              const fresh = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/${userId}`).then(r => r.json());
                              setProfile(fresh);
                            }}
                            className="px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/30 transition-colors"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 2. МОИ ЗАГРУЗКИ (кастомный значок) */}
                  {profile?.custom_badge_url && (
                    <div>
                      <p className="text-xs text-gray-600 dark:text-white/60 mb-2">Мой загруженный значок:</p>
                      <div className="grid grid-cols-4 gap-2">
                        <button 
                          onClick={async () => {
                            // Выбираем кастомный значок (он уже установлен, просто закрываем модалку)
                            setShowBadgeModal(false);
                          }}
                          className="aspect-square rounded-lg border border-purple-600 dark:border-purple-400 bg-purple-500/20 flex items-center justify-center relative"
                          style={{ filter: `drop-shadow(0 0 8px #8b5cf699)` }}
                        >
                          <img src={profile.custom_badge_url} className="w-6 h-6 object-contain" alt="custom" />
                          <Check size={12} className="absolute -top-1 -right-1 bg-purple-500 text-white rounded-full p-0.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 3. СТОКОВЫЕ ЗНАЧКИ (из админки) */}
                  {availableBadges.filter(b => b.role_id === currentUser?.role?.id || b.user_id === currentUser?.id || (b.is_selectable && (currentUser?.level ?? 1) >= 3)).length > 0 && (
                    <div>
                      <p className="text-xs text-gray-600 dark:text-white/60 mb-2">Стоковые значки:</p>
                      <div className="grid grid-cols-4 gap-2">
                        {availableBadges
                          .filter(b => b.role_id === currentUser?.role?.id || b.user_id === currentUser?.id || (b.is_selectable && (currentUser?.level ?? 1) >= 3))
                          .map((badge) => {
                            const isActive = profile?.selected_badge_id === badge.id && !profile?.custom_badge_url;
                            return (
                              <button 
                                key={badge.id} 
                                onClick={async () => {
                                  const token = getToken();
                                  const form = new FormData();
                                  form.append("badge_id", String(badge.id));
                                  await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me/badge`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
                                  setShowBadgeModal(false);
                                  const fresh = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/${userId}`).then(r => r.json());
                                  setProfile(fresh);
                                }}
                                className={`aspect-square rounded-lg border flex items-center justify-center relative transition-all ${
                                  isActive ? "border-purple-600 dark:border-purple-400 bg-purple-500/20" : "border-line dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/5"
                                }`}
                                style={{ filter: isActive ? `drop-shadow(0 0 8px ${badge.glow_color || '#8b5cf6'}99)` : "none" }}
                              >
                                <img src={badge.icon_url} className="w-6 h-6 object-contain" alt={badge.name} />
                                {isActive && <Check size={12} className="absolute -top-1 -right-1 bg-purple-500 text-white rounded-full p-0.5" />}
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </main>

    </div>
  );
}