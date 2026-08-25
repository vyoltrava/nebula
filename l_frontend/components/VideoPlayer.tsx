"use client";
import { useRef, useState, useEffect } from "react";
import { Play, Pause, Rewind, FastForward, Volume2, VolumeX, Film } from "lucide-react";
import { mediaUrl } from "@/lib/media";

interface VideoPlayerProps {
  src: string;
  className?: string;
}

type FeedbackType = "play" | "pause" | "-5" | "+5" | null;

export function VideoPlayer({ src, className = "" }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [feedback, setFeedback] = useState<{ type: FeedbackType; id: number } | null>(null);
  const feedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const feedbackIdRef = useRef(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);
    const handleMeta = () => setDuration(video.duration || 0);
    const handleTime = () => setCurrentTime(video.currentTime);

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("loadedmetadata", handleMeta);
    video.addEventListener("timeupdate", handleTime);

    return () => {
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("loadedmetadata", handleMeta);
      video.removeEventListener("timeupdate", handleTime);
    };
  }, []);

  const showFeedback = (type: FeedbackType) => {
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    feedbackIdRef.current += 1;
    setFeedback({ type, id: feedbackIdRef.current });
    feedbackTimeoutRef.current = setTimeout(() => setFeedback(null), 600);
  };

  const handleVideoClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    const zone = x / width;

    if (zone < 0.3) {
      video.currentTime = Math.max(0, video.currentTime - 5);
      showFeedback("-5");
    } else if (zone > 0.7) {
      video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
      showFeedback("+5");
    } else {
      if (video.paused) {
        video.play();
        showFeedback("play");
      } else {
        video.pause();
        showFeedback("pause");
      }
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMuted(!muted);
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const renderFeedbackIcon = () => {
    if (!feedback) return null;
    let Icon = Play;
    let label = "";
    let positionClass = "left-1/2 -translate-x-1/2";

    switch (feedback.type) {
      case "play": Icon = Play; break;
      case "pause": Icon = Pause; break;
      case "-5": Icon = Rewind; label = "5"; positionClass = "left-[15%] -translate-x-1/2"; break;
      case "+5": Icon = FastForward; label = "5"; positionClass = "right-[15%] translate-x-1/2"; break;
    }

    return (
      <div key={feedback.id} className={`absolute top-1/2 ${positionClass} -translate-y-1/2 pointer-events-none z-10 animate-[ping_0.6s_ease-out_forwards]`}>
        <div className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <Icon size={24} className="text-gray-900 dark:text-white" fill="currentColor" />
          {label && <span className="absolute bottom-0.5 text-[10px] font-bold text-gray-900 dark:text-white">{label}</span>}
        </div>
      </div>
    );
  };

  return (
    <div className={`relative rounded-xl overflow-hidden bg-black select-none transition-all duration-300 ${!loaded && !failed ? "aspect-video" : ""} ${className}`}>
      <video
        ref={videoRef}
        src={mediaUrl(src)}
        // 🔥 ГЛАВНОЕ ИЗМЕНЕНИЕ ЗДЕСЬ:
        className={`w-full cursor-pointer transition-all duration-300 ease-in-out ${
          isPlaying 
            ? "h-auto max-h-none" // При проигрывании: полная ширина, высота по пропорциям, без ограничений
            : "h-auto max-h-64 sm:max-h-80 md:max-h-96" // В паузе: ограничено по высоте
        } ${loaded ? "opacity-100" : "opacity-0"}`}
        playsInline
        muted={muted}
        onLoadedData={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />

      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-100 dark:bg-white/20">
        <div className="h-full bg-[#8b5cf6] transition-all duration-200" style={{ width: `${progress}%` }} />
      </div>

      <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/60 text-gray-800 dark:text-white/80 text-[10px] font-mono">
        {isPlaying ? formatTime(duration - currentTime) : formatTime(duration)}
      </div>

      <button onClick={toggleMute} className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-gray-800 dark:text-white/80 hover:bg-black/80 transition-colors">
        {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
      </button>

      {renderFeedbackIcon()}

      {!loaded && !failed && (
        <div className="absolute inset-0 bg-gray-50 dark:bg-[#0d0d10]">
          <div className="absolute inset-0 skeleton-shimmer" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-white/10 animate-pulse flex items-center justify-center">
              <Film size={20} className="text-[#a78bfa]" />
            </div>
            <span className="text-[10px] font-medium text-gray-500 dark:text-white/30">Загрузка видео…</span>
          </div>
        </div>
      )}

      {failed && (
        <div className="absolute inset-0 bg-gray-50 dark:bg-[#0d0d10] flex flex-col items-center justify-center gap-1.5 text-gray-500 dark:text-white/30">
          <Film size={20} />
          <span className="text-[10px] font-bold">видео недоступно</span>
        </div>
      )}
    </div>
  );
}