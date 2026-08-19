// lib/secureSessionKeys.ts

/**
 * 🛡️ БЕЗОПАСНОЕ ХРАНИЛИЩE КЛЮЧЕЙ СЕССИЙ (E2EE)
 * 
 * Мы НЕ используем localStorage или IndexedDB. 
 * Если произойдет XSS-атака, злоумышленник не сможет украсть ключи с диска.
 * Ключи хранятся только в RAM. При закрытии вкладки или обновлении страницы они стираются.
 * При следующем входе initSecretChat() автоматически восстановит их с сервера.
 */

const sessionKeysMemory = new Map<number, Uint8Array>();

export function storeSessionKey(chatId: number, key: Uint8Array): void {
    sessionKeysMemory.set(chatId, key);
}

export function loadSessionKey(chatId: number): Uint8Array | undefined {
    return sessionKeysMemory.get(chatId);
}

export function clearSessionKey(chatId: number): void {
    sessionKeysMemory.delete(chatId);
}

export function clearAllSessionKeys(): void {
    sessionKeysMemory.clear();
}