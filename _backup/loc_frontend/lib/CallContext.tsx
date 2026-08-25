// frontend/lib/CallContext.tsx
'use client';

import { createContext, useContext } from 'react';
import { CallState, CallType } from '@/src/hooks/useWebRTC';

export interface CallContextType {
  callState: CallState;
  initiateCall: (userId: number, callType: CallType, userName: string, userAvatar: string) => void;
  acceptCall: () => void;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
}

export const CallContext = createContext<CallContextType | null>(null);

export function useCall() {
  const context = useContext(CallContext);
  if (!context) throw new Error('useCall должен использоваться внутри CallContext.Provider');
  return context;
}