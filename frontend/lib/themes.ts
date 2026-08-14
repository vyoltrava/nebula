export type ThemeAnimationType = "aurora" | "gradient" | "liquid" | "neon";

export interface ThemeConfig {
  id: number | string;
  name: string;
  type: ThemeAnimationType;
  colors: string[];   // 2-4 цвета
  speed: number;      // сек на цикл (больше = медленнее)
  intensity: number;  // 0.05–0.5 (яркость)
  blur: number;       // размытие в px
  is_default?: boolean;
}

// 🎨 Встроенные пресеты (потом будут приходить с бэкенда)
export const BUILTIN_THEMES: ThemeConfig[] = [
  {
    id: 1,
    name: "Глубокий космос",
    type: "aurora",
    colors: ["#8b5cf6", "#6366f1", "#0ea5e9"],
    speed: 26,
    intensity: 0.22,
    blur: 80,
    is_default: true,
  },
  {
    id: 2,
    name: "Северное сияние",
    type: "aurora",
    colors: ["#22d3ee", "#34d399", "#818cf8"],
    speed: 22,
    intensity: 0.18,
    blur: 70,
  },
  {
    id: 3,
    name: "Перелив",
    type: "gradient",
    colors: ["#1e1b4b", "#7c3aed", "#db2777", "#0f172a"],
    speed: 18,
    intensity: 0.35,
    blur: 0,
  },
  {
    id: 4,
    name: "Жидкость",
    type: "liquid",
    colors: ["#0ea5e9", "#8b5cf6"],
    speed: 30,
    intensity: 0.15,
    blur: 40,
  },
  {
    id: 5,
    name: "Неоновая ночь",
    type: "neon",
    colors: ["#f472b6", "#8b5cf6", "#22d3ee"],
    speed: 8,
    intensity: 0.2,
    blur: 60,
  },
];

// "Выключено" — тема по умолчанию пока админ не включил
export const NO_THEME: ThemeConfig | null = null;