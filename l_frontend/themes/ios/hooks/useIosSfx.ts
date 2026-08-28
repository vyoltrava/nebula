"use client";

/**
 * ЗВУКОВОЙ ДВИЖОК «OLD iOS» — все эффекты синтезируются Web Audio API
 * (никаких аудиофайлов). AudioContext создаётся лениво по первому жесту.
 * Выключатель хранится в localStorage (ios-sfx-preference) и подписан
 * через useSyncExternalStore — переключатель живёт в IosThemeSelector.
 */

const STORAGE_KEY = "ios-sfx-preference";

type SfxPref = "on" | "off";

let pref: SfxPref = "on";
let prefLoaded = false;
const listeners = new Set<() => void>();

function readPref(): SfxPref {
  if (typeof window === "undefined") return "on";
  try {
    return localStorage.getItem(STORAGE_KEY) === "off" ? "off" : "on";
  } catch {
    return "on";
  }
}

export function getSfxSnapshot(): SfxPref {
  if (!prefLoaded && typeof window !== "undefined") {
    pref = readPref();
    prefLoaded = true;
  }
  return pref;
}

export function getSfxServerSnapshot(): SfxPref {
  return "on";
}

export function subscribeSfx(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function setSfxEnabled(on: boolean): void {
  pref = on ? "on" : "off";
  prefLoaded = true;
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    /* приватный режим */
  }
  listeners.forEach((l) => l());
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function engine(): AudioContext | null {
  if (getSfxSnapshot() === "off") return null;
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => undefined);
  }
  return ctx;
}

function noiseBuffer(c: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/** Короткий тон с частотным скольжением */
function tone(
  from: number,
  to: number,
  dur: number,
  type: OscillatorType,
  peak: number,
  delay = 0
): void {
  const c = ctx as AudioContext;
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master as GainNode);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** Шумовой всплеск через фильтр (бумага, шуршание, удар) */
function hiss(
  dur: number,
  peak: number,
  freq: number,
  sweepTo?: number,
  type: BiquadFilterType = "bandpass",
  delay = 0
): void {
  const c = ctx as AudioContext;
  const t = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  f.Q.value = 1.1;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master as GainNode);
  src.start(t, Math.random() * 0.4);
  src.stop(t + dur + 0.02);
}

export const iosSfx = {
  /** Прогреть контекст по первому жесту */
  warm(): void {
    engine();
  },

  /** Лёгкий щелчок (ссылки, переключатели) */
  click(): void {
    if (!engine()) return;
    tone(1900, 750, 0.045, "square", 0.07);
    hiss(0.03, 0.05, 3200, undefined, "highpass");
  },

  /** Утопленная клавиша (кнопки форм) */
  press(): void {
    if (!engine()) return;
    tone(210, 80, 0.09, "sine", 0.22);
    hiss(0.035, 0.12, 2400, undefined, "highpass");
  },

  /** Тяжёлый «щелчок» индустриальной кнопки (лайк/шеры) */
  clunk(): void {
    if (!engine()) return;
    tone(320, 130, 0.06, "square", 0.1);
    tone(150, 60, 0.12, "sine", 0.3, 0.03);
    hiss(0.03, 0.14, 3000, undefined, "highpass", 0.02);
  },

  /** Шуршание бумаги */
  paper(): void {
    if (!engine()) return;
    hiss(0.22, 0.14, 900, 2600);
    hiss(0.14, 0.08, 2200, 3600, "bandpass", 0.1);
  },

  /** Удар штампа / сургуча */
  stamp(): void {
    if (!engine()) return;
    tone(95, 42, 0.14, "sine", 0.5);
    hiss(0.05, 0.3, 1400, undefined, "lowpass");
  },

  /** Треск телеграфа (страница уведомлений) */
  telegraph(): void {
    if (!engine()) return;
    let at = 0;
    for (let i = 0; i < 5; i++) {
      tone(760 + Math.random() * 160, 700, 0.022, "square", 0.06, at);
      at += 0.07 + Math.random() * 0.09;
    }
    hiss(0.3, 0.03, 3600, undefined, "highpass");
  },

  /** Перелистывание страницы (закладки) */
  flip(): void {
    if (!engine()) return;
    hiss(0.16, 0.12, 500, 2400);
    tone(500, 240, 0.08, "triangle", 0.05, 0.1);
  },
};
