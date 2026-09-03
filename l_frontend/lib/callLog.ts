// lib/callLog.ts — сообщения-уведомления о звонках (как в Telegram).
// Звонок может начаться из страницы чата, но завершиться когда пользователь
// уже ушёл со страницы, поэтому контекст чата регистрируется в момент старта
// звонка и живёт в module-level переменной.
'use client';

import { getToken } from './auth';
import { loadSessionKey } from './secureSessionKeys';
import { encryptMessage } from './crypto';
import { API_URL } from './apiUrl';

export type CallLogOutcome = 'ended' | 'missed' | 'declined';

export interface CallLogPayload {
  /** Маркер-детектор сообщения-звонка */
  nebula_call_log: 1;
  call_type: 'audio' | 'video';
  /** ended — разговор состоялся; missed — не ответили/отменили до ответа; declined — отклонён */
  outcome: CallLogOutcome;
  /** Длительность разговора в секундах (0 — если не состоялся) */
  duration: number;
}

interface ActiveCallChat {
  chatId: number;
  isSecret: boolean;
}

let activeCallChat: ActiveCallChat | null = null;

/** Вызывается со страницы чата ПЕРЕД initiateCall. */
export function registerCallChat(chatId: number, isSecret: boolean): void {
  activeCallChat = { chatId, isSecret };
}

export function clearCallChat(): void {
  activeCallChat = null;
}

/** Парсинг текста сообщения в call_log (null — если это обычное сообщение). */
export function parseCallLog(text: string | null | undefined): CallLogPayload | null {
  if (!text || !text.startsWith('{"nebula_call_log"')) return null;
  try {
    const parsed = JSON.parse(text);
    if (parsed && parsed.nebula_call_log === 1) {
      return {
        nebula_call_log: 1,
        call_type: parsed.call_type === 'video' ? 'video' : 'audio',
        outcome: ['ended', 'missed', 'declined'].includes(parsed.outcome) ? parsed.outcome : 'ended',
        duration: Number(parsed.duration) || 0,
      };
    }
  } catch { /* не наш формат */ }
  return null;
}

/**
 * Отправляет в чат сообщение-уведомление о завершённом звонке.
 * Вызывается ТОЛЬКО на стороне вызывающего (один writer — нет дублей).
 * Для секретных чатов payload шифруется сессионным ключом.
 */
export async function sendCallLogMessage(opts: {
  remoteUserId: number;
  callType: 'audio' | 'video';
  outcome: CallLogOutcome;
  duration: number;
}): Promise<void> {
  try {
    const token = getToken();
    if (!token) return;

    let chatId = activeCallChat?.chatId ?? null;
    let isSecret = activeCallChat?.isSecret ?? false;

    // Звонок мог быть начат не со страницы чата — резолвим DM-чат
    if (!chatId) {
      const res = await fetch(`${API_URL}/api/chats?other_user_id=${opts.remoteUserId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      chatId = data?.chat_id ?? null;
      isSecret = false; // open_or_create_chat возвращает только не-секретные DM
    }
    if (!chatId) return;

    const payload: CallLogPayload = {
      nebula_call_log: 1,
      call_type: opts.callType,
      outcome: opts.outcome,
      duration: Math.max(0, Math.round(opts.duration)),
    };
    const body = JSON.stringify(payload);

    const form = new FormData();
    if (isSecret) {
      const sk = loadSessionKey(chatId);
      if (!sk) return; // нет ключа — не отправляем (не роняем UI)
      form.append('ciphertext', encryptMessage(body, sk));
      form.append('text', '');
    } else {
      form.append('text', body);
    }

    await fetch(`${API_URL}/api/chats/${chatId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    activeCallChat = null;
  } catch (e) {
    // Уведомление о звонке не критично — молча игнорируем сбои
    console.warn('📞 call_log: failed to send', e);
  }
}
