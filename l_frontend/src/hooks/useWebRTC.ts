'use client';

import {
  useState,
  useRef,
  useCallback,
  useEffect,
} from 'react';

import { getToken, getActiveAccount } from '@/lib/auth';

export type CallType = 'audio' | 'video';

/** 📊 Диагностика соединения для UI-индикаторов (рендерится в CallModal). */
export interface CallDiagnostics {
  ice: string;            // iceConnectionState: new / checking / connected / failed...
  conn: string;           // connectionState
  candHost: number;       // host-кандидаты (локальная сеть)
  candSrflx: number;      // srflx/prflx (прошли STUN)
  candRelay: number;      // relay (через TURN) — критичны для звонков между сетями
  candidateErrors: number;// ошибки сбора кандидатов (блокировки/таймауты STUN-TURN)
  turnActive: boolean;    // подтянулись ли TURN-сервера с бэкенда
  hint: string | null;    // человекочитаемая причина проблемы
}

export interface CallState {
  status:
    | 'idle'
    | 'initiating'
    | 'ringing'
    | 'connecting'
    | 'active'
    | 'ended';

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

  /** 📊 Живая диагностика соединения (рендерится в CallModal) */
  diag?: CallDiagnostics;
}

export type WebRTCSignal =
  | {
      type: 'call_initiate';
      target_user_id: number;
      call_type: CallType;
      caller_name: string;
      caller_avatar: string;
    }
  | {
      type: 'call_accept';
      call_id: string;
      target_user_id: number;
    }
  | {
      type: 'call_reject';
      call_id: string;
      target_user_id: number;
    }
  | {
      type: 'call_end';
      call_id: string | null;
      target_user_id: number;
    }
  | {
      type: 'call_offer';
      call_id: string;
      target_user_id: number;
      sdp: RTCSessionDescriptionInit;
    }
  | {
      type: 'call_answer';
      call_id: string;
      target_user_id: number;
      sdp: RTCSessionDescriptionInit;
    }
  | {
      type: 'call_ice_candidate';
      call_id: string;
      target_user_id: number;
      candidate: RTCIceCandidateInit;
    };

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

// ============================================================================
// TURN CONFIGURATION
// ============================================================================

const TURN_USERNAME =
  process.env.NEXT_PUBLIC_TURN_USERNAME ??
  process.env.NEXT_PUBLIC_METERED_USERNAME ??
  '';

const TURN_CREDENTIAL =
  process.env.NEXT_PUBLIC_TURN_CREDENTIAL ??
  process.env.NEXT_PUBLIC_METERED_CREDENTIAL ??
  '';

const TURN_HOST =
  process.env.NEXT_PUBLIC_TURN_HOST ??
  'relay.metered.ca';

/**
 * Конфигурация ICE серверов.
 * ВАЖНО: Порядок URL имеет значение для некоторых браузеров.
 * Ставим TCP/TLS первыми, так как они критичны для VPN.
 */
const ICE_SERVERS: RTCIceServer[] = [
  {
    urls: [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
    ],
  },
  ...(TURN_USERNAME && TURN_CREDENTIAL
    ? [
        {
          // 🔥 ПРИОРИТЕТ TCP/TLS ДЛЯ VPN
          urls: [
            `turns:${TURN_HOST}:443?transport=tcp`, // TLS поверх TCP (самый надежный)
            `turn:${TURN_HOST}:443?transport=tcp`,  // TCP порт 443
            `turn:${TURN_HOST}:80?transport=tcp`,   // TCP порт 80
            `turn:${TURN_HOST}:3478?transport=udp`, // UDP (попробуем, если повезет)
          ],
          username: TURN_USERNAME,
          credential: TURN_CREDENTIAL,
        },
      ]
    : []),
];

// 🔥 ГЛОБАЛЬНЫЙ ФЛАГ: Если true, используем ТОЛЬКО TURN (Relay)
// Это можно вынести в проп хука, если нужно переключать динамически
const FORCE_RELAY_ONLY = false; 

// ============================================================================
// 🔥 ДИНАМИЧЕСКИЕ ICE-SERVERS С БЭКЕНДА (/api/ice-servers)
// TURN-ключи хранятся ТОЛЬКО на сервере (Render env: METERED_USERNAME /
// METERED_PASSWORD / METERED_API_KEY) и не светятся в клиентском бандле.
// Грузим один раз до создания PeerConnection; при сбое — локальный STUN.
// ============================================================================

let dynamicIceServers: RTCIceServer[] | null = null;
let iceFetchInFlight = false;

/** Есть ли рабочий TURN (подтянутый с бэкенда)? Для индикаторов и подсказок. */
export function isTurnConfigured(): boolean {
  return !!(dynamicIceServers && dynamicIceServers.length > 0);
}

const emptyDiag = () => ({
  ice: 'new',
  conn: 'new',
  candHost: 0,
  candSrflx: 0,
  candRelay: 0,
  candidateErrors: 0,
  turnActive: false,
  hint: null as string | null,
});

