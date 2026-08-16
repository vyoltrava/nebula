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
  Video,
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
  
  // UI States
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
        video: {
          facingMode: mode,
          width: { ideal: 720 },
          height: { ideal: 720 },
        },
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
    if (isRecording || isSwitching) return; // Блокируем во время записи
    setIsSwitching(true);
    const nextMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(nextMode);
    setIsMirrored(nextMode === "user"); // Авто-зеркало для фронталки
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
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
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

  // Общие стили кнопок
  const btnClass = "flex items-center justify-center rounded-full transition-all active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed";
  const glassPanel = "bg-[#0a0a0a]/80 backdrop-blur-xl border border-white/10 shadow-2xl shadow-purple-900/20";

  return (
    <div 
      className={`fixed z-[300] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
        isMinimized 
          ? "bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-md pointer-events-auto" 
          : "inset-0 bg-black/95 flex items-center justify-center p-4"
      }`}
    >
      {/* Основной контейнер */}
      <div className={`relative overflow-hidden transition-all duration-500 ${glassPanel} ${
        isMinimized 
          ? "rounded-3xl h-20 flex items-center px-4 gap-4" 
          : "rounded-[32px] w-full max-w-[480px] aspect-square sm:aspect-auto sm:h-[600px] flex flex-col"
      }`}>
        
        {/* Видеоплеер */}
        <div className={`relative bg-black overflow-hidden shrink-0 transition-all duration-500 ${
          isMinimized 
            ? "w-16 h-16 rounded-2xl" 
            : "w-full flex-1 sm:rounded-t-[32px] sm:mb-4"
        }`}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ transform: isMirrored ? "scaleX(-1)" : "none" }}
          />
          
          {/* Индикатор записи (пульсация) */}
          {isRecording && (
            <div className={`absolute top-3 right-3 flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 ${isMinimized ? 'hidden' : ''}`}>
              <span className="w-2 h-2 rounded-full bg-[#8b5cf6] animate-pulse shadow-[0_0_10px_#8b5cf6]" />
              <span className="text-xs font-mono font-bold text-white">{formatTime(seconds)}</span>
            </div>
          )}

          {/* Прогресс бар (тонкая линия снизу видео) */}
          {isRecording && (
             <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/10">
               <div 
                 className="h-full bg-[#8b5cf6] shadow-[0_0_8px_#8b5cf6]" 
                 style={{ width: `${progress}%` }} 
               />
             </div>
          )}
        </div>

        {/* Панель управления */}
        <div className={`flex items-center transition-all duration-500 ${
          isMinimized 
            ? "flex-1 justify-between" 
            : "justify-center gap-6 pb-8 pt-2"
        }`}>
          
          {/* ЛЕВАЯ ЧАСТЬ (Инфо или Отмена) */}
          <div className="flex items-center gap-3">
            {isMinimized ? (
              <div className="flex flex-col">
                <span className="text-sm font-bold text-white">
                  {isRecording ? "Запись..." : "Камера"}
                </span>
                <span className="text-[10px] text-white/50 uppercase tracking-wider">
                  {isRecording ? formatTime(seconds) : "Готов"}
                </span>
              </div>
            ) : (
              <button 
                onClick={() => { cleanupResources(); onCancel(); }}
                className={`${btnClass} w-14 h-14 bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-white/70 border border-white/5`}
              >
                <X size={24} />
              </button>
            )}
          </div>

          {/* ЦЕНТРАЛЬНАЯ КНОПКА (Запись / Стоп) */}
          {!isMinimized && (
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={!isCameraReady}
              className={`${btnClass} w-20 h-20 relative group`}
            >
              {/* Внешнее кольцо */}
              <div className={`absolute inset-0 rounded-full border-2 transition-colors duration-300 ${
                isRecording ? "border-[#8b5cf6]" : "border-white/30 group-hover:border-white"
              }`} />
              
              {/* Внутренняя фигура */}
              <div className={`transition-all duration-300 ${
                isRecording 
                  ? "w-8 h-8 rounded-lg bg-[#8b5cf6] shadow-[0_0_15px_rgba(139,92,246,0.6)]" 
                  : "w-16 h-16 rounded-full bg-white/10 group-hover:bg-white/20 border border-white/50"
              }`} />
            </button>
          )}

          {/* ПРАВАЯ ЧАСТЬ (Действия) */}
          <div className="flex items-center gap-3">
            {isMinimized ? (
              <>
                {/* В свернутом режиме: Стоп и Развернуть */}
                {isRecording && (
                   <button 
                     onClick={stopRecording}
                     className={`${btnClass} w-10 h-10 bg-[#8b5cf6] text-white shadow-lg shadow-purple-500/30`}
                   >
                     <Square size={14} fill="currentColor" />
                   </button>
                )}
                <button 
                  onClick={() => setIsMinimized(false)}
                  className={`${btnClass} w-10 h-10 bg-white/10 text-white hover:bg-white/20`}
                >
                  <Maximize2 size={18} />
                </button>
              </>
            ) : (
              <>
                {/* В полном режиме: Доп. кнопки */}
                <button 
                  onClick={toggleMirror} 
                  className={`${btnClass} w-12 h-12 bg-white/5 text-white/70 hover:text-white hover:bg-white/10`}
                  title="Зеркало"
                >
                  <FlipHorizontal size={20} />
                </button>
                
                <button 
                  onClick={switchCamera} 
                  disabled={isRecording || isSwitching}
                  className={`${btnClass} w-12 h-12 bg-white/5 text-white/70 hover:text-white hover:bg-white/10`}
                  title="Сменить камеру"
                >
                  <RefreshCw size={20} className={isSwitching ? "animate-spin" : ""} />
                </button>

                <button 
                  onClick={() => setIsMinimized(true)}
                  className={`${btnClass} w-12 h-12 bg-white/5 text-white/70 hover:text-[#8b5cf6] hover:bg-[#8b5cf6]/10`}
                  title="Свернуть"
                >
                  <Minimize2 size={20} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}