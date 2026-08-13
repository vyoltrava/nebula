"use client";
import { useRef, useState, useEffect } from "react";
import { Square, X, Mic, MicOff, Minimize2, Maximize2 } from "lucide-react";

interface Props {
  mode: 'expanded' | 'minimized';
  onRecorded: (file: File) => void;
  onCancel: () => void;
  onMinimize: () => void;
  onExpand?: () => void;
  onDenied?: () => void;
  maxDuration?: number;
}

export function VideoNoteRecorder({
  mode = 'expanded',
  onRecorded,
  onCancel,
  onMinimize,
  onExpand,
  onDenied,
  maxDuration = 60,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    startCamera();
    return () => cleanupResources();
  }, []);

  // Перепривязываем video элемент после смены режима
  useEffect(() => {
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [mode, isCameraReady]);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 720, height: 720 },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setIsCameraReady(true);
    } catch {
      if (onDenied) onDenied();
      else alert("Нет доступа к камере");
      onCancel();
    }
  }

  function toggleMute() {
    if (streamRef.current) {
      const audioTracks = streamRef.current.getAudioTracks();
      audioTracks.forEach((track) => { track.enabled = isMuted; });
      setIsMuted(!isMuted);
    }
  }

  function startRecording() {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const recorder = new MediaRecorder(streamRef.current, {
      mimeType: "video/webm;codecs=vp8,opus",
    });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const file = new File([blob], `video-note-${Date.now()}.webm`, { type: "video/webm" });
      cleanupResources();
      onRecorded(file);
    };

    recorder.start();
    setIsRecording(true);
    setSeconds(0);

    timerRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= maxDuration) stopRecording();
        return s + 1;
      });
    }, 1000);
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function cleanupResources() {
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      } catch {}
      mediaRecorderRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
    setSeconds(0);
    chunksRef.current = [];
  }

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const progress = maxDuration > 0 ? Math.min((seconds / maxDuration) * 100, 100) : 0;
  const perimeter = 2 * (94 + 94);

  // ============================================================
  // 🆕 МИНИМИЗИРОВАННЫЙ РЕЖИМ — плавающая панель
  // ============================================================
  if (mode === 'minimized') {
    return (
      <div className="fixed bottom-20 left-3 right-3 md:left-auto md:right-6 md:w-[480px] z-[60] bg-[#1f1f23]/95 backdrop-blur-md border border-white/15 rounded-2xl shadow-2xl shadow-black/60 p-3 animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center gap-3">
          {/* Превью видео */}
          <div className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-black ring-1 ring-white/10">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {isRecording && (
              <div className="absolute top-1 left-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            )}
          </div>

          {/* Инфо: таймер + прогресс */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5 mb-1">
              <span className="text-sm font-bold text-red-400 tabular-nums">
                {formatTime(seconds)}
              </span>
              <span className="text-[10px] text-white/40 tabular-nums">
                / {formatTime(maxDuration)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-red-500 transition-all duration-300 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Кнопки */}
          <div className="flex items-center gap-1.5 shrink-0">
            {onExpand && (
              <button
                onClick={onExpand}
                className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
                title="Развернуть"
              >
                <Maximize2 size={15} />
              </button>
            )}
            {isRecording ? (
              <button
                onClick={stopRecording}
                className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-bold hover:bg-red-600 active:scale-95 transition-all flex items-center gap-1"
              >
                <Square size={10} fill="currentColor" />
                Стоп
              </button>
            ) : isCameraReady ? (
              <button
                onClick={startRecording}
                className="px-3 py-1.5 rounded-lg bg-[#8b5cf6] text-white text-xs font-bold hover:bg-[#7c3aed] active:scale-95 transition-all flex items-center gap-1"
              >
                <div className="w-2 h-2 rounded-full bg-white" />
                Запись
              </button>
            ) : null}
            <button
              onClick={() => { cleanupResources(); onCancel(); }}
              className="p-2 rounded-lg text-white/50 hover:text-red-400 hover:bg-red-500/10 active:scale-95 transition-all"
              title="Отменить"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // EXPANDED РЕЖИМ — полноэкранная модалка
  // ============================================================
  return (
    <div className="fixed inset-0 z-[300] bg-black/95 flex items-center justify-center">
      <div className="relative flex flex-col items-center">
        <div className="relative w-[340px] h-[340px] sm:w-[440px] sm:h-[440px] rounded-2xl overflow-hidden bg-black shadow-2xl ring-1 ring-white/10">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />

          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100">
            <rect x="1.5" y="1.5" width="97" height="97" rx="10" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
            <rect
              x="1.5" y="1.5" width="97" height="97" rx="10"
              fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"
              strokeDasharray={perimeter}
              strokeDashoffset={perimeter * (1 - progress / 100)}
              className="transition-all duration-300 ease-linear"
            />
          </svg>

          {isRecording && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/70 backdrop-blur-sm rounded-full px-4 py-1.5 ring-1 ring-white/10">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white text-sm font-mono font-bold tabular-nums">
                {formatTime(seconds)}
              </span>
              <span className="text-white/40 text-xs font-mono">/ {formatTime(maxDuration)}</span>
            </div>
          )}

          {!isRecording && isCameraReady && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <p className="text-white/40 text-sm font-medium">Нажмите ● для записи</p>
                <p className="text-white/20 text-xs mt-1">Видео-квадрат 1:1</p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-center gap-8">
          {/* 🆕 Отмена (полный выход) */}
          <button
            onClick={() => { cleanupResources(); onCancel(); }}
            className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 transition-colors active:scale-95 flex items-center justify-center text-white/80"
            title="Отменить"
          >
            <X size={24} />
          </button>

          {!isRecording ? (
            <button
              onClick={() => { if (!isCameraReady) startCamera(); setTimeout(startRecording, 300); }}
              disabled={!isCameraReady}
              className="w-20 h-20 rounded-full bg-[#8b5cf6] hover:bg-[#7c3aed] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-lg shadow-[#8b5cf6]/30 ring-4 ring-[#8b5cf6]/20"
            >
              <div className="w-9 h-9 rounded-full border-[3px] border-white flex items-center justify-center">
                <div className="w-5 h-5 rounded-sm bg-white" />
              </div>
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 active:scale-95 transition-all flex items-center justify-center shadow-lg shadow-red-500/30 ring-4 ring-red-500/20"
            >
              <Square size={28} className="text-white" fill="white" />
            </button>
          )}

          {/* 🆕 Свернуть (вместо mute) */}
          <button
            onClick={onMinimize}
            className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 transition-colors active:scale-95 flex items-center justify-center text-white/80"
            title="Свернуть"
          >
            <Minimize2 size={22} />
          </button>
        </div>

        <div className="mt-4 text-center">
          <p className="text-white/30 text-xs font-medium">
            {isRecording
              ? `⏺ Запись ... ${formatTime(seconds)}`
              : isCameraReady
                ? "↓ Свернуть · ● Записать · ✕ Отменить"
                : "⏳ Загрузка камеры..."}
          </p>
        </div>
      </div>
    </div>
  );
}