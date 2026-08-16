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
  const cancelRecordingRef = useRef(false);

  const [isRecording, setIsRecording] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [isMirrored, setIsMirrored] = useState(true);
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);

  useEffect(() => {
    startCamera(facingMode);

    return () => {
      cancelRecordingRef.current = true;
      cleanupResources();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCamera(mode: "user" | "environment" = facingMode) {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 720 },
          height: { ideal: 720 },
        },
        audio: true,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setIsCameraReady(true);
    } catch {
      alert("Нет доступа к камере");
      onCancel();
    }
  }

  async function switchCamera() {
    if (isRecording || isSwitchingCamera) return;

    setIsSwitchingCamera(true);

    const nextMode = facingMode === "user" ? "environment" : "user";

    setFacingMode(nextMode);
    setIsMirrored(nextMode === "user");

    try {
      await startCamera(nextMode);
    } finally {
      setIsSwitchingCamera(false);
    }
  }

  function toggleMirror() {
    setIsMirrored((prev) => !prev);
  }

  function toggleMute() {
    if (streamRef.current) {
      const audioTracks = streamRef.current.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = isMuted;
      });
      setIsMuted(!isMuted);
    }
  }

  function startRecording() {
    if (!streamRef.current) return;

    cancelRecordingRef.current = false;
    chunksRef.current = [];

    const recorder = new MediaRecorder(streamRef.current, {
      mimeType: "video/webm;codecs=vp8,opus",
    });

    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      if (cancelRecordingRef.current) {
        cancelRecordingRef.current = false;
        return;
      }

      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const file = new File([blob], `video-note-${Date.now()}.webm`, {
        type: "video/webm",
      });

      cleanupResources();
      onRecorded(file);
    };

    recorder.start();
    setIsRecording(true);
    setSeconds(0);

    timerRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= maxDuration) {
          stopRecording();
        }
        return s + 1;
      });
    }, 1000);
  }

  function stopRecording() {
    cancelRecordingRef.current = false;

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

  const buttonBase =
    "flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/80 transition-all hover:border-[#8b5cf6]/40 hover:bg-[#8b5cf6]/10 hover:text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-35";

  return (
    <div
      className={`fixed z-[300] transition-all duration-300 ${
        isMinimized
          ? "bottom-24 md:bottom-6 left-4 right-4 mx-auto max-w-[430px] pointer-events-none"
          : "inset-0 flex items-center justify-center overflow-y-auto bg-[#050508]/95 p-4 backdrop-blur-md"
      }`}
    >
      <div
        className={`${
          isMinimized ? "pointer-events-auto" : "w-full max-w-[560px]"
        } overflow-hidden rounded-[28px] border border-[#8b5cf6]/20 bg-[#0b0b11]/95 shadow-[0_0_45px_rgba(139,92,246,0.22)] backdrop-blur-xl`}
      >
        <div className={isMinimized ? "flex items-center gap-3 p-2" : "p-4 sm:p-5"}>
          <div
            className={`relative overflow-hidden bg-black ${
              isMinimized
                ? "h-16 w-20 shrink-0 rounded-2xl"
                : "mx-auto aspect-square w-full max-w-[430px] rounded-[24px]"
            }`}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
              style={{ transform: isMirrored ? "scaleX(-1)" : "none" }}
            />

            <div className="pointer-events-none absolute inset-0 ring-1 ring-white/10" />

            {isRecording && !isMinimized && (
              <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/70 px-3 py-1.5 backdrop-blur-sm">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#8b5cf6]" />
                <span className="font-mono text-xs font-bold tabular-nums text-white">
                  {formatTime(seconds)}
                </span>
                <span className="font-mono text-[10px] text-white/40">
                  / {formatTime(maxDuration)}
                </span>
              </div>
            )}

            <div
              className={`absolute inset-x-0 bottom-0 h-[3px] bg-white/10 ${
                isRecording ? "" : "opacity-0"
              }`}
            >
              <div
                className="h-full bg-[#8b5cf6] transition-all duration-300 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div
            className={
              isMinimized
                ? "flex min-w-0 flex-1 items-center justify-between gap-2"
                : "mt-5"
            }
          >
            {isMinimized ? (
              <>
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-white">
                    {isRecording ? `Запись ${formatTime(seconds)}` : "Камера"}
                  </p>
                  <p className="truncate text-[10px] text-white/40">
                    {isRecording ? "идёт запись видео" : "превью камеры"}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => setIsMinimized(false)}
                    className={buttonBase}
                    title="Развернуть"
                  >
                    <Maximize2 size={17} />
                  </button>

                  {isRecording ? (
                    <button
                      onClick={stopRecording}
                      className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#8b5cf6] text-white transition-all hover:bg-[#7c3aed] active:scale-95"
                      title="Стоп"
                    >
                      <Square size={17} fill="currentColor" />
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        if (!isCameraReady) return;
                        startRecording();
                      }}
                      className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#8b5cf6] text-white transition-all hover:bg-[#7c3aed] active:scale-95"
                      title="Начать запись"
                    >
                      <div className="h-4 w-4 rounded-[4px] border-2 border-white bg-white/10" />
                    </button>
                  )}

                  <button
                    onClick={() => {
                      cancelRecordingRef.current = true;
                      cleanupResources();
                      onCancel();
                    }}
                    className={buttonBase}
                    title="Закрыть"
                  >
                    <X size={18} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-white">
                      {isRecording ? "Идёт запись видео" : "Видео-кружок"}
                    </p>
                    <p className="mt-0.5 text-xs text-white/40">
                      {isCameraReady
                        ? isRecording
                          ? `Осталось ${formatTime(Math.max(maxDuration - seconds, 0))}`
                          : "Минимализм, чёрно-фиолетовый режим"
                        : "Загрузка камеры..."}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs font-bold tabular-nums text-white/80">
                    {formatTime(seconds)} / {formatTime(maxDuration)}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-5 gap-2">
                  <button
                    onClick={() => {
                      cancelRecordingRef.current = true;
                      cleanupResources();
                      onCancel();
                    }}
                    className={buttonBase}
                    title="Отмена"
                  >
                    <X size={19} />
                  </button>

                  <button
                    onClick={toggleMute}
                    className={buttonBase}
                    title={isMuted ? "Включить звук" : "Выключить звук"}
                  >
                    {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
                  </button>

                  <button onClick={toggleMirror} className={buttonBase} title="Зеркало">
                    <FlipHorizontal size={18} />
                  </button>

                  <button
                    onClick={switchCamera}
                    disabled={isRecording || isSwitchingCamera || !isCameraReady}
                    className={buttonBase}
                    title={
                      isRecording
                        ? "Смена камеры недоступна во время записи"
                        : "Сменить камеру"
                    }
                  >
                    <RefreshCw size={18} className={isSwitchingCamera ? "animate-spin" : ""} />
                  </button>

                  <button
                    onClick={() => setIsMinimized(true)}
                    className={buttonBase}
                    title="Свернуть"
                  >
                    <Minimize2 size={18} />
                  </button>
                </div>

                <div className="mt-5 flex items-center justify-center gap-5">
                  {!isRecording ? (
                    <button
                      onClick={() => {
                        if (!isCameraReady) return;
                        startRecording();
                      }}
                      disabled={!isCameraReady}
                      className="flex h-20 w-20 items-center justify-center rounded-full bg-[#8b5cf6] shadow-lg shadow-[#8b5cf6]/35 ring-4 ring-[#8b5cf6]/20 transition-all hover:bg-[#7c3aed] active:scale-95 disabled:opacity-50"
                      title="Начать запись"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-white">
                        <div className="h-4 w-4 rounded-[4px] bg-white" />
                      </div>
                    </button>
                  ) : (
                    <button
                      onClick={stopRecording}
                      className="flex h-20 w-20 items-center justify-center rounded-full bg-[#8b5cf6] shadow-lg shadow-[#8b5cf6]/35 ring-4 ring-[#8b5cf6]/20 transition-all hover:bg-[#7c3aed] active:scale-95"
                      title="Стоп"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-white">
                        <Square size={16} fill="currentColor" />
                      </div>
                    </button>
                  )}
                </div>

                <p className="mt-4 text-center text-[11px] leading-relaxed text-white/30">
                  {isRecording
                    ? "Можно свернуть и продолжать читать чат — запись останется активной."
                    : "Смена камеры доступна до старта записи. Зеркало влияет на предпросмотр."}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}