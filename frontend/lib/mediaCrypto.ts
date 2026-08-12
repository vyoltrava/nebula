// lib/mediaCrypto.ts
import { gcm } from "@noble/ciphers/aes";
import { base64ToBytes, bytesToBase64 } from "./crypto";

/**
 * Шифрует файл с помощью AES-256-GCM (синхронно, через @noble/ciphers)
 * Формат результата: IV (12 байт) || ciphertext
 */
export function encryptMediaFile(file: File, sessionKey: Uint8Array): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const fileBytes = new Uint8Array(reader.result as ArrayBuffer);

        // Генерируем случайный IV (12 байт для GCM)
        const iv = crypto.getRandomValues(new Uint8Array(12));

        // Шифруем синхронно через @noble/ciphers
        const cipher = gcm(sessionKey, iv);
        const encrypted = cipher.encrypt(fileBytes);

        // Склеиваем: IV (12) || ciphertext
        const combined = new Uint8Array(iv.length + encrypted.length);
        combined.set(iv, 0);
        combined.set(encrypted, iv.length);

        resolve(new Blob([combined], { type: "application/octet-stream" }));
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
 * Ожидает формат: IV (12 байт) || ciphertext
 */
export function decryptMediaBlob(encryptedBlob: Blob, sessionKey: Uint8Array): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const combined = new Uint8Array(reader.result as ArrayBuffer);
        const iv = combined.slice(0, 12);
        const ciphertext = combined.slice(12);

        const cipher = gcm(sessionKey, iv);
        const decrypted = cipher.decrypt(ciphertext);

        resolve(new Blob([decrypted]));
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read encrypted blob"));
    reader.readAsArrayBuffer(encryptedBlob);
  });
}