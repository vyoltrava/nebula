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

// Получаем креды из переменных окружения Vercel
const METERED_USERNAME = process.env.NEXT_PUBLIC_METERED_USERNAME;
const METERED_CREDENTIAL = process.env.NEXT_PUBLIC_METERED_CREDENTIAL;

console.log('🧊 [WEBRTC CONFIG] Metered Username:', METERED_USERNAME ? 'Present' : 'Missing');
console.log('🧊 [WEBRTC CONFIG] Metered Credential:', METERED_CREDENTIAL ? 'Present' : 'Missing');

const ICE_SERVERS: RTCIceServer[] = [
  // Google STUN (бесплатно, для быстрого старта)
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  
  // 🔥 Metered TURN (если переменные заданы)
  ...(METERED_USERNAME && METERED_CREDENTIAL ? [
    {
      urls: [
        'turn:relay.metered.ca:80',       // UDP
        'turn:relay.metered.ca:443',      // TCP (важно для VPN!)
        'turn:relay.metered.ca:443?transport=tcp',
      ],
      username: METERED_USERNAME,
      credential: METERED_CREDENTIAL,
    },
  ] : []),
];

console.log('🧊 [WEBRTC CONFIG] Total ICE Servers:', ICE_SERVERS.length);
ICE_SERVERS.forEach((s, i) => console.log(`   ${i+1}. ${Array.isArray(s.urls) ? s.urls.join(', ') : s.urls}`));

