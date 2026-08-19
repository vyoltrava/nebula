const base64ToBytes = (base64: string): Uint8Array => {
  const binString = atob(base64);
  return Uint8Array.from(binString, (m) => m.codePointAt(0)!);
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join("");
  return btoa(binString);
};

// ✅ FIX: Безопасный XOR, работает с разной длиной, но лучше использовать одинаковую
const xorBytes = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const len = Math.max(a.length, b.length);
  const result = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    const byteA = i < a.length ? a[i] : 0;
    const byteB = i < b.length ? b[i] : 0;
    result[i] = byteA ^ byteB;
  }
  return result;
};

// ✅ FIX: Генерируем 32 байта, чтобы совпадало с shard1 и shard2
export function generatePrismKey(): Uint8Array {
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
  const b1 = base64ToBytes(shard1);
  const b2 = base64ToBytes(shard2);
  const b3 = base64ToBytes(shard3);
  
  const temp = xorBytes(b1, b2);
  return xorBytes(temp, b3);
}

export async function encryptAnchorWithPin(shard1Base64: string, pin: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw", enc.encode(pin), { name: "PBKDF2" }, false, ["deriveKey"]
  );

  const cryptoKey = await window.crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode("trelod_prism_salt_v2"), iterations: 100000, hash: "SHA-256" },
    keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt"]
  );

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const data = base64ToBytes(shard1Base64);
  
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv } as any, cryptoKey, data as any
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
    "raw", enc.encode(pin), { name: "PBKDF2" }, false, ["deriveKey"]
  );

  const cryptoKey = await window.crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode("trelod_prism_salt_v2"), iterations: 100000, hash: "SHA-256" },
    keyMaterial, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
  );

  const combined = base64ToBytes(encryptedAnchorBase64);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  try {
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv } as any, cryptoKey, ciphertext as any
    );
    return bytesToBase64(new Uint8Array(decryptedBuffer));
  } catch (e) {
    throw new Error("Неверный PIN или данные были повреждены (изображение пережато)");
  }
}

function stringToBits(str: string): number[] {
  const bits: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i);
    for (let j = 7; j >= 0; j--) {
      bits.push((charCode >> j) & 1);
    }
  }
  // Маркер конца: 16 единиц и 1 ноль
  for (let i = 0; i < 16; i++) bits.push(1);
  bits.push(0);
  return bits;
}

function bitsToString(bits: number[]): string {
  let str = "";
  for (let i = 0; i < bits.length; i += 8) {
    const byte = bits.slice(i, i + 8);
    if (byte.length < 8) break;
    
    // Проверка на маркер конца (16 единиц)
    if (i + 16 < bits.length && byte.every(b => b === 1) && bits.slice(i, i + 16).every(b => b === 1) && bits[i + 16] === 0) {
      break;
    }
    
    const charCode = byte.reduce((acc, bit) => (acc << 1) | bit, 0);
    if (charCode > 0) { // Игнорируем нулевые байты
      str += String.fromCharCode(charCode);
    }
  }
  return str;
}

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
      
      if (bits.length > data.length / 4) {
        return reject("Секретные данные слишком большие для этого изображения");
      }

      for (let i = 0; i < bits.length; i++) {
        // Меняем только самый младший бит красного канала
        data[i * 4] = (data[i * 4] & 0xFE) | bits[i];
      }

      ctx.putImageData(imageData, 0, 0);
      
      // ✅ FIX: Убрали 0.8, для PNG это бессмысленно и может сбить с толку. 
      // ВАЖНО: Убедись, что твой бэкенд НЕ сжимает и НЕ конвертирует этот файл при загрузке!
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

export async function extractDataFromImage(imageUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
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
        
        // Проверяем маркер конца (16 единиц подряд, затем 0)
        if (bits.length >= 17) {
          const last17 = bits.slice(-17);
          if (last17[16] === 0 && last17.slice(0, 16).every(b => b === 1)) {
            resolve(bitsToString(bits.slice(0, -17)));
            return;
          }
        }
      }
      reject("Скрытые данные не найдены. Изображение было пережато или повреждено при загрузке на сервер.");
    };
    img.onerror = () => reject("Failed to load image");
    img.src = imageUrl;
  });
}