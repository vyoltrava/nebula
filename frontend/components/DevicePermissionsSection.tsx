"use client";
"use client";
import { useEffect, useState } from "react";  // ← useState добавлен
import { Mic, Video, RefreshCw, CheckCircle2, XCircle, HelpCircle, AlertTriangle } from "lucide-react";
import { useDevicePermission } from "@/lib/useDevicePermission";
import type { PermStatus } from "@/lib/useDevicePermission";

// Конфигурация отображения статусов
const STATUS_CONFIG: Record<PermStatus, { label: string; color: string; icon: any }> = {
  granted: { label: "Разрешён", color: "text-green-400", icon: CheckCircle2 },
  denied: { label: "Запрещён", color: "text-red-400", icon: XCircle },
  prompt: { label: "Не запрошен", color: "text-yellow-400", icon: HelpCircle },
  unknown: { label: "Неизвестно", color: "text-white/40", icon: HelpCircle },
};

function PermissionRow({
  kind,
  icon: Icon,
  iconColor,
  title,
  description,
}: {
  kind: "microphone" | "camera";
  icon: any;
  iconColor: string;
  title: string;
  description: string;
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
    <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
      {/* Иконка устройства */}
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
        kind === "microphone" ? "bg-red-500/15" : "bg-blue-500/15"
      }`}>
        <Icon size={18} className={iconColor} />
      </div>

      {/* Информация */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white">{title}</p>
        <p className="text-[11px] text-white/40 truncate">{description}</p>
        <div className={`flex items-center gap-1 mt-1 text-[11px] font-semibold ${cfg.color}`}>
          <StatusIcon size={12} />
          {cfg.label}
        </div>
      </div>

      {/* Кнопки действий */}
      <div className="flex items-center gap-1.5 shrink-0">
        {status !== "granted" && (
          <button
            onClick={handleEnable}
            disabled={requesting}
            className="px-3 py-1.5 rounded-lg bg-[#8b5cf6] text-white text-xs font-bold hover:bg-[#7c3aed] transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {requesting ? (
              <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              "Включить"
            )}
          </button>
        )}
        <button
          onClick={refresh}
          className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          title="Обновить статус"
        >
          <RefreshCw size={14} />
        </button>
      </div>
    </div>
  );
}

export function DevicePermissionsSection() {
  return (
    <div className="bg-[#1f1f23] border border-white/10 rounded-2xl overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-white/10">
        <h2 className="font-bold text-white flex items-center gap-2">
          <Mic size={16} className="text-[#8b5cf6]" />
          Разрешения устройства
        </h2>
        <p className="text-xs text-white/40 mt-0.5">
          Доступ к микрофону и камере для голосовых и видео-сообщений
        </p>
      </div>

      <div className="p-4 sm:p-5 space-y-3">
        <PermissionRow
          kind="microphone"
          icon={Mic}
          iconColor="text-red-400"
          title="Микрофон"
          description="Голосовые сообщения"
        />
        <PermissionRow
          kind="camera"
          icon={Video}
          iconColor="text-blue-400"
          title="Камера"
          description="Видео-кружки"
        />

        {/* Подсказка если что-то запрещено */}
        <PermissionDeniedHint />
      </div>
    </div>
  );
}

// Подсказка показывается только если есть denied статус
function PermissionDeniedHint() {
  const mic = useDevicePermission("microphone");
  const cam = useDevicePermission("camera");
  const hasDenied = mic.status === "denied" || cam.status === "denied";

  if (!hasDenied) return null;

  return (
    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
      <AlertTriangle size={15} className="text-yellow-400 shrink-0 mt-0.5" />
      <div className="text-[11px] text-yellow-200/80 leading-relaxed">
        <p className="font-bold text-yellow-300 mb-1">Разрешение было отозвано</p>
        <p>
          Если кнопка «Включить» не помогает — открой настройки сайта:
          нажми на иконку 🔒 в адресной строке → «Настройки сайта» →
          разреши доступ вручную, затем вернись сюда.
        </p>
      </div>
    </div>
  );
}