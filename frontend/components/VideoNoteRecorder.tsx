// components/VideoNoteRecorder.tsx
"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { X, Mic, MicOff, RefreshCcw, Maximize2, Square, Minimize2 } from "lucide-react";

interface Props {
  mode?: "expanded" | "minimized";
  onRecorded: (file: File) => void;
  onCancel: () => void;
  onMinimize?: () => void;
  onExpand?: () => void;
  onDenied?: () => void;
  maxDuration?: number;
}

type FacingMode = "user" | "environment";

export function VideoNoteRecorder({
  mode = "expanded",
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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const facingRef = useRef<FacingMode>("user");

  const [isRecording, setIsRecording] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [mirrored, setMirrored] = useState(true);
  const [canSwitchCamera, setCanSwitchCamera] = useState(false);
  const [showHint, setShowHint] = useState(true);

  const cleanupResources = useCallback(() => {
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
  }, []);

  const startCamera = useCallback(async (nextMode: FacingMode = "user") => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: nextMode },
          width: { ideal: 720 },
          height: { ideal: 720 },
          aspectRatio: { ideal: 1 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      facingRef.current = nextMode;
      setMirrored(nextMode === "user");
      setIsCameraReady(true);

      const devices = await navigator.mediaDevices.enumerateDevices();
      setCanSwitchCamera(devices.filter((d) => d.kind === "videoinput").length > 1);
    } catch {
      onDenied?.();
      onCancel();
    }
  }, [onCancel, onDenied]);

  useEffect(() => {
    mountedRef.current = true;
    startCamera("user");
    const hintTimer = setTimeout(() => setShowHint(false), 2500);
    return () => {
      mountedRef.current = false;
      clearTimeout(hintTimer);
      cleanupResources();
    };
  }, [startCamera, cleanupResources]);

  const toggleMirror = useCallback(() => setMirrored((v) => !v), []);
  
  const switchCamera = useCallback(async () => {
    if (isRecording || !canSwitchCamera) return;
    const next: FacingMode = facingRef.current === "user" ? "environment" : "user";
    await startCamera(next);
  }, [isRecording, canSwitchCamera, startCamera]);

  const toggleMute = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = isMuted;
      });
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startRecording = useCallback(() => {
    if (!streamRef.current || isRecording) return;
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
  }, [isRecording, maxDuration, onRecorded, cleanupResources, stopRecording]);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const progress = maxDuration > 0 ? Math.min((seconds / maxDuration) * 100, 100) : 0;

  // ==================== MINIMIZED BAR ====================
  if (mode === "minimized") {
    return (
      <div className="fixed bottom-4 left-3 right-3 z-[300] md:left-auto md:right-5 md:w-[420px]">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0a0a0a]/95 p-2.5 shadow-2xl backdrop-blur-xl">
          {/* Превью камеры */}
          <button
            type="button"
            onClick={toggleMirror}
            className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-black ring-2 ring-white/10 active:scale-95 transition"
          >
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="h-full w-full object-cover"
              style={{ transform: mirrored ? "scaleX(-1)" : undefined }}
            />
            {isRecording && (
              <span className="absolute left-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            )}
          </button>

          {/* Таймер + прогресс */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-white tabular-nums">
                {formatTime(seconds)}
              </span>
              <span className="text-xs text-white/30">/ {formatTime(maxDuration)}</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
              <div 
                className="h-full bg-red-500 transition-all duration-200" 
                style={{ width: `${progress}%` }} 
              />
            </div>
          </div>

          {/* Кнопки управления */}
          <div className="flex items-center gap-1">
            {/* Смена камеры */}
            {canSwitchCamera && !isRecording && (
              <button
                onClick={switchCamera}
                className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white transition"
                title="Сменить камеру"
              >
                <RefreshCcw size={16} />
              </button>
            )}

            {/* Развернуть */}
            {onExpand && (
              <button
                onClick={onExpand}
                className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white transition"
                title="Развернуть"
              >
                <Maximize2 size={16} />
              </button>
            )}

            {/* Запись / Стоп */}
            {!isRecording ? (
              <button
                onClick={startRecording}
                disabled={!isCameraReady}
                className="rounded-xl bg-[#8b5cf6] px-3 py-2 text-xs font-semibold text-white active:scale-95 disabled:opacity-40 transition"
              >
                Запись
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="flex items-center gap-1.5 rounded-xl bg-red-500 px-3 py-2 text-xs font-semibold text-white active:scale-95 transition"
              >
                <Square size={10} fill="currentColor" />
                Стоп
              </button>
            )}

            {/* Отмена */}
            <button
              onClick={() => { cleanupResources(); onCancel(); }}
              className="rounded-lg p-2 text-white/40 hover:bg-red-500/10 hover:text-red-400 transition"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==================== EXPANDED ====================
  return (
    <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-black/95 backdrop-blur-sm">
      
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 pt-5 pb-2">
        <button
          onClick={() => { cleanupResources(); onCancel(); }}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white/70 backdrop-blur-md transition hover:bg-white/10 hover:text-white active:scale-95"
        >
          <X size={20} />
        </button>

        {isRecording && (
          <div className="flex items-center gap-2 rounded-full bg-red-500/10 px-4 py-1.5 backdrop-blur-md border border-red-500/20">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            <span className="font-mono text-sm font-semibold text-red-400 tabular-nums">
              {formatTime(seconds)}
            </span>
            <span className="text-xs text-red-400/50 font-mono">
              / {formatTime(maxDuration)}
            </span>
          </div>
        )}

        {onMinimize && (
          <button
            onClick={onMinimize}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white/70 backdrop-blur-md transition hover:bg-white/10 hover:text-white active:scale-95"
            title="Свернуть"
          >
            <Minimize2 size={20} />
          </button>
        )}
      </div>

      {/* Video Square */}
      <div className="relative">
        <div 
          className={`
            relative w-[340px] h-[340px] sm:w-[400px] sm:h-[400px] 
            rounded-3xl overflow-hidden bg-[#0a0a0a] shadow-2xl
            transition-all duration-300
            ${isRecording 
              ? "ring-[2.5px] ring-red-500 shadow-red-500/20" 
              : "ring-1 ring-white/10 hover:ring-violet-500/40"
            }
          `}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover cursor-pointer transition-transform duration-200 active:scale-[0.98]"
            style={{ transform: mirrored ? "scaleX(-1)" : undefined }}
            onClick={toggleMirror}
          />

          {/* Hint */}
          {showHint && !isRecording && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-black/60 backdrop-blur-md rounded-full px-4 py-2 text-xs text-white/60 font-medium border border-white/5 animate-pulse">
                Нажмите для зеркала
              </div>
            </div>
          )}

          {/* Timer inside video */}
          {isRecording && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-black/60 backdrop-blur-md px-3.5 py-1.5 border border-white/10">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              <span className="font-mono text-sm font-bold text-white tabular-nums">
                {formatTime(seconds)}
              </span>
            </div>
          )}

          {/* Corner controls */}
          <div className="absolute top-3 right-3 flex flex-col gap-2">
            {canSwitchCamera && (
              <button
                onClick={(e) => { e.stopPropagation(); switchCamera(); }}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-md transition hover:bg-white/10 hover:text-white active:scale-90 border border-white/10"
                title="Сменить камеру"
              >
                <RefreshCcw size={15} />
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); toggleMute(); }}
              className={`
                flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-md transition active:scale-90 border
                ${isMuted 
                  ? "bg-red-500/20 text-red-400 border-red-500/30" 
                  : "bg-black/50 text-white/80 border-white/10 hover:bg-white/10 hover:text-white"
                }
              `}
              title={isMuted ? "Включить звук" : "Выключить звук"}
            >
              {isMuted ? <MicOff size={15} /> : <Mic size={15} />}
            </button>
          </div>

          {/* Progress bar */}
          {isRecording && (
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/10">
              <div className="h-full bg-red-500 transition-all duration-200 ease-linear" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>

        {/* Mirror label */}
        {mirrored && !isRecording && (
          <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[10px] font-medium tracking-[0.2em] text-white/25 uppercase">
            Зеркало
          </div>
        )}
      </div>

      {/* Record button */}
      <div className="mt-10 flex items-center justify-center">
        {!isRecording ? (
          <button
            onClick={startRecording}
            disabled={!isCameraReady}
            className="group relative flex h-[72px] w-[72px] items-center justify-center rounded-full transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <div className="absolute inset-0 rounded-full bg-[#8b5cf6] opacity-20 blur-lg transition group-hover:opacity-35" />
            <div className="relative flex h-[72px] w-[72px] items-center justify-center rounded-full border-[2.5px] border-[#8b5cf6] bg-[#8b5cf6]/10 transition group-hover:bg-[#8b5cf6]/20">
              <div className="h-7 w-7 rounded-full bg-[#8b5cf6] shadow-lg shadow-[#8b5cf6]/50 transition group-hover:scale-110" />
            </div>
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="group relative flex h-[72px] w-[72px] items-center justify-center rounded-full transition-all active:scale-95"
          >
            <div className="absolute inset-0 rounded-full bg-red-500 opacity-20 blur-lg animate-pulse" />
            <div className="relative flex h-[72px] w-[72px] items-center justify-center rounded-full border-[2.5px] border-red-500 bg-red-500/10">
              <div className="h-6 w-6 rounded-[3px] bg-red-500 shadow-lg shadow-red-500/50" />
            </div>
          </button>
        )}
      </div>

      {/* Bottom caption */}
      <div className="mt-6 text-center">
        <p className="text-white/20 text-xs font-medium tracking-wide">
          {isRecording 
            ? "Запись видео-кружка" 
            : isCameraReady 
              ? "Нажмите кнопку для записи" 
              : "Инициализация камеры..."}
        </p>
      </div>
    </div>
  );
}