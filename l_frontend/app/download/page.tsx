"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  Apple,
  ArrowDown,
  ArrowLeft,
  ArrowUpRight,
  Download,
  Laptop,
  Monitor,
  Smartphone,
  Terminal,
} from "lucide-react";
import { BrandIcon } from "@/components/BrandIcon";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import type { MessageKey } from "@/lib/i18n";

type Platform = "windows" | "linux" | "android" | "ios" | "macos" | "other";
type DownloadablePlatform = Extract<Platform, "windows" | "linux" | "android">;

interface Release {
  platform: string;
  filename: string;
  size: string;
  url: string;
}

const DETECTED_PLATFORM_KEYS: Record<Platform, MessageKey> = {
  windows: "download.detectedWindows",
  linux: "download.detectedLinux",
  android: "download.detectedAndroid",
  ios: "download.detectedIos",
  macos: "download.detectedOther",
  other: "download.detectedOther",
};

const RELEASES: Record<DownloadablePlatform, Release[]> = {
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
      platform: "AppImage",
      filename: "trelod-1.0.0.AppImage",
      size: "~103 MB",
      url: "https://github.com/vyoltrava/nebula/releases/download/v1.0.0/trelod-1.0.0.AppImage",
    },
  ],
  android: [
    {
      platform: "Android",
      filename: "app-release.apk",
      size: "~60 MB",
      url: "/apk/app-release.apk",
    },
  ],
};

const PLATFORMS: { id: Platform; title: string; icon: typeof Monitor }[] = [
  { id: "windows", title: "Windows", icon: Monitor },
  { id: "linux", title: "Linux", icon: Terminal },
  { id: "android", title: "Android", icon: Smartphone },
  { id: "ios", title: "iPhone / iPad", icon: Apple },
  { id: "macos", title: "macOS", icon: Laptop },
];