export function useWebRTC(sendSignal: (data: any) => void) {
  const [state, setState] = useState<CallState>(initialState);
  
  //  Рефы для доступа к актуальному состоянию из колбэков WebRTC
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  const cleanup = useCallback(() => {
    console.log('🧹 [WEBRTC] Cleanup started');
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    if (stateRef.current.localStream) {
      console.log(' [WEBRTC] Stopping local tracks');
      stateRef.current.localStream.getTracks().forEach(track => track.stop());
    }
    if (pcRef.current) {
      console.log(' [WEBRTC] Closing PeerConnection');
      pcRef.current.close();
      pcRef.current = null;
    }
    setState(prev => ({ ...prev, localStream: null, remoteStream: null, duration: 0 }));
    console.log('🧹 [WEBRTC] Cleanup finished');
  }, []);

  const getMediaStream = async (callType: CallType): Promise<MediaStream> => {
    console.log(`🎥 [WEBRTC] Requesting media stream (${callType})...`);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: callType === 'video' ? {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
          frameRate: { ideal: 30 },
        } : false,
      });
      console.log('✅ [WEBRTC] Media stream acquired successfully');
      return stream;
    } catch (error) {
      console.error('❌ [WEBRTC] Failed to get media stream:', error);
      throw error;
    }
  };

  const setupPeerConnection = useCallback(async (
    callId: string,
    stream: MediaStream,
    isCaller: boolean
  ) => {
    console.log(`🚀 [WEBRTC] Setting up PeerConnection for call ${callId} (isCaller: ${isCaller})`);
    
    const config: RTCConfiguration = {
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10,
    };

    const pc = new RTCPeerConnection(config);
    pcRef.current = pc;

    // Добавляем локальные треки
    stream.getTracks().forEach(track => {
      console.log(`➕ [WEBRTC] Adding track: ${track.kind} (${track.label})`);
      pc.addTrack(track, stream);
    });

    // ✅ ОДИН обработчик ICE candidates (Trickle ICE)
    pc.onicegatheringstatechange = () => {
      console.log(`🧊 [WEBRTC] ICE Gathering State: ${pc.iceGatheringState}`);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`🧊 [WEBRTC] ICE Candidate found: type=${event.candidate.type}, protocol=${event.candidate.protocol}, address=${event.candidate.address}`);
        sendSignal({
          type: 'call_ice_candidate',
          call_id: callId,
          candidate: event.candidate.toJSON(),
        });
      } else {
        console.log('✅ [WEBRTC] ICE Gathering Complete (no more candidates)');
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`💧 [WEBRTC] ICE Connection State: ${pc.iceConnectionState}`);
    };

    // ✅ ОДИН обработчик треков
    pc.ontrack = (event) => {
      console.log(`📺 [WEBRTC] Remote track received: ${event.track.kind}`);
      setState(prev => ({ ...prev, remoteStream: event.streams[0] }));
    };

    // ✅ ОДИН обработчик состояния соединения
    pc.onconnectionstatechange = () => {
      const newState = pc.connectionState;
      console.log(`🔌 [WEBRTC] Connection State Changed: ${newState}`);
      
      if (newState === 'connected') {
        console.log('🎉 [WEBRTC] CALL CONNECTED!');
        setState(prev => ({ ...prev, status: 'active' }));
        startTimeRef.current = Date.now();
        durationIntervalRef.current = setInterval(() => {
          setState(prev => ({
            ...prev,
            duration: Math.floor((Date.now() - startTimeRef.current) / 1000),
          }));
        }, 1000);
      } else if (newState === 'disconnected' || newState === 'failed') {
        console.error(`❌ [WEBRTC] Connection ${newState}`);
        const remoteId = stateRef.current.remoteUserId;
        if (remoteId) {
          sendSignal({
            type: 'call_end',
            call_id: stateRef.current.callId,
            target_user_id: remoteId,
          });
        }
        setState(prev => ({ ...prev, status: 'ended' }));
        setTimeout(() => {
          setState(initialState);
          cleanup();
        }, 2000);
      }
    };

    pc.onsignalingstatechange = () => {
      console.log(`📡 [WEBRTC] Signaling State: ${pc.signalingState}`);
    };

    // Если мы инициатор — создаём offer
    if (isCaller) {
      console.log('📝 [WEBRTC] Creating OFFER...');
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await pc.setLocalDescription(offer);
        console.log('✅ [WEBRTC] OFFER created and set as local description');
        sendSignal({
          type: 'call_offer',
          call_id: callId,
          sdp: pc.localDescription,
        });
      } catch (err) {
        console.error('❌ [WEBRTC] Error creating offer:', err);
      }
    } else {
      console.log('⏳ [WEBRTC] Waiting for OFFER from caller...');
    }
    // Если мы принимающий — offer придёт через handleSignal
  }, [sendSignal, cleanup]);

  const initiateCall = useCallback(async (
    targetUserId: number,
    callType: CallType,
    callerName: string,
    callerAvatar: string
  ) => {
    console.log(`📞 [WEBRTC] INITIATING CALL to user ${targetUserId} (${callType})`);
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
        remoteUserAvatar: callerAvatar,
      }));

      console.log('📤 [WEBRTC] Sending call_initiate signal');
      sendSignal({
        type: 'call_initiate',
        target_user_id: targetUserId,
        call_type: callType,
        caller_name: callerName,
        caller_avatar: callerAvatar,
      });
    } catch (error) {
      console.error('❌ [WEBRTC] Error initiating call:', error);
      setState(prev => ({ ...prev, status: 'idle' }));
    }
  }, [sendSignal]);

  const acceptCall = useCallback(async (
    callId: string,
    callerId: number,
    callType: CallType,
    callerName: string,
    callerAvatar: string
  ) => {
    console.log(`✅ [WEBRTC] ACCEPTING CALL ${callId} from ${callerId}`);
    try {
      const stream = await getMediaStream(callType);
      
      // СНАЧАЛА обновляем состояние
      setState(prev => ({
        ...prev,
        status: 'connecting',
        callId,
        callType,
        remoteUserId: callerId,
        isCaller: false,
        localStream: stream,
        remoteUserName: callerName,
        remoteUserAvatar: callerAvatar,
      }));

      console.log('📤 [WEBRTC] Sending call_accept signal');
      sendSignal({ type: 'call_accept', call_id: callId, target_user_id: callerId });
      
      // 🔥 Передаём isCaller явно, а не читаем из state
      await setupPeerConnection(callId, stream, false);
    } catch (error) {
      console.error('❌ [WEBRTC] Error accepting call:', error);
      sendSignal({ type: 'call_reject', call_id: callId, target_user_id: callerId });
      setState(initialState);
      cleanup();
    }
  }, [sendSignal, setupPeerConnection, cleanup]);

  const rejectCall = useCallback((callId: string, callerId: number) => {
    console.log(`🚫 [WEBRTC] REJECTING CALL ${callId}`);
    sendSignal({ type: 'call_reject', call_id: callId, target_user_id: callerId });
    setState(initialState);
    cleanup();
  }, [sendSignal, cleanup]);

  const endCall = useCallback((callId: string, targetUserId: number) => {
    console.log(`👋 [WEBRTC] ENDING CALL ${callId}`);
    sendSignal({ type: 'call_end', call_id: callId, target_user_id: targetUserId });
    setState(prev => ({ ...prev, status: 'ended' }));
    setTimeout(() => {
      setState(initialState);
      cleanup();
    }, 2000);
  }, [sendSignal, cleanup]);

