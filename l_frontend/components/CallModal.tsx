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
  const [remoteUnmuted, setRemoteUnmuted] = useState(false);

  const {
    status, callType, remoteUserName, remoteUserAvatar, isCaller,
    localStream, remoteStream, isMuted, isVideoOff, duration,
  } = callState;

  // Привязка локального видео
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Привязка удаленного видео/аудио
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
      className="fixed inset-0 z-[9999] bg-black flex flex-col text-white"
      onClick={() => { if (!remoteUnmuted) setRemoteUnmuted(true); }}
    >
      {/* Скрытый аудио-элемент для голосовых звонков (iOS unmute по тапу) */}
      {!isVideoCall && <audio ref={remoteAudioRef} autoPlay playsInline muted={!remoteUnmuted} />}

      {/* ======== 1. ВЕРХНЯЯ ПАНЕЛЬ: Имя и статус ======== */}
      <div className="flex flex-col items-center pt-8 pb-2">
        <h2 className="text-2xl font-bold drop-shadow-md">{displayName}</h2>
        <p className="text-white/70 text-sm font-medium mt-1">
          {status === 'ringing' && isCaller && 'Вызов...'}
          {status === 'ringing' && !isCaller && 'Входящий звонок'}
          {status === 'connecting' && 'Соединение...'}
          {status === 'active' && formatDuration(duration)}
          {status === 'ended' && 'Звонок завершён'}
        </p>
      </div>

      {/* ======== 2. ОСНОВНАЯ ОБЛАСТЬ: Квадраты друг под другом ======== */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 sm:gap-8">
        
        {/* Собеседник (сверху) */}
        <div className="relative w-48 h-48 sm:w-64 sm:h-64 rounded-2xl overflow-hidden bg-gray-800 shadow-2xl border border-white/10 flex items-center justify-center">
          {isVideoCall && isActive && remoteStream ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted={!remoteUnmuted}
              className="w-full h-full object-cover"
            />
          ) : (
            // Заглушка для аудиозвонка или пока нет потока
            displayAvatar ? (
              <img src={displayAvatar} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <span className="text-5xl font-bold text-white/50">
                {displayName?.[0]?.toUpperCase() ?? '?'}
              </span>
            )
          )}
        </div>

        {/* Вы (снизу) */}
        <div className="relative w-32 h-32 sm:w-48 sm:h-48 rounded-2xl overflow-hidden bg-gray-800 shadow-2xl border-2 border-white/20 flex items-center justify-center">
          {isVideoCall && isActive && localStream && !isVideoOff ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          ) : (
            // Заглушка, если камера выключена или это аудиозвонок
            <div className="flex flex-col items-center justify-center text-white/50">
              <svg className="w-10 h-10 sm:w-12 sm:h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-xs mt-1 font-medium">Вы</span>
            </div>
          )}
        </div>

      </div>

      {/* ======== 3. ПАНЕЛЬ УПРАВЛЕНИЯ: Кнопки в ряд ======== */}
      <div className="py-6 px-4 flex items-center justify-center gap-4 sm:gap-6 pb-10">
        
        {/* Входящий звонок: отклонить + ответить */}
        {status === 'ringing' && !isCaller && (
          <>
            <button
              type="button"
              onClick={rejectCall}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform"
              aria-label="Отклонить"
              title="Отклонить"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.258-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" /></svg>
            </button>
            <button
              type="button"
              onClick={acceptCall}
              className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform"
              aria-label="Ответить"
              title="Ответить"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h1c.5 0 .93.26 1.16.65l1.72 3.16a2 2 0 01-.4 2.36L6.5 10.9a13.04 13.04 0 006.6 6.6l1.73-1.98a2 2 0 012.36-.4l3.16 1.72c.39.23.65.66.65 1.16v1a2 2 0 01-2 2 15 15 0 01-15-15z" /></svg>
            </button>
          </>
        )}

        {/* Исходящий звонок: отменить */}
        {status === 'ringing' && isCaller && (
          <button
            type="button"
            onClick={endCall}
            className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform"
            aria-label="Отменить"
            title="Отменить"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.258-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" /></svg>
          </button>
        )}

        {/* Активный/соединяющийся звонок: микрофон + камера + завершить */}
        {(status === 'active' || status === 'connecting') && (
          <>
            <button
              type="button"
              onClick={toggleMute}
              className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform ${isMuted ? 'bg-amber-400 text-gray-900' : 'bg-white/15 text-white hover:bg-white/25'}`}
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
                className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform ${isVideoOff ? 'bg-amber-400 text-gray-900' : 'bg-white/15 text-white hover:bg-white/25'}`}
                title={isVideoOff ? 'Включить камеру' : 'Выключить камеру'}
              >
                {isVideoOff ? (
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
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
          </>
        )}
      </div>
    </div>
  );
}