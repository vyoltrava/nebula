"use client";
import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";
import { Mic, Video } from "lucide-react";

// Страницы где НЕ показываем PermissionGate
const PUBLIC_PAGES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/messages/", // в чатах свои проверки
];

// 🍏 Детекция iOS (включая iPad на iOS 13+ который притворяется Mac)
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

// 🔥 Тихий прогрев разрешений (без UI)
async function silentWarmup() {
  try {
    // Прогреваем микрофон
    const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioStream.getTracks().forEach((t) => t.stop());

    // iOS нужна небольшая пауза между запросами
    await new Promise((r) => setTimeout(r, 150));

    // Прогреваем камеру
    const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
    videoStream.getTracks().forEach((t) => t.stop());

    console.log("[PermissionGate] 🔥 Warm-up complete");
  } catch (err) {
    console.log("[PermissionGate] Warm-up failed:", err);
  }
}

export function PermissionGate() {
  const [show, setShow] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const pathname = usePathname();
  const warmedUpRef = useRef(false); // чтобы прогреть только 1 раз

  useEffect(() => {
    // ❌ Не показываем на публичных страницах
    if (PUBLIC_PAGES.some((p) => pathname?.startsWith(p))) return;

    const wasRequested = localStorage.getItem("app_perm_requested");

    // 🍏 iOS WARM-UP: если разрешения уже давали — делаем тихий прогрев
    if (wasRequested) {
      const handleWarmup = () => {
        if (warmedUpRef.current) return;
        warmedUpRef.current = true;

        document.removeEventListener("click", handleWarmup);
        document.removeEventListener("touchstart", handleWarmup);
        document.removeEventListener("keydown", handleWarmup);

        // Прогреваем только на iOS (на других ОС разрешения и так живут)
        if (isIOS()) {
          silentWarmup();
        }
      };

      document.addEventListener("click", handleWarmup);
      document.addEventListener("touchstart", handleWarmup);
      document.addEventListener("keydown", handleWarmup);

      return () => {
        document.removeEventListener("click", handleWarmup);
        document.removeEventListener("touchstart", handleWarmup);
        document.removeEventListener("keydown", handleWarmup);
      };
    }

    // 🆕 Если разрешения ещё не запрашивали — показываем модалку по первому клику
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

  async function handleAllow() {
    setRequesting(true);
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStream.getTracks().forEach((t) => t.stop());

      await new Promise((r) => setTimeout(r, 150));

      const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoStream.getTracks().forEach((t) => t.stop());
    } catch (err) {
      console.log("Permission denied:", err);
    }
    localStorage.setItem("app_perm_requested", "true");
    setShow(false);
    setRequesting(false);
  }

  function handleDeny() {
    localStorage.setItem("app_perm_requested", "true");
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm bg-[#1f1f23] border border-white/15 rounded-2xl p-6 shadow-2xl">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="flex items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-[#8b5cf6]/15 flex items-center justify-center">
              <Mic size={26} className="text-[#8b5cf6]" />
            </div>
            <div className="w-14 h-14 rounded-2xl bg-blue-500/15 flex items-center justify-center">
              <Video size={26} className="text-blue-400" />
            </div>
          </div>

          <h2 className="text-lg font-black text-white">
            Доступ к микрофону и камере
          </h2>

          <p className="text-sm text-white/50 leading-relaxed">
            Для записи голосовых сообщений и видеокружков нужен доступ
            к микрофону и камере. Разрешение запрашивается один раз.
          </p>

          <div className="flex flex-col gap-2 w-full mt-2">
            <button
              onClick={handleAllow}
              disabled={requesting}
              className="w-full py-3 rounded-xl bg-[#8b5cf6] text-white font-bold text-sm hover:bg-[#7c3aed] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {requesting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Запрашиваем...
                </>
              ) : (
                "Разрешить доступ"
              )}
            </button>
            <button
              onClick={handleDeny}
              disabled={requesting}
              className="w-full py-3 rounded-xl bg-white/5 text-white/60 font-bold text-sm hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              Не сейчас
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}