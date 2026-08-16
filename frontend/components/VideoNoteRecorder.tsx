"use client";
import { useRef, useState, useEffect, useCallback } from "react";
import { Square, X, Minimize2, Maximize2, SwitchCamera } from "lucide-react";

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
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // State
  const [isRecording, setIsRecording] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [mirrored, setMirrored] = useState(true);
  const [hasFlip, setHasFlip] = useState(false);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      } catch (e) {}
      mediaRecorderRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    chunksRef.current = [];
    setIsRecording(false);
    setSeconds(0);
  }, []);

  // Start camera and mic
  const startDevices = useCallback(async (facingMode: "user" | "environment" = "user") => {
    try {
      // Cleanup old streams
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 640 },
          height: { ideal: 640 },
          frameRate: { ideal: 30 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      
      // Check if multiple cameras available
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      setHasFlip(videoDevices.length > 1);
      
      setIsReady(true);
    } catch (error) {
      console.error('Error starting devices:', error);
      if (onDenied) {
        onDenied();
      } else {
        alert('Нет доступа к камере или микрофону');
      }
      onCancel();
    }
  }, [onDenied, onCancel]);

  // Start recording
  const startRecording = useCallback(() => {
    if (!streamRef.current) {
      alert('Камера не готова');
      return;
    }

    try {
      // Reset chunks
      chunksRef.current = [];

      // Get video and audio tracks
      const videoTracks = streamRef.current.getVideoTracks();
      const audioTracks = streamRef.current.getAudioTracks();

      if (videoTracks.length === 0) {
        alert('Нет видеотрека');
        return;
      }

      // Create new stream with both tracks
      const recordingStream = new MediaStream([
        ...videoTracks,
        ...audioTracks
      ]);

      // Find supported mime type
      const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=h264,opus',
        'video/webm'
      ];
      
      let mimeType = '';
      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          break;
        }
      }

      // Create MediaRecorder
      const options: MediaRecorderOptions = {
        mimeType: mimeType || undefined,
        videoBitsPerSecond: 2500000,
        audioBitsPerSecond: 128000
      };

      const recorder = new MediaRecorder(recordingStream, options);
      mediaRecorderRef.current = recorder;

      // Handle data
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      // Handle stop
      recorder.onstop = () => {
        if (chunksRef.current.length === 0) {
          alert('Запись не удалась');
          return;
        }

        try {
          const blob = new Blob(chunksRef.current, { 
            type: mimeType || 'video/webm' 
          });
          
          if (blob.size === 0) {
            alert('Файл пуст');
            return;
          }

          const ext = mimeType.includes('mp4') ? '.mp4' : '.webm';
          const file = new File([blob], `video-${Date.now()}${ext}`, {
            type: mimeType || 'video/webm'
          });
          
          cleanup();
          onRecorded(file);
        } catch (error) {
          console.error('Error creating file:', error);
          alert('Ошибка создания файла');
        }
      };

      // Start recording
      recorder.start(1000);
      setIsRecording(true);
      setSeconds(0);
      
      // Timer
      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setSeconds(elapsed);
        
        if (elapsed >= maxDuration) {
          stopRecording();
        }
      }, 1000);
      
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Ошибка начала записи');
      cleanup();
    }
  }, [cleanup, maxDuration, onRecorded]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Toggle camera
  const toggleCamera = useCallback(async () => {
    const newFacing = facing === 'user' ? 'environment' : 'user';
    setFacing(newFacing);
    setMirrored(newFacing === 'user');
    await startDevices(newFacing);
  }, [facing, startDevices]);

  // Init
  useEffect(() => {
    startDevices('user');
    return cleanup;
  }, [startDevices, cleanup]);

  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Progress
  const progress = maxDuration > 0 ? (seconds / maxDuration) * 100 : 0;
  const perimeter = 2 * (94 + 94);

  // Error state
  if (!isReady) {
    return (
      <div className="fixed inset-0 z-[300] bg-black/95 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-white/20 border-t-[#8b5cf6] rounded-full animate-spin mx-auto" />
          <p className="text-white/60 mt-4 text-sm">Загрузка камеры...</p>
        </div>
      </div>
    );
  }

  // Minimized mode
  if (mode === 'minimized') {
    return (
      <div className="fixed bottom-20 left-3 right-3 md:left-auto md:right-6 md:w-[480px] z-[60] bg-[#1f1f23]/95 backdrop-blur-md border border-white/15 rounded-2xl shadow-2xl shadow-black/60 p-3">
        <div className="flex items-center gap-3">
          {/* Video preview */}
          <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-black flex-shrink-0 ring-1 ring-white/10">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: mirrored ? 'scaleX(-1)' : 'none' }}
            />
            {isRecording && (
              <div className="absolute top-1 left-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            )}
          </div>

          {/* Timer */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-sm font-bold text-red-400 tabular-nums">
                {formatTime(seconds)}
              </span>
              <span className="text-[10px] text-white/40 tabular-nums">
                / {formatTime(maxDuration)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div 
                className="h-full bg-red-500 transition-all duration-300" 
                style={{ width: `${progress}%` }} 
              />
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {hasFlip && (
              <button
                onClick={toggleCamera}
                className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              >
                <SwitchCamera size={15} />
              </button>
            )}
            
            {onExpand && (
              <button
                onClick={onExpand}
                className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              >
                <Maximize2 size={15} />
              </button>
            )}

            {isRecording ? (
              <button
                onClick={stopRecording}
                className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-bold hover:bg-red-600 transition-colors flex items-center gap-1"
              >
                <Square size={10} fill="currentColor" />
                Стоп
              </button>
            ) : (
              <button
                onClick={startRecording}
                className="px-3 py-1.5 rounded-lg bg-[#8b5cf6] text-white text-xs font-bold hover:bg-[#7c3aed] transition-colors flex items-center gap-1"
              >
                <div className="w-2 h-2 rounded-full bg-white" />
                Запись
              </button>
            )}

            <button
              onClick={() => {
                cleanup();
                onCancel();
              }}
              className="p-2 rounded-lg text-white/50 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Expanded mode
  return (
    <div className="fixed inset-0 z-[300] bg-black/95 flex items-center justify-center">
      <div className="relative flex flex-col items-center">
        {/* Video preview */}
        <div className="relative w-[340px] h-[340px] sm:w-[440px] sm:h-[440px] rounded-2xl overflow-hidden bg-black shadow-2xl ring-1 ring-white/10">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ transform: mirrored ? 'scaleX(-1)' : 'none' }}
          />

          {/* Progress ring */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100">
            <rect 
              x="1.5" y="1.5" width="97" height="97" rx="10" 
              fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" 
            />
            {isRecording && (
              <rect 
                x="1.5" y="1.5" width="97" height="97" rx="10" 
                fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"
                strokeDasharray={perimeter} 
                strokeDashoffset={perimeter * (1 - progress / 100)}
                className="transition-all duration-300" 
              />
            )}
          </svg>

          {/* Status badge */}
          <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-sm rounded-full px-2.5 py-1 ring-1 ring-white/10">
            <span className="text-[11px] text-white/90 font-bold">
              {mirrored ? '🪞 зеркало' : 'без зеркала'}
            </span>
          </div>

          {/* Timer */}
          {isRecording && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-sm rounded-full px-4 py-1.5 ring-1 ring-white/10 flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white text-sm font-mono font-bold tabular-nums">
                {formatTime(seconds)}
              </span>
              <span className="text-white/40 text-xs font-mono">
                / {formatTime(maxDuration)}
              </span>
            </div>
          )}

          {/* Hint */}
          {!isRecording && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <p className="text-white/40 text-sm font-medium">
                  Нажмите ● для записи
                </p>
                <p className="text-white/20 text-xs mt-1">
                  {facing === 'user' ? 'фронтальная' : 'тыловая'} камера
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="mt-6 flex items-center justify-center gap-6 sm:gap-8">
          <button
            onClick={() => {
              cleanup();
              onCancel();
            }}
            className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center text-white/80"
          >
            <X size={24} />
          </button>

          <button
            onClick={toggleCamera}
            disabled={!hasFlip}
            className={`w-14 h-14 rounded-full transition-colors flex items-center justify-center ${
              hasFlip 
                ? 'bg-white/10 hover:bg-white/20 text-white/80' 
                : 'bg-white/5 text-white/20 cursor-not-allowed'
            }`}
          >
            <SwitchCamera size={22} />
          </button>

          {isRecording ? (
            <button
              onClick={stopRecording}
              className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 transition-colors flex items-center justify-center shadow-lg shadow-red-500/30 ring-4 ring-red-500/20"
            >
              <Square size={28} className="text-white" fill="white" />
            </button>
          ) : (
            <button
              onClick={startRecording}
              className="w-20 h-20 rounded-full bg-[#8b5cf6] hover:bg-[#7c3aed] transition-colors flex items-center justify-center shadow-lg shadow-[#8b5cf6]/30 ring-4 ring-[#8b5cf6]/20"
            >
              <div className="w-9 h-9 rounded-full border-[3px] border-white flex items-center justify-center">
                <div className="w-5 h-5 rounded-sm bg-white" />
              </div>
            </button>
          )}

          <button
            onClick={onMinimize}
            className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center text-white/80"
          >
            <Minimize2 size={22} />
          </button>
        </div>

        {/* Footer info */}
        <div className="mt-4 text-center">
          <p className="text-white/30 text-xs font-medium">
            {isRecording 
              ? `⏺ ${formatTime(seconds)} · ${mirrored ? '🪞' : ''} ${facing === 'user' ? 'фронт' : 'тыл'}`
              : '↓ Свернуть · 🔄 Камера · ● Записать · ✕ Отменить'
            }
          </p>
        </div>
      </div>
    </div>
  );
}