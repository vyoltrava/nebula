// components/VideoNoteRecorder.tsx
"use client";

import { useRef, useState, useEffect } from "react";
import {
  Square, X, Mic, MicOff, Minimize2, Maximize2,
  RefreshCw, FlipHorizontal, Send, Trash2,
} from "lucide-react";

interface Props {
  onRecorded: (file: File) => void;
  onCancel: () => void;
  maxDuration?: number;
}

export function VideoNoteRecorder({ onRecorded, onCancel, maxDuration = 60 }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const cancelRef = useRef(false);

  const [isRecording, setIsRecording] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const [isMinimized, setIsMinimized] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [isMirrored, setIsMirrored] = useState(true);
  const [isSwitching, setIsSwitching] = useState(false);

  const [hasRecording, setHasRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const recordedBlobRef = useRef<Blob | null>(null);

  // Инициализация камеры
  useEffect(() => {
    startCamera(facingMode);
    return () => {
      cancelRef.current = true;
      cleanupResources();
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


    // 🔄 ФИКС ЧЁРНОГО ЭКРАНА: при сворачивании/разворачивании/выходе из предпросмотра
  // <video> пересоздаётся, а стрим оставался на уничтоженном элементе.
  // Эффект повторно вешает стрим на живой элемент.
  useEffect(() => {
    const v = videoRef.current;
    if (v && streamRef.current && v.srcObject !== streamRef.current) {
      v.srcObject = streamRef.current;
      v.play().catch(() => {});
    }
  }, [isMinimized, hasRecording]);

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
    const next = facingMode === "user" ? "environment" : "user";
    setFacingMode(next);
    setIsMirrored(next === "user");
    try { await startCamera(next); } finally { setIsSwitching(false); }
  }

  function toggleMirror() { setIsMirrored((p) => !p); }

  function toggleMute() {
    if (!streamRef.current) return;
    streamRef.current.getAudioTracks().forEach((t) => (t.enabled = isMuted));
    setIsMuted(!isMuted);
  }

  function startRecording() {
    if (!streamRef.current) return;
    cancelRef.current = false;
    chunksRef.current = [];

    const recorder = new MediaRecorder(streamRef.current, {
      mimeType: "video/webm;codecs=vp8,opus",
    });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      if (cancelRef.current) {
        cancelRef.current = false;
        return;
      }
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      recordedBlobRef.current = blob;
      const url = URL.createObjectURL(blob);
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
      setRecordedUrl(url);
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
          // Авто-стоп → сразу отправляем (как в TG)
          autoSend();
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

  function autoSend() {
    // Останавливаем запись, но флаг cancel не ставим → onstop создаст blob
    // Затем сразу отправляем
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
    // Небольшая задержка, чтобы onstop успел отработать
    setTimeout(() => confirmSend(), 150);
  }

  function confirmSend() {
    const blob = recordedBlobRef.current;
    if (!blob) return;
    const file = new File([blob], `video-note-${Date.now()}.webm`, { type: "video/webm" });
    cleanupResources();
    if (recordedUrl) { URL.revokeObjectURL(recordedUrl); setRecordedUrl(null); }
    recordedBlobRef.current = null;
    setHasRecording(false);
    onRecorded(file);
  }

  function retake() {
    if (recordedUrl) { URL.revokeObjectURL(recordedUrl); setRecordedUrl(null); }
    recordedBlobRef.current = null;
    setHasRecording(false);
    setSeconds(0);
    chunksRef.current = [];
  }

  function cleanupResources() {
    if (mediaRecorderRef.current?.state === "recording") {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    mediaRecorderRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
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

  // SVG-кольцо прогресса (для орба и фуллскрина)
  function ProgressRing({ size, stroke, glow = false }: { size: number; stroke: number; glow?: boolean }) {
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - progress / 100);
    return (
      <svg
        className="absolute inset-0 pointer-events-none"
        width={size} height={size}
        style={{ transform: "rotate(-90deg)" }}
      >
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke="#8b5cf6"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-linear"
          style={glow ? { filter: "drop-shadow(0 0 6px #8b5cf6)" } : undefined}
        />
      </svg>
    );
  }

  const glassBtn =
    "flex items-center justify-center rounded-full bg-black/40 backdrop-blur-md border border-line dark:border-white/15 text-gray-800 dark:text-white/85 hover:bg-white/15 hover:text-gray-900 dark:text-white active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all";

  // ===================== СВЁРНУТЫЙ РЕЖИМ (ORB) =====================
  if (isMinimized) {
    const orbSize = 72; // мобила
    return (
      <div className="fixed bottom-6 right-4 sm:right-6 z-[300] flex items-end gap-2 pointer-events-none">
        {/* Орб */}
        <div
          className="relative pointer-events-auto cursor-pointer active:scale-95 transition-transform"
          style={{ width: orbSize, height: orbSize }}
          onClick={() => setIsMinimized(false)}
          title="Развернуть"
        >
          {/* Пульсация при записи */}
          {isRecording && (
            <span className="absolute inset-0 rounded-full bg-[#8b5cf6]/40 animate-ping" />
          )}

          {/* Кольцо прогресса */}
          {isRecording && <ProgressRing size={orbSize} stroke={3} glow />}

          {/* Видео-превью (квадрат, обрезанный в круг) */}
          <div className="absolute inset-[3px] rounded-full overflow-hidden bg-black ring-1 ring-white/10">
            {hasRecording && recordedUrl ? (
              <video src={recordedUrl} autoPlay loop muted playsInline className="w-full h-full object-cover" />
            ) : (
              <video
                ref={videoRef}
                autoPlay playsInline muted
                className="w-full h-full object-cover"
                style={{ transform: isMirrored ? "scaleX(-1)" : "none" }}
              />
            )}
          </div>

          {/* Красная точка записи */}
          {isRecording && (
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-[#0a0a0a] animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
          )}

          {/* Готово — галочка */}
          {hasRecording && !isRecording && (
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-[#0a0a0a] flex items-center justify-center">
              <span className="text-[8px] text-gray-900 dark:text-white font-black">✓</span>
            </span>
          )}
        </div>

        {/* Таймер рядом с орбом */}
        {(isRecording || hasRecording) && (
          <div className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-line dark:border-white/10 self-center">
            {isRecording && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
            <span className="text-xs font-mono font-bold text-gray-900 dark:text-white tabular-nums">
              {formatTime(seconds)}
            </span>
          </div>
        )}

        {/* Компактные кнопки */}
        <div className="pointer-events-auto flex flex-col gap-1.5">
          {hasRecording ? (
            <>
              <button onClick={confirmSend} className={`${glassBtn} w-10 h-10 bg-[#8b5cf6]/80 border-[#8b5cf6]/50 text-white`} title="Отправить">
                <Send size={15} />
              </button>
              <button onClick={retake} className={`${glassBtn} w-10 h-10`} title="Перезаписать">
                <Trash2 size={15} />
              </button>
            </>
          ) : isRecording ? (
            <button onClick={stopRecording} className={`${glassBtn} w-10 h-10 bg-red-500/70 border-red-400/50 text-white`} title="Стоп">
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={startRecording}
              disabled={!isCameraReady}
              className={`${glassBtn} w-10 h-10 bg-[#8b5cf6]/70 border-[#8b5cf6]/50 text-white`}
              title="Запись"
            >
              <div className="w-3 h-3 rounded-full bg-white" />
            </button>
          )}
          <button onClick={() => setIsMinimized(false)} className={`${glassBtn} w-10 h-10`} title="Развернуть">
            <Maximize2 size={15} />
          </button>
          <button
            onClick={() => { cancelRef.current = true; cleanupResources(); onCancel(); }}
            className={`${glassBtn} w-10 h-10 border-red-500/30 text-red-600 dark:text-red-300 hover:bg-red-500/20`}
            title="Закрыть"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    );
  }

  // ===================== ПОЛНОЭКРАННЫЙ РЕЖИМ =====================
  // Квадрат адаптивный: min(92vw, 92vh, 480px) — всегда квадрат на любом экране
  const squareSize = "min(92vw, 82vh, 480px)";

  return (
    <div className="fixed inset-0 z-[300] bg-black/95 backdrop-blur-sm flex items-center justify-center p-4 overflow-hidden">
      <div className="relative flex flex-col items-center" style={{ width: squareSize }}>

        {/* ===== Квадратное видео с кольцом ===== */}
        <div className="relative w-full aspect-square">
          {/* Внешнее светящееся кольцо-прогресс (только при записи) */}
          {isRecording && (
            <div className="absolute -inset-3 sm:-inset-4 pointer-events-none">
              <ProgressRing size={0} stroke={0} />
              {/* Используем отдельный SVG на весь контейнер */}
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)", filter: "drop-shadow(0 0 8px #8b5cf6)" }}>
                <rect x="2" y="2" width="96" height="96" rx="20" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                <rect
                  x="2" y="2" width="96" height="96" rx="20"
                  fill="none" stroke="#8b5cf6" strokeWidth="1.2" strokeLinecap="round"
                  strokeDasharray={2 * (96 + 96)}
                  strokeDashoffset={2 * (96 + 96) * (1 - progress / 100)}
                  className="transition-all duration-1000 ease-linear"
                />
              </svg>
            </div>
          )}

          {/* Видео-контейнер (ВСЕГДА квадрат благодаря aspect-square у родителя) */}
          <div className="relative w-full h-full rounded-[28px] overflow-hidden bg-black ring-1 ring-white/10 shadow-[0_0_60px_rgba(139,92,246,0.25)]">
            {hasRecording && recordedUrl ? (
              <video
                ref={previewRef}
                src={recordedUrl}
                autoPlay loop playsInline muted
                className="w-full h-full object-cover"
                style={{ transform: isMirrored ? "scaleX(-1)" : "none" }}
              />
            ) : (
              <video
                ref={videoRef}
                autoPlay playsInline muted
                className="w-full h-full object-cover"
                style={{ transform: isMirrored ? "scaleX(-1)" : "none" }}
              />
            )}

            {/* Верхний градиент + таймер */}
            {(isRecording || hasRecording) && (
              <div className="absolute top-0 left-0 right-0 p-4 sm:p-5 bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
                <div className="flex items-center justify-center gap-2">
                  {isRecording && (
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.9)]" />
                  )}
                  <span className="text-base sm:text-lg font-mono font-bold text-gray-900 dark:text-white tabular-nums">
                    {formatTime(seconds)}
                  </span>
                  <span className="text-sm font-mono text-gray-500 dark:text-white/40">/ {formatTime(maxDuration)}</span>
                </div>
              </div>
            )}

            {/* Подсказка когда не пишем */}
            {!isRecording && !hasRecording && isCameraReady && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="text-gray-500 dark:text-white/30 text-sm font-medium px-6 text-center">
                  Нажми кнопку ниже для записи
                </p>
              </div>
            )}

            {/* Нижний градиент под кнопки */}
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
          </div>
        </div>

        {/* ===== Панель кнопок под квадратом ===== */}
        <div className="mt-6 sm:mt-8 w-full flex items-center justify-between gap-3 px-2">

          {/* ЛЕВО: доп. действия */}
          <div className="flex items-center gap-2">
            {hasRecording ? (
              <button onClick={retake} className={`${glassBtn} w-12 h-12 sm:w-14 sm:h-14`} title="Перезаписать">
                <Trash2 size={20} />
              </button>
            ) : (
              <>
                <button onClick={toggleMirror} disabled={isRecording} className={`${glassBtn} w-11 h-11 sm:w-12 sm:h-12`} title="Зеркало">
                  <FlipHorizontal size={18} />
                </button>
                <button onClick={switchCamera} disabled={isRecording || isSwitching} className={`${glassBtn} w-11 h-11 sm:w-12 sm:h-12`} title="Сменить камеру">
                  <RefreshCw size={18} className={isSwitching ? "animate-spin" : ""} />
                </button>
                <button onClick={toggleMute} disabled={isRecording && false} className={`${glassBtn} w-11 h-11 sm:w-12 sm:h-12 hidden sm:flex`} title="Микрофон">
                  {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
                </button>
              </>
            )}
          </div>

          {/* ЦЕНТР: главная кнопка */}
          <div className="flex items-center justify-center">
            {hasRecording ? (
              <button
                onClick={confirmSend}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#8b5cf6] hover:bg-[#7c3aed] text-white flex items-center justify-center shadow-[0_0_30px_rgba(139,92,246,0.7)] ring-4 ring-[#8b5cf6]/30 active:scale-90 transition-all"
                title="Отправить"
              >
                <Send size={26} />
              </button>
            ) : isRecording ? (
              <button
                onClick={stopRecording}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-[0_0_30px_rgba(239,68,68,0.6)] ring-4 ring-red-500/30 active:scale-90 transition-all relative"
                title="Стоп"
              >
                <span className="absolute inset-0 rounded-full border-2 border-red-600 dark:border-red-300 animate-ping opacity-50" />
                <Square size={26} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={startRecording}
                disabled={!isCameraReady}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gray-100 dark:bg-white/10 hover:bg-gray-100 dark:hover:bg-white/20 border-[3px] border-white flex items-center justify-center active:scale-90 transition-all disabled:opacity-40 group"
                title="Запись"
              >
                <span className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[#8b5cf6] group-hover:scale-95 transition-transform shadow-[0_0_20px_rgba(139,92,246,0.6)]" />
              </button>
            )}
          </div>

          {/* ПРАВО: свернуть / закрыть */}
          <div className="flex items-center gap-2">
            {!hasRecording && (
              <button onClick={() => setIsMinimized(true)} className={`${glassBtn} w-11 h-11 sm:w-12 sm:h-12`} title="Свернуть в орб">
                <Minimize2 size={18} />
              </button>
            )}
            <button
              onClick={() => { cancelRef.current = true; cleanupResources(); onCancel(); }}
              className={`${glassBtn} w-11 h-11 sm:w-12 sm:h-12 border-red-500/30 text-red-600 dark:text-red-300 hover:bg-red-500/20`}
              title="Отмена"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Подпись */}
        <p className="mt-4 text-center text-[11px] text-gray-500 dark:text-white/30 px-4">
          {hasRecording
            ? "Пересмотри и отправь, либо перезапиши"
            : isRecording
            ? "Можно свернуть в орб — чат останется доступен"
            : "Видео-кружок · лимит " + formatTime(maxDuration)}
        </p>
      </div>
    </div>
  );
}