"use client";

/**
 * Nebula: окно своего профиля — баннер, аватар с анимированной рамкой,
 * бейдж/плашка роли, редактирование, настройки и выход. Полная ширина на ПК.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ArrowLeft, Settings, LogOut, Check, Pencil, Sparkles, Users,
  Camera, Image as ImageIcon, X as XIcon, AlertTriangle,
} from "lucide-react";
import { useNebulaMode } from "@/lib/useNebula";
import { getToken, clearToken } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import { Avatar } from "@/components/Avatar";
import { AvatarFrame } from "@/components/AvatarFrame";
import { RoleBadge } from "@/components/RoleBadge";
import { SmartImage } from "@/components/SmartImage";
import { useAvatarUploader } from "@/components/AvatarUploader";
import { AvatarCropper } from "@/components/AvatarCropper";
import { validateUpload, uploadErrorText, UPLOAD_RULES } from "@/lib/uploadRules";
import { resolveNickColor } from "@/lib/nickGlow";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { NebulaCircleModal } from "@/components/NebulaCircleModal";

type Me = {
  id?: number;
  username?: string;
  bio?: string;
  display_name?: string;
  avatar_url?: string | null;
  cover_url?: string | null;
  level?: number;
  role?: { id?: number; color?: string; level?: number } | null;
  selected_badge_id?: number | null;
  custom_badge_url?: string | null;
};

export default function NebulaProfilePage() {
  const router = useRouter();
  const { isNebula, toggleNebula } = useNebulaMode();
  const { t } = useI18n();
  const { resolvedTheme } = useTheme();
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showCircle, setShowCircle] = useState(false);
  const [availableBadges, setAvailableBadges] = useState<any[]>([]);
  const [customAssignment, setCustomAssignment] = useState<any>(null);
  const [coverMenu, setCoverMenu] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const {
    inputRef, openFilePicker, handleFileSelect, handleCropComplete,
    cropperImage, setCropperImage,
  } = useAvatarUploader((newUrl) => {
    setMe((prev) => (prev ? { ...prev, avatar_url: newUrl } : prev));
  }, "/api/me/avatar");


  useEffect(() => setReady(true), []);

  useEffect(() => {
    if (ready && isNebula === false) router.replace("/messages");
  }, [ready, isNebula, router]);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setMe(data);
        setDisplayName(data?.display_name || "");
        setBio(data?.bio || "");
      })
      .catch(() => {});
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/badges`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setAvailableBadges(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [router]);

  // Кастомная плашка роли (как в классическом профиле)
  useEffect(() => {
    if (!me?.id) return;
    const token = getToken();
    if (!token) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/custom-badge-assignments?user_id=${me.id}&active_only=true`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setCustomAssignment(Array.isArray(d) && d.length ? d[0] : null))
      .catch(() => {});
  }, [me?.id]);

  async function uploadCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverError(null);
    const localErr = await validateUpload(file, "banner");
    if (localErr) { setCoverError(localErr); e.target.value = ""; return; }
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
      setMe((prev) => (prev ? { ...prev, cover_url: data.cover_url } : prev));
    } else {
      setCoverError(await uploadErrorText(res));
    }
    e.target.value = "";
  }

  async function removeCover() {
    const token = getToken();
    if (!token) return;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me/cover`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setMe((prev) => (prev ? { ...prev, cover_url: null } : prev));
  }

  const saveProfile = async () => {
    const token = getToken();
    if (!token) return;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ display_name: displayName, bio }),
    });
    if (res.ok) {
      setMe((prev) => (prev ? { ...prev, display_name: displayName, bio } : prev));
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const logout = () => { clearToken(); router.push("/login"); };

  function glowStyle(u: Me | null): React.CSSProperties | undefined {
    const c = resolveNickColor(u?.role?.color || null, resolvedTheme);
    if (!c) return undefined;
    return { color: c, textShadow: `0 0 10px ${c}55` };
  }

  const avatarUrl = me?.avatar_url
    ? me.avatar_url.startsWith("http") ? me.avatar_url : mediaUrl(me.avatar_url)
    : null;

  const coverSrc = me?.cover_url
    ? me.cover_url.startsWith("http") ? me.cover_url : mediaUrl(me.cover_url)
    : null;

  const hasCover = !!coverSrc;

  if (!ready || !isNebula) return null;

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-[#17171b] text-gray-900 dark:text-white font-sans">
      <div className="fixed top-0 left-0 right-0 h-1 bg-purple-500 z-50" />
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
      <input
        ref={coverInputRef}
        type="file"
        accept={UPLOAD_RULES.banner.types.join(",")}
        className="hidden"
        onChange={uploadCover}
      />
      {cropperImage ? (
        <AvatarCropper
          imageSrc={cropperImage}
          onCropComplete={handleCropComplete}
          onClose={() => setCropperImage(null)}
        />
      ) : null}

      <div className="w-full px-4 md:px-10 pt-6 pb-16">
        <button
          onClick={() => router.push("/messages")}
          className="flex items-center gap-2 text-sm text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white mb-5 transition-colors"
        >
          <ArrowLeft size={16} />
          {t("profile.backToChats")}
        </button>

        {!me ? (
          <div className="animate-pulse" aria-busy="true">
            {/* шапка: фон-блок + аватар/имя по центру */}
            <div className="rounded-2xl bg-white dark:bg-[#1e1e23] border border-line dark:border-white/10 overflow-hidden">
              <div className="h-28 md:h-40 bg-gray-200 dark:bg-white/10" />
              <div className="px-4 pb-6 flex flex-col items-center">
                <div className="w-32 h-32 rounded-2xl bg-gray-200 dark:bg-white/15 shrink-0 -mt-14 md:-mt-16 shadow-lg" />
                <div className="mt-3 h-6 w-40 rounded bg-gray-200 dark:bg-white/10" />
                <div className="mt-2 h-3.5 w-32 rounded bg-gray-100 dark:bg-white/5" />
              </div>
            </div>
            {/* список действий */}
            <div className="mt-6 rounded-2xl bg-white dark:bg-[#1e1e23] border border-line dark:border-white/10 divide-y divide-line dark:divide-white/10">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-4">
                  <div className="w-5 h-5 rounded bg-gray-200 dark:bg-white/10" />
                  <div className="h-4 w-44 rounded bg-gray-200 dark:bg-white/10" />
                </div>
              ))}
            </div>
          </div>
        ) : (
        <>
        {/* ── ШАПКА: баннер фоном + аватар/имя/плашка по центру ── */}
        <div className={`relative w-full overflow-hidden rounded-2xl border border-line dark:border-white/10 ${hasCover ? "" : "bg-white dark:bg-[#1e1e23]"}`}>
          {hasCover ? (
            <div className="absolute inset-0">
              <SmartImage src={coverSrc} wrapperClassName="w-full h-full" alt="Cover" />
              <div className="absolute inset-0 bg-black/40 pointer-events-none" />
            </div>
          ) : null}

          <button
            onClick={() => setCoverMenu(!coverMenu)}
            className="absolute top-3 right-3 z-20 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-sm border border-white/25 transition-colors"
            title={t("profile.changeCover")}
          >
            <ImageIcon size={15} />
          </button>

          {coverMenu && (
            <>
              <div className="fixed inset-0 z-30" onClick={(e) => { e.stopPropagation(); setCoverMenu(false); }} />
              <div className="absolute top-14 right-3 z-40 min-w-[170px] bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-xl shadow-2xl overflow-hidden">
                <button
                  onClick={(e) => { e.stopPropagation(); coverInputRef.current?.click(); setCoverMenu(false); }}
                  className="w-full px-4 py-3 text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-2.5 transition-colors"
                >
                  <ImageIcon size={16} className="text-[#8b5cf6]" />
                  {t("profile.changeCover")}
                </button>
                {me.cover_url && (
                  <button
                    onClick={(e) => { e.stopPropagation(); removeCover(); setCoverMenu(false); }}
                    className="w-full px-4 py-3 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-500/10 flex items-center gap-2.5 transition-colors"
                  >
                    <XIcon size={16} />
                    {t("profile.deleteCover")}
                  </button>
                )}
              </div>
            </>
          )}

          <div className={`relative z-10 flex flex-col items-center ${hasCover ? "pt-10 md:pt-14 pb-6" : "py-10"}`}>
            <div className="relative shrink-0 w-32 h-32 rounded-xl group cursor-pointer" onClick={openFilePicker}>
              <AvatarFrame user={me} availableBadges={availableBadges} size={128}>
                <Avatar src={avatarUrl} name={displayName || "U"} id={me.id ?? 0} size={128} />
              </AvatarFrame>
              <div className="absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex items-center justify-center pointer-events-none">
                <Camera size={26} className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
              </div>
              <span className="sr-only">{t("profile.changeAvatar")}</span>
            </div>

            <div className="mt-3 flex items-center gap-2 flex-wrap justify-center">
              <h1
                className={`text-2xl md:text-3xl font-black break-words ${glowStyle(me) ? "" : "text-gray-900 dark:text-white"}`}
                style={glowStyle(me)}
              >
                {displayName || t("profile.fallbackName")}
              </h1>
              <RoleBadge user={me} activeCustomBadgeAssignment={customAssignment} size="md" />
              <button
                onClick={() => setEditing((v) => !v)}
                className="text-gray-400 hover:text-purple-500 transition-colors"
                title={t("profile.editProfile")}
              >
                <Pencil size={16} />
              </button>
            </div>
            {me?.username && (
              <div className="mt-1 text-sm text-gray-400 dark:text-white/40">@{me.username}</div>
            )}
            {!editing && me?.bio && (
              <p className="mt-3 text-sm text-gray-500 dark:text-white/50 text-center max-w-md px-4">{me.bio}</p>
            )}
          </div>

          {coverError && (
            <div className="absolute bottom-3 left-3 right-3 z-20 rounded-xl bg-red-500/20 border border-red-500/40 px-3 py-2 flex items-center gap-2 backdrop-blur-sm">
              <AlertTriangle size={14} className="text-red-300 shrink-0" />
              <p className="text-xs font-semibold text-red-100 flex-1">{coverError}</p>
              <button onClick={() => setCoverError(null)} className="p-1 shrink-0 text-red-200 hover:text-white">
                <XIcon size={14} />
              </button>
            </div>
          )}
        </div>

        {editing && (
          <div className="mt-5 max-w-xl mx-auto md:mx-0 space-y-3">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value.slice(0, 60))}
              placeholder={t("profile.namePlaceholder")}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-white/5 border border-line dark:border-white/10 text-sm focus:outline-none focus:border-purple-500/60"
            />
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, 200))}
              placeholder={t("profile.bioPlaceholder")}
              rows={3}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-white/5 border border-line dark:border-white/10 text-sm resize-none focus:outline-none focus:border-purple-500/60"
            />
            <button
              onClick={saveProfile}
              className="w-full md:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium py-2.5 px-6 transition-colors"
            >
              <Check size={16} />
              {saved ? t("profile.saved") : t("profile.save")}
            </button>
          </div>
        )}

        <div className="mt-4 inline-flex md:hidden items-center gap-1.5 rounded-full bg-purple-500/10 border border-purple-500/25 px-3 py-1 text-xs font-medium text-purple-500">
          <Sparkles size={12} />
          {t("profile.nebulaMode")}
        </div>

        {/* ── Действия ── */}
        <div className="mt-6 rounded-2xl bg-white dark:bg-[#1e1e23] border border-line dark:border-white/10 divide-y divide-line dark:divide-white/10 overflow-hidden">
          <button
            onClick={() => setShowCircle(true)}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
          >
            <Users size={20} className="text-[#8b5cf6] shrink-0" />
            <span className="flex-1 text-sm font-medium">{t("profile.circleFriends")}</span>
          </button>
          <button
            onClick={() => router.push("/nebula-settings")}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
          >
            <Settings size={20} className="text-gray-400 shrink-0" />
            <span className="flex-1 text-sm font-medium">{t("profile.settings")}</span>
          </button>
          <button
            onClick={() => { toggleNebula(); router.push("/"); }}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
          >
            <Sparkles size={20} className="text-purple-500 shrink-0" />
            <span className="flex-1 text-sm font-medium">{t("profile.exitNebula")}</span>
          </button>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-5 py-4 text-[#E74C3C] hover:bg-[#E74C3C]/10 transition-colors text-left"
          >
            <LogOut size={20} className="shrink-0" />
            <span className="flex-1 text-sm font-medium">{t("profile.logout")}</span>
          </button>
        </div>
        </>
        )}
      </div>

      {showCircle && <NebulaCircleModal onClose={() => setShowCircle(false)} />}
    </div>
  );
}
