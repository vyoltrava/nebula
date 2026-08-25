// lib/cryptoInit.ts
import { getToken } from "@/lib/auth";
import { ensureKeyPair, getKeyPair } from "@/lib/crypto";

let initPromise: Promise<boolean> | null = null;

/**
 * Инициализирует криптографию при загрузке приложения.
 * Вызывается ОДИН РАЗ в layout или провайдере.
 * Генерирует ключи если их нет и регистрирует на сервере.
 */
export function initCryptoOnLogin(): Promise<boolean> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const token = getToken();
    if (!token) return false;

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      if (!apiUrl) return false;

      // 1. Генерируем/загружаем ключи локально
      const keyData = await ensureKeyPair(token, apiUrl);
      if (!keyData) {
        console.error("[CryptoInit] Failed to generate key pair");
        return false;
      }

      // 2. Регистрируем на сервере (если ещё не зарегистрированы)
      const keys = getKeyPair();
      if (!keys) return false;

      const form = new FormData();
      form.append("public_key", keys.publicKeyBase64);

      const res = await fetch(`${apiUrl}/api/keys/register`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (!res.ok) {
        console.error("[CryptoInit] Failed to register keys:", res.status);
        return false;
      }

      const data = await res.json();
      console.log("[CryptoInit] Keys registered:", data);
      return true;
    } catch (err) {
      console.error("[CryptoInit] Error:", err);
      return false;
    }
  })();

  return initPromise;
}

/**
 * Сбрасывает состояние (при выходе из аккаунта)
 */
export function resetCryptoInit() {
  initPromise = null;
}