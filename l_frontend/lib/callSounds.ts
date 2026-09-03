// lib/callSounds.ts
// 🔔 Стандартные звуки звонка: входящий рингтон, исходящий гудок, звук соединения.
// Файлы лежат в /public/sounds/*.wav (синтезированы, классический телефонный тембр).

const BASE = '/sounds';

const cache: Record<string, HTMLAudioElement> = {};

function getAudio(file: string, loop = false): HTMLAudioElement {
  const key = `${file}:${loop}`;
  if (!cache[key]) {
    const a = new Audio(`${BASE}/${file}`);
    a.loop = loop;
    a.preload = 'auto';
    cache[key] = a;
  }
  return cache[key];
}

/** Запуск зацикленного звука (рингтон/гудок). Игнорирует ошибки автоплея. */
function playLoop(file: string, volume = 1): void {
  try {
    const a = getAudio(file, true);
    a.volume = volume;
    a.currentTime = 0;
    a.play().catch(() => {
      // Автоплей заблокирован (нет жеста пользователя) — попробуем muted-старт:
      // после первого тапа звук всё равно не критичен, глушим и не спамим.
      a.muted = true;
      a.play().catch(() => {});
    });
  } catch { /* ignore */ }
}

function stop(file: string): void {
  try {
    for (const key of Object.keys(cache)) {
      if (key.startsWith(`${file}:`)) {
        const a = cache[key];
        a.pause();
        a.currentTime = 0;
        a.muted = false;
      }
    }
  } catch { /* ignore */ }
}

export const callSounds = {
  /** Входящий звонок — зацикленный двойной рингтон */
  playIncoming() { playLoop('ringtone-incoming.wav'); },
  /** Исходящий звонок — зацикленный гудок вызова */
  playOutgoing() { playLoop('ringtone-outgoing.wav'); },
  /** Короткий «пип» установления соединения (одноразовый) */
  playConnected() {
    try {
      const a = getAudio('call-connected.wav', false);
      a.volume = 0.8;
      a.currentTime = 0;
      a.play().catch(() => {});
    } catch { /* ignore */ }
  },
  stopIncoming() { stop('ringtone-incoming.wav'); },
  stopOutgoing() { stop('ringtone-outgoing.wav'); },
  /** Полная остановка всех звонковых звуков */
  stopAll() {
    this.stopIncoming();
    this.stopOutgoing();
  },
};
