"use client";
import { useTheme } from "@/components/ThemeProvider";

export function AnimatedBackground() {
  const { theme } = useTheme();

  if (!theme) return null;

  const c1 = theme.colors[0] || "#8b5cf6";
  const c2 = theme.colors[1] || "#6366f1";
  const c3 = theme.colors[2] || "#0ea5e9";
  const c4 = theme.colors[3] || c1;

  const style = {
    "--theme-speed": `${theme.speed}s`,
    "--theme-intensity": String(theme.intensity),
    "--theme-blur": `${theme.blur}px`,
    "--c1": c1,
    "--c2": c2,
    "--c3": c3,
    "--c4": c4,
  } as React.CSSProperties;

  return (
    <div className={`animated-bg type-${theme.type}`} style={style} aria-hidden="true">
      {theme.type === "aurora" && (
        <>
          <div className="blob blob-1" style={{ background: `radial-gradient(circle at center, ${c1} 0%, transparent 70%)` }} />
          <div className="blob blob-2" style={{ background: `radial-gradient(circle at center, ${c2} 0%, transparent 70%)` }} />
          <div className="blob blob-3" style={{ background: `radial-gradient(circle at center, ${c3} 0%, transparent 70%)` }} />
        </>
      )}

      {theme.type === "liquid" && (
        <>
          <div className="wave wave-1" style={{ background: `radial-gradient(ellipse at center, ${c1} 0%, transparent 65%)` }} />
          <div className="wave wave-2" style={{ background: `radial-gradient(ellipse at center, ${c2} 0%, transparent 65%)` }} />
        </>
      )}

      {theme.type === "neon" && (
        <>
          <div className="neon-spot neon-1" style={{ background: c1 }} />
          <div className="neon-spot neon-2" style={{ background: c2 }} />
          <div className="neon-spot neon-3" style={{ background: c3 }} />
        </>
      )}

      {/* gradient — рисуется через CSS на самом контейнере */}
    </div>
  );
}