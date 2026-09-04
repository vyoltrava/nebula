// lib/relayCall.ts
// 📞 Релейный звонок БЕЗ WebRTC. Медиа идёт через WebSocket (TCP).
// Приём через MSE (MediaSource Extensions) — чанки стримятся в <audio>.
// Кодек согласуется между сторонами через meta-сообщение:
//   Safari пишет audio/mp4, Chrome/Firefox — audio/webm;codecs=opus.
'use client';

import { getToken } from '@/lib/auth';
import { socket } from '@/lib/websocket';

export type RelayStatus = 'idle' | 'calling' | 'ringing' | 'active' | 'ended';

export interface RelayCallState {
  callId: string;
  status: RelayStatus;
  isCaller: boolean;
  peerId: number | null;
  peerName: string;
  peerAvatar: string;
  callType: string;
}

export interface RelayCapturedStream { stop: () => void; }

export interface RelayCallApi {
  getState: () => RelayCallState;
  initiate: (targetUserId: number, callType: string, name: string, avatar: string) => Promise<void>;
  incoming: (callId: string, callerId: number, callType: string, name: string, avatar: string) => void;
  accept: () => Promise<void>;
  reject: () => Promise<void>;
  end: () => Promise<void>;
  remoteEnded: () => void;
  remoteAccepted: () => Promise<void>;
  remoteRejected: () => void;
  getReceiver: () => RelayReceiver | null;
  onEvent: (cb: (s: RelayCallState) => void) => () => void;
}

function apiUrl(): string { return process.env.NEXT_PUBLIC_API_URL || ''; }
function apiWsUrl(path: string): string { return apiUrl().replace(/^http/, 'ws') + path; }
function log(...a: unknown[]): void { console.log('[RELAY]', ...a); }

