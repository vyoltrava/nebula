// components/VideoNoteRecorder.tsx
"use client";
import { useRef, useState, useEffect } from "react";
import { Square, X, Mic, MicOff } from "lucide-react";

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

  useEffect(() => {
    startCamera();
    return () => {
      // ✅ Полная очистка при размонтировании
      fullCleanup();
    };
  }, []);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 720, height: 720 },
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
    chunksRef.current = [];
    const recorder = new MediaRecorder(streamRef.current, {
      mimeType: "video/webm;codecs=vp8,opus",
    });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      // ✅ Останавливаем всё ПЕРЕД вызовом onRecorded
      fullCleanup();
      
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const file = new File([blob], `video-note-${Date.now()}.webm`, { type: "video/webm" });
      
      // ✅ Вызываем onRecorded ПОСЛЕ полной очистки
      onRecorded(file);
    };

    recorder.start();
    setIsRecording(true);
    setSeconds(0);

    timerRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= maxDuration) {
          // ✅ При достижении лимита останавливаем запись
          stopRecordingAndCleanup();
        }
        return s + 1;
      });
    }, 1000);
  }

  // ✅ Функция остановки записи с очисткой
  function stopRecordingAndCleanup() {
    // Останавливаем рекордер
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.log("Recorder already stopped");
      }
    }
    
    // ✅ СБРАСЫВАЕМ СОСТОЯНИЕ ЗАПИСИ
    setIsRecording(false);
    setSeconds(0);
    
    // Очищаем таймер
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  // ✅ ПОЛНАЯ ОЧИСТКА ВСЕГО
  function fullCleanup() {
    // 1. Останавливаем рекордер
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      } catch (e) {}
      mediaRecorderRef.current = null;
    }
    
    // 2. ✅ СБРАСЫВАЕМ СОСТОЯНИЕ ЗАПИСИ
    setIsRecording(false);
    setSeconds(0);
    
    // 3. Очищаем таймер
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    // 4. Останавливаем поток
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    
    // 5. Очищаем чанки
    chunksRef.current = [];
  }

  // ✅ Ручная остановка записи (кнопка Стоп)
  function handleStopRecording() {
    if (isRecording) {
      // Останавливаем рекордер (вызовет onstop)
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      // ✅ Сразу сбрасываем состояние
      setIsRecording(false);
      setSeconds(0);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const progress = maxDuration > 0 ? Math.min((seconds / maxDuration) * 100, 100) : 0;
  const perimeter = 2 * (94 + 94);

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

          {/* Квадратная дорожка записи */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 100 100"
          >
            <rect
              x="3"
              y="3"
              width="94"
              height="94"
              rx="12"
              fill="none"
              stroke="rgba(255,255,255,0.15)"
              strokeWidth="3"
            />
            <rect
              x="3"
              y="3"
              width="94"
              height="94"
              rx="12"
              fill="none"
              stroke="#ef4444"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={perimeter}
              strokeDashoffset={perimeter * (1 - progress / 100)}
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

          {/* Подсказка */}
          {!isRecording && isCameraReady && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <p className="text-white/40 text-sm font-medium">Нажмите ● для записи</p>
                <p className="text-white/20 text-xs mt-1">Видео-кружок 1:1</p>
              </div>
            </div>
          )}
        </div>

        {/* Кнопки управления */}
        <div className="mt-6 flex items-center justify-center gap-8">
          {/* Отмена */}
          <button
            onClick={() => { fullCleanup(); onCancel(); }}
            className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 transition-colors active:scale-95 flex items-center justify-center text-white/80"
          >
            <X size={24} />
          </button>

          {/* Кнопка записи */}
          {!isRecording ? (
            <button
              onClick={() => { startCamera(); setTimeout(startRecording, 300); }}
              disabled={!isCameraReady}
              className="w-20 h-20 rounded-full bg-[#8b5cf6] hover:bg-[#7c3aed] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-lg shadow-[#8b5cf6]/30 ring-4 ring-[#8b5cf6]/20"
            >
              <div className="w-9 h-9 rounded-full border-[3px] border-white flex items-center justify-center">
                <div className="w-5 h-5 rounded-sm bg-white" />
              </div>
            </button>
          ) : (
            <button
              onClick={handleStopRecording}
              className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 active:scale-95 transition-all flex items-center justify-center shadow-lg shadow-red-500/30 ring-4 ring-red-500/20"
            >
              <div className="w-9 h-9 rounded-full border-[3px] border-white flex items-center justify-center">
                <div className="w-5 h-5 rounded-sm bg-white" />
              </div>
            </button>
          )}

          {/* Микрофон */}
          <button
            onClick={toggleMute}
            className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 transition-colors active:scale-95 flex items-center justify-center text-white/80"
          >
            {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
          </button>
        </div>

        {/* Подсказка */}
        <div className="mt-4 text-center">
          <p className="text-white/30 text-xs font-medium">
            {isRecording 
              ? `⏺ Запись ... ${formatTime(seconds)}` 
              : isCameraReady 
                ? "👆 Нажмите кнопку для записи" 
                : "⏳ Загрузка камеры..."}
          </p>
        </div>
      </div>
    </div>
  );
}