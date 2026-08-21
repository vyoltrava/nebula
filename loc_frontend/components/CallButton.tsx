// frontend/components/CallButton.tsx
'use client';

import { CallType } from '@/lib/webrtc';

interface CallButtonProps {
  userId: number;
  userName: string;
  userAvatar: string;
  callType: CallType;
  onCall: (userId: number, callType: CallType) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export default function CallButton({
  userName,
  callType,
  onCall,
  userId,
  disabled,
  size = 'md',
}: CallButtonProps) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
  };

  const iconSize = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  const isVideo = callType === 'video';

  return (
    <button
      onClick={() => onCall(userId, callType)}
      disabled={disabled}
      className={`${sizeClasses[size]} rounded-full flex items-center justify-center
        ${isVideo
          ? 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-400'
          : 'bg-green-500/20 hover:bg-green-500/30 text-green-400'
        }
        disabled:opacity-50 disabled:cursor-not-allowed
        transition-all hover:scale-110 active:scale-95`}
      title={`${isVideo ? 'Видео' : 'Аудио'} звонок ${userName}`}
    >
      {isVideo ? (
        <svg className={iconSize[size]} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      ) : (
        <svg className={iconSize[size]} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
      )}
    </button>
  );
}