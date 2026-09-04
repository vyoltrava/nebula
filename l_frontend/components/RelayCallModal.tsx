// components/RelayCallModal.tsx
// 📞 UI релейного звонка (без WebRTC). Полноценно: иконки трубок, звуки,
// видео, статусы, сброс у каждого. Медиа идёт через сервер (WebSocket-релей).
'use client';

import { useEffect, useRef, useState } from 'react';
import { getRelayCallApi, RelayPlayer } from '@/lib/relayCall';
import { callSounds } from '@/lib/callSounds';
import type { RelayCallState } from '@/lib/relayCall';

function TubeIcon({ end = false, className = 'w-7 h-7' }: { end?: boolean; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d={end
          ? 'M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.258-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z'
          : 'M3 5a2 2 0 012-2h1c.5 0 .93.26 1.16.65l1.72 3.16a2 2 0 01-.4 2.36L6.5 10.9a13.04 13.04 0 006.6 6.6l1.73-1.98a2 2 0 012.36-.4l3.16 1.72c.39.23.65.66.65 1.16v1a2 2 0 01-2 2 15 15 0 01-15-15z'}
      />
    </svg>
  );
}

export default function RelayCallModal() {
  const api = getRelayCallApi();
  const [st, setSt] = useState<RelayCallState>(api.getState());
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const playerRef = useRef<RelayPlayer | null>(null);

  // Подписка на изменения состояния API
  useEffect(() => api.onEvent((s) => setSt({ ...s })), [api]);

  // Когда активен — привязываем плеер API к нашим remote-элементам.
  useEffect(() => {
    const pl = api.getPlayer();
    if (pl) {
      if (pl.isVideo && remoteVideoRef.current) pl.attach(remoteVideoRef.current);
      else if (!pl.isVideo && remoteAudioRef.current) pl.attach(remoteAudioRef.current);
    }
  }, [st.status, st.callType]);
// Звуки звонка: входящий/исходящий гудок; стоп при соединении/сбросе.
  const pingedRef = useRef(false);
  useEffect(() => {
    if (st.status === 'ringing') {
      if (st.isCaller) callSounds.playOutgoing();
      else callSounds.playIncoming();
      pingedRef.current = false;
    } else {
      callSounds.stopAll();
      if (st.status === 'active' && !pingedRef.current) {
        pingedRef.current = true;
        callSounds.playConnected();
      }
      if (st.status === 'idle' || st.status === 'ended') pingedRef.current = false;
    }
    return () => callSounds.stopAll();
  }, [st.status, st.isCaller]);

  if (st.status === 'idle' || st.status === 'ended') return null;

  const isActive = st.status === 'active';
  const isRinging = st.status === 'ringing';
  const isCalling = st.status === 'calling';
  const isVideoCall = st.callType === 'video';
  const name = st.peerName || 'Неизвестный';

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col text-white overflow-hidden">
      {/* видео-зона */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {isVideoCall && isActive ? (
          <div className="relative w-[min(70vw,220px)] aspect-square rounded-2xl overflow-hidden bg-black/40 flex items-center justify-center">
            <video ref={remoteVideoRef} className="w-full h-full object-cover" muted playsInline />
          </div>
        ) : (
          <div className="w-28 h-28 rounded-full bg-white/10 flex items-center justify-center text-5xl overflow-hidden">
            {st.peerAvatar
              ? <img src={st.peerAvatar} alt={name} className="w-full h-full object-cover" />
              : '📞'}
          </div>
        )}
        <h2 className="text-2xl font-bold mt-4">{name}</h2>
        <p className="text-white/70">
          {isCalling ? 'Вызов...' : isRinging ? 'Входящий звонок' : 'Идёт разговор'}
        </p>
        {isActive && (
          <div className="flex items-center gap-2 mt-4 text-green-400 text-sm">
            <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" /> live
          </div>
        )}
        <audio ref={remoteAudioRef} className="hidden" />
      </div>

      {/* кнопки */}
      <div className="shrink-0 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex items-center justify-center gap-5">
        {isRinging && !st.isCaller && (
          <>
            <button onClick={() => api.reject()} className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg active:scale-95" aria-label="Отклонить">
              <TubeIcon end className="w-8 h-8" />
            </button>
            <button onClick={() => api.accept()} className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center shadow-lg active:scale-95" aria-label="Ответить">
              <TubeIcon className="w-8 h-8" />
            </button>
          </>
        )}
        {(isCalling || isActive) && (
          <button onClick={() => api.end()} className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg active:scale-95" aria-label="Завершить">
            <TubeIcon end className="w-8 h-8" />
          </button>
        )}
      </div>
    </div>
  );
}