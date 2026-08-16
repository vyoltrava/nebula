"use client";
import { useEffect, useState } from "react";
import { Mic, Video, RefreshCw, CheckCircle2, XCircle, HelpCircle, AlertTriangle } from "lucide-react";
import { useDevicePermission } from "@/lib/useDevicePermission";
import type { PermStatus } from "@/lib/useDevicePermission";

const STATUS_CONFIG: Record<PermStatus, { label: string; color: string; icon: any }> = {
  granted: { label: "granted", color: "text-emerald-400", icon: CheckCircle2 },
  denied: { label: "denied", color: "text-red-400", icon: XCircle },
  prompt: { label: "not requested", color: "text-amber-400", icon: HelpCircle },
  unknown: { label: "unknown", color: "text-white/40", icon: HelpCircle },
};

function PermissionRow({
  kind,
  icon: Icon,
  title,
  description,
  isLast = false,
}: {
  kind: "microphone" | "camera";
  icon: any;
  title: string;
  description: string;
  isLast?: boolean;
}) {
  const { status, request, refresh } = useDevicePermission(kind);
  const [requesting, setRequesting] = useState(false);
  const cfg = STATUS_CONFIG[status];
  const StatusIcon = cfg.icon;

  async function handleEnable() {
    setRequesting(true);
    await request();
    setRequesting(false);
  }

  return (
    <div className={`flex items-center justify-between gap-4 py-5 ${!isLast ? "border-b border-white/10" : ""}`}>
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Icon size={16} className={kind === "microphone" ? "text-rose-400" : "text-sky-400"} />
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.25em] text-white/40 mb-1">{title}</p>
          <p className="text-xs text-white/55 truncate">{description}</p>
          <div className={`flex items-center gap-1.5 mt-1.5 ${cfg.color}`}>
            <StatusIcon size={11} />
            <span className="text-[9px] uppercase tracking-[0.25em] font-semibold">{cfg.label}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {status !== "granted" && (
          <button
            onClick={handleEnable}
            disabled={requesting}
            className="uppercase text-[10px] tracking-[0.25em] border border-[#a855f7]/50 text-[#c084fc] hover:bg-[#a855f7] hover:text-black px-3 py-1.5 transition-all disabled:opacity-40"
          >
            {requesting ? "..." : "+ enable"}
          </button>
        )}
        <button
          onClick={refresh}
          className="w-7 h-7 flex items-center justify-center text-white/30 hover:text-white hover:border-white/30 border border-transparent transition-colors"
          title="refresh"
        >
          <RefreshCw size={12} />
        </button>
      </div>
    </div>
  );
}

function PermissionDeniedHint() {
  const mic = useDevicePermission("microphone");
  const cam = useDevicePermission("camera");
  const hasDenied = mic.status === "denied" || cam.status === "denied";

  if (!hasDenied) return null;

  return (
    <div className="flex items-start gap-3 pt-4 mt-2 border-t border-amber-500/20">
      <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
      <div className="text-[11px] text-white/50 leading-relaxed">
        <p className="text-[10px] uppercase tracking-[0.25em] text-amber-400/80 mb-1.5 font-semibold">access revoked</p>
        <p>
          если кнопка «+ enable» не помогает — нажми на 🔒 в адресной строке → «настройки сайта» → разреши доступ вручную.
        </p>
      </div>
    </div>
  );
}

export function DevicePermissionsSection() {
  return (
    <div>
      <PermissionRow
        kind="microphone"
        icon={Mic}
        title="microphone"
        description="voice messages"
      />
      <PermissionRow
        kind="camera"
        icon={Video}
        title="camera"
        description="video bubbles"
        isLast
      />
      <PermissionDeniedHint />
    </div>
  );
}