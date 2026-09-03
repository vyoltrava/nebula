'use client';

import { useRef, useEffect, useState } from 'react';
import { useCall } from '@/lib/CallContext';
import { callSounds } from '@/lib/callSounds';

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

  // Звук включён по умолчанию; muted-фолбэк только если браузер заблокировал unmuted-автоплей
  const [remoteUnmuted, setRemoteUnmuted] = useState(true);

  const {
    status, callType, remoteUserName, remoteUserAvatar, isCaller,
    localStream, remoteStream, isMuted, isVideoOff, duration, diag,
  } = callState;

  // Привязка локального видео
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      // Принудительный play для Android/iOS WebView
      localVideoRef.current.play().catch(() => {
        // Игнорируем ошибки, если поток еще не готов
      });
    }
  }, [localStream]);

  // Привязка удаленного видео/аудио
  useEffect(() => {
    const tryPlay = (el: HTMLMediaElement) => {
      el.play().catch((err: DOMException) => {
        // iOS Safari: unmuted-автоплей заблокирован — глушим, запускаем play()
        // снова, а звук вернём при первом тапе (жест пользователя).
        if (err?.name === 'NotAllowedError') {
          el.muted = true;
          setRemoteUnmuted(false);
          el.play().catch(() => {});
        }
      });
    };
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      tryPlay(remoteVideoRef.current);
    }
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
      tryPlay(remoteAudioRef.current);
    }
  }, [remoteStream]);

  // Размут напрямую через DOM-свойство + ОБЯЗАТЕЛЬНЫЙ повторный play():
  // на iOS после смены muted аудио/видео не продолжает играть само.
  useEffect(() => {
    for (const el of [remoteVideoRef.current, remoteAudioRef.current]) {
      if (!el) continue;
      el.muted = !remoteUnmuted;
      if (!remoteUnmuted && el.srcObject) {
        el.play().catch(() => {});
      }
    }
  }, [remoteUnmuted, remoteStream]);

  // Сброс состояния звука между звонками
  useEffect(() => {
    if (status === 'idle' || status === 'ended') setRemoteUnmuted(true);
  }, [status]);

  // 🔔 ЗВУКИ ЗВОНКА: рингтон для входящего, гудок для исходящего,
  // стоп при соединении/завершении + короткий «пип» соединения.
  const connectedSoundRef = useRef(false);
  useEffect(() => {
    if (status === 'ringing') {
      if (isCaller) callSounds.playOutgoing();
      else callSounds.playIncoming();
      connectedSoundRef.current = false;
    } else {
      callSounds.stopAll();
      if (status === 'active' && !connectedSoundRef.current) {
        connectedSoundRef.current = true;
        callSounds.playConnected();
      }
      if (status === 'idle' || status === 'ended') connectedSoundRef.current = false;
    }
    return () => { callSounds.stopAll(); };
  }, [status, isCaller]);

  if (status === 'idle') return null;

  const isActive = status === 'active' || status === 'connecting';
  const isVideoCall = callType === 'video';
  const displayName = remoteUserName || 'Неизвестный';
  const displayAvatar = remoteUserAvatar || '';

  // Адаптив: квадрат = min(70% ширины экрана, 30% высоты, 320px).
  // На телефонах — крупный, на ПК/низких окнах — ограничен по высоте,
  // поэтому панель управления никогда не уезжает за экран.
  const videoBoxClass = "relative w-[min(70vw,30vh,320px)] h-[min(70vw,30vh,320px)] rounded-2xl overflow-hidden bg-black shadow-2xl flex items-center justify-center";

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black flex flex-col text-white overflow-hidden"
      onClick={() => { if (!remoteUnmuted) setRemoteUnmuted(true); }}
    >
      {!isVideoCall && <audio ref={remoteAudioRef} autoPlay playsInline muted={!remoteUnmuted} />}

      {/* ======== 1. ВЕРХНЯЯ ПАНЕЛЬ: Имя и статус ======== */}
      <div className="shrink-0 flex flex-col items-center pt-6 sm:pt-8 pb-2 px-4">
        <h2 className="text-2xl font-bold drop-shadow-md truncate max-w-full">{displayName}</h2>
        <p className="text-white/70 text-sm font-medium mt-1">
          {(status === 'ringing' || status === 'initiating') && isCaller && 'Вызов...'}
          {status === 'ringing' && !isCaller && 'Входящий звонок'}
          {status === 'connecting' && 'Соединение...'}
          {status === 'active' && formatDuration(duration)}
          {status === 'ended' && 'Звонок завершён'}
        </p>

        {/* 📊 Диагностика соединения — видна, пока не подключились */}
        {status === 'connecting' && diag && (
          <p className="text-[11px] text-white/40 font-mono mt-1">
            ICE:{diag.ice} · H/S/R:{diag.candHost}/{diag.candSrflx}/{diag.candRelay} · TURN:{diag.turnActive ? 'ON' : 'OFF'}
            {diag.candidateErrors > 0 && ` · err:${diag.candidateErrors}`}
          </p>
        )}

        {/* ⚠️ Красная плашка при проблемах ICE */}
        {diag && (diag.ice === 'failed' || diag.conn === 'failed') && (
          <div className="mt-2 px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-400/40 max-w-[92%]">
            <p className="text-xs text-red-200 text-center">
              {diag.hint || 'Не удалось установить P2P-соединение. Проверьте сеть или TURN-сервер.'}
            </p>
          </div>
        )}
      </div>

      {/* ======== 2. ОСНОВНАЯ ОБЛАСТЬ: Два квадрата ======== */}
      {/* min-h-0 + shrink: область сжимается, кнопки управления ВСЕГДА остаются на экране */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4 sm:gap-8 px-3">
        
        {/* СОБЕСЕДНИК (Сверху) */}
        <div className={videoBoxClass + " border border-white/10"}>
          {isVideoCall ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted={!remoteUnmuted}
              className="w-full h-full object-cover transform-gpu"
              style={{ transform: 'translateZ(0)' }} /* Фикс серого экрана на Android */
            />
          ) : (
            // Заглушка для аудио-звонка
            displayAvatar ? (
              <img src={displayAvatar} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <span className="text-5xl font-bold text-white/50">
                {displayName?.[0]?.toUpperCase() ?? '?'}
              </span>
            )
          )}
        </div>

        {/* ВЫ (Снизу) */}
        <div className={videoBoxClass + " border-2 border-white/20"}>
          {isVideoCall ? (
            isVideoOff ? (
              // Показываем иконку ТОЛЬКО если пользователь сам выключил камеру
              <div className="flex flex-col items-center justify-center text-white/50">
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                <span className="text-xs mt-2 font-medium">Камера выкл.</span>
              </div>
            ) : (
              // Видео рендерится ВСЕГДА, если это видеозвонок и камера не выключена вручную
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted /* ОБЯЗАТЕЛЬНО для автовоспроизведения на Android/iOS */
                className="w-full h-full object-cover transform-gpu"
                style={{ transform: 'translateZ(0)' }} /* Фикс серого экрана на Android */
              />
            )
          ) : (
            // Заглушка для аудио-звонка
            <div className="flex flex-col items-center justify-center text-white/50">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-xs mt-2 font-medium">Вы</span>
            </div>
          )}
        </div>

      </div>

      {/* ======== 3. ПАНЕЛЬ УПРАВЛЕНИЯ ======== */}
      <div className="shrink-0 py-4 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex items-center justify-center gap-4 sm:gap-6">
        
        {status === 'ringing' && !isCaller && (
          <>
            <button onClick={rejectCall} className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform" aria-label="Отклонить">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.258-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" /></svg>
            </button>
            <button onClick={acceptCall} className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform" aria-label="Ответить">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h1c.5 0 .93.26 1.16.65l1.72 3.16a2 2 0 01-.4 2.36L6.5 10.9a13.04 13.04 0 006.6 6.6l1.73-1.98a2 2 0 012.36-.4l3.16 1.72c.39.23.65.66.65 1.16v1a2 2 0 01-2 2 15 15 0 01-15-15z" /></svg>
            </button>
          </>
        )}

        {status === 'ringing' && isCaller && (
          <button onClick={endCall} className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform" aria-label="Отменить">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.258-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" /></svg>
          </button>
        )}

        {(status === 'active' || status === 'connecting') && (
          <>
            <button
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