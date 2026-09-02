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

  const [remoteUnmuted, setRemoteUnmuted] = useState(false);

  const {
    status, callType, remoteUserName, remoteUserAvatar, isCaller,
    localStream, remoteStream, isMuted, isVideoOff, duration,
  } = callState;

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(() => {});
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch(() => {});
    }
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.play().catch(() => {});
    }
  }, [remoteStream]);

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.muted = !remoteUnmuted;
    if (remoteAudioRef.current) remoteAudioRef.current.muted = !remoteUnmuted;
  }, [remoteUnmuted]);

  if (status === 'idle') return null;

  const isActive = status === 'active' || status === 'connecting';
  const isVideoCall = callType === 'video';
  const displayName = remoteUserName || 'Неизвестный';
  const displayAvatar = remoteUserAvatar || '';

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black flex flex-col text-white overflow-hidden"
      onClick={() => { if (!remoteUnmuted) setRemoteUnmuted(true); }}
    >
      {!isVideoCall && <audio ref={remoteAudioRef} autoPlay playsInline muted={!remoteUnmuted} />}

      {/* ШАПКА — компактная */}
      <div className="flex flex-col items-center pt-4 pb-2 shrink-0">
        <h2 className="text-xl font-bold">{displayName}</h2>
        <p className="text-white/70 text-xs mt-0.5">
          {status === 'ringing' && isCaller && 'Вызов...'}
          {status === 'ringing' && !isCaller && 'Входящий звонок'}
          {status === 'connecting' && 'Соединение...'}
          {status === 'active' && formatDuration(duration)}
          {status === 'ended' && 'Звонок завершён'}
        </p>
      </div>

      {/* ДВА КВАДРАТА ОТ КРАЯ ДО КРАЯ */}
      <div className="flex-1 flex flex-col w-full min-h-0 gap-0.5 px-0.5">
        
        {/* СОБЕСЕДНИК — на всю ширину, квадрат */}
        <div 
          className="relative w-full flex-1 rounded-lg overflow-hidden bg-black"
          style={{ aspectRatio: '1 / 1', maxHeight: 'calc((100vh - 180px) / 2)' }}
        >
          {isVideoCall ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted={!remoteUnmuted}
              className="absolute inset-0 w-full h-full object-cover"
              style={{ transform: 'translateZ(0)' }}
            />
          ) : displayAvatar ? (
            <img src={displayAvatar} alt={displayName} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
              <span className="text-7xl font-bold text-white/30">
                {displayName?.[0]?.toUpperCase() ?? '?'}
              </span>
            </div>
          )}
        </div>

        {/* ВЫ — на всю ширину, квадрат */}
        <div 
          className="relative w-full flex-1 rounded-lg overflow-hidden bg-black"
          style={{ aspectRatio: '1 / 1', maxHeight: 'calc((100vh - 180px) / 2)' }}
        >
          {isVideoCall && !isVideoOff ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
              style={{ transform: 'translateZ(0)' }}
            />
          ) : isVideoCall && isVideoOff ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900">
              <svg className="w-16 h-16 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              <span className="text-sm mt-2 text-white/50">Камера выкл.</span>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900">
              <svg className="w-16 h-16 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-sm mt-2 text-white/50">Вы</span>
            </div>
          )}
        </div>

      </div>

      {/* КНОПКИ — внизу */}
      <div className="shrink-0 py-4 px-4 flex items-center justify-center gap-5 pb-6">
        
        {status === 'ringing' && !isCaller && (
          <>
            <button onClick={rejectCall} className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.258-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" /></svg>
            </button>
            <button onClick={acceptCall} className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h1c.5 0 .93.26 1.16.65l1.72 3.16a2 2 0 01-.4 2.36L6.5 10.9a13.04 13.04 0 006.6 6.6l1.73-1.98a2 2 0 012.36-.4l3.16 1.72c.39.23.65.66.65 1.16v1a2 2 0 01-2 2 15 15 0 01-15-15z" /></svg>
            </button>
          </>
        )}

        {status === 'ringing' && isCaller && (
          <button onClick={endCall} className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.258-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" /></svg>
          </button>
        )}

        {(status === 'active' || status === 'connecting') && (
          <>
            <button
              onClick={toggleMute}
              className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform ${isMuted ? 'bg-amber-400 text-gray-900' : 'bg-white/15 text-white'}`}
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
                className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform ${isVideoOff ? 'bg-amber-400 text-gray-900' : 'bg-white/15 text-white'}`}
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
            >
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.258-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" /></svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}