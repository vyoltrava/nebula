// lib/relayCall.ts
// 📞 Релейный звонок БЕЗ WebRTC: медиа идёт через WebSocket-сервер (TCP),
// как обычный трафик сайта. Не нужны UDP/STUN/TURN — работает там, где
// открывается сам сайт. Двусторонний.
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
  onEvent: (cb: (s: RelayCallState) => void) => () => void;
  getPlayer: () => RelayPlayer | null;
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

/** Захват потока и стрим чанков на сервер. */
export async function startCapture(
  callType: string,
  onChunk: (b: ArrayBuffer) => void,
  chunkMs = 400,
): Promise<RelayCapturedStream | null> {
  if (!navigator.mediaDevices?.getUserMedia) { log('getUserMedia unsupported'); return null; }
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  try {
    const isVideo = callType === 'video';
    stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isVideo ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } : false,
    });
    const wanted = isVideo ? 'video/webm;codecs=vp8,opus' : 'audio/webm;codecs=opus';
    let chosen = '';
    if (typeof MediaRecorder.isTypeSupported === 'function') {
      chosen = MediaRecorder.isTypeSupported(wanted) ? wanted
        : (isVideo ? (MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : 'audio/webm;codecs=opus') : 'audio/webm;codecs=opus');
    } else { chosen = wanted; }
    recorder = new MediaRecorder(stream, { mimeType: chosen });
    const queue: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) queue.push(e.data); };
    recorder.start(chunkMs);
    const mime = chosen;
    const timer = setInterval(() => {
      if (!queue.length) return;
      const blob = new Blob(queue.splice(0, queue.length), { type: mime });
      blob.arrayBuffer().then((ab) => onChunk(ab)).catch((e) => log('arrayBuffer err', e));
    }, chunkMs);
    log('capture started', callType, mime);
    return { stop: () => { clearInterval(timer); try { recorder?.stop(); } catch {} try { stream?.getTracks().forEach((t) => t.stop()); } catch {} log('capture stopped'); } };
  } catch (e) { log('capture failed', callType, (e as Error)?.message || e); return null; }
}
export class RelayPlayer {
  private el: HTMLAudioElement | HTMLVideoElement | null = null;
  private isVideoValue = false;
  private buf: Uint8Array[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private url: string | null = null;
  constructor(isVideo: boolean) { this.isVideoValue = isVideo; }
  get isVideo(): boolean { return this.isVideoValue; }
  attach(el: HTMLAudioElement | HTMLVideoElement): void { this.el = el; this.start(); }
  start(): void { if (!this.flushTimer) this.flushTimer = setInterval(() => this.flush(), 250); }
  push(data: ArrayBuffer): void { this.buf.push(new Uint8Array(data)); }
  private flush(): void {
    if (!this.buf.length || !this.el) return;
    const parts = this.buf; this.buf = [];
    const len = parts.reduce((s, p) => s + p.length, 0);
    const data = new Uint8Array(len); let off = 0;
    for (const p of parts) { data.set(p, off); off += p.length; }
    const blob = new Blob([data as unknown as BlobPart], { type: this.isVideoValue ? 'video/webm' : 'audio/webm' });
    const url = URL.createObjectURL(blob);
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = url;
    try { this.el.src = url; this.el.play().catch(() => { /* deferred */ }); }
    catch (e) { log('flush/play err', e); }
  }
  stop(): void {
    if (this.flushTimer) { clearInterval(this.flushTimer); this.flushTimer = null; }
    if (this.el) { try { this.el.pause(); } catch {} this.el.src = ''; }
    if (this.url) { URL.revokeObjectURL(this.url); this.url = null; }
    this.buf = [];
  }
}
// (content will be written in next step)

export function makeRelayCall(callType: string): RelayCallApi {
  let state: RelayCallState = { callId: '', status: 'idle', isCaller: false, peerId: null, peerName: '', peerAvatar: '', callType };
  let cap: RelayCapturedStream | null = null;
  let player: RelayPlayer | null = null;
  let streamWs: WebSocket | null = null;
  const listeners = new Set<(s: RelayCallState) => void>();
  const emit = () => listeners.forEach((cb) => { try { cb(state); } catch {} });
  const set = (patch: Partial<RelayCallState>, why = '') => { state = { ...state, ...patch }; log('state->', state.status, '(' + why + ')'); emit(); };

  const openStream = async (): Promise<void> => {
    const token = getToken();
    if (!token || !state.callId) return;
    const wsUrl = apiWsUrl(`/api/calls/${state.callId}/stream?token=${token}`);
    log('opening stream ws', wsUrl);
    try {
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => { streamWs = ws; log('stream ws open'); };
      ws.onmessage = (ev) => { if (ev.data instanceof ArrayBuffer) player?.push(ev.data); };
      ws.onerror = (e) => log('stream ws error', e);
      ws.onclose = (e) => { log('stream ws close', e.code, e.reason); if (streamWs === ws) streamWs = null; };
    } catch (e) { log('stream ws open failed', e); }
  };
  const closeStream = () => { try { streamWs?.close(); } catch {} streamWs = null; };
  const cleanup = (why: string) => { cap?.stop(); cap = null; player?.stop(); player = null; closeStream(); log('cleanup', why); };

  return {
    getState: () => state,
    async initiate(targetUserId, callType, name, avatar) {
      log('initiate', targetUserId, callType, name);
      const res = await post('/api/calls/initiate', { target_user_id: targetUserId, call_type: callType });
      if (!res?.ok) { set({ status: 'ended' }, 'initiate-failed'); return; }
      const d = await res.json().catch(() => null);
      if (!d?.call_id) { set({ status: 'ended' }, 'no-call-id'); return; }
      set({ callId: d.call_id, status: 'calling', isCaller: true, peerId: targetUserId, peerName: name, peerAvatar: avatar, callType }, 'initiate');
      cap = await startCapture(callType === 'video' ? 'video' : 'audio', (ab) => { if (streamWs?.readyState === WebSocket.OPEN) streamWs.send(ab); });
      player = new RelayPlayer(callType === 'video'); player.start();
      await openStream();
    },
    incoming(callId, callerId, callType, name, avatar) {
      log('incoming', callId, callerId, name);
      set({ callId, status: 'ringing', isCaller: false, peerId: callerId, peerName: name, peerAvatar: avatar, callType }, 'incoming');
    },
    async accept() {
      log('accept', state.callId);
      await post('/api/calls/action', { call_id: state.callId, action: 'accept' });
      set({ status: 'active' }, 'accept');
      cap = await startCapture(state.callType === 'video' ? 'video' : 'audio', (ab) => { if (streamWs?.readyState === WebSocket.OPEN) streamWs.send(ab); });
      player = new RelayPlayer(state.callType === 'video'); player.start();
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
    onEvent: (cb) => { listeners.add(cb); cb(state); return () => listeners.delete(cb); },
    getPlayer: () => player,
  };
}

let globalApi: RelayCallApi | null = null;
export function getRelayCallApi(): RelayCallApi {
  if (!globalApi) globalApi = makeRelayCall('audio');
  return globalApi;
}

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