// components/VideoNoteRecorder.tsx
"use client";

import { useRef, useState, useEffect } from "react";
import {
  Square,
  X,
  Mic,
  MicOff,
  Minimize2,
  Maximize2,
  RefreshCw,
  FlipHorizontal,
  Send,
  Trash2,
} from "lucide-react";

interface Props {
  onRecorded: (file: File) => void;
  onCancel: () => void;
  maxDuration?: number;
}

export function VideoNoteRecorder({ onRecorded, onCancel, maxDuration = 60 }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [hasRecording, setHasRecording] = useState(false); // Записанное видео готово к предпросмотру
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);

  const [isMinimized, setIsMinimized] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [isMirrored, setIsMirrored] = useState(true);
  const [isSwitching, setIsSwitching] = useState(false);

  useEffect(() => {
    startCamera(facingMode);
    return () => cleanupResources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCamera(mode: "user" | "environment") {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 720 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setIsCameraReady(true);
    } catch (e) {
      console.error("Camera error", e);
      alert("Нет доступа к камере");
      onCancel();
    }
  }

  async function switchCamera() {
    if (isRecording || isSwitching || hasRecording) return;
    setIsSwitching(true);
    const nextMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(nextMode);
    setIsMirrored(nextMode === "user");
    await startCamera(nextMode);
    setIsSwitching(false);
  }

  function toggleMirror() {
    setIsMirrored((prev) => !prev);
  }

  function toggleMute() {
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach((t) => (t.enabled = isMuted));
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
      // НЕ отправляем сразу — показываем предпросмотр
      setRecordedBlob(blob);
      setHasRecording(true);
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    };

    recorder.start();
    setIsRecording(true);
    setSeconds(0);
    timerRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= maxDuration) {
          // Авто-стоп при достижении лимита → сразу отправляем (как в TG)
          stopAndSend();
          return maxDuration;
        }
        return s + 1;
      });
    }, 1000);
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }

  function stopAndSend() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  function confirmSend() {
    if (!recordedBlob) return;
    const file = new File([recordedBlob], `video-note-${Date.now()}.webm`, { type: "video/webm" });
    cleanupResources();
    setRecordedBlob(null);
    setHasRecording(false);
    onRecorded(file);
  }

  function retake() {
    setRecordedBlob(null);
    setHasRecording(false);
    setSeconds(0);
    chunksRef.current = [];
  }

  function cleanupResources() {
    if (mediaRecorderRef.current?.state === "recording") {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    mediaRecorderRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
    setSeconds(0);
  }

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const progress = Math.min((seconds / maxDuration) * 100, 100);

  const btnBase = "flex items-center justify-center rounded-full transition-all active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed";

  return (
    <div
      className={`fixed z-[300] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
        isMinimized
          ? "bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-md pointer-events-auto"
          : "inset-0 bg-black/95 backdrop-blur-sm flex items-center justify-center p-4"
      }`}
    >
      <div
        className={`relative overflow-hidden transition-all duration-500 bg-[#0a0a0a] border border-white/10 shadow-2xl shadow-purple-900/30 ${
          isMinimized
            ? "rounded-3xl h-20 flex items-center px-3 gap-3 w-full"
            : // ✅ ЖЁСТКИЙ КВАДРАТ на мобиле, на десктопе чуть крупнее но тоже квадрат
              "rounded-[32px] w-full max-w-[min(92vw,92vh,480px)] aspect-square"
        }`}
      >
        {/* ============ ВИДЕО (всегда заполняет весь квадрат) ============ */}
        <div className={`relative overflow-hidden transition-all duration-500 ${
          isMinimized ? "w-16 h-16 rounded-2xl shrink-0" : "absolute inset-0"
        }`}>
          {hasRecording && recordedBlob ? (
            // Предпросмотр записанного видео
            <video
              src={URL.createObjectURL(recordedBlob)}
              controls
              autoPlay
              loop
              playsInline
              className="w-full h-full object-cover"
              style={{ transform: isMirrored ? "scaleX(-1)" : "none" }}
            />
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: isMirrored ? "scaleX(-1)" : "none" }}
            />
          )}

          {/* ========== ОВЕРЛЕЙ С ИНДИКАТОРАМИ (только в полном режиме) ========== */}
          {!isMinimized && isRecording && (
            <>
              {/* Верхний индикатор записи */}
              <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/60 to-transparent pointer-events-none">
                <div className="flex items-center justify-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.8)]" />
                  <span className="text-sm font-mono font-bold text-white tabular-nums">
                    {formatTime(seconds)}
                  </span>
                  <span className="text-sm font-mono text-white/50">/ {formatTime(maxDuration)}</span>
                </div>
              </div>

              {/* Круговой прогресс по краю видео */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100">
                <rect
                  x="1" y="1" width="98" height="98"
                  rx="7"
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="0.5"
                />
                <rect
                  x="1" y="1" width="98" height="98"
                  rx="7"
                  fill="none"
                  stroke="#8b5cf6"
                  strokeWidth="0.8"
                  strokeLinecap="round"
                  strokeDasharray={2 * (98 + 98)}
                  strokeDashoffset={2 * (98 + 98) * (1 - progress / 100)}
                  className="transition-all duration-1000 ease-linear"
                  style={{ filter: "drop-shadow(0 0 4px #8b5cf6)" }}
                />
              </svg>
            </>
          )}

          {/* ========== НИЖНИЕ КНОПКИ УПРАВЛЕНИЯ (поверх видео) ========== */}
          {!isMinimized && (
            <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none">
              <div className="flex items-center justify-between pointer-events-auto">
                {/* ЛЕВО: Отмена или Зеркало */}
                <div className="flex items-center gap-2">
                  {hasRecording ? (
                    <button
                      onClick={() => { retake(); }}
                      className={`${btnBase} w-12 h-12 bg-black/40 backdrop-blur-md border border-white/20 text-white/90 hover:bg-red-500/30 hover:border-red-400/50`}
                      title="Перезаписать"
                    >
                      <Trash2 size={20} />
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={toggleMirror}
                        disabled={isRecording || hasRecording}
                        className={`${btnBase} w-11 h-11 bg-black/40 backdrop-blur-md border border-white/10 text-white/80 hover:bg-white/10`}
                        title="Зеркало"
                      >
                        <FlipHorizontal size={18} />
                      </button>
                      <button
                        onClick={switchCamera}
                        disabled={isRecording || isSwitching || hasRecording}
                        className={`${btnBase} w-11 h-11 bg-black/40 backdrop-blur-md border border-white/10 text-white/80 hover:bg-white/10`}
                        title="Сменить камеру"
                      >
                        <RefreshCw size={18} className={isSwitching ? "animate-spin" : ""} />
                      </button>
                      <button
                        onClick={toggleMute}
                        disabled={hasRecording}
                        className={`${btnBase} w-11 h-11 bg-black/40 backdrop-blur-md border border-white/10 text-white/80 hover:bg-white/10`}
                        title="Микрофон"
                      >
                        {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
                      </button>
                    </>
                  )}
                </div>

                {/* ЦЕНТР: Главная кнопка */}
                <div className="flex items-center justify-center">
                  {hasRecording ? (
                    // После записи — кнопка ОТПРАВИТЬ
                    <button
                      onClick={confirmSend}
                      className={`${btnBase} w-16 h-16 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white shadow-[0_0_30px_rgba(139,92,246,0.6)] border-2 border-purple-300/30`}
                    >
                      <Send size={24} />
                    </button>
                  ) : isRecording ? (
                    // Стоп
                    <button
                      onClick={stopRecording}
                      className={`${btnBase} w-20 h-20 relative group`}
                    >
                      <div className="absolute inset-0 rounded-full border-[3px] border-red-400 animate-pulse" />
                      <div className="w-full h-full rounded-full bg-red-500 hover:bg-red-600 shadow-[0_0_20px_rgba(239,68,68,0.6)] flex items-center justify-center">
                        <Square size={24} fill="currentColor" />
                      </div>
                    </button>
                  ) : (
                    // Запись
                    <button
                      onClick={startRecording}
                      disabled={!isCameraReady}
                      className={`${btnBase} w-20 h-20 relative group`}
                    >
                      <div className="absolute inset-0 rounded-full border-[3px] border-white/60 group-hover:border-white transition-colors" />
                      <div className="w-14 h-14 rounded-full bg-white group-hover:scale-95 transition-transform" />
                    </button>
                  )}
                </div>

                {/* ПРАВО: Закрыть */}
                <div className="flex items-center gap-2">
                  {!hasRecording && (
                    <button
                      onClick={() => setIsMinimized(true)}
                      className={`${btnBase} w-11 h-11 bg-black/40 backdrop-blur-md border border-white/10 text-white/80 hover:bg-white/10`}
                      title="Свернуть"
                    >
                      <Minimize2 size={18} />
                    </button>
                  )}
                  <button
                    onClick={() => { cleanupResources(); onCancel(); }}
                    className={`${btnBase} w-11 h-11 bg-black/40 backdrop-blur-md border border-red-500/30 text-red-300 hover:bg-red-500/20`}
                    title="Отмена"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ============ СВЁРНУТЫЙ РЕЖИМ (панель справа от видео) ============ */}
        {isMinimized && (
          <div className="flex-1 flex items-center justify-between gap-2 min-w-0">
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold text-white truncate">
                {isRecording ? "🔴 Запись..." : hasRecording ? "✓ Готово" : "⏸ Пауза"}
              </span>
              <span className="text-[10px] text-white/50 uppercase tracking-wider font-mono tabular-nums">
                {isRecording ? formatTime(seconds) : hasRecording ? "Отправить?" : "Готов"}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {hasRecording ? (
                <>
                  <button
                    onClick={retake}
                    className={`${btnBase} w-9 h-9 bg-white/10 text-white/70 hover:bg-red-500/30 hover:text-red-300`}
                  >
                    <Trash2 size={14} />
                  </button>
                  <button
                    onClick={confirmSend}
                    className={`${btnBase} w-9 h-9 bg-[#8b5cf6] text-white shadow-lg shadow-purple-500/40`}
                  >
                    <Send size={14} />
                  </button>
                </>
              ) : isRecording ? (
                <button
                  onClick={stopRecording}
                  className={`${btnBase} w-9 h-9 bg-red-500 text-white shadow-lg shadow-red-500/40`}
                >
                  <Square size={12} fill="currentColor" />
                </button>
              ) : (
                <button
                  onClick={startRecording}
                  disabled={!isCameraReady}
                  className={`${btnBase} w-9 h-9 bg-[#8b5cf6] text-white`}
                >
                  <div className="w-3.5 h-3.5 rounded-full bg-white" />
                </button>
              )}
              <button
                onClick={() => setIsMinimized(false)}
                className={`${btnBase} w-9 h-9 bg-white/10 text-white/70 hover:bg-white/20 hover:text-white`}
              >
                <Maximize2 size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}