"use client";

/**
 * Nebula: настройки режима Nebula (вид как в Telegram) —
 * профиль сверху, список настроек ниже. Доступна только в режиме Nebula.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Sparkles, Bell, ShieldCheck, Sun, ChevronRight,
} from "lucide-react";
import { useNebulaMode } from "@/lib/useNebula";
import { getToken } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import { Avatar } from "@/components/Avatar";

type Pref = "on" | "off";
type Me = {
  displayName?: string;
  username?: string;
  avatarUrl?: string | null;
};
const PREF_KEYS = {
  theme: "nebula_pref_theme",
  notifications: "nebula_pref_notifications",
  privacy: "nebula_pref_privacy",
};

function readPref(key: string): Pref {
  if (typeof window === "undefined") return "on";
  return localStorage.getItem(key) === "off" ? "off" : "on";
}

function Toggle({ value }: { value: Pref }) {
  return (
    <span
      className={`w-11 h-6 rounded-full relative shrink-0 transition-colors ${
        value === "on" ? "bg-purple-500" : "bg-gray-300 dark:bg-white/15"
      }`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
          value === "on" ? "right-0.5" : "left-0.5"
        }`}
      />
    </span>
  );
}

export default function NebulaSettingsPage() {
  const router = useRouter();
  const { isNebula, toggleNebula } = useNebulaMode();
  const [me, setMe] = useState<Me | null>(null);
  const [theme, setTheme] = useState<Pref>("on");
  const [notifications, setNotifications] = useState<Pref>("on");
  const [privacy, setPrivacy] = useState<Pref>("on");

  // Режим Nebula выключен -> мессенджер
  useEffect(() => {
    if (isNebula === false) router.replace("/messages");
  }, [isNebula, router]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    setTheme(readPref(PREF_KEYS.theme));
    setNotifications(readPref(PREF_KEYS.notifications));
    setPrivacy(readPref(PREF_KEYS.privacy));

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe)
      .catch(() => {});
  }, [router]);

  const savePref = (key: string, value: Pref, setter: (v: Pref) => void) => {
    setter(value);
    try {
      localStorage.setItem(key, value);
    } catch {
      /* приватный режим */
    }
  };

  const avatarUrl = me?.avatarUrl
    ? (me.avatarUrl.startsWith("http") ? me.avatarUrl : mediaUrl(me.avatarUrl))
    : null;

  if (!isNebula) return null;

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-[#17171b] text-gray-900 dark:text-white font-sans">
      {/* Индикатор режима Nebula */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-purple-500 z-50" />

      <div className="max-w-xl mx-auto px-4 pt-10 pb-16">
        {/* Назад к чатам */}
        <button
          onClick={() => router.push("/messages")}
          className="flex items-center gap-2 text-sm text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft size={16} />
          Назад к чатам
        </button>

        {/* Профиль (как в Telegram) */}
        <div className="flex flex-col items-center py-8 rounded-2xl bg-white dark:bg-[#1e1e23] border border-line dark:border-white/10 mb-6">
          {avatarUrl ? (
            <Avatar src={avatarUrl} name={me?.displayName || me?.username || "?"} size={96} />
          ) : (
            <div className="w-24 h-24 rounded-full bg-purple-500/15 flex items-center justify-center">
              <span className="text-3xl font-bold text-purple-500">
                {(me?.displayName || me?.username || "?").charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div className="mt-4 text-xl font-bold text-center">
            {me?.displayName || me?.username || "Пользователь"}
          </div>
          {me?.username && (
            <div className="mt-1 text-sm text-gray-400 dark:text-white/30">
              @{me.username}
            </div>
          )}
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-purple-500/10 border border-purple-500/25 px-3 py-1 text-xs font-medium text-purple-500">
            <Sparkles size={12} />
            Режим Nebula активен
          </div>
        </div>

        {/* Список настроек */}
        <div className="rounded-2xl bg-white dark:bg-[#1e1e23] border border-line dark:border-white/10 divide-y divide-line dark:divide-white/10 overflow-hidden">
          {/* Переключатель режима Nebula */}
          <button
            onClick={() => {
              toggleNebula();
              router.push("/");
            }}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
          >
            <Sparkles size={20} className="text-purple-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Режим Nebula</div>
              <div className="text-xs text-gray-400 dark:text-white/30">
                Включён · нажмите, чтобы вернуться в полный режим соцсети
              </div>
            </div>
            <span className="w-11 h-6 rounded-full bg-purple-500 relative shrink-0">
              <span className="absolute right-0.5 top-0.5 w-5 h-5 rounded-full bg-white" />
            </span>
          </button>

          {/* Тема */}
          <button
            onClick={() => savePref(PREF_KEYS.theme, theme === "on" ? "off" : "on", setTheme)}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
          >
            <Sun size={20} className="text-amber-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Тема</div>
              <div className="text-xs text-gray-400 dark:text-white/30">
                Системная / светлая / тёмная
              </div>
            </div>
            <span className={`text-xs font-medium ${theme === "on" ? "text-purple-500" : "text-gray-400 dark:text-white/30"}`}>
              {theme === "on" ? "Системная" : "Упрощённая"}
            </span>
            <ChevronRight size={16} className="text-gray-300 dark:text-white/20" />
          </button>

          {/* Уведомления */}
          <button
            onClick={() => savePref(PREF_KEYS.notifications, notifications === "on" ? "off" : "on", setNotifications)}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
          >
            <Bell size={20} className="text-blue-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Уведомления</div>
              <div className="text-xs text-gray-400 dark:text-white/30">
                Push-уведомления о новых сообщениях
              </div>
            </div>
            <Toggle value={notifications} />
          </button>

          {/* Приватность */}
          <button
            onClick={() => savePref(PREF_KEYS.privacy, privacy === "on" ? "off" : "on", setPrivacy)}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
          >
            <ShieldCheck size={20} className="text-emerald-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Приватность</div>
              <div className="text-xs text-gray-400 dark:text-white/30">
                Кто может писать вам в мессенджере
              </div>
            </div>
            <Toggle value={privacy} />
          </button>
        </div>
      </div>
    </div>
  );
}
