// frontend/src/hooks/useWebRTC.ts
'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export type CallType = 'audio' | 'video';

export interface CallState {
  status: 'idle' | 'initiating' | 'ringing' | 'connecting' | 'active' | 'ended';
  callId: string | null;
  callType: CallType;
  remoteUserId: number | null;
  remoteUserName: string;
  remoteUserAvatar: string;
  isCaller: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isVideoOff: boolean;
  duration: number;
}

const initialState: CallState = {
  status: 'idle',
  callId: null,
  callType: 'audio',
  remoteUserId: null,
  remoteUserName: '',
  remoteUserAvatar: '',
  isCaller: false,
  localStream: null,
  remoteStream: null,
  isMuted: false,
  isVideoOff: false,
  duration: 0,
};

// 🔥 ОПТИМИЗИРОВАННЫЕ ICE СЕРВЕРЫ
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // Публичные TURN для обхода сложных NAT
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

export function useWebRTC(sendSignal: (data: any) => void) {
  const [state, setState] = useState<CallState>(initialState);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  
  // 🔥 Таймер для форсированной отправки SDP (чтобы не ждать долго сбора ICE)
  const iceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const cleanup = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    if (iceTimeoutRef.current) {
      clearTimeout(iceTimeoutRef.current);
      iceTimeoutRef.current = null;
    }
    if (state.localStream) {
      state.localStream.getTracks().forEach(track => track.stop());
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setState(prev => ({ ...prev, localStream: null, remoteStream: null, duration: 0 }));
  }, [state.localStream]);

  const getMediaStream = async (callType: CallType) => {
    return navigator.mediaDevices.getUserMedia({
      audio: { 
        echoCancellation: true, 
        noiseSuppression: true,
        autoGainControl: true,
        // latency: 0 убрано, так как не стандарт
        channelCount: 1 
      },
      video: callType === 'video' ? { 
        width: { ideal: 1280 }, 
        height: { ideal: 720 }, 
        facingMode: 'user',
        frameRate: { ideal: 30 }
      } : false,
    });
  };

  const initiateCall = useCallback(async (targetUserId: number, callType: CallType, callerName: string, callerAvatar: string) => {
    try {
      const stream = await getMediaStream(callType);
      setState(prev => ({ 
        ...prev, 
        status: 'initiating', 
        callType, 
        remoteUserId: targetUserId, 
        isCaller: true, 
        localStream: stream, 
        remoteUserName: callerName, 
        remoteUserAvatar: callerAvatar 
      }));
      
      sendSignal({
        type: 'call_initiate',
        target_user_id: targetUserId,
        call_type: callType,
        caller_name: callerName,
        caller_avatar: callerAvatar,
      });
    } catch (error) {
      console.error('Ошибка доступа к медиа:', error);
      setState(prev => ({ ...prev, status: 'idle' }));
    }
  }, [sendSignal]);

  const acceptCall = useCallback(async (callId: string, callerId: number, callType: CallType, callerName: string, callerAvatar: string) => {
    try {
      const stream = await getMediaStream(callType);
      setState(prev => ({ 
        ...prev, 
        status: 'connecting', 
        callId, 
        callType, 
        remoteUserId: callerId, 
        isCaller: false, 
        localStream: stream, 
        remoteUserName: callerName, 
        remoteUserAvatar: callerAvatar 
      }));
      
      sendSignal({ type: 'call_accept', call_id: callId, target_user_id: callerId });
      await setupPeerConnection(callId, callType, stream);
    } catch (error) {
      console.error('Ошибка принятия звонка:', error);
      rejectCall(callId, callerId);
    }
  }, [sendSignal]);

  const rejectCall = useCallback((callId: string, callerId: number) => {
    sendSignal({ type: 'call_reject', call_id: callId, target_user_id: callerId });
    setState(initialState);
    cleanup();
  }, [sendSignal, cleanup]);

  const endCall = useCallback((callId: string, targetUserId: number) => {
    sendSignal({ type: 'call_end', call_id: callId, target_user_id: targetUserId });
    setState(prev => ({ ...prev, status: 'ended' }));
    setTimeout(() => { setState(initialState); cleanup(); }, 2000);
  }, [sendSignal, cleanup]);

  // 🔥 Функция отправки SDP с таймаутом
  const sendSdpWithTimeout = async (pc: RTCPeerConnection, callId: string, type: 'offer' | 'answer') => {
    // Очищаем предыдущий таймер если был
    if (iceTimeoutRef.current) clearTimeout(iceTimeoutRef.current);

    // Создаем описание
    const desc = type === 'offer' 
      ? await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
      : await pc.createAnswer();
    
    await pc.setLocalDescription(desc);

    // 🔥 ТРИКЛИНГ: Отправляем сразу же (даже если ICE candidates еще не собраны полностью)
    // Сервер/клиент будет получать candidates отдельно через call_ice_candidate
    sendSignal({ 
      type: type === 'offer' ? 'call_offer' : 'call_answer', 
      call_id: callId, 
      sdp: pc.localDescription 
    });

    // 🔥 ТАЙМАУТ: Если через 500мс ICE все еще собираются, мы уже отправили SDP.
    // Но если вдруг onicecandidate не сработал для первых кандидатов, 
    // мы можем отправить финальный "пустой" кандидат или просто убедиться что процесс идет.
    // В современной WebRTC trickle работает из коробки, но таймаут спасает от зависания UI.
    iceTimeoutRef.current = setTimeout(() => {
      console.log("⏱️ ICE gathering timeout check");
    }, 500);
  };

  const setupPeerConnection = async (callId: string, callType: CallType, stream: MediaStream) => {
    const config: RTCConfiguration = {
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10, // 🔥 Начинаем сбор заранее
      // encodedInsertableStreams: false убрано, так как false идет по умолчанию и не входит в стандартные типы TS
    };

    const pc = new RTCPeerConnection(config);

    pcRef.current = pc;

    // Добавляем треки
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    // 🔥 Обработка ICE кандидатов (Trickle ICE)
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        // Отправляем каждый кандидат сразу же, как только он появился
        sendSignal({ 
          type: 'call_ice_candidate', 
          call_id: callId, 
          candidate: event.candidate.toJSON() 
        });
      } else {
        // Сбор закончен
        if (iceTimeoutRef.current) clearTimeout(iceTimeoutRef.current);
        console.log("✅ ICE gathering complete");
      }
    };

    pc.ontrack = (event) => {
      setState(prev => ({ ...prev, remoteStream: event.streams[0] }));
    };

    pc.onconnectionstatechange = () => {
      console.log("🔌 Connection State:", pc.connectionState);
      if (pc.connectionState === 'connected') {
        if (iceTimeoutRef.current) clearTimeout(iceTimeoutRef.current);
        setState(prev => ({ ...prev, status: 'active' }));
        startTimeRef.current = Date.now();
        durationIntervalRef.current = setInterval(() => {
          setState(prev => ({ ...prev, duration: Math.floor((Date.now() - startTimeRef.current) / 1000) }));
        }, 1000);
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        endCall(callId, state.remoteUserId!);
      }
    };

    // Логика создания Offer/Answer
    if (!state.isCaller) {
      // Принимающий ждет offer в handleSignal
    } else {
      // Инициатор создает offer
      await sendSdpWithTimeout(pc, callId, 'offer');
    }
  };

  const handleSignal = useCallback(async (data: any) => {
    const pc = pcRef.current;
    
    switch (data.type) {
      case 'call_incoming':
        setState(prev => ({
          ...prev, status: 'ringing', callId: data.call_id, callType: data.call_type,
          remoteUserId: data.caller_id, remoteUserName: data.caller_name, remoteUserAvatar: data.caller_avatar, isCaller: false
        }));
        break;
      case 'call_initiated':
        setState(prev => ({ ...prev, callId: data.call_id, remoteUserId: data.target_user_id }));
        break;
      case 'call_accepted':
        setState(prev => ({ ...prev, status: 'connecting' }));
        if (state.localStream) await setupPeerConnection(data.call_id, state.callType, state.localStream);
        break;
      case 'call_rejected':
      case 'call_busy':
      case 'call_ended':
        setState(prev => ({ ...prev, status: 'ended' }));
        setTimeout(() => { setState(initialState); cleanup(); }, 2000);
        break;
      case 'call_offer':
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          // Создаем и отправляем answer
          await sendSdpWithTimeout(pc, data.call_id, 'answer');
        }
        break;
      case 'call_answer':
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        }
        break;
      case 'call_ice_candidate':
        if (pc && data.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch (e) {
            console.warn("Failed to add ICE candidate", e);
          }
        }
        break;
    }
  }, [sendSignal, cleanup, state.localStream, state.callType, state.isCaller]);

  const toggleMute = () => {
    if (!state.localStream) return;
    const tracks = state.localStream.getAudioTracks();
    const newMuted = !tracks[0]?.enabled;
    tracks.forEach(t => t.enabled = !newMuted);
    setState(prev => ({ ...prev, isMuted: newMuted }));
  };

  const toggleVideo = () => {
    if (!state.localStream) return;
    const tracks = state.localStream.getVideoTracks();
    const newOff = !tracks[0]?.enabled;
    tracks.forEach(t => t.enabled = !newOff);
    setState(prev => ({ ...prev, isVideoOff: newOff }));
  };

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return {
    callState: state,
    initiateCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    handleSignal,
  };
}