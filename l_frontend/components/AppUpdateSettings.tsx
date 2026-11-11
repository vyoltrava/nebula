"use client";

import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import {
  applyPwaUpdate,
  checkApkUpdate,
  checkPwaUpdate,
  installUpdate,
  isDesktopApp,
  isNativeApp,
  isPwaStandalone,
  supportsNativeUpdate,
  type ApkUpdateInfo,
} from "@/lib/appUpdate";
import { Button } from "@/components/ui/Button";

type AppEnvironment = "browser" | "native" | "desktop" | "pwa";

export function AppUpdateSettings({ onDownload }: { onDownload: () => void }) {
  const { t } = useI18n();
  const [environment, setEnvironment] = useState<AppEnvironment | null>(null);
  const [busy, setBusy] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<ApkUpdateInfo | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (isDesktopApp()) setEnvironment("desktop");
      else if (isNativeApp() && supportsNativeUpdate()) setEnvironment("native");
      else if (isNativeApp()) setEnvironment("pwa");
      else if (isPwaStandalone()) setEnvironment("pwa");
      else setEnvironment("browser");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const checkForUpdates = async () => {
    setBusy(true);
    setStatus(null);
    setUpdateAvailable(false);
    setUpdateInfo(null);
    try {
      if (environment === "pwa") {
        const available = await checkPwaUpdate();
        setUpdateAvailable(available);
        setStatus(t(available ? "download.updateAvailable" : "download.upToDate"));
      } else {
        const info = await checkApkUpdate();
        setUpdateInfo(info);
        if (info.error) {
          console.error("App update check failed:", info.error);
          setStatus(t("download.updateFailed"));
        } else {
          setUpdateAvailable(info.available);
          setStatus(t(info.available ? "download.updateAvailable" : "download.upToDate"));
        }
      }
    } catch (error) {
      console.error("App update check failed:", error);
      setStatus(t("download.updateFailed"));
    } finally {
      setBusy(false);
    }
  };

  const applyUpdate = async () => {
    if (environment === "pwa") {
      setBusy(true);
      setStatus(t("download.applyingUpdate"));
      try {
        await applyPwaUpdate();
      } catch (error) {
        console.error("Failed to apply PWA update:", error);
        setStatus(t("download.updateFailed"));
        setBusy(false);
      }
      return;
    }

    if (!updateInfo?.apkUrl) return;
    setBusy(true);
    setStatus(t("download.checkingUpdates"));
    try {
      const result = await installUpdate(updateInfo.apkUrl);
      if (!result.ok) {
        console.error("Failed to install app update:", result.error);
        setStatus(t("download.updateFailed"));
      } else {
        setStatus(result.message || t("download.updateStarted"));
      }
    } catch (error) {
      console.error("Failed to install app update:", error);
      setStatus(t("download.updateFailed"));
    } finally {
      setBusy(false);
    }
  };

  if (environment === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-white/50">
        <RefreshCw size={16} className="animate-spin" />
        {t("common.loading")}
      </div>
    );
  }

  if (environment === "browser") {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">{t("download.title")}</h3>
        <p className="text-sm text-[#B9B8BD]">{t("download.subtitle")}</p>
        <Button icon={Download} onClick={onDownload}>
          {t("download.download")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">{t("download.appSettingsTitle")}</h3>
      <p className="text-sm text-gray-500 dark:text-white/50">{t("download.appSettingsSubtitle")}</p>
      {status && (
        <p role="status" aria-live="polite" className="text-sm text-gray-600 dark:text-white/70">
          {status}
        </p>
      )}
      {updateInfo?.available && (
        <p className="text-xs text-gray-500 dark:text-white/40">
          v{updateInfo.currentVersion} → v{updateInfo.latestVersion}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={checkForUpdates}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg border border-[#7B3FF2]/60 px-4 py-2.5 text-sm font-medium text-violet-600 transition-colors hover:bg-[#7B3FF2]/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-[#a678f7]"
        >
          <RefreshCw size={16} className={busy ? "animate-spin" : ""} />
          {busy ? t("download.checkingUpdates") : t("download.checkUpdates")}
        </button>
        {updateAvailable && (
          <button
            type="button"
            onClick={applyUpdate}
            disabled={busy || (environment !== "pwa" && !updateInfo?.apkUrl)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#7B3FF2] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#6a34d3] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={16} />
            {t("download.updateNow")}
          </button>
        )}
      </div>
    </div>
  );
}
