"use client";
import { X, Mic, Video } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";

interface Props {
  device: "microphone" | "camera";
  onClose: () => void;
}

export function PermissionHelpModal({ device, onClose }: Props) {
  const isMic = device === "microphone";
  return (
    <>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[250]" onClick={onClose} />
      <div className="fixed inset-0 z-[251] flex items-center justify-center p-4 pointer-events-none">
        <div className="w-full max-w-sm border border-white/15 rounded-2xl bg-[#1f1f23] shadow-2xl p-5 pointer-events-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {isMic ? <Mic className="text-red-400" size={18} /> : <Video className="text-blue-400" size={18} />}
              <h3 className="font-bold text-white text-sm">
                Нет доступа: {isMic ? "микрофон" : "камера"}
              </h3>
            </div>
            <IconButton icon={X} size="iconSm" onClick={onClose} />
          </div>

          <p className="text-xs text-white/60 mb-3">
            Браузер запретил доступ. Разреши его вручную:
          </p>

          <div className="space-y-2 text-xs text-white/80">
            <div className="p-2.5 rounded-lg bg-white/5 border border-white/10">
              💻 <b>ПК:</b> иконка замка 🔒 слева от адресной строки → «Настройки сайта» → включи «{isMic ? "Микрофон" : "Камера"}» → обнови страницу
            </div>
            <div className="p-2.5 rounded-lg bg-white/5 border border-white/10">
              🤖 <b>Android (Chrome):</b> ⋮ → «Настройки сайта» → Разрешения → разреши
            </div>
            <div className="p-2.5 rounded-lg bg-white/5 border border-white/10">
              🍏 <b>iOS (Safari):</b> кнопка «аА» → «Настройки сайта» → включи доступ
            </div>
          </div>

          <Button variant="primary" className="mt-4 w-full" onClick={onClose}>
            Понятно
          </Button>
        </div>
      </div>
    </>
  );
}