export async function refreshIceServers(): Promise<void> {
  if (!isBrowser || dynamicIceServers || iceFetchInFlight) return;
  iceFetchInFlight = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ICE_FETCH_TIMEOUT_MS);
  try {
    const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000')
      .replace(/\/+$/, '');
    const token = getToken();
    const res = await fetch(`${apiUrl}/api/ice-servers`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data?.iceServers) && data.iceServers.length > 0) {
      dynamicIceServers = data.iceServers as RTCIceServer[];
      rtcLog('🔥 Dynamic TURN iceServers loaded from backend');
    } else {
      rtcWarn(
        '⚠️ Backend вернул ПУСТОЙ iceServers — TURN не настроен! ' +
        'Задай METERED_* переменные на Render, иначе межсетевые звонки невозможны.',
      );
    }
  } catch (err) {
    rtcWarn('ice-servers fetch failed/timeout — using local STUN fallback', err);
  } finally {
    clearTimeout(timer);
    iceFetchInFlight = false;
  }
}

const getRTCConfig = (): RTCConfiguration => {
  // Приоритет: серверные iceServers (TURN из Render env) -> локальная статика (STUN)
  // 🔥 FIX: Google-STUN оставляем ВСЕГДА, TURN с бэкенда ДОБАВЛЯЕМ сверху.
  // Раньше бэкенд-список ЗАМЕНЯЛ статику целиком: если DNS провайдера блокирует
  // relay.metered.ca (errorCode 701 'host lookup'), мы теряли и публичный STUN —
  // не собирались даже srflx-кандидаты для прямого P2P.
  const iceServers =
    dynamicIceServers && dynamicIceServers.length > 0
      ? [...ICE_SERVERS, ...dynamicIceServers]
      : ICE_SERVERS;

  // 📱 iOS/VPN FIX: Metered и прочие TURN-провайдеры часто отдают только
  // udp-варианты. На iPhone (особенно за VPN/WireGuard и сотовым оператором)
  // UDP часто зарезан -> srflx/relay через udp не собираются -> вечное
  // «Соединение...». Дублируем каждый turn:/turns: TCP-вариантом (и для
  // turn: дополнительно порт 443 tcp), если transport ещё не указан.
  const withTcpFallback = (servers: RTCIceServer[]): RTCIceServer[] => {
    const out: RTCIceServer[] = [];
    for (const s of servers) {
      out.push(s);
      if (!s.urls) continue;
      const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
      const tcpUrls: string[] = [];
      for (const u of urls) {
        if (typeof u !== 'string') continue;
        if (!/^turns?:/i.test(u)) continue;
        if (u.includes('transport=')) continue; // transport уже задан
        const sep = u.includes('?') ? '&' : '?';
        tcpUrls.push(`${u}${sep}transport=tcp`);
        if (/^turn:/i.test(u) && !u.includes('443')) {
          try {
            const noScheme = u.replace(/^turn:/i, '');
            const hostPart = noScheme.split('?')[0];
            tcpUrls.push(`turn:${hostPart.split(':')[0]}:443?transport=tcp`);
          } catch { /* ignore */ }
        }
      }
      if (tcpUrls.length) out.push({ ...s, urls: tcpUrls });
    }
    return out;
  };

  const config: RTCConfiguration = {
    iceServers: withTcpFallback(iceServers),

    // 🔥 ИЗМЕНЕНИЕ: Если включен флаг или мы detect проблемы, ставим 'relay'
    iceTransportPolicy: FORCE_RELAY_ONLY ? 'relay' : 'all',

    // 📱 iOS: минимальный безопасный конфиг (обход бага WebKit «зависший ICE»).
    ...(isIOS
      ? {
          // 🔥 Чиним бесконечное "Соединение..." на iPhone/iPad: убираем
          // iceCandidatePoolSize и не форсируем bundlePolicy/rtcpMuxPolicy,
          // которые в WebKit могут остановить сборку кандидатов.
          iceCandidatePoolSize: 0,
        }
      : {
          bundlePolicy: 'max-bundle',
          rtcpMuxPolicy: 'require',
          iceCandidatePoolSize: 8, // Увеличили пул для быстрого старта
        }),
  };

  // 🔍 VERIFICATION AID: видно, какие iceServers реально попали в PeerConnection.
  // Здесь должны быть turn:-URL'ы, когда на Render заданы METERED_* переменные.
  if (process.env.NODE_ENV !== 'production') {
    console.log(
      '🧊 [WEBRTC] RTC config iceServers:',
      JSON.stringify(config.iceServers),
    );
  }

  return config;
};

