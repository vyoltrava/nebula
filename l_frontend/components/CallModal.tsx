// frontend/components/CallModal.tsx
'use client';

import { useRef, useEffect, useState } from 'react';
import { useCall } from '@/lib/CallContext';

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function CallModal() {
  const { callState, acceptCall, rejectCall, endCall, toggleMute, toggleVideo } = useCall();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  // iOS: autoplay немuted-видео/аудио блокируется политикой воспроизведения.
  // Медиа стартует muted, а после первого тапа размонтируется (unmute).
  const [remoteUnmuted, setRemoteUnmuted] = useState(false);
  // true — удалённое видео на весь экран (по тапу по квадрату собеседника)
  const [remoteFullscreen, setRemoteFullscreen] = useState(false);

  const {
    status, callType, remoteUserName, remoteUserAvatar, isCaller,
    localStream, remoteStream, isMuted, isVideoOff, duration,
    diag,
  } = callState;

  // Привязка локального видео
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Привязка удаленного видео/аудио (только когда меняется поток —
  // чтобы на iOS не перепривязывать srcObject при каждом переключении mute)
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Размут напрямую через DOM-свойство (без пересоздания медиа-элемента)
  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.muted = !remoteUnmuted;
    if (remoteAudioRef.current) remoteAudioRef.current.muted = !remoteUnmuted;
  }, [remoteUnmuted]);

  // Если звонок не активен — ничего не рендерим
  if (status === 'idle') return null;

  const isActive = status === 'active' || status === 'connecting';
  const isVideoCall = callType === 'video';
  const displayName = remoteUserName || 'Неизвестный';
  const displayAvatar = remoteUserAvatar || '';

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black flex flex-col"
      onClick={() => { if (!remoteUnmuted) setRemoteUnmuted(true); }}
    >
      {/* Аудио-элемент для голосовых звонков — muted старт (iOS), unmute по тапу */}
      {!isVideoCall && <audio ref={remoteAudioRef} autoPlay playsInline muted={!remoteUnmuted} />}
      {/* ======== ОСНОВНАЯ ОБЛАСТЬ ======== */}
      {/* Видео-квадраты: сверху — собеседник, снизу — своя камера (PiP). По тапу на собеседнике — раскрытие на весь экран. */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">

        {/* Удалённое видео: квадрат по центру; по тапу — на весь экран */}
        {isVideoCall && isActive && (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            muted={!remoteUnmuted}
            onClick={() => setRemoteFullscreen((v) => !v)}
            className={
              remoteFullscreen
                ? 'absolute inset-0 w-full h-full object-contain cursor-zoom-out rounded-none'
                : 'w-[240px] h-[240px] object-cover rounded-2xl cursor-zoom-in shadow-2xl'
            }
          />
        )}

        {/* Своя камера — небольшой PiP поверх удалённого видео (если оно не в фуллскрин) */}
        {isVideoCall && isActive && !remoteFullscreen && localStream && (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute bottom-6 right-[-60px] sm:right-6 w-32 h-32 object-cover rounded-2xl shadow-2xl border-2 border-white"
          />
        )}

        {/* Аватарка / статус для аудио-звонков и экрана "звоню" */}
        {!isVideoCall && (
          <div className="flex flex-col items-center justify-center gap-6">
            {displayAvatar ? (
              <img src={displayAvatar} alt={displayName} className="w-40 h-40 rounded-full object-cover border-4 border-white/20" />
            ) : (
              <div className="w-40 h-40 rounded-full bg-gray-700 flex items-center justify-center text-5xl font-bold text-white/70">
                {displayName?.[0]?.toUpperCase() ?? '?'}
              </div>
            )}
                        <div className="text-center">
              <p className="text-2xl font-bold text-white">{displayName}</p>
              <p className="text-sm text-white/50 mt-1">
                {status === 'ringing' ? 'Входящий звонок…' : status === 'initiating' ? 'Звоню…' : 'Соединение…'}
              </p>
              {status !== 'ringing' && status !== 'initiating' && (
                <p className="text-sm text-white/50 mt-2">{formatDuration(duration)}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ======== КНОПКИ УПРАВЛЕНИЯ — один ряд ======== */}
      <div className="flex items-center justify-center gap-4 pb-6">
        {status === 'ringing' && (
          <button
            type="button"
            onClick={() => acceptCall()}
            className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform"
            title="Принять"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.258-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" /></svg>
          </button>
        )}

        {/* Своя камера: квадрат снизу */}
        {isVideoCall && isActive && localStream && !isVideoOff && (
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="absolute bottom-4 left-1/2 -translate-x-1/2 w-28 h-28 rounded-xl object-cover ring-2 ring-white/30"
          />
        )}

        {/* Верхняя панель: имя и статус */}
        <div className="absolute top-0 inset-x-0 z-10 flex flex-col items-center pt-6 pb-2 pointer-events-none">
          <div className="text-xl font-bold text-white drop-shadow">{displayName}</div>
          <div className="text-white/80 text-sm font-medium">
            {status === 'ringing' && isCaller && 'Вызов...'}
            {status === 'ringing' && !isCaller && 'Входящий звонок'}
            {status === 'connecting' && 'Соединение...'}
            {status === 'active' && formatDuration(duration)}
            {status === 'ended' && 'Звонок завершён'}
          </div>
</div>
        </div>
{/* ======== ПАНЕЛЬ УПРАВЛЕНИЯ (кнопки в один ряд) ======== */}
      <div className="py-6 px-4 flex items-center justify-center min-h-[96px]">

        {/* Входящий звонок: отклонить + ответить */}
        {status === 'ringing' && !isCaller && (
          <div className="flex items-center justify-center gap-5">
            <button
              type="button"
              onClick={rejectCall}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform"
              aria-label="Отклонить"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.258-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" /></svg>
            </button>
            <button
              type="button"
              onClick={acceptCall}
              className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform"
              aria-label="Ответить"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h1c.5 0 .93.26 1.16.65l1.72 3.16a2 2 0 01-.4 2.36L6.5 10.9a13.04 13.04 0 006.6 6.6l1.73-1.98a2 2 0 012.36-.4l3.16 1.72c.39.23.65.66.65 1.16v1a2 2 0 01-2 2 15 15 0 01-15-15z" /></svg>
            </button>
          </div>
        )}

        {/* Исходящий звонок: отменить */}
        {status === 'ringing' && isCaller && (
          <button
            type="button"
            onClick={endCall}
            className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform"
            aria-label="Отменить"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.258-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" /></svg>
          </button>
        )}

        {/* Активный/соединяющийся: микрофон + камера + завершить в один ряд */}
        {(status === 'active' || status === 'connecting') && (
          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={toggleMute}
              className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform ${isMuted ? 'bg-amber-400 text-gray-900' : 'bg-white/15 text-white'}`}
              title={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
            >
              {isMuted ? (
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
              ) : (
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
              )}
            </button>

            {isVideoCall && (
              <button
                type="button"
                onClick={toggleVideo}
                className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform ${isVideoOff ? 'bg-amber-400 text-gray-900' : 'bg-white/15 text-white'}`}
                title={isVideoOff ? 'Включить камеру' : 'Выключить камеру'}
              >
                {isVideoOff ? (
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                ) : (
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={endCall}
              className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform"
              title="Завершить"
            >
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.258-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" /></svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}