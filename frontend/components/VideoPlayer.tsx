"use client";
import { useRef, useState, useEffect } from "react";
import { Play, Pause, Rewind, FastForward, Volume2, VolumeX } from "lucide-react";
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
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current);
    }
    feedbackIdRef.current += 1;
    setFeedback({ type, id: feedbackIdRef.current });
    feedbackTimeoutRef.current = setTimeout(() => {
      setFeedback(null);
    }, 600);
  };

  const handleVideoClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    const zone = x / width; // 0..1

    if (zone < 0.3) {
      // Левая зона — перемотка назад
      video.currentTime = Math.max(0, video.currentTime - 5);
      showFeedback("-5");
    } else if (zone > 0.7) {
      // Правая зона — перемотка вперёд
      video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
      showFeedback("+5");
    } else {
      // Центр — play/pause
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
      case "play":
        Icon = Play;
        break;
      case "pause":
        Icon = Pause;
        break;
      case "-5":
        Icon = Rewind;
        label = "5";
        positionClass = "left-[15%] -translate-x-1/2";
        break;
      case "+5":
        Icon = FastForward;
        label = "5";
        positionClass = "right-[15%] translate-x-1/2";
        break;
    }

    return (
      <div
        key={feedback.id}
        className={`absolute top-1/2 ${positionClass} -translate-y-1/2 pointer-events-none z-10 animate-[ping_0.6s_ease-out_forwards]`}
      >
        <div className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <Icon size={24} className="text-white" fill="currentColor" />
          {label && (
            <span className="absolute bottom-0.5 text-[10px] font-bold text-white">
              {label}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className={`relative rounded-xl overflow-hidden bg-black select-none ${className}`}
      onClick={handleVideoClick}
    >
      <video
        ref={videoRef}
        src={mediaUrl(src)}
        className="w-full h-auto max-h-64 sm:max-h-80 md:max-h-96 cursor-pointer"
        playsInline
        muted={muted}
      />

      {/* Прогресс-бар снизу как в Telegram */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
        <div
          className="h-full bg-[#8b5cf6] transition-all duration-200"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Время */}
      <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/60 text-white/80 text-[10px] font-mono">
        {isPlaying ? formatTime(duration - currentTime) : formatTime(duration)}
      </div>

      {/* Кнопка звука */}
      <button
        onClick={toggleMute}
        className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white/80 hover:bg-black/80 transition-colors"
      >
        {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
      </button>

      {/* 🔇 НЕТ БОЛЬШОЙ КНОПКИ PLAY — только фидбек при клике */}
      {renderFeedbackIcon()}
    </div>
  );
}