const DISCONNECTED_GRACE_MS = 15_000;
const ICE_RESTART_TIMEOUT_MS = 8_000;
const DURATION_INTERVAL_MS = 1_000;
// 🔥 Сеть не должна блокировать камеру дольше этого времени:
const ICE_FETCH_TIMEOUT_MS = 4_000;
// ⏱ Сколько ждём call_answer после отправки offer, прежде чем переотправить
// offer ещё раз (самолечение потерянных/зарейсившихся SDP-сообщений).
const ANSWER_TIMEOUT_MS = 8_000;
// 🔁 Симметричное самолечение на ВЫЗЫВАЕМОЙ стороне: как часто переотправлять
// call_answer, пока соединение не установилось (лечит потерю ответа у вызывающего).
const ANSWER_RESEND_INTERVAL_MS = 5_000;
const ANSWER_RESEND_MAX_ATTEMPTS = 5;

type BufferedIceCandidate = RTCIceCandidateInit;

const isBrowser =
  typeof window !== 'undefined' &&
  typeof RTCPeerConnection !== 'undefined';

// 📱 iOS Safari/WKWebView — известный баг: iceCandidatePoolSize>0 в связке с
// жёсткими bundlePolicy/rtcpMuxPolicy может ЗАВИСИТЬ ICE-сборку (бесконечное
// "Соединение..."). На iOS применяем минимальный безопасный конфиг.
const isIOS =
  typeof window !== 'undefined' &&
  (/iP(hone|ad|od)/.test(navigator.userAgent || '') ||
    (navigator.userAgent === 'MacIntel' && 'ontouchstart' in window));

function rtcLog(message: string, ...args: unknown[]) {
  console.log(`🧊 [WEBRTC] ${message}`, ...args);
}

function rtcWarn(message: string, ...args: unknown[]) {
  console.warn(`⚠️ [WEBRTC] ${message}`, ...args);
}

function rtcError(message: string, ...args: unknown[]) {
  console.error(`❌ [WEBRTC] ${message}`, ...args);
}

function getCandidateInfo(candidate: RTCIceCandidate) {
  return {
    type: candidate.type,
    protocol: candidate.protocol,
    address: candidate.address,
    port: candidate.port,
    tcpType: candidate.tcpType,
  };
}

