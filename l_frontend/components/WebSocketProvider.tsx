// frontend/components/WebSocketProvider.tsx
"use client";

import { useEffect, useRef } from "react";
import { socket } from "@/lib/websocket";
import { getToken } from "@/lib/auth";
import { showBackgroundNotification } from "@/lib/notifications";
import { useWebRTC } from "@/src/hooks/useWebRTC";
import { CallContext } from "@/lib/CallContext";
import { sendCallLogMessage, clearCallChat, parseCallLog, formatCallLogText } from "@/lib/callLog";
import { stripMarkdown } from "@/lib/plainText";
import CallModal from "@/components/CallModal";
import RelayCallModal from "@/components/RelayCallModal";
import { getRelayCallApi } from "@/lib/relayCall";

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const {
    callState,
    initiateCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    handleSignal,
    endReasonRef,
    connectedOnceRef,
  } = useWebRTC((data) => {
    // ✅ ТЕПЕРЬ ЭТО РАБОТАЕТ, так как мы добавили метод send в шаге 1
    socket.send(data); 
  });

  // 📞 Сообщение-уведомление о звонке в чате (как в Telegram).
  // Пишет ТОЛЬКО вызывающий (один writer — нет дублей). Отправляется один раз
  // при переходе статуса в 'ended'. Исход:
  //   declined     — собеседник отклонил/занят
  //   ended        — разговор состоялся (duration > 0)
  //   missed       — никто не ответил (отмена на гудках или сбой)
  const lastLoggedCallRef = useRef<string | null>(null);
  useEffect(() => {
    const { status, isCaller, callId, callType, remoteUserId, duration } = callState;
    if (status !== 'ended' || !isCaller || !callId || !remoteUserId) return;
    if (lastLoggedCallRef.current === callId) return;
    lastLoggedCallRef.current = callId;

    const reason = endReasonRef.current;
    const outcome = reason === 'declined'
      ? 'declined'
      : connectedOnceRef.current
        ? 'ended'
        : 'missed';
    sendCallLogMessage({ remoteUserId, callType, outcome, duration });
    clearCallChat();
  }, [callState, endReasonRef, connectedOnceRef]);

  // 🛡 STABILIZATION FIX (критично для звонков):
  // Раньше весь этот useEffect зависел от [handleSignal], а handleSignal
  // пересоздавался при КАЖДОМ рендере провайдера (sendSignal передаётся
  // inline-стрелкой -> новые useCallback внутри useWebRTC). Во время звонка
  // провайдер рендерится очень часто (таймер длительности, обновление
  // диагностики на каждый ICE-кандидат), из-за чего эффект размонтировался:
  //   unsubscribe -> socket.disconnect() (close 1000) -> socket.connect()
  // Соединение "мигало", входящие call_offer/call_answer/call_ice_candidate
  // терялись => ICE не собирался => сторона ловила 'failed' и обрывала звонок
  // (в консоли второй стороны: "📴 Remote ended: call_ended").
  //
  // Фикс: держим последний handleSignal в ref и подписываемся на события
  // ОДИН раз за монтирование ([]). Теперь рефакторы колбэков НЕ убивают WS.
  const handleSignalRef = useRef(handleSignal);

  useEffect(() => {
    handleSignalRef.current = handleSignal;
  });

  useEffect(() => {
    const token = getToken();
    if (token) {
      socket.connect(token);
    }

    const unsubMessage = socket.on("new_message", (data: any) => {
      if (document.hidden) {
        const rawText: string = data.text || "";
        // 📞 Звонок — человекочитаемое превью вместо сырого JSON; обычные — без Markdown-разметки
        const callLog = parseCallLog(rawText);
        let body: string;
        if (callLog) {
          body = formatCallLogText(callLog);
        } else if (data.media_type) {
          body = `📎 ${data.media_type === "image" ? "Фото" : data.media_type === "audio" ? "Голосовое" : data.media_type}`;
        } else {
          body = stripMarkdown(rawText) || "🔒 Секретное сообщение";
        }
        showBackgroundNotification({
          title: `💬 ${data.sender_name || "Новое сообщение"}`,
          body,
          icon: data.sender_avatar || undefined,
          tag: `chat-${data.chat_id}`,
          url: `/messages/${data.chat_id}`,
        });
      }
    });

    const unsubPost = socket.on("new_post", (data: any) => {
      if (document.hidden) {
        showBackgroundNotification({
          title: `✨ ${data.author} (@${data.handle})`,
          body: data.text ? data.text.slice(0, 100) : (data.media_url ? "📷 Медиа" : "Новый пост"),
          tag: `post-${data.id}`,
          url: `/post/${data.id}`,
        });
      }
    });

    const unsubUpdate = socket.on("new_update", (data: any) => {
      showBackgroundNotification({
        title: `📢 Обновление: ${data.title}`,
        body: data.importance === "major" ? "🔥 Важное обновление!" : "Незначительное обновление",
        tag: `update-${data.id}`,
        url: "/updates",
      });
    });

    // 🔥 Подписки на звонки — всегда через handleSignalRef.current,
    // чтобы актуальный обработчик использовался без пересоздания подписок.
    const unsubCallIncoming = socket.on("call_incoming", (data: any) => handleSignalRef.current({ type: "call_incoming", ...data }));
    const unsubCallInitiated = socket.on("call_initiated", (data: any) => handleSignalRef.current({ type: "call_initiated", ...data }));
    const unsubCallAccepted = socket.on("call_accepted", (data: any) => handleSignalRef.current({ type: "call_accepted", ...data }));
    const unsubCallRejected = socket.on("call_rejected", (data: any) => handleSignalRef.current({ type: "call_rejected", ...data }));
    const unsubCallEnded = socket.on("call_ended", (data: any) => handleSignalRef.current({ type: "call_ended", ...data }));
    const unsubCallOffer = socket.on("call_offer", (data: any) => handleSignalRef.current({ type: "call_offer", ...data }));
    const unsubCallAnswer = socket.on("call_answer", (data: any) => handleSignalRef.current({ type: "call_answer", ...data }));
    const unsubCallIce = socket.on("call_ice_candidate", (data: any) => handleSignalRef.current({ type: "call_ice_candidate", ...data }));
    const unsubCallBusy = socket.on("call_busy", (data: any) => handleSignalRef.current({ type: "call_busy", ...data }));

    // 📞 Релейный звонок (без WebRTC): входящий от сервера управляет API.
    const unsubRelayIncoming = socket.on("relay_call_incoming", (data: any) => {
      const r = getRelayCallApi();
      r.incoming(data.call_id, data.caller_id, data.call_type || "audio", data.caller_name || "", data.caller_avatar || "");
    });

    // 📱 iOS: после возврата из фона/разблокировки сокет может быть мёртв —
    // оживляем, иначе входящие звонки не доходят.
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        socket.ensureAlive();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', onVisible);

    return () => {
      unsubMessage();
      unsubPost();
      unsubUpdate();
      unsubCallIncoming();
      unsubCallInitiated();
      unsubCallAccepted();
      unsubCallRejected();
      unsubCallEnded();
      unsubCallOffer();
      unsubCallAnswer();
      unsubCallIce();
      unsubCallBusy();
      unsubRelayIncoming();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('online', onVisible);
      // Разрываем соединение ТОЛЬКО при финальном размонтировании провайдера
      // ([] deps), а не при каждом рендере, как раньше.
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ ИСПРАВЛЕНО: Правильная передача аргументов из текущего состояния
  const contextValue = {
    callState,
    initiateCall,
    acceptCall: () => {
      if (callState.callId && callState.remoteUserId) {
        acceptCall(
          callState.callId,
          callState.remoteUserId,
          callState.callType,
          callState.remoteUserName,
          callState.remoteUserAvatar
        );
      }
    },
    rejectCall: () => {
      if (callState.callId && callState.remoteUserId) {
        rejectCall(callState.callId, callState.remoteUserId);
      }
    },
    endCall: () => {
      if (callState.callId && callState.remoteUserId) {
        endCall(callState.callId, callState.remoteUserId);
      }
    },
    toggleMute,
    toggleVideo,
  };

  return (
    <CallContext.Provider value={contextValue}>
      {children}
      <CallModal />
      <RelayCallModal />
    </CallContext.Provider>
  );
}