import { x25519 } from "@noble/curves/ed25519";
import { gcm } from "@noble/ciphers/aes";

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

const utf8ToBytes = (str: string): Uint8Array => new TextEncoder().encode(str);
const bytesToUtf8 = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

// ============ КЛЮЧИ ПОЛЬЗОВАТЕЛЯ ============

export interface StoredKeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  publicKeyBase64: string;
}

let cachedKeyPair: StoredKeyPair | null = null;

export function getKeyPair(): StoredKeyPair | null {
  if (typeof window === "undefined") return null;
  if (cachedKeyPair) return cachedKeyPair;

  const privB64 = localStorage.getItem(PRIVATE_KEY_STORAGE);
  const pubB64 = localStorage.getItem(PUBLIC_KEY_STORAGE);
  if (!privB64 || !pubB64) return null;

  try {
    const privBytes = base64ToBytes(privB64);
    const pubBytes = base64ToBytes(pubB64);
    cachedKeyPair = {
      privateKey: privBytes,
      publicKey: pubBytes,
      publicKeyBase64: pubB64,
    };
    return cachedKeyPair;
  } catch (e) {
    console.error("Failed to load key pair:", e);
    return null;
  }
}

export function generateKeyPair(): StoredKeyPair {
  const privateKey = x25519.utils.randomPrivateKey();
  const publicKey = x25519.getPublicKey(privateKey);
  const pubB64 = bytesToBase64(publicKey);
  const privB64 = bytesToBase64(privateKey);

  localStorage.setItem(PRIVATE_KEY_STORAGE, privB64);
  localStorage.setItem(PUBLIC_KEY_STORAGE, pubB64);

  cachedKeyPair = {
    privateKey,
    publicKey,
    publicKeyBase64: pubB64,
  };
  return cachedKeyPair;
}

export async function ensureKeyPair(
  token: string,
  apiUrl: string
): Promise<{ publicKey: Uint8Array; publicKeyBase64: string; fingerprint: string }> {
  let pair = getKeyPair();
  if (!pair) {
    pair = generateKeyPair();
  }
  const fd = new FormData();
  fd.append("public_key", pair.publicKeyBase64);
  const res = await fetch(`${apiUrl}/api/keys/register`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  if (!res.ok) {
    throw new Error("Failed to register key");
  }
  const data = await res.json();
  return { publicKey: pair.publicKey, publicKeyBase64: pair.publicKeyBase64, fingerprint: data.fingerprint };
}

// ============ ШИФРОВАНИЕ СООБЩЕНИЙ (AES-256-GCM) ============

export function encryptMessage(plaintext: string, sessionKey: Uint8Array): string {
  const iv = randomBytes(12);
  const data = utf8ToBytes(plaintext);
  const cipher = gcm(sessionKey, iv);
  const encrypted = cipher.encrypt(data);
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
    const cipher = gcm(sessionKey, iv);
    const decrypted = cipher.decrypt(data);
    return bytesToUtf8(decrypted);
  } catch (e) {
    console.error("Decryption failed:", e);
    return "[Ошибка расшифровки]";
  }
}

// ============ SESSION KEYS (ECDH + AES-GCM) ============

export function generateSessionKey(): Uint8Array {
  return randomBytes(32);
}

export function encryptSessionKeyForUser(
  sessionKey: Uint8Array,
  recipientPublicKeyBase64: string
): string {
  const myKeys = getKeyPair();
  if (!myKeys) throw new Error("Нет ключей");

  // Одноразовая пара для ECDH
  const ephemeralPriv = x25519.utils.randomPrivateKey();
  const ephemeralPub = x25519.getPublicKey(ephemeralPriv);

  // Публичный ключ получателя
  const recipientPub = base64ToBytes(recipientPublicKeyBase64);

  // ECDH shared secret
  const sharedSecret = x25519.getSharedSecret(ephemeralPriv, recipientPub);

  // Шифруем session key
  const iv = randomBytes(12);
  const cipher = gcm(sharedSecret, iv);
  const encrypted = cipher.encrypt(sessionKey);

  // Формат: ephemeral_pub (32) || iv (12) || ciphertext
  const result = new Uint8Array(32 + 12 + encrypted.length);
  result.set(ephemeralPub);
  result.set(iv, 32);
  result.set(encrypted, 32 + 12);
  return bytesToBase64(result);
}

export function decryptSessionKey(encryptedPayload: string): Uint8Array {
  const myKeys = getKeyPair();
  if (!myKeys) throw new Error("Нет ключей");

  const payload = base64ToBytes(encryptedPayload);
  const ephemeralPubBytes = payload.slice(0, 32);
  const iv = payload.slice(32, 32 + 12);
  const ciphertext = payload.slice(32 + 12);

  const sharedSecret = x25519.getSharedSecret(myKeys.privateKey, ephemeralPubBytes);
  const cipher = gcm(sharedSecret, iv);
  return cipher.decrypt(ciphertext);
}

// ============ SESSION KEY CACHE ============

export function storeSessionKey(chatId: number, sessionKey: Uint8Array) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(`${SESSION_KEYS_PREFIX}${chatId}`, bytesToBase64(sessionKey));
}

export function loadSessionKey(chatId: number): Uint8Array | null {
  if (typeof window === "undefined") return null;
  const b64 = sessionStorage.getItem(`${SESSION_KEYS_PREFIX}${chatId}`);
  return b64 ? base64ToBytes(b64) : null;
}

export function clearSessionKey(chatId: number) {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(`${SESSION_KEYS_PREFIX}${chatId}`);
}

// ============ ОТПЕЧАТОК ============

export function fingerprint(publicKey: Uint8Array): string {
  return Array.from(publicKey.slice(0, 4))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("-")
    .toUpperCase();
}