export function useWebRTC(
  sendSignal: (data: WebRTCSignal) => void,
) {
  const [state, setState] = useState<CallState>(initialState);
  const stateRef = useRef<CallState>(initialState);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const activeCallIdRef = useRef<string | null>(null);
  const iceCandidateBufferRef = useRef<BufferedIceCandidate[]>([]);
  const iceAddQueueRef = useRef<Promise<void>>(Promise.resolve());

  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const disconnectedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(0);
  const iceRestartInProgressRef = useRef(false);
  // 🔥 Самолечение handshake: offer, пришедший ДО создания PeerConnection,
  // больше не теряется ("Received OFFER but no PC") — буферизуем и применяем
  // сразу после создания PC.
  const pendingOfferRef = useRef<{
    callId: string;
    sdp: RTCSessionDescriptionInit;
  } | null>(null);
  const answerTimeoutTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);
  // 🔁 Периодическая переотправка ANSWER вызываемой стороной
  const answerResendTimerRef =
    useRef<ReturnType<typeof setInterval> | null>(null);
  // 📞 Причина завершения звонка (для сообщения-уведомления в чате)
  const endReasonRef = useRef<'local' | 'declined' | 'remote_ended' | null>(null);
  // 📞 Флаг: P2P-соединение хоть раз установилось (для исхода 'ended' vs 'missed')
  const connectedOnceRef = useRef(false);

  const safeSendSignal = useCallback(
    (data: WebRTCSignal) => {
      try {
        rtcLog(`📤 Signal: ${data.type}`);
        sendSignal(data);
      } catch (error) {
        rtcError(`Signal ${data.type} failed to queue`, error);
      }
    },
    [sendSignal],
  );

  const clearTimers = useCallback(() => {
    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    if (disconnectedTimerRef.current) clearTimeout(disconnectedTimerRef.current);
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    
    durationIntervalRef.current = null;
    disconnectedTimerRef.current = null;
    restartTimerRef.current = null;
  }, []);

  const getMediaStream = useCallback(
    async (callType: CallType): Promise<MediaStream> => {
      if (!isBrowser) throw new Error('WebRTC unavailable');

      rtcLog(`🎥 Requesting ${callType} media`);
      
      // 🔥 Запрос медиа. Упрощённые аудио-констрейнты: на iOS Safari форсированный
      // channelCount:1 (моно) + noiseSuppression/autoGainControl не поддерживаются и
      // приводят к отказу getUserMedia или тихому треку. echoCancellation убирает эхо.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
          },
          video: callType === 'video' ? {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30, max: 30 },
            facingMode: 'user',
          } : false,
        });
        rtcLog('✅ Media stream acquired');
        return stream;
      } catch (err: any) {
        // 📱 iOS FIX: Safari/PWA может отказать на расширенных констрейнтах
        // (NotReadableError/OverconstrainedError/AbortError). Повторяем с
        // максимально простым запросом — audio:true / video:true.
        const name = err?.name || '';
        if (name === 'NotReadableError' || name === 'OverconstrainedError' || name === 'AbortError' || name === 'TypeError') {
          rtcWarn(`⚠️ getUserMedia failed (${name}) — retrying with plain constraints`);
          const plain = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: callType === 'video',
          });
          rtcLog('✅ Media stream acquired (plain constraints fallback)');
          return plain;
        }
        throw err;
      }
    },
    [],
  );

  const flushIceCandidateBuffer = useCallback(
    async (pc: RTCPeerConnection) => {
      if (!pc.remoteDescription || iceCandidateBufferRef.current.length === 0) return;

      const candidates = [...iceCandidateBufferRef.current];
      iceCandidateBufferRef.current = [];

      rtcLog(` Flushing ${candidates.length} buffered ICE candidates`);

      for (const candidate of candidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          rtcWarn('Failed to apply buffered ICE', error, candidate);
        }
      }
    },
    [],
  );

  const addRemoteIceCandidate = useCallback(
    async (pc: RTCPeerConnection, candidateInit: RTCIceCandidateInit) => {
      if (!pc.remoteDescription) {
        rtcLog('🧊 Remote desc not ready — buffering ICE');
        iceCandidateBufferRef.current.push(candidateInit);
        return;
      }

      iceAddQueueRef.current = iceAddQueueRef.current
        .catch(() => {}) 
        .then(async () => {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidateInit));
          } catch (error) {
            rtcWarn('Failed to add remote ICE', error, candidateInit);
          }
        });

      await iceAddQueueRef.current;
    },
    [],
  );

  const applyRemoteOffer = useCallback(
    async (
      pc: RTCPeerConnection,
      callId: string,
      sdp: RTCSessionDescriptionInit,
    ) => {
      rtcLog('📝 Applying remote OFFER');
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await flushIceCandidateBuffer(pc);

      rtcLog('📝 Creating ANSWER');
      const answer = await pc.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(answer);

      if (!pc.localDescription) throw new Error('localDescription null');

      safeSendSignal({
        type: 'call_answer',
        call_id: callId,
        target_user_id: stateRef.current.remoteUserId ?? 0,
        sdp: pc.localDescription,
      });
      rtcLog('📤 ANSWER sent');

      // 🔁 RESEND-WATCHDOG: если инициатор не получил наш ответ (потерянный
      // WS-пакет/мигание соединения), периодически отправляем его заново,
      // пока PeerConnection не подключится или не кончатся попытки.
      if (answerResendTimerRef.current) {
        clearInterval(answerResendTimerRef.current);
      }
      let resendAttempts = 0;
      answerResendTimerRef.current = setInterval(() => {
        const cur = pcRef.current ?? pc;
        if (
          !cur ||
          cur.connectionState === 'connected' ||
          resendAttempts >= ANSWER_RESEND_MAX_ATTEMPTS
        ) {
          if (answerResendTimerRef.current) {
            clearInterval(answerResendTimerRef.current);
            answerResendTimerRef.current = null;
          }
          return;
        }
        const desc = cur.localDescription;
        const tid = stateRef.current.remoteUserId;
        if (desc && desc.type === 'answer' && tid) {
          resendAttempts += 1;
          rtcWarn(`🔁 ANSWER not confirmed — resending (attempt ${resendAttempts})`);
          safeSendSignal({ type: 'call_answer', call_id: callId, target_user_id: tid, sdp: desc });
        }
      }, ANSWER_RESEND_INTERVAL_MS);
    },
    [flushIceCandidateBuffer, safeSendSignal],
  );

  const restartIce = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || iceRestartInProgressRef.current) return;
    if (pc.signalingState === 'closed' || pc.connectionState === 'closed') return;

    const currentState = stateRef.current;
    if (!currentState.callId || !currentState.isCaller) return;

    try {
      iceRestartInProgressRef.current = true;
      rtcLog('🔄 Starting ICE restart (Network change recovery)');

      const offer = await pc.createOffer({
        iceRestart: true,
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });

      await pc.setLocalDescription(offer);
      
      if (!pc.localDescription) throw new Error('localDescription is null');

      safeSendSignal({
        type: 'call_offer',
        call_id: currentState.callId,
        target_user_id: currentState.remoteUserId ?? 0,
        sdp: pc.localDescription,
      });

      rtcLog('📤 ICE restart offer sent');
    } catch (error) {
      rtcError('ICE restart failed', error);
    } finally {
      iceRestartInProgressRef.current = false;
    }
  }, [safeSendSignal]);

  const cleanup = useCallback(() => {
    rtcLog('🧹 Cleanup');
    clearTimers();
    iceCandidateBufferRef.current = [];
    iceAddQueueRef.current = Promise.resolve();
    iceRestartInProgressRef.current = false;
    if (answerTimeoutTimerRef.current) {
      clearTimeout(answerTimeoutTimerRef.current);
      answerTimeoutTimerRef.current = null;
    }
    if (answerResendTimerRef.current) {
      clearInterval(answerResendTimerRef.current);
      answerResendTimerRef.current = null;
    }
    pendingOfferRef.current = null;

    // 📞 сброс флага «соединение устанавливалось» для сообщения о звонке
    connectedOnceRef.current = false;

    const pc = pcRef.current;
    if (pc) {
      try {
        pc.onicecandidate = null;
        pc.onicecandidateerror = null;
        pc.oniceconnectionstatechange = null;
        pc.onicegatheringstatechange = null;
        pc.onconnectionstatechange = null;
        pc.onsignalingstatechange = null;
        pc.ontrack = null;
        pc.close();
      } catch (e) { /* ignore */ }
      pcRef.current = null;
    }

    activeCallIdRef.current = null;

    const stream = stateRef.current.localStream;
    if (stream) {
      stream.getTracks().forEach((t) => {
        try { t.stop(); } catch {}
      });
    }

    setState((prev) => ({
      ...prev,
      localStream: null,
      remoteStream: null,
      duration: 0,
    }));
  }, [clearTimers]);

  const setupPeerConnection = useCallback(
    async (callId: string, stream: MediaStream, isCaller: boolean) => {
      if (!isBrowser) throw new Error('WebRTC unavailable');

      rtcLog(`🚀 Creating PeerConnection: ${callId}`, { isCaller });

      if (pcRef.current) {
        rtcWarn('Closing existing PC');
        try { pcRef.current.close(); } catch {}
        pcRef.current = null;
      }

      iceCandidateBufferRef.current = [];
      iceAddQueueRef.current = Promise.resolve();

      // 🔥 Получаем свежий конфиг каждый раз (на случай изменения FORCE_RELAY_ONLY)
      const config = getRTCConfig();
      const pc = new RTCPeerConnection(config);

      pcRef.current = pc;
      activeCallIdRef.current = callId;

      // 📊 Сброс диагностики на старте каждого PeerConnection
      setState((prev) => ({
        ...prev,
        diag: { ...emptyDiag(), turnActive: isTurnConfigured() },
      }));

      stream.getTracks().forEach((track) => {
        rtcLog(`➕ Adding ${track.kind} track`);
        pc.addTrack(track, stream);
      });

      pc.onicecandidate = (event) => {
        if (!event.candidate) {
          rtcLog('✅ ICE gathering complete');
          return;
        }

        const candidate = event.candidate;
        const info = getCandidateInfo(candidate);
        
        // 🔥 Логирование типа кандидата для диагностики VPN
        rtcLog(`🧊 ICE candidate: ${info.type}/${info.protocol}`, info);

        // 📊 Индикатор: считаем кандидатов по типам (host/srflx/relay)
        setState((prev) => {
          const d: CallDiagnostics =
            prev.diag ?? { ...emptyDiag(), turnActive: isTurnConfigured() };
          if (info.type === 'relay') d.candRelay += 1;
          else if (info.type === 'srflx' || info.type === 'prflx') d.candSrflx += 1;
          else d.candHost += 1;
          return { ...prev, diag: d };
        });

        safeSendSignal({
          type: 'call_ice_candidate',
          call_id: callId,
          target_user_id: stateRef.current.remoteUserId ?? 0,
          candidate: candidate.toJSON(),
        });
      };

      pc.onicecandidateerror = (event) => {
        // Частая ошибка в VPN: "Address family not supported" или таймауты
        rtcWarn('ICE candidate error', {
          url: event.url,
          errorCode: event.errorCode,
          errorText: event.errorText,
        });
        // 📊 Индикатор: ошибки сбора кандидатов (STUN/TURN недоступен)
        setState((prev) => {
          const d: CallDiagnostics =
            prev.diag ?? { ...emptyDiag(), turnActive: isTurnConfigured() };
          return { ...prev, diag: { ...d, candidateErrors: d.candidateErrors + 1 } };
        });
      };

      pc.onicegatheringstatechange = () => {
        rtcLog(`🧊 ICE gathering: ${pc.iceGatheringState}`);
      };

      pc.oniceconnectionstatechange = () => {
        const iceState = pc.iceConnectionState;
        rtcLog(`💧 ICE state: ${iceState}`);

        // 📊 Индикатор состояния ICE (+ причина при провале)
        setState((prev) => {
          const d: CallDiagnostics =
            prev.diag ?? { ...emptyDiag(), turnActive: isTurnConfigured() };
          let hint = d.hint;
          if (iceState === 'failed') {
            hint = isTurnConfigured()
              ? 'TURN задан, но недоступен из вашей сети (провайдер/DPI). Попробуйте VPN или другой TURN.'
              : 'TURN НЕ НАСТРОЕН: звонок между разными сетями невозможен. Задайте METERED_* на бэкенде.';
          }
          return { ...prev, diag: { ...d, ice: iceState, hint } };
        });

        if (iceState === 'checking') {
          setState((prev) => ({ ...prev, status: 'connecting' }));
        }

        if (iceState === 'connected' || iceState === 'completed') {
          rtcLog(' ICE Connected/Completed');
          if (disconnectedTimerRef.current) {
            clearTimeout(disconnectedTimerRef.current);
            disconnectedTimerRef.current = null;
          }
        }

        if (iceState === 'disconnected') {
          rtcWarn('ICE disconnected — waiting for recovery...');
          if (!disconnectedTimerRef.current) {
            disconnectedTimerRef.current = setTimeout(async () => {
              disconnectedTimerRef.current = null;
              if (pcRef.current?.iceConnectionState === 'disconnected') {
                rtcWarn('Recovery timeout — restarting ICE');
                await restartIce();
              }
            }, DISCONNECTED_GRACE_MS);
          }
        }

        if (iceState === 'failed') {
          rtcError('ICE FAILED');
        }
      };

      pc.onconnectionstatechange = () => {
        const connState = pc.connectionState;
        rtcLog(` Connection state: ${connState}`);

        // 📊 Индикатор состояния соединения
        setState((prev) => {
          const d: CallDiagnostics =
            prev.diag ?? { ...emptyDiag(), turnActive: isTurnConfigured() };
          return { ...prev, diag: { ...d, conn: connState } };
        });

        switch (connState) {
          case 'connecting':
            setState((prev) => ({ ...prev, status: 'connecting' }));
            break;

          case 'connected':
            rtcLog('🎉 WEBRTC CALL CONNECTED');
            connectedOnceRef.current = true;
            if (disconnectedTimerRef.current) clearTimeout(disconnectedTimerRef.current);
            if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
            
            setState((prev) => ({ ...prev, status: 'active' }));
            
            if (!durationIntervalRef.current) {
              startTimeRef.current = Date.now();
              durationIntervalRef.current = setInterval(() => {
                setState((prev) => ({
                  ...prev,
                  duration: Math.floor((Date.now() - startTimeRef.current) / 1000),
                }));
              }, DURATION_INTERVAL_MS);
            }
            break;

          case 'disconnected':
            rtcWarn('Connection disconnected — waiting...');
            setState((prev) => ({
              ...prev,
              status: prev.status === 'active' ? 'active' : 'connecting',
            }));
            
            if (!disconnectedTimerRef.current) {
              disconnectedTimerRef.current = setTimeout(async () => {
                disconnectedTimerRef.current = null;
                if (pcRef.current?.connectionState === 'disconnected') {
                  rtcWarn('Recovery timeout — restarting ICE');
                  await restartIce();
                }
              }, DISCONNECTED_GRACE_MS);
            }
            break;

          case 'failed':
            rtcError('Connection failed — attempting ICE restart');
            if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
            
            restartTimerRef.current = setTimeout(async () => {
              restartTimerRef.current = null;
              if (pcRef.current && pcRef.current.connectionState !== 'connected') {
                await restartIce();
                
                // Финальная проверка через несколько секунд
                setTimeout(() => {
                  if (pcRef.current?.connectionState === 'failed') {
                    rtcError('ICE restart failed. Ending call.');
                    const current = stateRef.current;
                    if (current.remoteUserId && current.callId) {
                      safeSendSignal({
                        type: 'call_end',
                        call_id: current.callId,
                        target_user_id: current.remoteUserId,
                      });
                    }
                    setState((prev) => ({ ...prev, status: 'ended' }));
                    setTimeout(() => {
                      cleanup();
                      setState(initialState);
                    }, 1000);
                  }
                }, ICE_RESTART_TIMEOUT_MS);
              }
            }, 1000);
            break;
            
          case 'closed':
            rtcLog('PC closed');
            break;
        }
      };

      pc.onsignalingstatechange = () => {
        rtcLog(`📡 Signaling: ${pc.signalingState}`);
      };

      pc.ontrack = (event) => {
        rtcLog(`📺 Remote ${event.track.kind} track received`);
        if (event.streams?.[0]) {
          setState((prev) => ({ ...prev, remoteStream: event.streams[0] }));
        } else {
          const fallback = stateRef.current.remoteStream ?? new MediaStream();
          fallback.addTrack(event.track);
          setState((prev) => ({ ...prev, remoteStream: fallback }));
        }
      };

      if (isCaller) {
        rtcLog('📝 Creating OFFER');
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await pc.setLocalDescription(offer);
        if (!pc.localDescription) throw new Error('localDescription null');
        
        safeSendSignal({
          type: 'call_offer',
          call_id: callId,
          target_user_id: stateRef.current.remoteUserId ?? 0,
          sdp: pc.localDescription,
        });

        // ⏱ WATCHDOG: если answer не пришёл вовремя — один раз переотправляем
        // offer. Лечит потерянный по пути offer ИЛИ потерянный answer: при
        // повторном получении того же offer принимающая сторона просто
        // создаёт новый ответ.
        if (answerTimeoutTimerRef.current) {
          clearTimeout(answerTimeoutTimerRef.current);
        }
        answerTimeoutTimerRef.current = setTimeout(() => {
          answerTimeoutTimerRef.current = null;
          const cur = pcRef.current;
          if (!cur || cur.connectionState === 'connected') return;
          if (cur.signalingState !== 'stable' || !cur.remoteDescription) {
            rtcWarn('⏱ ANSWER not received in time — resending OFFER');
            const desc = cur.localDescription;
            const cid = stateRef.current.callId;
            const tid = stateRef.current.remoteUserId;
            if (desc && cid && tid) {
              safeSendSignal({ type: 'call_offer', call_id: cid, target_user_id: tid, sdp: desc });
            }
          }
        }, ANSWER_TIMEOUT_MS);
      }

      // 🔥 SELF-HEALING: если offer пришёл до создания PC (гонка при медленном
      // getUserMedia/refreshIceServers на принимающей стороне), применяем его
      // сразу после готовности PeerConnection.
      if (!isCaller && pendingOfferRef.current?.callId === callId) {
        const buffered = pendingOfferRef.current;
        pendingOfferRef.current = null;
        try {
          rtcLog('↩️ Applying buffered OFFER');
          await applyRemoteOffer(pc, callId, buffered.sdp);
        } catch (error) {
          rtcError('Failed to apply buffered OFFER', error);
        }
      }
    },
    [applyRemoteOffer, cleanup, restartIce, safeSendSignal]
  );

  const initiateCall = useCallback(
    async (targetUserId: number, callType: CallType, callerName: string, callerAvatar: string) => {
      rtcLog(`📞 Initiating call to ${targetUserId}`);
      // 🔥 Медиа и TURN грузим ПАРАЛЛЕЛЬНО: камера включается мгновенно,
      // а не после (возможно очень медленного) запроса /api/ice-servers.
      // refreshIceServers ограничен таймаутом 4с и никогда не бросает исключений.
      const streamPromise = getMediaStream(callType);
      try {
        await refreshIceServers();
        const stream = await streamPromise;
        setState((prev) => ({
          ...prev,
          status: 'initiating',
          callType,
          remoteUserId: targetUserId,
          remoteUserName: callerName,
          remoteUserAvatar: callerAvatar,
          isCaller: true,
          localStream: stream,
        }));

        // 🛡 ОПРЕДЕЛИТЕЛЬ: в сигнале уходим СВОИ именем/авой из активного
        // аккаунта. Раньше сюда улетало имя СОБЕСЕДНИКА (параметры
        // callerName/callerAvatar передаёт страница, зная только партнёра),
        // из-за чего вызываемый видел в «Входящем звонке» СВОЙ ник.
        const me = getActiveAccount();
        safeSendSignal({
          type: 'call_initiate',
          target_user_id: targetUserId,
          call_type: callType,
          caller_name: me?.displayName || callerName,
          caller_avatar: me?.avatarUrl || callerAvatar,
        });
      } catch (error) {
        rtcError('Failed to initiate call', error);
        setState(initialState);
      }
    },
    [getMediaStream, safeSendSignal]
  );

  const acceptCall = useCallback(
    async (callId: string, callerId: number, callType: CallType, callerName: string, callerAvatar: string) => {
      rtcLog(`✅ Accepting call ${callId}`);
      // 🔥 Медиа и TURN параллельно (см. initiateCall) — камера включается мгновенно
      const streamPromise = getMediaStream(callType);
      try {
        await refreshIceServers();
        const stream = await streamPromise;
        activeCallIdRef.current = callId;

        setState((prev) => ({
          ...prev,
          status: 'connecting',
          callId,
          callType,
          remoteUserId: callerId,
          remoteUserName: callerName,
          remoteUserAvatar: callerAvatar,
          isCaller: false,
          localStream: stream,
        }));

        // 🔥 FIX (race condition): сначала создаём PeerConnection и ТОЛЬКО
        // потом объявляем о готовности. Раньше call_accept уходил до
        // setupPeerConnection: инициатор мгновенно получал 'call_accepted',
        // собирал offer и отправлял его по WS раньше, чем у вызываемого
        // создавался pcRef -> 'Received OFFER but no PC' -> offer терялся.
        await setupPeerConnection(callId, stream, false);

        safeSendSignal({
          type: 'call_accept',
          call_id: callId,
          target_user_id: callerId,
        });
      } catch (error) {
        rtcError('Failed to accept call', error);
        safeSendSignal({ type: 'call_reject', call_id: callId, target_user_id: callerId });
        cleanup();
        setState(initialState);
      }
    },
    [cleanup, getMediaStream, safeSendSignal, setupPeerConnection]
  );

  const rejectCall = useCallback(
    (callId: string, callerId: number) => {
      rtcLog(`🚫 Rejecting call ${callId}`);
      safeSendSignal({ type: 'call_reject', call_id: callId, target_user_id: callerId });
      cleanup();
      setState(initialState);
    },
    [cleanup, safeSendSignal]
  );

  const endCall = useCallback(
    (callId: string, targetUserId: number) => {
      rtcLog(`👋 Ending call ${callId}`);
      endReasonRef.current = 'local';
      safeSendSignal({ type: 'call_end', call_id: callId, target_user_id: targetUserId });
      setState((prev) => ({ ...prev, status: 'ended' }));
      setTimeout(() => {
        cleanup();
        setState(initialState);
      }, 500);
    },
    [cleanup, safeSendSignal]
  );

  const handleSignal = useCallback(
    async (data: any) => {
      if (!data?.type) {
        rtcWarn('Malformed signal', data);
        return;
      }

      rtcLog(`📥 Signal: ${data.type}`, data);

      switch (data.type) {
        case 'call_incoming':
          setState((prev) => ({
            ...prev,
            status: 'ringing',
            callId: data.call_id,
            callType: data.call_type,
            remoteUserId: data.caller_id,
            remoteUserName: data.caller_name ?? '',
            remoteUserAvatar: data.caller_avatar ?? '',
            isCaller: false,
          }));
          break;

        case 'call_initiated':
          rtcLog(`✅ Call initiated: ${data.call_id}`);
          setState((prev) => ({
            ...prev,
            callId: data.call_id,
            remoteUserId: data.target_user_id ?? prev.remoteUserId,
          }));
          activeCallIdRef.current = data.call_id;
          break;

        case 'call_accepted': {
          const current = stateRef.current;
          const callId = current.callId ?? data.call_id;
          const stream = current.localStream;

          if (!callId || !stream) {
            rtcError('Cannot create caller PC', { callId, hasStream: !!stream });
            return;
          }

          setState((prev) => ({ ...prev, status: 'connecting', callId }));
          await setupPeerConnection(callId, stream, true);
          break;
        }

        case 'call_offer': {
          if (!data.sdp) {
            rtcError('OFFER missing SDP');
            return;
          }

          const pc = pcRef.current;
          const callId = data.call_id ?? stateRef.current.callId;

          if (!pc || !callId) {
            // 🔥 FIX: раньше offer, пришедший до создания PC, терялся навсегда
            // ("Received OFFER but no PC"). Теперь буферизуем — setupPeerConnection
            // применит его сразу после готовности PeerConnection.
            rtcWarn('Received OFFER before PC — buffering');
            if (callId) {
              pendingOfferRef.current = { callId, sdp: data.sdp };
            }
            return;
          }

          if (pc.signalingState === 'have-remote-offer') {
            rtcWarn('Duplicate OFFER while have-remote-offer — ignoring');
            return;
          }

          await applyRemoteOffer(pc, callId, data.sdp);
          break;
        }

        case 'call_answer': {
          const pc = pcRef.current;
          if (!pc) {
            rtcError('Received ANSWER but no PC');
            return;
          }
          if (!data.sdp) {
            rtcError('ANSWER missing SDP');
            return;
          }

          try {
            rtcLog('📝 Setting remote ANSWER');
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
            await flushIceCandidateBuffer(pc);
            rtcLog('✅ ANSWER applied');
          } catch (error) {
            rtcError('Failed to set ANSWER', error);
          }
          break;
        }

        case 'call_ice_candidate': {
          if (!data.candidate) {
            rtcWarn('ICE signal without candidate');
            return;
          }
          const pc = pcRef.current;
          if (!pc) {
            rtcLog('🧊 PC not ready — buffering ICE');
            iceCandidateBufferRef.current.push(data.candidate);
            return;
          }
          await addRemoteIceCandidate(pc, data.candidate);
          break;
        }

        case 'call_rejected':
        case 'call_busy':
        case 'call_ended':
          rtcLog(`📴 Remote ended: ${data.type}`);
          endReasonRef.current = data.type === 'call_ended' ? 'remote_ended' : 'declined';
          setState((prev) => ({ ...prev, status: 'ended' }));
          setTimeout(() => {
            cleanup();
            setState(initialState);
          }, 500);
          break;

        default:
          rtcWarn(`Unknown signal: ${data.type}`);
      }
    },
    [addRemoteIceCandidate, applyRemoteOffer, cleanup,
      flushIceCandidateBuffer, safeSendSignal, setupPeerConnection]
  );

  const toggleMute = useCallback(() => {
    const stream = stateRef.current.localStream;
    if (!stream) return;
    const tracks = stream.getAudioTracks();
    if (tracks.length === 0) return;
    const shouldMute = tracks.some((t) => t.enabled);
    tracks.forEach((t) => (t.enabled = !shouldMute));
    rtcLog(`🔇 Mic muted: ${shouldMute}`);
    setState((prev) => ({ ...prev, isMuted: shouldMute }));
  }, []);

  const toggleVideo = useCallback(() => {
    const stream = stateRef.current.localStream;
    if (!stream) return;
    const tracks = stream.getVideoTracks();
    if (tracks.length === 0) return;
    const shouldDisable = tracks.some((t) => t.enabled);
    tracks.forEach((t) => (t.enabled = !shouldDisable));
    rtcLog(`📹 Video disabled: ${shouldDisable}`);
    setState((prev) => ({ ...prev, isVideoOff: shouldDisable }));
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
    peerConnection: pcRef.current,
    endReasonRef,
    connectedOnceRef,
  };
}