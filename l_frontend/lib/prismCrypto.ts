// lib/prismCrypto.ts

const base64ToBytes = (base64: string): Uint8Array => {
  if (!base64 || typeof base64 !== 'string') {
    throw new Error(`base64ToBytes: получено не строка, а ${typeof base64}`);
  }
  // 🔥 АГРЕССИВНАЯ ОЧИСТКА: удаляем ВСЕ пробелы, табы и переносы строк
  const cleanBase64 = base64.replace(/\s+/g, '');
  
  if (cleanBase64.length === 0) {
    throw new Error("base64ToBytes: строка пуста после очистки");
  }

  try {
    const binString = atob(cleanBase64);
    return Uint8Array.from(binString, (m) => m.codePointAt(0)!);
  } catch (e) {
    console.error(`❌ atob сломался на строке: "${cleanBase64}" (длина: ${cleanBase64.length})`);
    throw new Error(`Невалидный Base64: ${e instanceof Error ? e.message : 'Unknown'}`);
  }
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join("");
  return btoa(binString);
};

const xorBytes = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const result = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) {
    result[i] = a[i] ^ b[i];
  }
  return result;
};

export function generatePrismKey(): Uint8Array {
  // ✅ 32-байтовый ключ (AES-256-GCM), чтобы совпадать с размером shards 1&2
  return window.crypto.getRandomValues(new Uint8Array(32));
}

export function splitKeyIntoShards(key: Uint8Array): {
  shard1_anchor: string;
  shard2_genesis: string;
  shard3_local: string;
} {
  const shard1 = window.crypto.getRandomValues(new Uint8Array(32));
  const shard2 = window.crypto.getRandomValues(new Uint8Array(32));
  const temp = xorBytes(key, shard1);
  const shard3 = xorBytes(temp, shard2);

  return {
    shard1_anchor: bytesToBase64(shard1),
    shard2_genesis: bytesToBase64(shard2),
    shard3_local: bytesToBase64(shard3),
  };
}

export function reconstructKey(shard1: string, shard2: string, shard3: string): Uint8Array {
  try {
    console.log("🔍 Проверка спектров перед reconstructKey:");
    console.log("  shard1 длина:", shard1?.replace(/\s+/g, '').length);
    console.log("  shard2 длина:", shard2?.replace(/\s+/g, '').length);
    console.log("  shard3 длина:", shard3?.replace(/\s+/g, '').length);

    const b1 = base64ToBytes(shard1);
    const b2 = base64ToBytes(shard2);
    const b3 = base64ToBytes(shard3);
    
    const temp = xorBytes(b1, b2);
    return xorBytes(temp, b3);
  } catch (e) {
    console.error("❌ КРИТИЧЕСКАЯ ОШИБКА В reconstructKey!");
    console.error("shard1:", shard1);
    console.error("shard2:", shard2);
    console.error("shard3:", shard3);
    throw new Error(`Повреждённый ключ: ${e instanceof Error ? e.message : 'Unknown'}`);
  }
}

export async function encryptAnchorWithPin(shard1Base64: string, pin: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const cryptoKey = await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("trelod_prism_salt"),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const algorithm = { name: "AES-GCM", iv } as any;
  const data = base64ToBytes(shard1Base64) as any;
  
  const encryptedBuffer = await window.crypto.subtle.encrypt(algorithm, cryptoKey, data);
  const encrypted = new Uint8Array(encryptedBuffer);
  const combined = new Uint8Array(iv.length + encrypted.length);
  combined.set(iv);
  combined.set(encrypted, iv.length);

  return bytesToBase64(combined);
}

export async function decryptAnchorWithPin(encryptedAnchorBase64: string, pin: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const cryptoKey = await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("trelod_prism_salt"),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const combined = base64ToBytes(encryptedAnchorBase64);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const algorithm = { name: "AES-GCM", iv } as any;
  const decryptedBuffer = await window.crypto.subtle.decrypt(algorithm, cryptoKey, ciphertext as any);
  return bytesToBase64(new Uint8Array(decryptedBuffer));
}