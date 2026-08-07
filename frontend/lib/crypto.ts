import { x25519 } from "@noble/curves/ed25519";
import { gcm } from "@noble/ciphers/aes";
import { utf8ToBytes, bytesToUtf8 } from "@noble/ciphers/utils";
import { randomBytes } from "@noble/ciphers/webcrypto";

const PRIVATE_KEY_STORAGE = "nebula_e2ee_private_key";
const PUBLIC_KEY_STORAGE = "nebula_e2ee_public_key";
const SESSION_KEYS_PREFIX = "nebula_session_key_";

// ============ БАЗОВЫЕ УТИЛИТЫ ============

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ============ КЛЮЧИ ПОЛЬЗОВАТЕЛЯ ============

export function getKeyPair(): { privateKey: Uint8Array; publicKey: Uint8Array } | null {
  const priv = localStorage.getItem(PRIVATE_KEY_STORAGE);
  const pub = localStorage.getItem(PUBLIC_KEY_STORAGE);
  if (!priv || !pub) return null;
  return {
    privateKey: base64ToBytes(priv),
    publicKey: base64ToBytes(pub),
  };
}

export function generateKeyPair(): { privateKey: Uint8Array; publicKey: Uint8Array } {
  const privateKey = x25519.utils.randomPrivateKey();
  const publicKey = x25519.getPublicKey(privateKey);
  localStorage.setItem(PRIVATE_KEY_STORAGE, bytesToBase64(privateKey));
  localStorage.setItem(PUBLIC_KEY_STORAGE, bytesToBase64(publicKey));
  return { privateKey, publicKey };
}

export async function ensureKeyPair(token: string, apiUrl: string): Promise<{ publicKey: Uint8Array; fingerprint: string }> {
  let pair = getKeyPair();
  if (!pair) {
    pair = generateKeyPair();
  }
  // Всегда регистрируем публичный ключ (или обновляем)
  const fd = new FormData();
  fd.append("public_key", bytesToBase64(pair.publicKey));
  const res = await fetch(`${apiUrl}/api/keys/register`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const data = await res.json();
  return { publicKey: pair.publicKey, fingerprint: data.fingerprint };
}

// ============ ШИФРОВАНИЕ СООБЩЕНИЙ ============

export function encryptMessage(plaintext: string, sessionKey: Uint8Array): string {
  const iv = randomBytes(12);
  const data = utf8ToBytes(plaintext);
  const encrypted = gcm(sessionKey, iv).encrypt(data);
  const combined = new Uint8Array(iv.length + encrypted.length);
  combined.set(iv);
  combined.set(encrypted, iv.length);
  return bytesToBase64(combined);
}

export function decryptMessage(ciphertext: string, sessionKey: Uint8Array): string {
  try {
    const combined = base64ToBytes(ciphertext);
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = gcm(sessionKey, iv).decrypt(data);
    return bytesToUtf8(decrypted);
  } catch (e) {
    console.error("Decryption failed:", e);
    return "[Ошибка расшифровки]";
  }
}

// ============ SESSION KEYS ============

export function generateSessionKey(): Uint8Array {
  return randomBytes(32);
}

/**
 * Шифрует session key публичным ключом получателя через ECDH.
 * Формат: ephemeral_pub (32) || iv (12) || ciphertext
 */
export function encryptSessionKeyForUser(
  sessionKey: Uint8Array,
  recipientPublicKey: Uint8Array
): string {
  const ephemeralPriv = x25519.utils.randomPrivateKey();
  const ephemeralPub = x25519.getPublicKey(ephemeralPriv);
  const sharedSecret = x25519.getSharedSecret(ephemeralPriv, recipientPublicKey);

  const iv = randomBytes(12);
  const encrypted = gcm(sharedSecret, iv).encrypt(sessionKey);

  const result = new Uint8Array(32 + 12 + encrypted.length);
  result.set(ephemeralPub);
  result.set(iv, 32);
  result.set(encrypted, 32 + 12);
  return bytesToBase64(result);
}

export function decryptSessionKey(encryptedPayload: string, privateKey: Uint8Array): Uint8Array {
  const payload = base64ToBytes(encryptedPayload);
  const ephemeralPub = payload.slice(0, 32);
  const iv = payload.slice(32, 32 + 12);
  const ciphertext = payload.slice(32 + 12);

  const sharedSecret = x25519.getSharedSecret(privateKey, ephemeralPub);
  return gcm(sharedSecret, iv).decrypt(ciphertext);
}

// ============ SESSION KEY CACHE ============

export function storeSessionKey(chatId: number, sessionKey: Uint8Array) {
  sessionStorage.setItem(`${SESSION_KEYS_PREFIX}${chatId}`, bytesToBase64(sessionKey));
}

export function loadSessionKey(chatId: number): Uint8Array | null {
  const b64 = sessionStorage.getItem(`${SESSION_KEYS_PREFIX}${chatId}`);
  return b64 ? base64ToBytes(b64) : null;
}

export function clearSessionKey(chatId: number) {
  sessionStorage.removeItem(`${SESSION_KEYS_PREFIX}${chatId}`);
}

// ============ ОТПЕЧАТОК ============

export function fingerprint(publicKey: Uint8Array): string {
  return Array.from(publicKey.slice(0, 4))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("-")
    .toUpperCase();
}