async function post(path: string, body: unknown): Promise<Response | null> {
  const token = getToken();
  try {
    const res = await fetch(`${apiUrl()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    log('POST', path, '->', res.status);
    if (!res.ok) log('POST body:', await res.text().catch(() => ''));
    return res;
  } catch (e) { log('POST failed', path, e); return null; }
}

/** Выбираем mime, который умеет этот браузер (Safari=mp4, Chrome/Firefox=webm). */
export function pickRecorderMime(isVideo: boolean): string {
  const audio = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
  const video = ['video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const list = isVideo ? video : audio;
  try {
    if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
      for (const m of list) if (MediaRecorder.isTypeSupported(m)) return m;
    }
  } catch {}
  return list[0];
}
/** Захват потока: recorder -> чанки -> onChunk; первым вызывается onMeta(mime). */
export async function startCapture(
  callType: string,
  mime: string,
  onChunk: (b: ArrayBuffer) => void,
  chunkMs = 60,
): Promise<RelayCapturedStream | null> {
  if (!navigator.mediaDevices?.getUserMedia) { log('getUserMedia unsupported'); return null; }
  let stream: MediaStream | null = null;
  try {
    const isVideo = callType === 'video';
    stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isVideo ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } : false,
    });
    log('capture mime=', mime);
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    // 🔥 Низкая задержка: MediaRecorder сам вызывает ondataavailable каждые
    // chunkMs без промежуточного setInterval (он добавлял лишнюю паузу
    // и накапливал чанки -> «невыносимая» задержка).
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        e.data.arrayBuffer().then((ab) => onChunk(ab)).catch((err) => log('chunk err', err));
      }
    };
    recorder.start(chunkMs);
    log('capture started', callType, chunkMs + 'ms');
    return { stop: () => { try { recorder.stop(); } catch {} stream?.getTracks().forEach((t) => t.stop()); log('capture stopped'); } };
  } catch (e) { log('capture failed', callType, (e as Error)?.message || e); return null; }
}

/**
 * Приёмник: MSE-стриминг чанков в <audio>/<video>.
 * Safari-получатель: 'audio/mp4' поддержан MSE — работает.
 * Если MSE/mime не поддержан — фолбэк: полный буфер через blob (костыль).
 */
export class RelayReceiver {
  private el: HTMLAudioElement | HTMLVideoElement | null = null;
  private ms: MediaSource | null = null;
  private sb: SourceBuffer | null = null;
  private mime = '';
  private isVideoValue = false;
  private queue: ArrayBuffer[] = [];
  private appending = false;
  private fallback: Uint8Array[] = [];
  private fallbackUrl: string | null = null;
  private mseOk = false;
  private started = false;

  init(mime: string, isVideo: boolean): void {
    if (this.started) return;
    this.started = true;
    this.mime = mime;
    this.isVideoValue = isVideo;
    try {
      const MSE = (window as any).MediaSource;
      if (MSE && typeof MSE.isTypeSupported === 'function' && MSE.isTypeSupported(mime)) {
        const ms: MediaSource = new MSE();
        this.ms = ms;
        this.el = isVideo ? document.createElement('video') : new Audio();
        this.el.src = URL.createObjectURL(ms);
        (this.el as HTMLAudioElement).autoplay = true;
        ms.addEventListener('sourceopen', () => {
          try {
            this.sb = ms.addSourceBuffer(mime);
            if ('mode' in this.sb) (this.sb as any).mode = 'sequence';
            this.sb.addEventListener('updateend', () => this.drain());
            this.drain();
            log('receiver MSE ready', mime);
          } catch (e) { log('addSourceBuffer failed', e); this.mseOk = false; }
        });
        this.mseOk = true;
        this.el.play().catch(() => {});
        log('receiver MSE init', mime);
        return;
      }
    } catch (e) { log('MSE init error', e); }
    this.mseOk = false;
    this.el = isVideo ? document.createElement('video') : new Audio();
    log('receiver fallback (blob)', mime);
  }

  get element(): HTMLAudioElement | HTMLVideoElement | null { return this.el; }
  get isVideo(): boolean { return this.isVideoValue; }

  push(data: ArrayBuffer): void {
    if (!this.started) return;
    if (this.mseOk) { this.queue.push(data); this.drain(); }
    else { this.fallback.push(new Uint8Array(data)); this.flushFallback(); }
  }

  private drain(): void {
    if (!this.sb || this.appending || !this.queue.length) return;
    const chunk = this.queue.shift()!;
    try {
      this.appending = true;
      // 🔥 Не даём буферу MSE раздуваться: если накоплено больше ~1 сек,
      // удаляем старые сегменты (иначе задержка растёт → «невыносимо»).
      try {
        const sd = this.sb.buffered;
        if (sd.length && sd.end(sd.length - 1) - sd.start(0) > 1.0) {
          this.sb.remove(sd.start(0), sd.end(sd.length - 1) - 0.5);
        }
      } catch {}
      this.sb.appendBuffer(chunk);
    } catch (e) {
      log('appendBuffer err', e);
      this.appending = false;
    }
  }

  /** Костыль-фолбэк: весь буфер от начала звонка -> blob -> src. */
  private flushFallback(): void {
    if (!this.el || !this.fallback.length) return;
    const len = this.fallback.reduce((s, p) => s + p.length, 0);
    const data = new Uint8Array(len); let off = 0;
    for (const p of this.fallback) { data.set(p, off); off += p.length; }
    const blob = new Blob([data as unknown as BlobPart], { type: this.mime });
    const url = URL.createObjectURL(blob);
    if (this.fallbackUrl) URL.revokeObjectURL(this.fallbackUrl);
    this.fallbackUrl = url;
    const prev = this.el.currentTime;
    try { this.el.src = url; this.el.currentTime = prev; this.el.play().catch(() => {}); } catch {}
  }

  stop(): void {
    try { this.el?.pause(); } catch {}
    if (this.el) this.el.src = '';
    try { if (this.sb) { try { this.sb.abort(); } catch {} } } catch {}
    try { if (this.ms && this.ms.readyState === 'open') this.ms.endOfStream(); } catch {}
    this.sb = null; this.ms = null; this.el = null;
    this.queue = []; this.fallback = [];
    if (this.fallbackUrl) { URL.revokeObjectURL(this.fallbackUrl); this.fallbackUrl = null; }
    this.started = false;
    log('receiver stopped');
  }
}

export function makeRelayCall(defaultCallType: string): RelayCallApi {
  let state: RelayCallState = { callId: '', status: 'idle', isCaller: false, peerId: null, peerName: '', peerAvatar: '', callType: defaultCallType };
  let cap: RelayCapturedStream | null = null;
  let receiver: RelayReceiver | null = null;
  let streamWs: WebSocket | null = null;
  let myMime = '';
  // 🔴 Исходящая очередь: meta и чанки, накопленные ДО открытия stream-WS.
  // Раньше meta отправлялась сразу из startCapture — когда WS ещё был закрыт —
  // и терялась. Приёмник без meta не инициализирует MSE → звука не было.
  const outQueue: (ArrayBuffer | string)[] = [];
  const listeners = new Set<(s: RelayCallState) => void>();
  const emit = () => listeners.forEach((cb) => { try { cb(state); } catch {} });
  const set = (patch: Partial<RelayCallState>, why = '') => { state = { ...state, ...patch }; log('state->', state.status, '(' + why + ')'); emit(); };

  const sendChunk = (ab: ArrayBuffer) => {
    if (streamWs?.readyState === WebSocket.OPEN) streamWs.send(ab);
    else { if (outQueue.length < 300) outQueue.push(ab); }
  };
  // meta отправляется в onopen; резервный sendMeta не нужен, но оставляем для ясности

  const openStream = async (): Promise<void> => {
    const token = getToken();
    if (!token || !state.callId) return;
    const wsUrl = apiWsUrl(`/api/calls/${state.callId}/stream?token=${token}`);
    log('opening stream ws');
    try {
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        streamWs = ws;
        log('stream ws open');
        // 🔑 Отправляем meta СРАЗУ после открытия + флушим очередь чанков
        if (myMime) {
          try { ws.send(JSON.stringify({ t: 'meta', mime: myMime })); log('meta sent on open:', myMime); } catch {}
        }
        while (outQueue.length) {
          const item = outQueue.shift()!;
          try { ws.send(item as any); } catch (e) { log('queue flush err', e); break; }
        }
      };
      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') {
          try {
            const m = JSON.parse(ev.data);
            if (m?.t === 'meta') {
              log('peer meta mime=', m.mime);
              receiver?.init(m.mime, state.callType === 'video');
            }
          } catch {}
          return;
        }
        if (ev.data instanceof ArrayBuffer) receiver?.push(ev.data);
      };
      ws.onerror = (e) => log('stream ws error', e);
      ws.onclose = (e) => { log('stream ws close', e.code, e.reason); if (streamWs === ws) streamWs = null; };
    } catch (e) { log('stream ws open failed', e); }
  };
  const closeStream = () => { try { streamWs?.close(); } catch {} streamWs = null; };
  const cleanup = (why: string) => { cap?.stop(); cap = null; receiver?.stop(); receiver = null; closeStream(); log('cleanup', why); };

  return {
    getState: () => state,
    async initiate(targetUserId, callType, name, avatar) {
      log('initiate', targetUserId, callType, name);
      const res = await post('/api/calls/initiate', { target_user_id: targetUserId, call_type: callType });
      if (!res?.ok) { set({ status: 'ended' }, 'initiate-failed'); return; }
      const d = await res.json().catch(() => null);
      if (!d?.call_id) { set({ status: 'ended' }, 'no-call-id'); return; }
      myMime = pickRecorderMime(callType === 'video');
      set({ callId: d.call_id, status: 'calling', isCaller: true, peerId: targetUserId, peerName: name, peerAvatar: avatar, callType }, 'initiate');
      receiver = new RelayReceiver();
      cap = await startCapture(callType, myMime, sendChunk);
      await openStream();
    },
    incoming(callId, callerId, callType, name, avatar) {
      log('incoming', callId, callerId, name);
      set({ callId, status: 'ringing', isCaller: false, peerId: callerId, peerName: name, peerAvatar: avatar, callType }, 'incoming');
    },
    async accept() {
      log('accept', state.callId);
      await post('/api/calls/action', { call_id: state.callId, action: 'accept' });
      myMime = pickRecorderMime(state.callType === 'video');
      set({ status: 'active' }, 'accept');
      receiver = new RelayReceiver();
      cap = await startCapture(state.callType, myMime, sendChunk);
      await openStream();
    },
    async reject() {
      log('reject', state.callId);
      await post('/api/calls/action', { call_id: state.callId, action: 'reject' });
      cleanup('reject'); set({ status: 'ended' }, 'reject');
    },
    async end() {
      log('end', state.callId);
      if (state.callId) await post('/api/calls/action', { call_id: state.callId, action: 'end' });
      cleanup('end'); set({ status: 'ended' }, 'end');
    },
    remoteEnded() {
      log('remoteEnded');
      cleanup('remote-ended'); set({ status: 'ended' }, 'remote-end');
    },
    async remoteAccepted() {
      log('remoteAccepted');
      if (state.status !== 'calling') { log('remoteAccepted ignored, status=', state.status); return; }
      set({ status: 'active' }, 'remote-accepted');
      if (!receiver) receiver = new RelayReceiver();
      if (!cap) {
        myMime = pickRecorderMime(state.callType === 'video');
        cap = await startCapture(state.callType, myMime, sendChunk);
      }
      if (!streamWs) await openStream();
    },
    remoteRejected() {
      log('remoteRejected');
      cleanup('remote-rejected'); set({ status: 'ended' }, 'remote-reject');
    },
    getReceiver: () => receiver,
    onEvent: (cb) => { listeners.add(cb); cb(state); return () => listeners.delete(cb); },
  };
}

let globalApi: RelayCallApi | null = null;
export function getRelayCallApi(): RelayCallApi {
  if (!globalApi) globalApi = makeRelayCall('audio');
  return globalApi;
}

