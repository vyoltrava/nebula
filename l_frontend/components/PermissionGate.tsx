"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Mic, Video, AlertCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { Button } from "@/components/ui/Button";
import { getActiveAccount } from "@/lib/auth";

// Страницы, где НЕ показываем PermissionGate
const PUBLIC_PAGES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/messages/", // в чатах свои проверки
];

// 🍏 Детекция iOS (включая iPad на iOS 13+, который притворяется Mac)
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

// --- Утилиты для localStorage ---

function getPermKey(userId: string | number | null, kind: "audio" | "video"): string {
  return `perm_${kind}_${userId || "anon"}`;
}

function getStoredStatus(userId: string | number | null, kind: "audio" | "video"): "granted" | "denied" | "unknown" {
  if (typeof window === "undefined") return "unknown";
  try {
    const status = localStorage.getItem(getPermKey(userId, kind));
    if (status === "granted" || status === "denied") return status;
    return "unknown";
  } catch {
    return "unknown";
  }
}

function setStoredStatus(userId: string | number | null, kind: "audio" | "video", status: "granted" | "denied" | "unknown") {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getPermKey(userId, kind), status);
  } catch (e) {
    console.warn("Failed to save permission status to localStorage", e);
  }
}

export function clearStoredPermissions(userId: string | number | null) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(getPermKey(userId, "audio"));
    localStorage.removeItem(getPermKey(userId, "video"));
  } catch {}
}

// --- Компонент ---

export function PermissionGate() {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pathname = usePathname();

  const requestMediaPermissions = useCallback(async () => {
    setRequesting(true);
    setError(null);
    const active = getActiveAccount();
    const userId = active?.userId ?? "anon";

    try {
      // Запрашиваем оба разрешения ОДНОВРЕМЕННО (одно системное окно)
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: true 
      });

      // Проверяем, что треки действительно активны (защита от блокировки на уровне ОС)
      const audioTrack = stream.getAudioTracks()[0];
      const videoTrack = stream.getVideoTracks()[0];

      if (audioTrack && audioTrack.readyState === "live") {
        setStoredStatus(userId, "audio", "granted");
      } else {
        setStoredStatus(userId, "audio", "denied");
      }

      if (videoTrack && videoTrack.readyState === "live") {
        setStoredStatus(userId, "video", "granted");
      } else {
        setStoredStatus(userId, "video", "denied");
      }

      // Останавливаем треки, чтобы погасла красная лампочка камеры/микрофона
      stream.getTracks().forEach((track) => track.stop());

      setShow(false);
    } catch (err: any) {
      console.warn("Media permission error:", err.name, err.message);
      
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setStoredStatus(userId, "audio", "denied");
        setStoredStatus(userId, "video", "denied");
        // Используем реальные ключи из словаря
        setError(`${t("perm.deniedTitle")}. ${t("perm.deniedHint")}`);
      } else if (err.name === "NotFoundError") {
        // Устройства физически отсутствуют
        setError(`${t("common.error")}: ${t("permHelp.mic")} / ${t("permHelp.camera")}`);
      } else {
        // Другие ошибки (например, блокировка на уровне ОС)
        setError(`${t("common.error")}: ${err.message || t("common.unknownError")}`);
      }
    } finally {
      setRequesting(false);
    }
  }, [t]);

  useEffect(() => {
    if (PUBLIC_PAGES.some((p) => pathname?.startsWith(p))) return;

    const active = getActiveAccount();
    const userId = active?.userId ?? "anon";

    const audioStatus = getStoredStatus(userId, "audio");
    const videoStatus = getStoredStatus(userId, "video");

    if (audioStatus === "granted" && videoStatus === "granted") return;

    const handleFirstInteraction = () => {
      setShow(true);
      document.removeEventListener("click", handleFirstInteraction);
      document.removeEventListener("touchstart", handleFirstInteraction);
      document.removeEventListener("keydown", handleFirstInteraction);
    };

    document.addEventListener("click", handleFirstInteraction);
    document.addEventListener("touchstart", handleFirstInteraction);
    document.addEventListener("keydown", handleFirstInteraction);

    return () => {
      document.removeEventListener("click", handleFirstInteraction);
      document.removeEventListener("touchstart", handleFirstInteraction);
      document.removeEventListener("keydown", handleFirstInteraction);
    };
  }, [pathname]);

  function handleDeny() {
    const active = getActiveAccount();
    const userId = active?.userId ?? "anon";
    
    setStoredStatus(userId, "audio", "denied");
    setStoredStatus(userId, "video", "denied");
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={handleDeny} />
      
      <div className="relative w-full max-w-sm bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="flex items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-[#8b5cf6]/15 flex items-center justify-center">
              <Mic size={26} className="text-[#8b5cf6]" />
            </div>
            <div className="w-14 h-14 rounded-2xl bg-blue-500/15 flex items-center justify-center">
              <Video size={26} className="text-blue-600 dark:text-blue-400" />
            </div>
          </div>

          <h2 className="text-lg font-black text-gray-900 dark:text-white">
            {t("perm.title")}
          </h2>

          <p className="text-sm text-gray-600 dark:text-white/50 leading-relaxed">
            {t("perm.hint")}
          </p>

          {error && (
            <div className="flex items-start gap-2 w-full bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-left">
              <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-600 dark:text-red-400 font-medium leading-snug">
                {error}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2 w-full mt-2">
            <Button
              loading={requesting}
              onClick={requestMediaPermissions}
              disabled={requesting}
              className="w-full"
            >
              {requesting ? t("common.requesting") : t("perm.allow")}
            </Button>
            
            <Button 
              variant="secondary" 
              onClick={handleDeny} 
              disabled={requesting} 
              className="w-full"
            >
              {t("common.notNow")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}