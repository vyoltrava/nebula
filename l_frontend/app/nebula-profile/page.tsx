"use client";

/**
 * Nebula: окно своего профиля — аватар, имя, username,
 * редактирование профиля, переход в настройки и выход.
 * ыстрая реакция живёт в астройки → нешний вид.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Settings, LogOut, Check, Pencil, Sparkles, Users,
} from "lucide-react";
import { useNebulaMode } from "@/lib/useNebula";
import { getToken, clearToken } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import { Avatar } from "@/components/Avatar";
import { useAvatarUploader } from "@/components/AvatarUploader";
import { AvatarCropper } from "@/components/AvatarCropper";
import { NebulaCircleModal } from "@/components/NebulaCircleModal";

type Me = {
  username?: string;
  bio?: string;
  display_name?: string;
  avatar_url?: string | null;
};

export default function NebulaProfilePage() {
  const router = useRouter();
  const { isNebula, toggleNebula } = useNebulaMode();
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showCircle, setShowCircle] = useState(false);

  const {
    inputRef,
    openFilePicker,
    handleFileSelect,
    handleCropComplete,
    cropperImage,
    setCropperImage,
  } = useAvatarUploader((newUrl) => {
    setMe((prev) => (prev ? { ...prev, avatar_url: newUrl } : prev));
  }, "/api/me/avatar");

  useEffect(() => setReady(true), []);

  useEffect(() => {
    if (ready && isNebula === false) router.replace("/messages");
  }, [ready, isNebula, router]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
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
  }, [router]);

  const saveProfile = async () => {
    const token = getToken();
    if (!token) return;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ display_name: displayName, bio }),
    });
    if (res.ok) {
      setMe((prev) => (prev ? { ...prev, display_name: displayName, bio } : prev));
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const logout = () => {
    clearToken();
    router.push("/login");
  };

  const avatarUrl = me?.avatar_url
    ? me.avatar_url.startsWith("http")
      ? me.avatar_url
      : mediaUrl(me.avatar_url)
    : null;

  if (!ready || !isNebula) return null;

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-[#17171b] text-gray-900 dark:text-white font-sans">
      <div className="fixed top-0 left-0 right-0 h-1 bg-purple-500 z-50" />
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
      {cropperImage ? (
        <AvatarCropper
          imageSrc={cropperImage}
          onCropComplete={handleCropComplete}
          onClose={() => setCropperImage(null)}
        />
      ) : null}

      <div className="max-w-xl mx-auto px-4 pt-10 pb-16">
        <button
          onClick={() => router.push("/messages")}
          className="flex items-center gap-2 text-sm text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft size={16} />
          азад к чатам
        </button>

        <div className="flex flex-col items-center py-8 rounded-2xl bg-white dark:bg-[#1e1e23] border border-line dark:border-white/10 mb-6">
          <button
            onClick={openFilePicker}
            title="Сменить аватар"
            className="rounded-full hover:ring-4 hover:ring-purple-500/25 transition-all"
          >
            {avatarUrl ? (
              <Avatar src={avatarUrl} name={displayName} size={110} />
            ) : (
              <div className="w-[110px] h-[110px] rounded-full bg-purple-500/15 flex items-center justify-center text-4xl font-bold text-purple-500">
                {displayName.charAt(0).toUpperCase() || "?"}
              </div>
            )}
          </button>
          <div className="mt-4 text-xl font-bold text-center flex items-center gap-2">
            {displayName || "ользователь"}
            <button
              onClick={() => setEditing((v) => !v)}
              className="text-gray-400 hover:text-purple-500 transition-colors"
              title="едактировать профиль"
            >
              <Pencil size={16} />
            </button>
          </div>
          {me?.username && (
            <div className="mt-1 text-sm text-gray-400 dark:text-white/30">@{me.username}</div>
          )}
          {!editing && me?.bio && (
            <p className="mt-3 text-sm text-gray-500 dark:text-white/50 text-center px-6">{me.bio}</p>
          )}

          {editing && (
            <div className="w-full px-6 mt-5 space-y-3">
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value.slice(0, 60))}
                placeholder="мя"
                className="w-full px-3.5 py-2.5 rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 text-sm focus:outline-none focus:border-purple-500/60"
              />
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, 200))}
                placeholder="  себе"
                rows={3}
                className="w-full px-3.5 py-2.5 rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 text-sm resize-none focus:outline-none focus:border-purple-500/60"
              />
              <button
                onClick={saveProfile}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium py-2.5 transition-colors"
              >
                <Check size={16} />
                {saved ? "Сохранено!" : "Сохранить"}
              </button>
            </div>
          )}

          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-purple-500/10 border border-purple-500/25 px-3 py-1 text-xs font-medium text-purple-500">
            <Sparkles size={12} />
            ежим Nebula
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#1e1e23] border border-line dark:border-white/10 divide-y divide-line dark:divide-white/10 overflow-hidden">
          <button
            onClick={() => setShowCircle(true)}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
          >
            <Users size={20} className="text-[#8b5cf6] shrink-0" />
            <span className="flex-1 text-sm font-medium">руг друзей</span>
          </button>
          <button
            onClick={() => router.push("/nebula-settings")}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
          >
            <Settings size={20} className="text-gray-400 shrink-0" />
            <span className="flex-1 text-sm font-medium">астройки</span>
          </button>
          <button
            onClick={() => { toggleNebula(); router.push("/"); }}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
          >
            <Sparkles size={20} className="text-purple-500 shrink-0" />
            <span className="flex-1 text-sm font-medium">ыйти из режима Nebula</span>
          </button>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-5 py-4 text-[#E74C3C] hover:bg-[#E74C3C]/10 transition-colors text-left"
          >
            <LogOut size={20} className="shrink-0" />
            <span className="flex-1 text-sm font-medium">ыйти из аккаунта</span>
          </button>
        </div>
      </div>

      {showCircle && <NebulaCircleModal onClose={() => setShowCircle(false)} />}
    </div>
  );
}
