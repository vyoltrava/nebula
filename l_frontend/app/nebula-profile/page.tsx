"use client";

/**
 * Nebula: новое окно профиля (как в Telegram) — аватар, имя, username,
 * редактирование профиля, выбор быстрой реакции, переход в настройки
 * и выход из аккаунта (как в обычном режиме).
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Settings, LogOut, Check, Pencil, SmilePlus, Sparkles,
  X, Lock, Users,
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

type QuickReaction = { type: "emoji" | "sticker"; content: string; stickerId?: number };

export default function NebulaProfilePage() {
  const router = useRouter();
  const { isNebula, toggleNebula } = useNebulaMode();
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [quickReaction, setQuickReaction] = useState<QuickReaction | null>(null);
  const [stickerPacks, setStickerPacks] = useState<any[]>([]);
  const [activePackTab, setActivePackTab] = useState(0);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
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

  // Nebula выключен -> чаты; не авторизован -> логин
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
    try {
      const savedReaction = localStorage.getItem("quick_reaction");
      if (savedReaction) setQuickReaction(JSON.parse(savedReaction));
    } catch {}
  }, [router]);

  const saveQuickReaction = (r: QuickReaction) => {
    setQuickReaction(r);
    localStorage.setItem("quick_reaction", JSON.stringify(r));
    setShowReactionPicker(false);
  };

  // Загружаем паки стикеров (для выбора реакции из всех паков)
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/sticker-packs`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setStickerPacks(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

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
      {/* AvatarCropper открывается внутри useAvatarUploader через cropperImage */}
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
          Назад к чатам
        </button>

        {/* Профиль */}
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
            {displayName || "Пользователь"}
            <button
              onClick={() => setEditing((v) => !v)}
              className="text-gray-400 hover:text-purple-500 transition-colors"
              title="Редактировать профиль"
            >
              <Pencil size={16} />
            </button>
          </div>
          {me?.username && (
            <div className="mt-1 text-sm text-gray-400 dark:text-white/30">@{me.username}</div>
          )}
          {!editing && me?.bio && (
            <p className="mt-3 text-sm text-gray-500 dark:text-white/50 text-center px-6">
              {me.bio}
            </p>
          )}

          {editing && (
            <div className="w-full px-6 mt-5 space-y-3">
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value.slice(0, 60))}
                placeholder="Имя"
                className="w-full px-3.5 py-2.5 rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 text-sm focus:outline-none focus:border-purple-500/60"
              />
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, 200))}
                placeholder="О себе"
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
            Режим Nebula
          </div>
        </div>

        {/* Быстрая реакция (двойной тап) */}
        {/* Быстрая реакция (двойной тап) */}
        <div className="rounded-2xl bg-white dark:bg-[#1e1e23] border border-line dark:border-white/10 p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <SmilePlus size={18} className="text-amber-500" />
            <h2 className="text-sm font-bold">Быстрая реакция (двойной тап)</h2>
          </div>
          <button
            onClick={() => {
              setActivePackTab(0);
              setShowReactionPicker(true);
            }}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors text-left"
          >
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {quickReaction
                ? quickReaction.type === "emoji"
                  ? quickReaction.content
                  : "Стикер"
                : "Выбрать реакцию"}
            </span>
            <span className="text-xs text-purple-500 font-medium">Все паки ›</span>
          </button>
          {quickReaction && (
            <p className="mt-2 text-xs text-gray-400 dark:text-white/30">
              Текущая: {quickReaction.type === "emoji" ? quickReaction.content : "стикер"}
            </p>
          )}
        </div>

        {showReactionPicker && (
          <>
            <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm" onClick={() => setShowReactionPicker(false)} />
            <div className="fixed inset-0 z-[301] flex items-center justify-center p-4 pointer-events-none">
              <div className="w-full max-w-sm max-h-[80vh] bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-2xl shadow-2xl flex flex-col pointer-events-auto animate-in zoom-in-95 duration-200">
                <div className="shrink-0 p-3 pb-2 border-b border-line dark:border-white/10">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <p className="text-xs font-bold text-gray-600 dark:text-white/60">Быстрая реакция (двойной тап)</p>
                    <button onClick={() => setShowReactionPicker(false)} className="text-gray-500 dark:text-white/40 hover:text-gray-900 dark:text-white p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-1">
                    {stickerPacks.map((pack, i) => {
                      const lockedP = (pack.min_level || 0) > ((me as any)?.level ?? 0);
                      return (
                        <button
                          key={pack.id ?? i}
                          onClick={() => setActivePackTab(i)}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 transition-all ${
                            activePackTab === i
                              ? "bg-[#8b5cf6] text-white"
                              : "bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/50 hover:bg-gray-100 dark:hover:bg-white/10"
                          }`}
                        >
                          {lockedP && <Lock size={10} className="text-yellow-600 dark:text-yellow-400" />}
                          {pack.name}
                        </button>
                      );
                    })}
                  </div>
                </div>                <div className="flex-1 overflow-y-auto p-3 min-h-0">
                  {stickerPacks[activePackTab] ? (
                    (stickerPacks[activePackTab].min_level || 0) > ((me as any)?.level ?? 0) ? (
                      <div className="flex flex-col items-center gap-2 py-8 text-center">
                        <div className="w-12 h-12 rounded-full bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center">
                          <Lock size={18} className="text-yellow-600 dark:text-yellow-400" />
                        </div>
                        <p className="text-sm font-bold text-gray-900 dark:text-white">Пак заблокирован</p>
                        <p className="text-[11px] text-gray-500 dark:text-white/40 max-w-[220px]">
                          Доступен с уровня {stickerPacks[activePackTab].min_level}.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-6 gap-1.5">
                        {stickerPacks[activePackTab].stickers?.map((st: any) => {
                          const type = st.type === "image" ? "sticker" : "emoji";
                          const isActive =
                            quickReaction?.type === type &&
                            quickReaction?.content === st.content &&
                            quickReaction?.stickerId === (type === "sticker" ? Number(st.id) : undefined);
                          return (
                            <button
                              key={st.id}
                              onClick={() =>
                                saveQuickReaction({
                                  type,
                                  content: st.content,
                                  stickerId: type === "sticker" ? Number(st.id) : undefined,
                                })
                              }
                              className={`aspect-square flex items-center justify-center rounded-xl transition-all ${
                                isActive ? "ring-2 ring-[#8b5cf6] bg-[#8b5cf6]/20" : "hover:bg-gray-100 dark:hover:bg-white/10 active:scale-90"
                              }`}
                              title={type === "emoji" ? "Эмодзи" : "Стикер"}
                            >
                              {type === "emoji" ? (
                                <span className="text-2xl">{st.content}</span>
                              ) : (
                                <img src={st.content} alt="" className="w-10 h-10 object-contain" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )
                  ) : (
                    <div className="py-8 text-center text-gray-600 dark:text-white/50">
                      {stickerPacks.length === 0 ? "Загрузка паков..." : "Нет доступных паков"}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Действия */}
        <div className="rounded-2xl bg-white dark:bg-[#1e1e23] border border-line dark:border-white/10 divide-y divide-line dark:divide-white/10 overflow-hidden">
          <button
            onClick={() => setShowCircle(true)}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
          >
            <Users size={20} className="text-[#8b5cf6] shrink-0" />
            <span className="flex-1 text-sm font-medium">Круг друзей</span>
          </button>
          <button
            onClick={() => router.push("/nebula-settings")}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
          >
            <Settings size={20} className="text-gray-400 shrink-0" />
            <span className="flex-1 text-sm font-medium">Настройки</span>
          </button>
          <button
            onClick={() => {
              toggleNebula();
              router.push("/");
            }}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
          >
            <Sparkles size={20} className="text-purple-500 shrink-0" />
            <span className="flex-1 text-sm font-medium">Выйти из режима Nebula</span>
          </button>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-5 py-4 text-[#E74C3C] hover:bg-[#E74C3C]/10 transition-colors text-left"
          >
            <LogOut size={20} className="shrink-0" />
            <span className="flex-1 text-sm font-medium">Выйти из аккаунта</span>
          </button>
        </div>
      </div>

      {/* __P3__ */}
      {showCircle && <NebulaCircleModal onClose={() => setShowCircle(false)} />}
    </div>
  );
}