function detectPlatform(): Platform {
  if (typeof window === "undefined") return "other";
  const userAgent = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const isiOS = /iPhone|iPad|iPod/.test(userAgent) || (platform === "MacIntel" && navigator.maxTouchPoints > 1);
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
  const selectedReleasePlatform: DownloadablePlatform | null =
    platform === "windows" || platform === "linux" || platform === "android" ? platform : null;
  const releases = selectedReleasePlatform ? RELEASES[selectedReleasePlatform] : [];
  const isPwaPlatform = platform === "ios" || platform === "macos" || platform === "other";
  const hasDetectedPlatform = platformOverride === null && platform !== "other";

  return (
    <main className="min-h-screen bg-paper text-gray-900 dark:bg-[#171717] dark:text-white">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <header className="mb-8 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 transition-colors hover:text-gray-900 dark:text-white/60 dark:hover:text-white">
            <ArrowLeft size={17} />
            <span className="hidden sm:inline">{t("common.back")}</span>
            <BrandIcon className="h-7 w-7" />
            <span className="font-logo text-2xl text-[#3D1F6D] dark:text-[#8b5cf6]">trelod</span>
          </Link>
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-ivory px-3 py-1.5 text-xs font-semibold text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-white/60">
            <Download size={14} className="text-[#8b5cf6]" />
            {t("download.download")}
          </span>
        </header>

        <section className="relative mb-8 overflow-hidden rounded-3xl border border-[#8b5cf6]/20 bg-ivory p-6 shadow-sm dark:border-white/10 dark:bg-[#1e1e23] sm:p-10">
          <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-[#8b5cf6]/10 blur-3xl" />
          <div className="relative grid items-center gap-8 md:grid-cols-[1fr_auto]">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#8b5cf6]/10 px-3 py-1.5 text-xs font-bold text-[#7040c0] dark:text-[#b69aff]">
                <BrandIcon className="h-4 w-4" />
                TRELOD DESKTOP & MOBILE
              </div>
              <h1 className="mb-3 text-3xl font-black tracking-tight sm:text-5xl">{t("download.title")}</h1>
              <p className="max-w-xl text-sm leading-6 text-gray-600 dark:text-white/55 sm:text-base">
                {t("download.subtitle")}
              </p>
            </div>
            <div className="hidden h-36 w-36 items-center justify-center rounded-[2rem] border border-[#8b5cf6]/15 bg-[#8b5cf6]/5 sm:flex">
              <BrandIcon className="h-24 w-24" />
            </div>
          </div>
        </section>

        {hasDetectedPlatform && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#8b5cf6]/20 bg-[#8b5cf6]/[0.06] px-4 py-3 dark:bg-[#8b5cf6]/10">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {t("download.detected", { platform: t(DETECTED_PLATFORM_KEYS[platform]) })}
            </div>
            <button type="button" onClick={() => setPlatformOverride("other")} className="text-xs font-semibold text-[#7040c0] hover:underline dark:text-[#b69aff]">
              {t("download.otherPlatforms")}
            </button>
          </div>
        )}

        {selectedReleasePlatform && (
          <section className="mb-10">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">{t(DETECTED_PLATFORM_KEYS[platform])}</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-white/45">{t("download.subtitle")}</p>
              </div>
              <span className="rounded-full bg-gray-200/70 px-3 py-1 text-xs font-bold text-gray-600 dark:bg-white/5 dark:text-white/50">
                {t("download.formatCount", { n: releases.length })}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {releases.map((release, index) => {
                const PlatformIcon = selectedReleasePlatform === "windows"
                  ? Monitor
                  : selectedReleasePlatform === "linux"
                    ? Terminal
                    : Smartphone;
                return (
                  <article key={release.filename} className={`group flex flex-col rounded-2xl border bg-ivory p-5 transition-all hover:-translate-y-0.5 hover:border-[#8b5cf6]/35 hover:shadow-lg hover:shadow-[#8b5cf6]/[0.06] dark:bg-[#1e1e23] ${index === 0 ? "border-[#8b5cf6]/35" : "border-line dark:border-white/10"}`}>
                    <div className="mb-5 flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#8b5cf6]/10 text-[#7040c0] dark:text-[#b69aff]">
                          <PlatformIcon size={22} />
                        </span>
                        <div>
                          <h3 className="font-bold">{release.platform}</h3>
                          <p className="mt-0.5 text-xs text-gray-500 dark:text-white/45">{release.size}</p>
                        </div>
                      </div>
                      {index === 0 && (
                        <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                          {t("download.install")}
                        </span>
                      )}
                    </div>
                    <p className="mb-4 flex-1 break-all rounded-lg bg-gray-100 px-3 py-2 font-mono text-xs text-gray-600 dark:bg-white/[0.04] dark:text-white/55">
                      {release.filename}
                    </p>
                    <a
                      href={release.url}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#8b5cf6] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#7c3aed]"
                    >
                      <Download size={17} />
                      {t("download.download")}
                    </a>
                  </article>
                );
              })}
            </div>
            {platform === "linux" && (
              <div className="mt-3 space-y-3">
                <p className="rounded-xl border border-line bg-ivory px-4 py-3 text-sm text-gray-600 dark:border-white/10 dark:bg-[#1e1e23] dark:text-white/55">
                  {t("download.archInstructions")}
                </p>
                <div className="rounded-xl border border-line bg-ivory px-4 py-3 dark:border-white/10 dark:bg-[#1e1e23]">
                  <p className="mb-2 text-sm font-semibold text-gray-700 dark:text-white/70">
                    {t("download.linuxTerminalCommand")}
                  </p>
                  <code className="block overflow-x-auto whitespace-nowrap rounded-lg bg-gray-100 px-3 py-2 font-mono text-xs text-gray-700 dark:bg-white/[0.04] dark:text-white/70">
                    {`curl -fL '${RELEASES.linux[0].url}' -o trelod.AppImage && chmod +x trelod.AppImage && ./trelod.AppImage`}
                  </code>
                </div>
              </div>
            )}
          </section>
        )}

        {isPwaPlatform && (
          <section className="mb-10 flex flex-col gap-5 rounded-2xl border border-line bg-ivory p-5 dark:border-white/10 dark:bg-[#1e1e23] sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#8b5cf6]/10 text-[#7040c0] dark:text-[#b69aff]">
                {platform === "ios" ? <Apple size={24} /> : platform === "macos" ? <Laptop size={24} /> : <Monitor size={24} />}
              </span>
              <div>
                <h2 className="font-bold">{platform === "macos" ? "macOS" : platform === "ios" ? "iPhone / iPad" : t("download.detectedOther")}</h2>
                <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-white/55">
                  {platform === "ios" ? t("download.iosPwaNotice") : t("download.pwaNotice")}
                </p>
              </div>
            </div>
            <Link href="/" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#8b5cf6]/30 px-4 py-2.5 text-sm font-bold text-[#7040c0] transition-colors hover:bg-[#8b5cf6]/10 dark:text-[#b69aff]">
              <ArrowUpRight size={17} />
              {t("download.iosPwaButton")}
            </Link>
          </section>
        )}

        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">{t("download.otherPlatforms")}</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-white/45">{t("download.subtitle")}</p>
            </div>
            {platformOverride === "other" && (
              <button type="button" onClick={() => setPlatformOverride(null)} className="inline-flex items-center gap-1 text-xs font-semibold text-[#7040c0] hover:underline dark:text-[#b69aff]">
                <ArrowDown size={14} className="rotate-180" />
                {t(DETECTED_PLATFORM_KEYS[detectedPlatform])}
              </button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PLATFORMS.map(({ id, title, icon: PlatformIcon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setPlatformOverride(id)}
                aria-pressed={platform === id}
                className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${platform === id ? "border-[#8b5cf6]/50 bg-[#8b5cf6]/[0.07] shadow-sm" : "border-line bg-ivory hover:border-[#8b5cf6]/30 dark:border-white/10 dark:bg-[#1e1e23]"}`}
              >
                <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${platform === id ? "bg-[#8b5cf6]/15 text-[#7040c0] dark:text-[#b69aff]" : "bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-white/55"}`}>
                  <PlatformIcon size={22} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{title}</span>
                  <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-white/45">
                    {id === "linux"
                      ? t("download.packageCount", { n: RELEASES.linux.length })
                      : id === "ios" || id === "macos"
                        ? t("download.webApp")
                        : RELEASES[id as DownloadablePlatform][0]?.size}
                  </span>
                </span>
                <ArrowUpRight size={16} className="shrink-0 text-gray-400 dark:text-white/30" />
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
