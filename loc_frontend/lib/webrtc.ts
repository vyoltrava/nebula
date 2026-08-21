// frontend/lib/webrtc.ts

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
];

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

export class WebRTCCallManager {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private sendSignal: (data: any) => void;
  private onStateChange: (state: Partial<CallState>) => void;
  private durationInterval: NodeJS.Timeout | null = null;
  private startTime: number = 0;

  constructor(
    sendSignal: (data: any) => void,
    onStateChange: (state: Partial<CallState>) => void
  ) {
    this.sendSignal = sendSignal;
    this.onStateChange = onStateChange;
  }

  async initiateCall(targetUserId: number, callType: CallType, callerName: string, callerAvatar: string) {
    try {
      this.onStateChange({
        status: 'initiating',
        callType,
        remoteUserId: targetUserId,
        isCaller: true,
      });

      // Запрашиваем медиа
      this.localStream = await this.getMediaStream(callType);

      this.sendSignal({
        type: 'call_initiate',
        target_user_id: targetUserId,
        call_type: callType,
        caller_name: callerName,
        caller_avatar: callerAvatar,
      });
    } catch (error) {
      console.error('Failed to initiate call:', error);
      this.onStateChange({ status: 'idle' });
      this.cleanup();
    }
  }

  async acceptCall(callId: string, callerId: number, callType: CallType, callerName: string, callerAvatar: string) {
    try {
      this.onStateChange({
        status: 'connecting',
        callId,
        callType,
        remoteUserId: callerId,
        remoteUserName: callerName,
        remoteUserAvatar: callerAvatar,
        isCaller: false,
      });

      // Запрашиваем медиа
      this.localStream = await this.getMediaStream(callType);

      // Отправляем accept
      this.sendSignal({
        type: 'call_accept',
        call_id: callId,
        target_user_id: callerId,
      });

      // Создаём peer connection (answerer)
      await this.createPeerConnection(callId, callType);
    } catch (error) {
      console.error('Failed to accept call:', error);
      this.rejectCall(callId, callerId);
    }
  }

  rejectCall(callId: string, callerId: number) {
    this.sendSignal({
      type: 'call_reject',
      call_id: callId,
      target_user_id: callerId,
    });
    this.onStateChange({ status: 'idle' });
    this.cleanup();
  }

  async handleCallAccepted(callId: string, receiverId: number) {
    this.onStateChange({
      status: 'connecting',
      callId,
      remoteUserId: receiverId,
    });

    // Создаём peer connection (caller creates offer)
    await this.createPeerConnection(callId, this.localStream ? 'video' : 'audio');
    await this.createAndSendOffer(callId);
  }

  async handleOffer(callId: string, sdp: RTCSessionDescriptionInit) {
    if (!this.pc) return;

    try {
      await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));

      // Добавляем ICE candidates которые могли прийти до offer
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);

      this.sendSignal({
        type: 'call_answer',
        call_id: callId,
        sdp: this.pc.localDescription,
      });
    } catch (error) {
      console.error('Failed to handle offer:', error);
    }
  }

  async handleAnswer(callId: string, sdp: RTCSessionDescriptionInit) {
    if (!this.pc) return;

    try {
      await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      this.startDurationTimer();
    } catch (error) {
      console.error('Failed to handle answer:', error);
    }
  }

  async handleIceCandidate(callId: string, candidate: RTCIceCandidateInit) {
    if (!this.pc) return;

    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('Failed to add ICE candidate:', error);
    }
  }

  handleCallEnded() {
    this.onStateChange({ status: 'ended' });
    this.cleanup();

    // Через 2 секунды сбрасываем в idle
    setTimeout(() => {
      this.onStateChange({ status: 'idle', callId: null, remoteUserId: null });
    }, 2000);
  }

  endCall(callId: string, targetUserId: number) {
    this.sendSignal({
      type: 'call_end',
      call_id: callId,
      target_user_id: targetUserId,
    });
    this.handleCallEnded();
  }

  toggleMute(): boolean {
    if (!this.localStream) return false;

    const audioTracks = this.localStream.getAudioTracks();
    const newMuted = !audioTracks[0]?.enabled;
    audioTracks.forEach(track => track.enabled = !newMuted);

    this.onStateChange({ isMuted: newMuted });
    return newMuted;
  }

  toggleVideo(): boolean {
    if (!this.localStream) return false;

    const videoTracks = this.localStream.getVideoTracks();
    const newOff = !videoTracks[0]?.enabled;
    videoTracks.forEach(track => track.enabled = !newOff);

    this.onStateChange({ isVideoOff: newOff });
    return newOff;
  }

  async switchCamera() {
    if (!this.localStream) return;

    const videoTracks = this.localStream.getVideoTracks();
    if (videoTracks.length === 0) return;

    const currentFacing = videoTracks[0].getSettings().facingMode;
    const newFacing = currentFacing === 'user' ? 'environment' : 'user';

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacing },
        audio: true,
      });

      // Заменяем треки в peer connection
      const sender = this.pc?.getSenders().find(s => s.track?.kind === 'video');
      if (sender && newStream.getVideoTracks()[0]) {
        await sender.replaceTrack(newStream.getVideoTracks()[0]);
      }

      // Обновляем local stream
      const oldVideoTrack = videoTracks[0];
      oldVideoTrack.stop();

      this.localStream.removeTrack(oldVideoTrack);
      this.localStream.addTrack(newStream.getVideoTracks()[0]);

      this.onStateChange({ localStream: this.localStream });
    } catch (error) {
      console.error('Failed to switch camera:', error);
    }
  }

  // --- Private methods ---

  private async getMediaStream(callType: CallType): Promise<MediaStream> {
    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: callType === 'video' ? {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user',
      } : false,
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    return stream;
  }

  private async createPeerConnection(callId: string, callType: CallType) {
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Добавляем локальные треки
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.pc!.addTrack(track, this.localStream!);
      });
    }

    // Обработка ICE candidates
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal({
          type: 'call_ice_candidate',
          call_id: callId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    // Обработка remote stream
    this.pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream) {
        this.remoteStream = remoteStream;
        this.onStateChange({ remoteStream: this.remoteStream });

        // Если это первый трек и статус connecting — значит соединение установлено
        if (this.pc?.connectionState === 'connected') {
          this.startDurationTimer();
        }
      }
    };

    // Обработка состояния соединения
    this.pc.onconnectionstatechange = () => {
      console.log('Connection state:', this.pc?.connectionState);

      if (this.pc?.connectionState === 'connected') {
        this.onStateChange({ status: 'active' });
        this.startDurationTimer();
      } else if (this.pc?.connectionState === 'disconnected' || this.pc?.connectionState === 'failed') {
        this.handleCallEnded();
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      console.log('ICE state:', this.pc?.iceConnectionState);
    };
  }

  private async createAndSendOffer(callId: string) {
    if (!this.pc) return;

    try {
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await this.pc.setLocalDescription(offer);

      this.sendSignal({
        type: 'call_offer',
        call_id: callId,
        sdp: this.pc.localDescription,
      });
    } catch (error) {
      console.error('Failed to create offer:', error);
    }
  }

  private startDurationTimer() {
    if (this.durationInterval) return;

    this.startTime = Date.now();
    this.durationInterval = setInterval(() => {
      const duration = Math.floor((Date.now() - this.startTime) / 1000);
      this.onStateChange({ duration });
    }, 1000);
  }

  private cleanup() {
    if (this.durationInterval) {
      clearInterval(this.durationInterval);
      this.durationInterval = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }

    this.remoteStream = null;
  }

  destroy() {
    this.cleanup();
  }
}