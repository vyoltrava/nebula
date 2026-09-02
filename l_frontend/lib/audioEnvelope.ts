/**
 * audioEnvelope.ts — БЛОК 4: вычисление огибающей громкости аудио.
 *
 * Чистые функции (тестируются без браузера). `computeAmplitudeEnvelope`
 * декодирует реальный профиль громкости всего трека — «пики соответствуют
 * громкости», как в Telegram/Signal. Используется как фоновая (статическая)
 * форма волны; в реальном времени огибая дополняется живыми данными
 * AnalyserNode (см. SineWaveform).
 */

/** RMS‑амплитуда из сырых time‑domain байтов AnalyserNode (0..1). */
export function rmsAmplitude(timeDomain: ArrayLike<number>): number {
  if (!timeDomain.length) return 0;
  let sum = 0;
  for (let i = 0; i < timeDomain.length; i++) {
    const v = (timeDomain[i] - 128) / 128; // byte 0..255 → -1..1
    sum += v * v;
  }
  return Math.sqrt(sum / timeDomain.length);
}

/**
 * Огибающая громкости (max‑hold на бин) для всего AudioBuffer,
 * нормирована на [0, 1]. Длина результата = `bins`.
 */
export function computeAmplitudeEnvelope(buffer: AudioBuffer, bins: number): Float32Array {
  const { length, numberOfChannels } = buffer;
  const nBins = Math.max(1, Math.min(bins, length));
  const binSize = Math.max(1, Math.floor(length / nBins));
  const out = new Float32Array(nBins);
  let globalMax = 0;

  for (let b = 0; b < nBins; b++) {
    const start = b * binSize;
    const end = Math.min(start + binSize, length);
    let peak = 0;
    for (let ch = 0; ch < numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = start; i < end; i++) {
        const a = Math.abs(data[i]);
        if (a > peak) peak = a;
        if (a > globalMax) globalMax = a;
      }
    }
    out[b] = peak;
  }

  if (globalMax > 0) {
    const inv = 1 / globalMax;
    for (let i = 0; i < nBins; i++) out[i] *= inv;
  }
  return out;
}

/** Сглаживает огибую за счёт max‑hold в скользящем окне (убирает «зубцы»). */
export function smoothEnvelope(env: Float32Array, windowSize: number): Float32Array {
  const out = new Float32Array(env.length);
  const half = Math.max(1, Math.floor(windowSize / 2));
  for (let i = 0; i < env.length; i++) {
    let max = 0;
    const lo = Math.max(0, i - half);
    const hi = Math.min(env.length, i + half + 1);
    for (let j = lo; j < hi; j++) {
      if (env[j] > max) max = env[j];
    }
    out[i] = max;
  }
  return out;
}
