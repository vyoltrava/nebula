// components/SwipeableMessage.tsx
"use client";
import { useSwipe } from "@/lib/useSwipe";
import { Send } from "lucide-react";

export function SwipeableMessage({
  children,
  onSwipeRight,
  msgId,
  raised = false,
}: {
  children: React.ReactNode;
  onSwipeRight: () => void;
  msgId: number;
  raised?: boolean;
}) {
  const { offset, direction, isSwiping, handlers } = useSwipe({
    threshold: 80,
    maxOffset: 120,
    resistance: 0.3,
    onSwipeRight,
  });

  const showReplyIcon = direction === "right" && offset > 30;
  const iconOpacity = Math.min((offset - 30) / 50, 1);

  return (
    <div
      className={`relative select-none ${raised ? "z-50" : ""}`}
      style={{ touchAction: "pan-y" }}
      {...handlers}
    >
      {showReplyIcon && (
        <div
          className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none"
          style={{ opacity: iconOpacity }}
        >
          <div className="w-10 h-10 rounded-full bg-[#8b5cf6]/20 border-2 border-[#8b5cf6] flex items-center justify-center">
            <Send size={18} className="text-[#8b5cf6] rotate-180" />
          </div>
        </div>
      )}
      <div
        className="relative z-10 transition-transform"
        style={{
          transform: `translateX(${isSwiping ? offset : 0}px)`,
          transition: isSwiping ? "none" : "transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        }}
      >
        {children}
      </div>
    </div>
  );
}