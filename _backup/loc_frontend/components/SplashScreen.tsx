"use client";

import { useEffect, useState } from "react";

const SPLASH_DURATION = 4000; // анимация ~3.5с + запас

export default function SplashScreen() {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);
  const [src, setSrc] = useState("/logo-animation.svg");

  useEffect(() => {
    const firstRun = !localStorage.getItem("splashSeen");
    const justLoggedIn = sessionStorage.getItem("justLoggedIn");

    if (!firstRun && !justLoggedIn) return;

    if (firstRun) localStorage.setItem("splashSeen", "1");
    if (justLoggedIn) sessionStorage.removeItem("justLoggedIn");

    // перезапускаем анимацию
    setSrc("/logo-animation.svg?r=" + Date.now());
    setVisible(true);

    const t1 = setTimeout(() => setFading(true), SPLASH_DURATION);
    const t2 = setTimeout(() => setVisible(false), SPLASH_DURATION + 500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className={"splash" + (fading ? " splash--hidden" : "")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="splash__img" />
    </div>
  );
}