import { Heart } from "lucide-react";

export function BrokenHeart({ 
  size = 16, 
  className = "" 
}: { 
  size?: number; 
  className?: string;
}) {
  return (
    <div className="relative inline-flex" style={{ width: size, height: size }}>
      <Heart size={size} className={className} />
      {/* Трещина поверх сердца — наследует цвет через currentColor */}
      <svg
        className="absolute inset-0 pointer-events-none"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 6 L10 12 L13 15 L11 20" />
      </svg>
    </div>
  );
}
