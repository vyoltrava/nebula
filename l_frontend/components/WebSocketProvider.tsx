// frontend/components/WebSocketProvider.tsx
"use client";

import { useEffect } from "react";
import { socket } from "@/lib/websocket";
import { getToken } from "@/lib/auth";
import { showBackgroundNotification } from "@/lib/notifications";
import { useWebRTC } from "@/src/hooks/useWebRTC";
import { CallContext } from "@/lib/CallContext";
import CallModal from "@/components/CallModal";

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
  } = useWebRTC((data) => {
    // ✅ ТЕПЕРЬ ЭТО РАБОТАЕТ, так как мы добавили метод send в шаге 1
    socket.send(data); 
  });

  useEffect(() => {
    const token = getToken();
    if (token) {
      socket.connect(token);
    }

    const unsubMessage = socket.on("new_message", (data: any) => {
      if (document.hidden) {
        showBackgroundNotification({
          title: `💬 ${data.sender_name || "Новое сообщение"}`,
          body: data.media_type
            ? `📎 ${data.media_type === "image" ? "Фото" : data.media_type === "audio" ? "Голосовое" : data.media_type}`
            : (data.text || "🔒 Секретное сообщение"),
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

    // 🔥 Подписки на звонки
    const unsubCallIncoming = socket.on("call_incoming", (data: any) => handleSignal({ type: "call_incoming", ...data }));
    const unsubCallInitiated = socket.on("call_initiated", (data: any) => handleSignal({ type: "call_initiated", ...data }));
    const unsubCallAccepted = socket.on("call_accepted", (data: any) => handleSignal({ type: "call_accepted", ...data }));
    const unsubCallRejected = socket.on("call_rejected", (data: any) => handleSignal({ type: "call_rejected", ...data }));
    const unsubCallEnded = socket.on("call_ended", (data: any) => handleSignal({ type: "call_ended", ...data }));
    const unsubCallOffer = socket.on("call_offer", (data: any) => handleSignal({ type: "call_offer", ...data }));
    const unsubCallAnswer = socket.on("call_answer", (data: any) => handleSignal({ type: "call_answer", ...data }));
    const unsubCallIce = socket.on("call_ice_candidate", (data: any) => handleSignal({ type: "call_ice_candidate", ...data }));
    const unsubCallBusy = socket.on("call_busy", (data: any) => handleSignal({ type: "call_busy", ...data }));

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
      socket.disconnect();
    };
  }, [handleSignal]);

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
    </CallContext.Provider>
  );
}