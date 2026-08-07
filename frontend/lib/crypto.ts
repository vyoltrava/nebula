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

// ============ X25519 ЧЕРЕЗ WEBCRYPTO ============

async function generateX25519KeyPair(): Promise<CryptoKeyPair> {
  return await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "X25519" } as any,
    true,
    ["deriveBits"]
  );
}

async function exportPublicKey(key: CryptoKey): Promise<Uint8Array> {
  const exported = await crypto.subtle.exportKey("raw", key);
  return new Uint8Array(exported as ArrayBuffer);
}

async function exportPrivateKey(key: CryptoKey): Promise<Uint8Array> {
  const jwk = await crypto.subtle.exportKey("jwk", key);
  return base64UrlToBytes(jwk.d!);
}

async function importPrivateKey(bytes: Uint8Array): Promise<CryptoKey> {
  const jwk = {
    kty: "OKP",
    crv: "X25519",
    d: bytesToBase64Url(bytes),
    key_ops: ["deriveBits"],
    ext: true,
  };
  return await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: "X25519" } as any,
    true,
    ["deriveBits"]
  );
}

async function importPublicKey(bytes: Uint8Array): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    bytes.buffer as ArrayBuffer,
    { name: "ECDH", namedCurve: "X25519" } as any,
    true,
    []
  );
}

async function deriveSharedSecret(privateKey: CryptoKey, publicKey: CryptoKey): Promise<Uint8Array> {
  const bits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: publicKey } as any,
    privateKey,
    256
  );
  return new Uint8Array(bits as ArrayBuffer);
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  return base64ToBytes(b64);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ============ КЛЮЧИ ПОЛЬЗОВАТЕЛЯ ============

interface StoredKeyPair {
  privateKey: CryptoKey;
  publicKey: Uint8Array;
  publicKeyBase64: string;
}

let cachedKeyPair: StoredKeyPair | null = null;

export async function getKeyPair(): Promise<StoredKeyPair | null> {
  if (typeof window === "undefined") return null;
  if (cachedKeyPair) return cachedKeyPair;

  const privB64 = localStorage.getItem(PRIVATE_KEY_STORAGE);
  const pubB64 = localStorage.getItem(PUBLIC_KEY_STORAGE);
  if (!privB64 || !pubB64) return null;

  try {
    const privBytes = base64ToBytes(privB64);
    const pubBytes = base64ToBytes(pubB64);
    const privateKey = await importPrivateKey(privBytes);
    cachedKeyPair = {
      privateKey,
      publicKey: pubBytes,
      publicKeyBase64: pubB64,
    };
    return cachedKeyPair;
  } catch (e) {
    console.error("Failed to load key pair:", e);
    return null;
  }
}

export async function generateKeyPair(): Promise<StoredKeyPair> {
  const pair = await generateX25519KeyPair();
  const pubBytes = await exportPublicKey(pair.publicKey);
  const privBytes = await exportPrivateKey(pair.privateKey);

  const pubB64 = bytesToBase64(pubBytes);
  const privB64 = bytesToBase64(privBytes);

  localStorage.setItem(PRIVATE_KEY_STORAGE, privB64);
  localStorage.setItem(PUBLIC_KEY_STORAGE, pubB64);

  cachedKeyPair = {
    privateKey: pair.privateKey,
    publicKey: pubBytes,
    publicKeyBase64: pubB64,
  };
  return cachedKeyPair;
}

export async function ensureKeyPair(
  token: string,
  apiUrl: string
): Promise<{ publicKey: Uint8Array; fingerprint: string }> {
  let pair = await getKeyPair();
  if (!pair) {
    pair = await generateKeyPair();
  }
  const fd = new FormData();
  fd.append("public_key", pair.publicKeyBase64);
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

// ============ SESSION KEYS ============

export function generateSessionKey(): Uint8Array {
  return randomBytes(32);
}

export async function encryptSessionKeyForUser(
  sessionKey: Uint8Array,
  recipientPublicKeyBase64: string
): Promise<string> {
  const ephemeral = await generateX25519KeyPair();
  const ephemeralPub = await exportPublicKey(ephemeral.publicKey);

  const recipientPub = await importPublicKey(base64ToBytes(recipientPublicKeyBase64));
  const sharedSecret = await deriveSharedSecret(ephemeral.privateKey, recipientPub);

  const iv = randomBytes(12);
  const cipher = gcm(sharedSecret, iv);
  const encrypted = cipher.encrypt(sessionKey);

  const result = new Uint8Array(32 + 12 + encrypted.length);
  result.set(ephemeralPub);
  result.set(iv, 32);
  result.set(encrypted, 32 + 12);
  return bytesToBase64(result);
}

export async function decryptSessionKey(
  encryptedPayload: string,
  privateKey?: CryptoKey
): Promise<Uint8Array> {
  const payload = base64ToBytes(encryptedPayload);
  const ephemeralPubBytes = payload.slice(0, 32);
  const iv = payload.slice(32, 32 + 12);
  const ciphertext = payload.slice(32 + 12);

  let privKey = privateKey;
  if (!privKey) {
    const pair = await getKeyPair();
    if (!pair) throw new Error("Нет ключей");
    privKey = pair.privateKey;
  }

  const ephemeralPub = await importPublicKey(ephemeralPubBytes);
  const sharedSecret = await deriveSharedSecret(privKey, ephemeralPub);

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