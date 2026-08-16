// components/VideoNoteRecorder.tsx
"use client";

import { useRef, useState, useEffect } from "react";
import { 
  Square, X, Mic, MicOff, Minimize2, Maximize2, 
  RefreshCw, FlipHorizontal, Send 
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
  
  // Состояния
  const [isRecording, setIsRecording] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  
  // Камера
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [isMirrored, setIsMirrored] = useState(true);
  const [isSwitching, setIsSwitching] = useState(false);

  // Инициализация
  useEffect(() => {
    startCamera();
    return () => cleanupResources();
  }, []);

  async function startCamera(mode = facingMode) {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: mode, 
          width: { ideal: 720 }, 
          height: { ideal: 720 } 
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
    if (isRecording || isSwitching) return;
    setIsSwitching(true);
    const next = facingMode === "user" ? "environment" : "user";
    setFacingMode(next);
    setIsMirrored(next === "user"); // Задняя камера обычно не зеркалится
    await startCamera(next);
    setIsSwitching(false);
  }

  function toggleMirror() {
    setIsMirrored(prev => !prev);
  }

  function toggleMute() {
    if (!streamRef.current) return;
    const tracks = streamRef.current.getAudioTracks();
    tracks.forEach(t => t.enabled = isMuted);
    setIsMuted(!isMuted);
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
      const file = new File([blob], `video-${Date.now()}.webm`, { type: "video/webm" });
      cleanupResources();
      onRecorded(file);
    };
    
    recorder.start();
    setIsRecording(true);
    setSeconds(0);
    
    timerRef.current = setInterval(() => {
      setSeconds(s => {
        if (s + 1 >= maxDuration) {
          stopRecording(); // Авто-стоп и отправка
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
      streamRef.current.getTracks().forEach(t => t.stop());
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

  // Стили
  const btnClass = "h-12 w-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95 disabled:opacity-50";
  const primaryBtnClass = "h-16 w-16 flex items-center justify-center rounded-full bg-[#8b5cf6] hover:bg-[#7c3aed] text-white shadow-lg shadow-purple-500/30 transition-all active:scale-95 ring-4 ring-purple-500/20";

  return (
    <div className={`fixed z-[300] transition-all duration-300 ease-in-out
      ${isMinimized 
        ? "bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-md pointer-events-auto" 
        : "inset-0 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
      }
    `}>
      
      {/* Основной контейнер */}
      <div className={`
        relative overflow-hidden bg-[#0a0a0a] border border-white/10 shadow-2xl transition-all duration-300
        ${isMinimized 
          ? "rounded-2xl h-20 flex items-center px-4 gap-4 w-full" 
          : "rounded-[32px] w-full max-w-[400px] aspect-square flex flex-col"
        }
      `}>
        
        {/* Видеоплеер */}
        <div className={`relative bg-black overflow-hidden shrink-0 transition-all duration-300
          ${isMinimized ? "h-14 w-14 rounded-xl" : "w-full h-full absolute inset-0"}
        `}>
          <video
            ref={videoRef}
            autoPlay playsInline muted
            className="h-full w-full object-cover"
            style={{ transform: isMirrored ? "scaleX(-1)" : "none" }}
          />
          
          {/* Индикатор записи (точка) */}
          {isRecording && (
            <div className={`absolute z-10 flex items-center gap-1.5 bg-black/60 backdrop-blur px-2 py-1 rounded-full border border-white/10
              ${isMinimized ? "top-1 right-1 scale-75 origin-top-right" : "top-4 left-1/2 -translate-x-1/2"}
            `}>
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs font-mono font-bold text-white tabular-nums">{formatTime(seconds)}</span>
            </div>
          )}

          {/* Прогресс бар (тонкая линия снизу) */}
          {isRecording && (
            <div className="absolute bottom-0 left-0 h-1 bg-white/10 w-full">
              <div 
                className="h-full bg-[#8b5cf6] transition-all duration-1000 ease-linear" 
                style={{ width: `${progress}%` }} 
              />
            </div>
          )}
        </div>

        {/* Панель управления */}
        <div className={`flex-1 flex items-center justify-between transition-all duration-300
          ${isMinimized ? "pl-2" : "relative z-10 mt-auto p-6 bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-20"}
        `}>
          
          {/* Левая часть: Отмена / Свернуть */}
          <div className="flex items-center gap-3">
             {isMinimized ? (
               <button onClick={() => setIsMinimized(false)} className={btnClass} title="Развернуть">
                 <Maximize2 size={20} />
               </button>
             ) : (
               <button 
                 onClick={() => { cleanupResources(); onCancel(); }} 
                 className={`${btnClass} bg-red-500/20 hover:bg-red-500/30 text-red-200`}
                 title="Отмена"
               >
                 <X size={24} />
               </button>
             )}
          </div>

          {/* Центр: Кнопка записи (только в полном режиме) или инфо (в мини) */}
          {!isMinimized && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              {!isRecording ? (
                <button 
                  onClick={startRecording}
                  disabled={!isCameraReady}
                  className={primaryBtnClass}
                >
                  <div className="w-8 h-8 rounded-sm bg-white" />
                </button>
              ) : (
                <button 
                  onClick={stopRecording}
                  className={`${primaryBtnClass} bg-red-500 hover:bg-red-600 shadow-red-500/30 ring-red-500/20`}
                >
                  <Square size={24} fill="currentColor" />
                </button>
              )}
            </div>
          )}

          {/* Правая часть: Настройки камеры / Стоп (в мини) */}
          <div className="flex items-center gap-3">
            {isMinimized ? (
              // В свернутом режиме только стоп и настройки
              <>
                 <div className="flex flex-col">
                    <span className="text-xs font-bold text-white">
                      {isRecording ? "Запись..." : "Пауза"}
                    </span>
                    <span className="text-[10px] text-white/50">
                       {isRecording ? formatTime(seconds) : "Нажми для записи"}
                    </span>
                 </div>
                 
                 {!isRecording ? (
                    <button onClick={startRecording} className="w-10 h-10 rounded-full bg-[#8b5cf6] flex items-center justify-center text-white">
                       <div className="w-4 h-4 bg-white rounded-sm" />
                    </button>
                 ) : (
                    <button onClick={stopRecording} className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center text-white">
                       <Square size={14} fill="currentColor" />
                    </button>
                 )}
                 
                 <button onClick={() => setIsMinimized(false)} className="p-2 text-white/50 hover:text-white">
                    <Maximize2 size={18} />
                 </button>
              </>
            ) : (
              // В полном режиме: доп кнопки
              <>
                <button onClick={toggleMirror} className={btnClass} title="Зеркало">
                  <FlipHorizontal size={20} />
                </button>
                
                <button 
                  onClick={switchCamera} 
                  disabled={isRecording || isSwitching}
                  className={btnClass} 
                  title="Сменить камеру"
                >
                  <RefreshCw size={20} className={isSwitching ? "animate-spin" : ""} />
                </button>

                <button onClick={toggleMute} className={btnClass} title="Микрофон">
                  {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
                
                {/* Кнопка свернуть */}
                <button onClick={() => setIsMinimized(true)} className={btnClass} title="Свернуть">
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