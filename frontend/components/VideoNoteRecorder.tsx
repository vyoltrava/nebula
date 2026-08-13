// components/VideoNoteRecorder.tsx
"use client";
import { useRef, useState, useEffect } from "react";
import { Square, X, Camera, Mic, MicOff, RotateCw, Video } from "lucide-react";

interface Props {
  onRecorded: (file: File) => void;
  onCancel: () => void;
  maxDuration?: number; // сек, по умолчанию 60
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
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");

  useEffect(() => {
    startCamera();
    return () => cleanup();
  }, []);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: 720, height: 720 },
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
    // Останавливаем текущий поток
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    // Меняем камеру
    setFacingMode(facingMode === "user" ? "environment" : "user");
    // Запускаем новую
    await startCamera();
  }

  function toggleMute() {
    if (streamRef.current) {
      const audioTracks = streamRef.current.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = isMuted; // инвертируем состояние
      });
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
      onRecorded(file);
      cleanup();
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
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  function cleanup() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (timerRef.current) clearInterval(timerRef.current);
  }

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Прогресс в процентах для дорожки
  const progress = maxDuration > 0 ? (seconds / maxDuration) * 100 : 0;

  return (
    <div className="fixed inset-0 z-[300] bg-black/95 flex items-center justify-center">
      <div className="relative flex flex-col items-center">
        {/* Квадратное видео */}
        <div className="relative w-[340px] h-[340px] sm:w-[440px] sm:h-[440px] rounded-2xl overflow-hidden bg-black shadow-2xl ring-1 ring-white/10">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />

          {/* 🟣 Круговая дорожка записи (как в Telegram) */}
          <svg
            className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none"
            viewBox="0 0 100 100"
          >
            {/* Фон дорожки */}
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke="rgba(255,255,255,0.15)"
              strokeWidth="3"
            />
            {/* Прогресс записи */}
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke="#ef4444"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 44}`}
              strokeDashoffset={`${2 * Math.PI * 44 * (1 - progress / 100)}`}
              className="transition-all duration-300 ease-linear"
            />
          </svg>

          {/* Таймер записи */}
          {isRecording && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/70 backdrop-blur-sm rounded-full px-4 py-1.5 ring-1 ring-white/10">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white text-sm font-mono font-bold tabular-nums">
                {formatTime(seconds)}
              </span>
              <span className="text-white/40 text-xs font-mono">
                / {formatTime(maxDuration)}
              </span>
            </div>
          )}

          {/* Подсказка "Снимите видео-кружок" */}
          {!isRecording && !isCameraReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-3">
                  <Video size={32} className="text-white/60" />
                </div>
                <p className="text-white/60 text-sm font-medium">Нажмите ● для записи</p>
                <p className="text-white/30 text-xs mt-1">Видео-кружок 1:1</p>
              </div>
            </div>
          )}
        </div>

        {/* 🎮 Кнопки управления */}
        <div className="mt-8 flex items-center gap-5">
          {/* Отмена */}
          <button
            onClick={() => { cleanup(); onCancel(); }}
            className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 transition-colors active:scale-95 flex items-center justify-center text-white/80"
          >
            <X size={24} />
          </button>

          {/* Переключить камеру */}
          <button
            onClick={switchCamera}
            className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 transition-colors active:scale-95 flex items-center justify-center text-white/80"
          >
            <RotateCw size={24} />
          </button>

          {/* Кнопка записи */}
          {!isRecording ? (
            <button
              onClick={() => { startCamera(); setTimeout(startRecording, 300); }}
              disabled={!isCameraReady}
              className="w-24 h-24 rounded-full bg-[#8b5cf6] hover:bg-[#7c3aed] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-lg shadow-[#8b5cf6]/30 ring-4 ring-[#8b5cf6]/20"
            >
              <div className="w-10 h-10 rounded-full border-[3px] border-white flex items-center justify-center">
                <div className="w-6 h-6 rounded-sm bg-white" />
              </div>
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="w-24 h-24 rounded-full bg-red-500 hover:bg-red-600 active:scale-95 transition-all flex items-center justify-center shadow-lg shadow-red-500/30 ring-4 ring-red-500/20"
            >
              <div className="w-10 h-10 rounded-full border-[3px] border-white flex items-center justify-center">
                <div className="w-6 h-6 rounded-sm bg-white" />
              </div>
            </button>
          )}

          {/* Звук */}
          <button
            onClick={toggleMute}
            className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 transition-colors active:scale-95 flex items-center justify-center text-white/80"
          >
            {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
          </button>

          {/* Сброс (очистить) */}
          <button
            onClick={() => { 
              if (isRecording) stopRecording();
              setSeconds(0);
              cleanup();
              startCamera();
            }}
            className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 transition-colors active:scale-95 flex items-center justify-center text-white/80"
          >
            <RotateCw size={24} className="rotate-45" />
          </button>
        </div>

        {/* Подсказка */}
        <div className="mt-4 text-center">
          <p className="text-white/30 text-xs font-medium">
            {isRecording 
              ? `⏺ Запись ... ${formatTime(seconds)}` 
              : isCameraReady 
                ? "👆 Нажмите ● чтобы начать запись" 
                : "⏳ Загрузка камеры..."}
          </p>
          <p className="text-white/20 text-[10px] mt-0.5">
            {isRecording ? "Нажмите красную кнопку для остановки" : "Максимум 60 секунд"}
          </p>
        </div>
      </div>
    </div>
  );
}