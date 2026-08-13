"use client";
import { useRef, useState, useEffect } from "react";
import { Play, Pause, Rewind, FastForward } from "lucide-react";
import { mediaUrl } from "@/lib/media";

interface VideoPlayerProps {
  src: string;
  className?: string;
}

type FeedbackType = "play" | "pause" | "-5" | "+5" | null;

export function VideoPlayer({ src, className = "" }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [feedback, setFeedback] = useState<{ type: FeedbackType; id: number } | null>(null);
  const feedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const feedbackIdRef = useRef(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("ended", handleEnded);

    return () => {
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("ended", handleEnded);
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
        <div className="w-14 h-14 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <Icon size={28} className="text-white" fill="currentColor" />
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
      />

      {/* Большая иконка Play по центру когда видео на паузе (и не было недавнего действия) */}
      {!isPlaying && !feedback && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
          <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center backdrop-blur-sm">
            <Play size={32} className="text-black ml-1" fill="currentColor" />
          </div>
        </div>
      )}

      {/* Всплывающий фидбек при тапе */}
      {renderFeedbackIcon()}

      {/* Невидимые разделители для понимания зон (для разработки можно раскомментировать) */}
      {/*
      <div className="absolute inset-y-0 left-0 w-[30%] border-r border-red-500/30 pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-[30%] border-l border-red-500/30 pointer-events-none" />
      */}
    </div>
  );
}