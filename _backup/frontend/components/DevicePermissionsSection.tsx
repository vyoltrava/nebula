"use client";
import { useState } from "react";
import { Mic, Video, RefreshCw, CheckCircle2, XCircle, HelpCircle, AlertTriangle, Loader2 } from "lucide-react";
import { useDevicePermission } from "@/lib/useDevicePermission";
import type { PermStatus } from "@/lib/useDevicePermission";

const STATUS_CONFIG: Record<PermStatus, { label: string; color: string; bg: string; border: string; icon: any }> = {
  granted: { label: "Разрешено", color: "text-[#2ECC71]", bg: "bg-[#2ECC71]/15", border: "border-[#2ECC71]/30", icon: CheckCircle2 },
  denied: { label: "Запрещено", color: "text-[#E74C3C]", bg: "bg-[#E74C3C]/15", border: "border-[#E74C3C]/30", icon: XCircle },
  prompt: { label: "Не запрошено", color: "text-[#F39C12]", bg: "bg-[#F39C12]/15", border: "border-[#F39C12]/30", icon: HelpCircle },
  unknown: { label: "Неизвестно", color: "text-[#B9B8BD]", bg: "bg-white/5", border: "border-white/10", icon: HelpCircle },
};

function PermissionRow({
  kind,
  icon: Icon,
  iconColor,
  title,
  description,
  isLast = false,
}: {
  kind: "microphone" | "camera";
  icon: any;
  iconColor: string;
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
    <div className={`p-4 rounded-lg bg-white/5 border border-white/10 ${!isLast ? "mb-3" : ""}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
            <Icon size={18} className={iconColor} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">{title}</p>
            <p className="text-xs text-[#B9B8BD] mt-0.5">{description}</p>
            <div className={`inline-flex items-center gap-1.5 mt-2 px-2 py-0.5 rounded-md ${cfg.bg} ${cfg.border} border`}>
              <StatusIcon size={11} className={cfg.color} />
              <span className={`text-[11px] font-medium ${cfg.color}`}>{cfg.label}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {status !== "granted" && (
            <button
              onClick={handleEnable}
              disabled={requesting}
              className="border border-[#7B3FF2]/60 text-[#a678f7] hover:bg-[#7B3FF2]/10 text-sm font-medium rounded-lg px-4 py-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {requesting ? <Loader2 size={14} className="animate-spin" /> : null}
              {requesting ? "Запрос..." : "Включить"}
            </button>
          )}
          <button
            onClick={refresh}
            className="w-10 h-10 shrink-0 rounded-lg border border-white/10 text-[#B9B8BD] hover:text-white hover:bg-white/5 flex items-center justify-center transition-colors"
            title="Обновить"
          >
            <RefreshCw size={15} />
          </button>
        </div>
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
    <div className="mt-3 p-4 rounded-lg bg-[#E74C3C]/5 border border-[#E74C3C]/30">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-[#E74C3C]/15 flex items-center justify-center shrink-0">
          <AlertTriangle size={18} className="text-[#E74C3C]" />
        </div>
        <div>
          <p className="text-sm font-medium text-[#E74C3C]">Доступ отклонён</p>
          <p className="text-xs text-[#B9B8BD] mt-1 leading-relaxed">
            Если кнопка «Включить» не помогает — нажмите на 🔒 в адресной строке → «Настройки сайта» → разрешите доступ вручную.
          </p>
        </div>
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
        iconColor="text-[#FB7185]"
        title="Микрофон"
        description="Голосовые сообщения"
      />
      <PermissionRow
        kind="camera"
        icon={Video}
        iconColor="text-[#38BDF8]"
        title="Камера"
        description="Видеосообщения"
        isLast
      />
      <PermissionDeniedHint />
    </div>
  );
}