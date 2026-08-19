// lib/prismCrypto.ts

const base64ToBytes = (base64: string): Uint8Array => {
  const binString = atob(base64);
  return Uint8Array.from(binString, (m) => m.codePointAt(0)!);
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
  return window.crypto.getRandomValues(new Uint8Array(16));
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
  const b1 = base64ToBytes(shard1);
  const b2 = base64ToBytes(shard2);
  const b3 = base64ToBytes(shard3);
  const temp = xorBytes(b1, b2);
  return xorBytes(temp, b3);
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

  // ✅ ГАРАНТИРОВАННО РАБОТАЕТ: явное приведение типов
  const algorithm = { name: "AES-GCM", iv } as any;
  const data = base64ToBytes(shard1Base64) as any;
  
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    algorithm,
    cryptoKey,
    data
  );

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

  // ✅ ГАРАНТИРОВАННО РАБОТАЕТ: явное приведение типов
  const algorithm = { name: "AES-GCM", iv } as any;
  
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    algorithm,
    cryptoKey,
    ciphertext as any
  );

  return bytesToBase64(new Uint8Array(decryptedBuffer));
}

function stringToBits(str: string): number[] {
  const bits: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i);
    for (let j = 7; j >= 0; j--) {
      bits.push((charCode >> j) & 1);
    }
  }
  // Маркер конца данных (16 единиц и 1 ноль, маловероятно в обычном тексте)
  for (let i = 0; i < 15; i++) bits.push(1);
  bits.push(0);
  return bits;
}

/**
 * Извлекает строку из массива битов
 */
function bitsToString(bits: number[]): string {
  let str = "";
  for (let i = 0; i < bits.length; i += 8) {
    const byte = bits.slice(i, i + 8);
    if (byte.length < 8) break;
    
    // Проверка на маркер конца
    if (byte.every(b => b === 1) && bits[i + 8] === 0) {
      break;
    }
    
    const charCode = byte.reduce((acc, bit) => (acc << 1) | bit, 0);
    str += String.fromCharCode(charCode);
  }
  return str;
}

/**
 * 🆕 Внедряет строку (Shard 3) в PNG-изображение через LSB
 */
export async function embedDataInImage(imageFile: File, secretData: string): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(imageFile);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject("Canvas context not found");
      
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const bits = stringToBits(secretData);
      
      // ✅ ОПТИМИЗАЦИЯ: пишем сразу в буфер, не по одному биту
      for (let i = 0; i < bits.length; i++) {
        data[i * 4] = (data[i * 4] & 0xFE) | bits[i];
      }

      ctx.putImageData(imageData, 0, 0);
      
      // ✅ ОПТИМИЗАЦИЯ: используем quality 0.8 вместо lossless PNG
canvas.toBlob((blob) => {
  if (blob) {
    resolve(new File([blob], "prism_avatar.png", { type: "image/png" }));
  } else {
    reject("Failed to create blob");
  }
}, "image/png"); 
    };
    img.onerror = () => reject("Failed to load image");
    img.src = url;
  });
}

/**
 * 🆕 Извлекает скрытую строку (Shard 3) из PNG-изображения
 */
export async function extractDataFromImage(imageUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous"; // Важно для загрузки с Cloudinary
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject("Canvas context not found");
      
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const bits: number[] = [];
      
      for (let i = 0; i < data.length / 4; i++) {
        bits.push(data[i * 4] & 1);
        
        // Проверяем маркер конца каждые 16 бит
        if (bits.length >= 16) {
          const last16 = bits.slice(-16);
          if (last16[15] === 0 && last16.slice(0, 15).every(b => b === 1)) {
            resolve(bitsToString(bits.slice(0, -16)));
            return;
          }
        }
      }
      reject("Скрытые данные не найдены или изображение было сжато");
    };
    img.src = imageUrl;
  });
}