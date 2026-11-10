"use client";

import { useState, useSyncExternalStore } from "react";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { Button } from "@/components/ui/Button";
import { Download, ArrowDown } from "lucide-react";
import type { MessageKey } from "@/lib/i18n";

type Platform = "windows" | "linux" | "android" | "ios" | "macos" | "other";

const DETECTED_PLATFORM_KEYS: Record<Platform, MessageKey> = {
  windows: "download.detectedWindows",
  linux: "download.detectedLinux",
  android: "download.detectedAndroid",
  ios: "download.detectedIos",
  macos: "download.detectedOther",
  other: "download.detectedOther",
};

interface Release {
  platform: string;
  filename: string;
  size: string;
  url: string;
}

const RELEASES: { [key: string]: Release[] } = {
  windows: [
    {
      platform: "Windows",
      filename: "trelod-Setup-1.0.0.exe",
      size: "~50 MB",
      url: "/desktop/trelod-Setup-1.0.0.exe",
    },
  ],
  linux: [
    {
      platform: "Linux (.AppImage)",
      filename: "trelod-1.0.0-x86_64.AppImage",
      size: "~55 MB",
      url: "/desktop/trelod-1.0.0-x86_64.AppImage",
    },
    {
      platform: "Linux (.deb)",
      filename: "trelod-1.0.0.deb",
      size: "~55 MB",
      url: "/desktop/trelod-1.0.0.deb",
    },
    {
      platform: "Linux (.rpm)",
      filename: "trelod-1.0.0.rpm",
      size: "~55 MB",
      url: "/desktop/trelod-1.0.0.rpm",
    },
    {
      platform: "Linux (Arch)",
      filename: "makepkg -si",
      size: "Build from AUR",
      url: "https://aur.archlinux.org/packages/trelod-desktop",
    },
  ],
  android: [
    {
      platform: "Android",
      filename: "trelod.apk",
      size: "~60 MB",
      url: "/android/trelod.apk",
    },
  ],
};

function detectPlatform(): Platform {
  if (typeof window === "undefined") return "other";
  const userAgent = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const isiOS = /iPhone|iPad|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
  if (isiOS) return "ios";
  if (/android/i.test(userAgent)) return "android";
  if (/win32|windows/i.test(platform)) return "windows";
  if (/linux/i.test(platform)) return "linux";
  if (/macintosh|macintel/i.test(platform)) return "macos";
  return "other";
}

const subscribeToPlatform = () => () => {};
const getPlatformSnapshot = () => detectPlatform();
const getServerPlatformSnapshot = (): Platform => "other";

export default function DownloadPage() {
  const { t } = useI18n();
  const detectedPlatform = useSyncExternalStore(
    subscribeToPlatform,
    getPlatformSnapshot,
    getServerPlatformSnapshot
  );
  const [platformOverride, setPlatformOverride] = useState<Platform | null>(null);
  const platform = platformOverride ?? detectedPlatform;
  const filtered = RELEASES[platform as keyof typeof RELEASES] || [];
  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold mb-2">{t("download.title")}</h1>
          <p className="text-lg text-[#B9B8BD]">{t("download.subtitle")}</p>
        </div>
        {platform !== "other" ? (
          <div className="mb-6 p-4 rounded-lg border border-line dark:border-white/15" style={{ backgroundColor: "#1E1E23" }}>
            <p className="text-sm font-medium text-[#8b5cf6]">
              {t("download.detected", { platform: t(DETECTED_PLATFORM_KEYS[platform]) })}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 mb-8">
            <h2 className="text-sm font-medium mb-2">{t("download.otherPlatforms")}</h2>
            {Object.values(RELEASES).flat().map((release) => (
              <div key={release.platform} className="p-3 rounded-lg border border-line dark:border-white/10 hover:border-purple-500/30 transition-colors">
                <div className="flex items-center gap-3 mb-2">
                  <Download className="w-4 h-4" />
                  <span className="font-medium">{release.platform}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-400">
                  <span>{release.filename}</span>
                  <span>{release.size}</span>
                </div>
                <a href={release.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 transition-colors">
                  {t("download.download")}
                </a>
              </div>
            ))}
          </div>
        )}
        {platform === "ios" || platform === "macos" || platform === "other" ? (
          <div className="mb-6 p-4 rounded-lg border border-line dark:border-white/15" style={{ backgroundColor: "#1E1E23" }}>
            <p className="text-base">{t("download.iosPwaNotice")}</p>
            <div className="mt-4 text-center"><Button onClick={() => window.open("https://trelod.app", "_blank")} variant="secondary" className="w-auto px-4">{t("download.iosPwaButton")}</Button></div>
          </div>
        ) : platform === "android" ? (
          <div className="mb-6 p-4 rounded-lg border border-line dark:border-white/15" style={{ backgroundColor: "#1E1E23" }}>
            <h2 className="text-base font-medium mb-3">{t("download.detectedAndroid")}</h2>
            <p>{t("download.download", { version: "1.0.0", size: "~60 MB" })}</p>
            <a href="/android/trelod.apk" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 transition-colors w-full">{t("download.download")}</a>
            <p className="mt-3 text-sm text-gray-400">Auto-updates from update.json</p>
          </div>
        ) : platform === "linux" ? (
          <div className="space-y-4"><h2 className="text-base font-medium">{t("download.detectedLinux")}</h2>{filtered.map((release) => (
            <div key={release.platform} className="p-3 rounded-lg border border-line dark:border-white/10 hover:border-purple-500/30 transition-colors">
              <div className="flex items-center gap-3 mb-2"><Download className="w-4 h-4" /><span className="font-medium">{release.platform}</span></div>
              <div className="flex justify-between text-sm text-gray-400"><span>{release.filename}</span><span>{release.size}</span></div>
              <a href={release.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 transition-colors w-full">{t("download.download")}</a>
            </div>
          ))}
          {t("download.archInstructions")}
          <a href="https://aur.archlinux.org/packages/trelod-desktop" target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 transition-colors w-full">{t("download.otherPlatforms")}</a>
        </div>) : platform === "windows" ? (
          <div className="mb-6 p-4 rounded-lg border border-line dark:border-white/15" style={{ backgroundColor: "#1E1E23" }}>
            <h2 className="text-base font-medium">{t("download.detectedWindows")}</h2>
            <p>{t("download.download", { version: "1.0.0", size: "~50 MB" })}</p>
            <a href="/desktop/trelod-Setup-1.0.0.exe" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 transition-colors w-full">{t("download.download")}</a>
          </div>
        ) : null}
        {platform !== "other" && (
          <div className="mt-6 text-center"><button type="button" onClick={() => setPlatformOverride("other")} className="inline-flex items-center gap-2 text-purple-400 hover:text-white transition-colors text-sm">{t("download.otherPlatforms")}<ArrowDown className="w-3 h-3" /></button></div>
        )}
      </div>
    </div>
  );
}