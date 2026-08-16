// components/VideoNoteRecorder.tsx
"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { X, Send, Mic, MicOff, Maximize2, Minimize2 } from "lucide-react";

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
  
  // UI States
  const [isRecording, setIsRecording] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isMirrored, setIsMirrored] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null); // Для предпросмотра после записи
  
  // Interaction States
  const [isMinimized, setIsMinimized] = useState(false);
  const [dragState, setDragState] = useState<{ startX: number; currentX: number } | null>(null);
  const [swipeAction, setSwipeAction] = useState<"none" | "cancel" | "send">("none");
  
  // Refs for gesture handling without re-renders
  const recordBtnRef = useRef<HTMLButtonElement>(null);
  const dragStartYRef = useRef<number>(0);
  const isDraggingVerticalRef = useRef(false);

  useEffect(() => {
    startCamera();
    return () => cleanupResources();
  }, []);

  async function startCamera() {
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
        audio: true,
      });
      
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setIsCameraReady(true);
    } catch {
      alert("Нет доступа к камере");
      onCancel();
    }
  }

  function toggleMute(e?: React.MouseEvent) {
    e?.stopPropagation();
    if (streamRef.current) {
      const tracks = streamRef.current.getAudioTracks();
      tracks.forEach(t => t.enabled = isMuted);
      setIsMuted(!isMuted);
    }
  }

  function toggleMirror(e?: React.MouseEvent) {
    e?.stopPropagation();
    setIsMirrored(prev => !prev);
  }

  // --- Recording Logic ---

  function startRecordingSession() {
    if (!streamRef.current || blobUrl) return; // Не начинаем если есть готовый результат
    
    chunksRef.current = [];
    const recorder = new MediaRecorder(streamRef.current, { mimeType: "video/webm;codecs=vp8,opus" });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    
    // On stop logic handled externally via finalizeRecording or cancel
    recorder.start();
    setIsRecording(true);
    setSeconds(0);
    
    timerRef.current = setInterval(() => {
      setSeconds(s => {
        if (s + 1 >= maxDuration) stopRecordingInternal();
        return s + 1;
      });
    }, 1000);
  }

  function stopRecordingInternal() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function finalizeRecording() {
    stopRecordingInternal();
    const blob = new Blob(chunksRef.current, { type: "video/webm" });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    // Переключаем видео элемент на просмотр записи
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src = url;
      videoRef.current.loop = true;
      videoRef.current.play();
    }
  }

  function discardRecording() {
    stopRecordingInternal();
    setBlobUrl(null);
    setSeconds(0);
    chunksRef.current = [];
    // Возвращаем камеру
    if (videoRef.current) {
      videoRef.current.src = "";
      if (streamRef.current) videoRef.current.srcObject = streamRef.current;
      videoRef.current.loop = false;
      videoRef.current.play();
    }
  }

  function submitRecording() {
    if (!blobUrl) return;
    // Конвертируем blobUrl обратно в File для отправки
    fetch(blobUrl)
      .then(res => res.blob())
      .then(blob => {
        const file = new File([blob], `video-note-${Date.now()}.webm`, { type: "video/webm" });
        cleanupResources();
        onRecorded(file);
      });
  }

  function cleanupResources() {
    stopRecordingInternal();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }

  // --- Gesture Handling (Slider & Swipe Down) ---

  const handlePointerDown = (e: React.PointerEvent) => {
    if (blobUrl) return; // Если уже записано, кнопка работает как "Перезаписать" (сброс)
    
    e.preventDefault(); // Предотвращаем скролл страницы
    recordBtnRef.current?.setPointerCapture(e.pointerId);
    
    dragStartYRef.current = e.clientY;
    isDraggingVerticalRef.current = false;
    
    setDragState({ startX: e.clientX, currentX: e.clientX });
    setSwipeAction("none");
    
    // Начинаем запись сразу при нажатии
    startRecordingSession();
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState || !isRecording) return;

    const deltaX = e.clientX - dragState.startX;
    const deltaY = e.clientY - dragStartYRef.current;

    // Логика свайпа вниз для минимизации
    if (!isDraggingVerticalRef.current && Math.abs(deltaY) > 20 && Math.abs(deltaY) > Math.abs(deltaX)) {
      isDraggingVerticalRef.current = true;
    }

    if (isDraggingVerticalRef.current) {
       // Визуально можно добавить эффект "тянем вниз", но для простоты просто обновляем координаты
       // Реальная минимизация произойдет на PointerUp
       return;
    }

    // Логика горизонтального слайдера (Отмена / Отправка)
    setDragState(prev => prev ? { ...prev, currentX: e.clientX } : null);

    if (deltaX < -60) setSwipeAction("cancel");
    else if (deltaX > 60) setSwipeAction("send");
    else setSwipeAction("none");
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragState) return;
    recordBtnRef.current?.releasePointerCapture(e.pointerId);

    const deltaY = e.clientY - dragStartYRef.current;

    // 1. Свайп вниз -> Минимизация
    if (isDraggingVerticalRef.current && deltaY > 80) {
      stopRecordingInternal(); // Приостанавливаем запись? Нет, продолжаем в фоне!
      // Но нам нужно сохранить состояние. Запись продолжается в mediaRecorder.
      // Просто меняем UI.
      setIsMinimized(true);
      setDragState(null);
      setSwipeAction("none");
      return;
    }

    // Если мы в режиме записи
    if (isRecording) {
      if (swipeAction === "cancel") {
        discardRecording();
      } else if (swipeAction === "send") {
        finalizeRecording();
        // Сразу отправлять или показать превью? По ТЗ: "появляются кнопки". 
        // Но если свайпнул сильно - можно сразу отправить. 
        // Сделаем так: свайп до конца = действие.
        submitRecording();
      } else {
        // Просто отпустил -> Стоп, показываем превью
        finalizeRecording();
      }
    }

    setDragState(null);
    setSwipeAction("none");
    isDraggingVerticalRef.current = false;
  };

  // Вычисление смещения кнопки для визуализации слайдера
  const getSliderTransform = () => {
    if (!dragState || !isRecording) return "translateX(0px)";
    const delta = dragState.currentX - dragState.startX;
    // Ограничиваем движение
    const clamped = Math.max(-100, Math.min(100, delta));
    return `translateX(${clamped}px)`;
  };

  const progress = maxDuration > 0 ? Math.min((seconds / maxDuration) * 100, 100) : 0;

  // --- Render Helpers ---
  
  // Компактный бар
  if (isMinimized) {
    return (
      <div 
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[300] w-[90%] max-w-[340px] h-16 bg-[#0a0a0a]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl flex items-center px-4 gap-4 cursor-pointer transition-all hover:border-[#8b5cf6]/50 animate-in slide-in-from-bottom-10 fade-in duration-300"
      >
        {/* Mini Preview */}
        <div className="relative w-10 h-10 rounded-full overflow-hidden bg-black shrink-0 ring-2 ring-[#8b5cf6]/30">
           <video 
             ref={videoRef} // Тот же реф, видео продолжает играть/писаться
             autoPlay playsInline muted 
             className={`w-full h-full object-cover ${isMirrored ? "scale-x-[-1]" : ""}`}
           />
           {/* Tiny Progress Ring */}
           <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none">
             <circle cx="20" cy="20" r="18" fill="none" stroke="#8b5cf6" strokeWidth="2" 
               strokeDasharray={113} strokeDashoffset={113 - (113 * progress) / 100} />
           </svg>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-bold text-white tracking-wide">ЗАПИСЬ...</span>
          </div>
          <div className="w-full h-1 bg-white/10 rounded-full mt-1.5 overflow-hidden">
            <div className="h-full bg-[#8b5cf6] transition-all duration-1000 ease-linear" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <button 
          onClick={(e) => { e.stopPropagation(); setIsMinimized(false); }}
          className="p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-colors"
        >
          <Maximize2 size={18} />
        </button>
      </div>
    );
  }

  // Полноэкранный интерфейс
  return (
    <div className="fixed inset-0 z-[300] bg-black flex flex-col items-center justify-center overflow-hidden select-none touch-none">
      
      {/* Background / Video Area */}
      <div 
        className="relative w-full h-full max-w-[500px] mx-auto flex flex-col"
        onClick={toggleMirror} // Тап по экрану = зеркало
      >
        {/* Header Controls (Overlay) */}
        <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-20 pointer-events-none">
          <div className="pointer-events-auto">
             {/* Placeholder for balance */}
          </div>
          <div className="flex gap-3 pointer-events-auto">
             <button onClick={toggleMute} className="p-3 rounded-full bg-black/20 backdrop-blur-md text-white hover:bg-white/10 transition-colors">
                {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
             </button>
             <button onClick={(e) => { e.stopPropagation(); cleanupResources(); onCancel(); }} className="p-3 rounded-full bg-black/20 backdrop-blur-md text-white hover:bg-red-500/80 transition-colors">
                <X size={20} />
             </button>
          </div>
        </div>

        {/* Main Video View */}
        <div className="flex-1 relative flex items-center justify-center">
           <div className="relative aspect-square w-full max-h-[70vh] rounded-[32px] overflow-hidden bg-[#111] shadow-[0_0_60px_rgba(139,92,246,0.15)] ring-1 ring-white/5">
              <video
                ref={videoRef}
                autoPlay playsInline muted loop={!!blobUrl}
                className={`w-full h-full object-cover transition-transform duration-300 ${isMirrored ? "scale-x-[-1]" : ""}`}
              />
              
              {/* Progress Ring Overlay (Only when recording) */}
              {isRecording && (
                <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-60">
                   <rect x="2%" y="2%" width="96%" height="96%" rx="30" fill="none" stroke="#8b5cf6" strokeWidth="4" 
                     strokeDasharray="2000" strokeDashoffset={2000 - (2000 * progress) / 100} 
                     className="transition-all duration-1000 ease-linear" />
                </svg>
              )}

              {/* Hint Overlay (Idle) */}
              {!isRecording && !blobUrl && isCameraReady && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/20">
                  <div className="bg-black/40 backdrop-blur-sm px-6 py-3 rounded-full border border-white/10">
                    <span className="text-white/80 text-sm font-medium tracking-wide">Зажми для записи</span>
                  </div>
                </div>
              )}
           </div>
        </div>

        {/* Bottom Controls Area */}
        <div className="h-[280px] shrink-0 flex flex-col items-center justify-center pb-8 relative z-30">
           
           {/* Action Buttons (Visible only after recording stops) */}
           {blobUrl && (
             <div className="absolute inset-0 flex items-center justify-between px-12 animate-in fade-in zoom-in-95 duration-200">
                <button 
                  onClick={discardRecording}
                  className="flex flex-col items-center gap-2 group"
                >
                  <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-red-400 group-hover:bg-red-500/20 group-hover:border-red-500/50 transition-all">
                    <X size={28} />
                  </div>
                </button>

                <button 
                  onClick={submitRecording}
                  className="flex flex-col items-center gap-2 group"
                >
                  <div className="w-16 h-16 rounded-full bg-[#8b5cf6] shadow-[0_0_30px_rgba(139,92,246,0.4)] flex items-center justify-center text-white group-hover:scale-110 transition-all">
                    <Send size={28} className="ml-1" />
                  </div>
                </button>
             </div>
           )}

           {/* Record Slider Button (Visible when idle or recording) */}
           {!blobUrl && (
             <div className="relative w-full flex items-center justify-center h-24">
                
                {/* Visual Track for Slider */}
                {isRecording && (
                  <div className="absolute inset-x-12 h-1 bg-white/5 rounded-full overflow-hidden">
                     {/* Left Zone (Cancel) */}
                     <div className={`absolute left-0 top-0 bottom-0 w-1/3 bg-red-500/20 transition-opacity ${swipeAction === 'cancel' ? 'opacity-100' : 'opacity-0'}`} />
                     {/* Right Zone (Send) */}
                     <div className={`absolute right-0 top-0 bottom-0 w-1/3 bg-[#8b5cf6]/20 transition-opacity ${swipeAction === 'send' ? 'opacity-100' : 'opacity-0'}`} />
                  </div>
                )}

                {/* Icons hint when sliding */}
                {isRecording && swipeAction !== 'none' && (
                  <div className={`absolute inset-0 flex items-center justify-between px-10 pointer-events-none transition-opacity duration-200 ${dragState ? 'opacity-100' : 'opacity-0'}`}>
                     <span className={`text-sm font-bold tracking-widest uppercase ${swipeAction === 'cancel' ? 'text-red-500' : 'text-white/20'}`}>Отмена</span>
                     <span className={`text-sm font-bold tracking-widest uppercase ${swipeAction === 'send' ? 'text-[#8b5cf6]' : 'text-white/20'}`}>Отпр.</span>
                  </div>
                )}

                {/* THE BUTTON */}
                <button
                  ref={recordBtnRef}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp} // Safety
                  style={{ transform: getSliderTransform() }}
                  className={`
                    relative w-20 h-20 rounded-full flex items-center justify-center touch-none outline-none
                    transition-all duration-200 ease-out
                    ${isRecording 
                      ? "bg-red-500 shadow-[0_0_40px_rgba(239,68,68,0.4)] scale-90" 
                      : "bg-[#8b5cf6] shadow-[0_0_40px_rgba(139,92,246,0.4)] hover:scale-105 active:scale-95"
                    }
                  `}
                >
                  {/* Inner Icon Morphing */}
                  <div className={`transition-all duration-300 ${isRecording ? "scale-110" : "scale-100"}`}>
                    {isRecording ? (
                       <div className="w-8 h-8 bg-white rounded-sm animate-pulse" />
                    ) : (
                       <div className="w-8 h-8 border-4 border-white rounded-full" />
                    )}
                  </div>
                </button>
             </div>
           )}
           
           {/* Minimize Hint */}
           {!blobUrl && isRecording && (
             <div className="mt-6 text-white/30 text-xs font-medium animate-pulse">
               Свайпни вниз, чтобы свернуть
             </div>
           )}
        </div>
      </div>
    </div>
  );
}