const handleSignal = useCallback(async (data: any) => {
  console.log(`📥 [WEBRTC] SIGNAL RECEIVED: ${data.type}`, data);
  const pc = pcRef.current;

  switch (data.type) {
    case 'call_incoming':
      console.log(`🔔 [WEBRTC] Incoming call from ${data.caller_name}`);
      setState(prev => ({
        ...prev,
        status: 'ringing',
        callId: data.call_id, // ← Устанавливаем ID сразу
        callType: data.call_type,
        remoteUserId: data.caller_id,
        remoteUserName: data.caller_name,
        remoteUserAvatar: data.caller_avatar,
        isCaller: false,
      }));
      break;

    case 'call_initiated':
      console.log(`✅ [WEBRTC] Call initiated confirmed, ID: ${data.call_id}`);
      setState(prev => ({
        ...prev,
        callId: data.call_id, // ← Устанавливаем ID сразу
        remoteUserId: data.target_user_id,
      }));
      break;

    case 'call_accepted':
      console.log(`✅ [WEBRTC] Call accepted by receiver`);
      
      // 🔥 ИСПРАВЛЕНИЕ: Используем callId из данных сигнала, если в стейте его нет
      const currentCallId = stateRef.current.callId || data.call_id;
      const currentStream = stateRef.current.localStream;

      if (currentStream && currentCallId) {
        setState(prev => ({ ...prev, status: 'connecting' }));
        console.log(`🚀 [WEBRTC] Starting PeerConnection with ID: ${currentCallId}`);
        await setupPeerConnection(currentCallId, currentStream, true); // true = мы инициатор
      } else {
        console.error(`❌ [WEBRTC] Cannot setup connection: Stream=${!!currentStream}, CallId=${currentCallId}`);
        console.warn('💡 Hint: Did the signal arrive before state updated? Trying fallback...');
        
        // Попытка восстановления: если стрим есть, а ID нет — ждем немного или используем ID из сигнала
        if (currentStream && data.call_id) {
           console.log('🔄 [WEBRTC] Fallback: Using call_id from signal');
           setState(prev => ({ ...prev, status: 'connecting', callId: data.call_id }));
           await setupPeerConnection(data.call_id, currentStream, true);
        }
      }
      break;

    case 'call_rejected':
    case 'call_busy':
    case 'call_ended':
      console.log(`🛑 [WEBRTC] Call ended/rejected/busy`);
      setState(prev => ({ ...prev, status: 'ended' }));
      setTimeout(() => {
        setState(initialState);
        cleanup();
      }, 2000);
      break;

    case 'call_offer':
      console.log(`📝 [WEBRTC] Received OFFER, creating ANSWER...`);
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          console.log('✅ [WEBRTC] ANSWER created and sent');
          sendSignal({
            type: 'call_answer',
            call_id: data.call_id,
            sdp: pc.localDescription,
          });
        } catch (err) {
          console.error('❌ [WEBRTC] Error handling offer:', err);
        }
      } else {
        console.error('❌ [WEBRTC] No PC available to handle offer');
      }
      break;

    case 'call_answer':
      console.log(`📝 [WEBRTC] Received ANSWER`);
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        } catch (err) {
          console.error('❌ [WEBRTC] Error setting remote description (answer):', err);
        }
      }
      break;

    case 'call_ice_candidate':
      if (pc && data.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          // console.log('✅ [WEBRTC] ICE candidate added successfully');
        } catch (e) {
          console.warn('⚠️ [WEBRTC] Failed to add ICE candidate:', e);
        }
      }
      break;
      
    default:
      console.warn(`❓ [WEBRTC] Unknown signal type: ${data.type}`);
  }
}, [sendSignal, cleanup, setupPeerConnection]);

  const toggleMute = useCallback(() => {
    if (!stateRef.current.localStream) return;
    const tracks = stateRef.current.localStream.getAudioTracks();
    const newMuted = !tracks[0]?.enabled;
    tracks.forEach(t => t.enabled = !newMuted);
    console.log(`🔇 [WEBRTC] Audio muted: ${newMuted}`);
    setState(prev => ({ ...prev, isMuted: newMuted }));
  }, []);

  const toggleVideo = useCallback(() => {
    if (!stateRef.current.localStream) return;
    const tracks = stateRef.current.localStream.getVideoTracks();
    const newOff = !tracks[0]?.enabled;
    tracks.forEach(t => t.enabled = !newOff);
    console.log(` [WEBRTC] Video off: ${newOff}`);
    setState(prev => ({ ...prev, isVideoOff: newOff }));
  }, []);

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