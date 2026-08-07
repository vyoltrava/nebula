"use client";
import { useState, useEffect } from "react";

export function SystemName({ name }: { name: string }) {
  const [displayText, setDisplayText] = useState("");
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    let i = 0;
    let timeout: NodeJS.Timeout;
    
    const typing = setInterval(() => {
      if (i <= name.length) {
        setDisplayText(name.slice(0, i));
        i++;
      } else {
        clearInterval(typing);
        // Пауза 3 секунды, затем перезапуск
        timeout = setTimeout(() => {
          i = 0;
          setDisplayText("");
          // Перезапускаем interval
          const newTyping = setInterval(() => {
            if (i <= name.length) {
              setDisplayText(name.slice(0, i));
              i++;
            } else {
              clearInterval(newTyping);
            }
          }, 150);
        }, 3000);
      }
    }, 150);

    const cursor = setInterval(() => {
      setShowCursor(prev => !prev);
    }, 500);

    return () => {
      clearInterval(typing);
      clearInterval(cursor);
      clearTimeout(timeout);
    };
  }, [name]);

  return (
    <span className="font-mono text-green-400 drop-shadow-[0_0_10px_rgba(0,255,65,0.6)]">
      {displayText}
      <span className={showCursor ? "opacity-100" : "opacity-0"}>█</span>
    </span>
  );
}