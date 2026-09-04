// components/RelayCallModal.tsx
// 📞 UI релейного звонка (без WebRTC). Кнопки: ответить/отклонить/завершить.
'use client';

import { useEffect, useState } from 'react';
import { getRelayCallApi, onRelayCallSignal } from '@/lib/relayCall';
import { useI18n } from '@/lib/i18n/LanguageProvider';

export default function RelayCallModal() {
  const { t } = useI18n();
  const api = getRelayCallApi();
  const [state, setState] = useState(api.state);

  useEffect(() => {
    getRelayCallApi(setState);
    const unsub = onRelayCallSignal((type) => {
      // сигналы accepted/rejected/active/ended уже меняют state у api,
      // здесь подписка нужна, чтобы модалка перерендерилась при активном звонке
      getRelayCallApi();
    });
    return unsub;
  }, []);

  if (state.status === 'idle' || state.status === 'ended') return null;

  const isCaller = state.isCaller;
  const name = state.peerName || 'Неизвестный';
  const isRinging = state.status === 'ringing';
  const isCalling = state.status === 'calling';
  const isActive = state.status === 'active';

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col text-white overflow-hidden">
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center text-4xl overflow-hidden">
          {state.peerAvatar
            ? <img src={state.peerAvatar} alt={name} className="w-full h-full object-cover" />
            : '📞'}
        </div>
        <h2 className="text-2xl font-bold mt-4">{name}</h2>
        <p className="text-white/70">
          {isCalling ? 'Вызов...' : isRinging ? 'Входящий звонок' : 'Идёт разговор'}
        </p>
        {isActive && (
          <div className="flex items-center gap-2 mt-4 text-green-400">
            <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" /> live
          </div>
        )}
      </div>

      <div className="shrink-0 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex items-center justify-center gap-5">
        {/* Входящий: ответить + отклонить */}
        {isRinging && !isCaller && (
          <>
            <button onClick={() => api.reject()} className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white text-sm" aria-label="Отклонить">Отклонить</button>
            <button onClick={() => api.accept()} className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 text-white text-sm" aria-label="Ответить">Ответить</button>
          </>
        )}
        {/* Исходящий (calling): отменить */}
        {isCalling && isCaller && (
          <button onClick={() => api.end()} className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white text-sm" aria-label="Отменить">Отменить</button>
        )}
        {/* Активный: завершить */}
        {isActive && (
          <button onClick={() => api.end()} className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white text-sm" aria-label="Завершить">Завершить</button>
        )}
      </div>
    </div>
  );
}