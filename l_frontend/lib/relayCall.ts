// lib/relayCall.ts
// 📞 Релейный звонок БЕЗ WebRTC: аудио идёт через WebSocket-сервер (TCP),
// как обычный трафик сайта. Не нужны UDP/STUN/TURN — значит работает
// везде, где открывается сам сайт (Firefox/Safari/iPhone/Android).
// Аудио: MediaRecorder (opus/webm) -> чанки -> WS -> релей -> плеер.
'use client';

import { getToken } from '@/lib/auth';
import { socket } from '@/lib/websocket';

interface RelayCallSession {
  callId: string;
  status: 'idle' | 'calling' | 'ringing' | 'active' | 'ended';
  isCaller: boolean;
  peerId: number | null;
  peerName: string;
  peerAvatar: string;
}

export interface RelayCallApi {
  state: RelayCallSession;
  initiate: (targetUserId: number, callType: string, name: string, avatar: string) => Promise<void>;
  incoming: (callId: string, callerId: number, callType: string, name: string, avatar: string) => void;
  accept: () => Promise<void>;
  reject: () => Promise<void>;
  end: () => Promise<void>;
}

function apiUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || '';
}

async function post(path: string, body: unknown) {
  const token = getToken();
  return fetch(`${apiUrl()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const TICK = 400; // ms: отдаём чанки с MediaRecorder пачками
/** Запись микрофона и отправка чанков на сервер. */
async function startCapture(onChunk: (b: ArrayBuffer) => void): Promise<{ stop: () => void } | null> {
  if (!navigator.mediaDevices?.getUserMedia) return null;
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
    const queue: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) queue.push(e.data); };
    recorder.start(400);
    const rec = recorder;
    const timer = setInterval(() => {
      if (!queue.length) return;
      const blob = new Blob(queue.splice(0, queue.length), { type: 'audio/webm' });
      blob.arrayBuffer().then((ab) => onChunk(ab));
    }, TICK);
    return {
      stop: () => {
        clearInterval(timer);
        try { rec.stop(); } catch {}
        stream?.getTracks().forEach((t) => t.stop());
      },
    };
  } catch (e) {
    console.error('relay capture failed', e);
    return null;
  }
}

/** Воспроизведение принимаемых чанков (webm) через один <audio>-элемент. */
export class RelayPlayer {
  private audio: HTMLAudioElement | null = null;
  private buf: Uint8Array[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private url: string | null = null;

  start(): void {
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.loop = true;
      this.audio.preload = 'auto';
    }
    this.flushTimer = setInterval(() => this.flush(), 250);
  }

  push(data: ArrayBuffer): void {
    this.buf.push(new Uint8Array(data));
  }

  private flush(): void {
    if (!this.buf.length || !this.audio) return;
    const data = this.concat(this.buf);
    this.buf = [];
    const blob = new Blob([data as unknown as BlobPart], { type: 'audio/webm' });
    const url = URL.createObjectURL(blob);
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = url;
    this.audio.src = url;
    try { this.audio.play(); } catch {}
  }

  private concat(parts: Uint8Array[]): Uint8Array {
    const len = parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(len);
    let off = 0;
    for (const p of parts) {
      const src = p.buffer instanceof ArrayBuffer ? new Uint8Array(p.buffer, p.byteOffset, p.byteLength) : p;
      out.set(src as Uint8Array<ArrayBuffer>, off);
      off += src.length;
    }
    return out;
  }

  stop(): void {
    if (this.flushTimer) { clearInterval(this.flushTimer); this.flushTimer = null; }
    if (this.audio) { try { this.audio.pause(); } catch {} this.audio.src = ''; }
    if (this.url) { URL.revokeObjectURL(this.url); this.url = null; }
    this.buf = [];
  }
}

/** Подписка на сигнальные события релей-звонка через общий WS. */
export function onRelayCallSignal(cb: (type: string, data: any) => void): () => void {
  const handlers: [string, (d: any) => void][] = [
    ['relay_call_incoming', (d) => cb('incoming', d)],
    ['relay_call_accepted', (d) => cb('accepted', d)],
    ['relay_call_rejected', (d) => cb('rejected', d)],
    ['relay_call_active', (d) => cb('active', d)],
    ['relay_call_ended', (d) => cb('ended', d)],
  ];
  handlers.forEach(([ev, fn]) => socket.on(ev, fn));
  return () => handlers.forEach(([ev, fn]) => socket.off(ev, fn));
}

const emptyState = (): RelayCallSession => ({
  callId: '', status: 'idle', isCaller: false, peerId: null, peerName: '', peerAvatar: '',
});

// Глобальный синглтон: одна модалка на всё приложение.
let globalApi: RelayCallApi | null = null;
let globalOnState: ((s: RelayCallSession) => void) | null = null;

export function getRelayCallApi(cb?: (s: RelayCallSession) => void): RelayCallApi {
  if (!globalApi) {
    globalApi = makeRelayCall((s) => globalOnState?.(s));
  }
  if (cb) globalOnState = cb;
  return globalApi;
}

export function makeRelayCall(onState: (s: RelayCallSession) => void): RelayCallApi {
  let state = emptyState();
  let cap: { stop: () => void } | null = null;
  let player: RelayPlayer | null = null;
  let streamWs: WebSocket | null = null;

  const set = (patch: Partial<RelayCallSession>) => { state = { ...state, ...patch }; onState(state); };

  const connectStream = async () => {
    const token = getToken();
    if (!token || !state.callId) return;
    const wsUrl = apiUrl().replace(/^http/, 'ws') + `/api/calls/${state.callId}/stream?token=${token}`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => { streamWs = ws; };
    ws.onmessage = (ev) => { if (ev.data instanceof ArrayBuffer) player?.push(ev.data); };
    ws.onclose = () => { if (streamWs === ws) streamWs = null; };
  };

  return {
    get state() { return state; },
    async initiate(targetUserId, callType, name, avatar) {
      const res = await post('/api/calls/initiate', { target_user_id: targetUserId, call_type: callType });
      if (!res.ok) return;
      const d = await res.json();
      set({ callId: d.call_id, status: 'calling', isCaller: true, peerId: targetUserId, peerName: name, peerAvatar: avatar });
      cap = await startCapture((ab) => { if (streamWs?.readyState === WebSocket.OPEN) streamWs.send(ab); });
      player = new RelayPlayer(); player.start();
      await connectStream();
    },
    incoming(callId, callerId, callType, name, avatar) {
      // Входящий зВОнок от сервера: используем ПРИСЛАННЫЙ call_id (не создаём новый).
      set({ callId, status: 'ringing', isCaller: false, peerId: callerId, peerName: name, peerAvatar: avatar });
    },
    async accept() {
      if (!state.callId) return;
      await post('/api/calls/action', { call_id: state.callId, action: 'accept' });
      set({ status: 'active' });
      player = new RelayPlayer(); player.start();
      await connectStream();
    },
    async reject() {
      if (!state.callId) return;
      await post('/api/calls/action', { call_id: state.callId, action: 'reject' });
      cleanup(); set({ status: 'ended' });
    },
    async end() {
      if (state.callId) await post('/api/calls/action', { call_id: state.callId, action: 'end' });
      cleanup(); set({ status: 'ended' });
    },
  };

  function cleanup() {
    cap?.stop(); cap = null;
    player?.stop(); player = null;
    try { streamWs?.close(); } catch {}
    streamWs = null;
  }
}