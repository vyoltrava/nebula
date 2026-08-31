"use client";

/**
 * 🌌 OrbitOnboarding: анимация знакомства с орбитой при первом запуске.
 * Сцена 1: скелетный нижний бар (как в TG) — пункты по очереди «оживают».
 * Сцена 2: бар плавно морфится в орбитальную дугу с кнопками (SVG).
 * Дугу можно реально потрогать (pointerdown) — как в настоящей орбите.
 * Показывается один раз: флаг в localStorage (`nebula_orbit_intro_v1`) —
 * работает и для уже зарегистрированных пользователей.
 * Повтор без нового аккаунта: localStorage.removeItem("nebula_orbit_intro_v1")
 * и перезагрузить страницу (или вызвать orbitIntroReset()).
 */
import { useCallback, useEffect, useState } from "react";
import { Home, Compass, Bell, Bookmark, MessageCircle, Orbit, ChevronRight } from "lucide-react";
import { useI18nSafe } from "@/lib/i18n/LanguageProvider";

const FLAG = "nebula_orbit_intro_v1";

export function orbitIntroReset() {
  try {
    localStorage.removeItem(FLAG);
  } catch {}
}

export default function OrbitOnboarding() {
  const { t } = useI18nSafe();
  const [visible, setVisible] = useState(false);
  const [stage, setStage] = useState<0 | 1 | 2>(0); // 0 = скрыто, 1 = скелетный бар, 2 = орбита
  const [closing, setClosing] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [tried, setTried] = useState(false);
  const [showArrow, setShowArrow] = useState(false);

  useEffect(() => {
    try {
      // Повтор для уже зарегистрированных: открыть /?orbit-intro=1
      const force = new URLSearchParams(window.location.search).get("orbit-intro") === "1";
      if (force) {
        localStorage.removeItem(FLAG);
        window.history.replaceState(null, "", window.location.pathname);
      }
      if (!localStorage.getItem(FLAG)) {
        setVisible(true);
        setStage(1);
      }
    } catch {}
  }, []);

  // Сцена 1 → 2: скелетный бар живёт ~2.8с, потом морфится в орбиту
  useEffect(() => {
    if (stage !== 1) return;
    const id = window.setTimeout(() => setStage(2), 2800);
    return () => window.clearTimeout(id);
  }, [stage]);

  // Запуск из админки (кнопка «Показать обучение орбите»)
  useEffect(() => {
    const show = () => {
      setVisible(true);
      setStage(1);
      setClosing(false);
    };
    window.addEventListener("orbit-intro-show", show);
    return () => window.removeEventListener("orbit-intro-show", show);
  }, []);

  const finish = useCallback(() => {
    setClosing(true);
    try {
      localStorage.setItem(FLAG, "1");
    } catch {}
    window.setTimeout(() => {
      setVisible(false);
      // На телефоне после закрытия — стрелка, переводящая взгляд на реальную кнопку орбиты
      if (window.matchMedia("(max-width: 767px)").matches) setShowArrow(true);
    }, 350);
  }, []);

  // Стрелка-подсказка исчезает сама через 4с
  useEffect(() => {
    if (!showArrow) return;
    const id = window.setTimeout(() => setShowArrow(false), 4000);
    return () => window.clearTimeout(id);
  }, [showArrow]);

  if (!visible) {
    // После закрытия на телефоне: стрелка + пульсирующее кольцо переводят
    // взгляд на реальную кнопку орбиты (правый край, середина экрана)
    if (!showArrow) return null;
    return (
      <div className="fixed inset-0 z-[9998] pointer-events-none" data-orbit-ignore>
        <div
          className="absolute right-1 top-1/2 -translate-y-1/2 w-16 h-16 rounded-full border-2 border-[#8b5cf6]"
          style={{ animation: "obRing 1.2s ease-out infinite" }}
        />
        <div
          className="absolute right-[72px] top-1/2 -translate-y-1/2 text-[#8b5cf6]"
          style={{ animation: "obArrow 1.2s ease-in-out infinite" }}
        >
          <ChevronRight size={36} strokeWidth={3} />
        </div>
      </div>
    );
  }

  const onPointerDown = () => {
    setPressed(true);
    setTried(true);
  };
  const onPointerUp = () => setPressed(false);

  // Пункты скелетного бара и узлы дуги (на полуокружности r=100 над кнопкой)
  const items = [
    { Icon: Home, x: -87, y: -50 },
    { Icon: Compass, x: -50, y: -87 },
    { Icon: Bell, x: 0, y: -100 },
    { Icon: Bookmark, x: 50, y: -87 },
    { Icon: MessageCircle, x: 87, y: -50 },
  ];
  const isOrbit = stage === 2;

  return (
    <div
      className={
        "fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm transition-opacity duration-300 " +
        (closing ? "opacity-0" : "opacity-100")
      }
      role="dialog"
      aria-modal="true"
      aria-label={t("onboarding.title")}
      data-orbit-ignore
      onClick={finish}
    >
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        {/* Текст (один блок, сверху) */}
        <div className="mb-2 max-w-sm px-6 text-center">
          <h2 className="text-lg font-bold text-white">{t("onboarding.title")}</h2>
          <p className="mt-1 text-sm text-white/70">{t("onboarding.desc")}</p>
          {tried && <p className="mt-2 text-sm font-semibold text-[#8b5cf6]">{t("onboarding.hintTry")}</p>}
        </div>

        <div className="relative mb-20 h-64 w-full max-w-md">
          {/* Сцена 1: скелетный нижний бар (как в TG) */}
          <div
            className="absolute inset-x-8 bottom-2 flex items-end justify-around rounded-2xl border border-white/10 bg-white/[0.06] px-3 pb-3 pt-2 backdrop-blur"
            style={{
              opacity: isOrbit ? 0 : 1,
              transform: isOrbit ? "scale(0.85) translateY(30px)" : "scale(1)",
              transition: "opacity 350ms ease, transform 400ms cubic-bezier(.4,0,.2,1)",
            }}
            aria-label={t("onboarding.skeletonLabel")}
          >
            {items.map(({ Icon }, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div className="relative flex h-10 w-10 items-center justify-center">
                  <div
                    className="absolute h-10 w-10 rounded-full bg-white/25"
                    style={{ animation: `obPulse 1.4s ease-in-out ${i * 0.22}s infinite` }}
                  />
                  <Icon size={18} className="relative text-white/80" />
                </div>
                <div className="h-1.5 w-8 rounded-full bg-white/20" />
              </div>
            ))}
          </div>

          {/* Сцена 2: орбитальная дуга (SVG) */}
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 400 256"
            fill="none"
            aria-hidden="true"
            style={{
              opacity: isOrbit ? 1 : 0,
              transform: isOrbit ? "scale(1)" : "scale(0.85)",
              transition: "opacity 350ms ease 150ms, transform 400ms cubic-bezier(.4,0,.2,1) 150ms",
            }}
          >
            <path
              d="M 100 240 A 100 100 0 0 1 300 240"
              stroke="rgba(139,92,246,0.45)"
              strokeWidth="2"
              strokeDasharray="6 6"
              fill="none"
              style={{ opacity: pressed ? 1 : 0, transition: "opacity 200ms ease" }}
            />
            <line
              x1="200" y1="240" x2="200" y2="145"
              stroke="rgba(139,92,246,0.6)"
              strokeWidth="2"
              style={{ opacity: pressed ? 1 : 0, transition: "opacity 200ms ease" }}
            />
          </svg>

          {/* Центральная кнопка-якорь — как кнопка вызова реальной орбиты */}
          <button
            type="button"
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            className={"absolute bottom-[26px] left-1/2 flex h-14 w-14 items-center justify-center border bg-paper dark:bg-[#171717]/90 backdrop-blur-sm shadow-lg shadow-gray-400/40 dark:shadow-black/50 transition-all duration-300 " +
              (pressed
                ? "rounded-full border-[#8b5cf6]/50 bg-[#8b5cf6]/20 scale-110"
                : "rounded-full border-line dark:border-white/10")}
            style={{
              opacity: isOrbit ? 1 : 0,
              transform: `translateX(-50%) scale(${isOrbit ? (pressed ? 0.95 : 1) : 0.6})`,
              transition: "opacity 300ms ease 150ms, transform 300ms cubic-bezier(.2,.8,.3,1.2) 150ms",
            }}
            aria-label={t("onboarding.title")}
          >
            <span className="absolute inset-0 rounded-full bg-[#8b5cf6]/30" style={{ animation: "obPulse 1.8s ease-in-out infinite" }} />
            <Orbit size={22} className={"relative transition-all duration-300 " + (pressed ? "text-[#8b5cf6] rotate-[60deg]" : "text-gray-800 dark:text-white/80")} />
          </button>

          {/* Кнопки дуги (каскад при удержании) — над кнопкой орбиты */}
          {items.map(({ Icon, x, y }, i) => (
            <div
              key={i}
              className="pointer-events-none absolute bottom-[54px] left-1/2 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white shadow-lg backdrop-blur"
              style={{
                transform: `translate(calc(-50% + ${x}px), calc(${y}px - 50%)) scale(${isOrbit && pressed ? 1 : 0})`,
                opacity: isOrbit && pressed ? 1 : 0,
                transition: `transform 260ms cubic-bezier(.2,.8,.3,1.15) ${i * 45}ms, opacity 200ms ${i * 45}ms`,
              }}
            >
              <Icon size={20} />
            </div>
          ))}
        </div>

        {/* Кнопки управления */}
        <div className="mb-6 flex items-center gap-3">
          <button
            type="button"
            onClick={finish}
            className="rounded-full bg-white/10 px-4 py-1.5 text-sm text-white/70 transition-colors hover:bg-white/20 hover:text-white"
          >
            {t("onboarding.skip")}
          </button>
          <button
            type="button"
            onClick={finish}
            className="rounded-full bg-[#8b5cf6] px-5 py-1.5 text-sm font-semibold text-white shadow-lg shadow-[#8b5cf6]/30 transition-transform active:scale-95"
          >
            {t("onboarding.done")}
          </button>
        </div>
</div>
</div>
  );
}
