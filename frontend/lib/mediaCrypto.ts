import { gcm } from "@noble/ciphers/aes";
import { base64ToBytes, bytesToBase64 } from "./crypto";

/**
 * Шифрует файл с помощью AES-256-GCM
 * Формат результата: MIME_LENGTH (2 байта) || MIME_TYPE || IV (12 байт) || ciphertext
 */
export function encryptMediaFile(file: File, sessionKey: Uint8Array): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const fileBytes = new Uint8Array(reader.result as ArrayBuffer);

        // Кодируем MIME-type
        const mimeBytes = new TextEncoder().encode(file.type || "application/octet-stream");
        const mimeLength = new Uint8Array(2);
        new DataView(mimeLength.buffer).setUint16(0, mimeBytes.length, false);

        // Генерируем случайный IV (12 байт для GCM)
        const iv = crypto.getRandomValues(new Uint8Array(12));

        // Шифруем
        const cipher = gcm(sessionKey, iv);
        const encrypted = cipher.encrypt(fileBytes);

        // Склеиваем: MIME_LENGTH (2) || MIME || IV (12) || ciphertext
        const combined = new Uint8Array(2 + mimeBytes.length + 12 + encrypted.length);
        combined.set(mimeLength, 0);
        combined.set(mimeBytes, 2);
        combined.set(iv, 2 + mimeBytes.length);
        combined.set(encrypted, 2 + mimeBytes.length + 12);

        resolve(new Blob([combined.buffer as ArrayBuffer], { type: "application/octet-stream" }));
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Расшифровывает медиафайл
 * Ожидает формат: MIME_LENGTH (2) || MIME || IV (12) || ciphertext
 */
export function decryptMediaBlob(encryptedBlob: Blob, sessionKey: Uint8Array): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const combined = new Uint8Array(reader.result as ArrayBuffer);
        
        // Читаем MIME-type
        const mimeLength = new DataView(combined.buffer).getUint16(0, false);
        const mimeBytes = combined.slice(2, 2 + mimeLength);
        const mimeType = new TextDecoder().decode(mimeBytes) || "application/octet-stream";
        
        const offset = 2 + mimeLength;
        const iv = combined.slice(offset, offset + 12);
        const ciphertext = combined.slice(offset + 12);

        const cipher = gcm(sessionKey, iv);
        const decrypted = cipher.decrypt(ciphertext);

        resolve(new Blob([decrypted.buffer as ArrayBuffer], { type: mimeType }));
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read encrypted blob"));
    reader.readAsArrayBuffer(encryptedBlob);
  });
}