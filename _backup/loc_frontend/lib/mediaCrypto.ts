import { gcm } from "@noble/ciphers/aes";
import { base64ToBytes, bytesToBase64 } from "./crypto";

export function encryptMediaFile(file: File, sessionKey: Uint8Array): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const fileBytes = new Uint8Array(reader.result as ArrayBuffer);

        const mimeBytes = new TextEncoder().encode(file.type || "application/octet-stream");
        const mimeLength = new Uint8Array(2);
        new DataView(mimeLength.buffer).setUint16(0, mimeBytes.length, false);

        const iv = crypto.getRandomValues(new Uint8Array(12));

        const cipher = gcm(sessionKey, iv);
        const encrypted = cipher.encrypt(fileBytes);

        const combined = new Uint8Array(2 + mimeBytes.length + 12 + encrypted.length);
        combined.set(mimeLength, 0);
        combined.set(mimeBytes, 2);
        combined.set(iv, 2 + mimeBytes.length);
        combined.set(encrypted, 2 + mimeBytes.length + 12);

        // ✅ ИСПРАВЛЕНО: передаём Uint8Array напрямую, не .buffer
        resolve(new Blob([combined], { type: "application/octet-stream" }));
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

export function decryptMediaBlob(encryptedBlob: Blob, sessionKey: Uint8Array): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const combined = new Uint8Array(reader.result as ArrayBuffer);
        
        const mimeLength = new DataView(combined.buffer, combined.byteOffset, 2).getUint16(0, false);
        const mimeBytes = combined.slice(2, 2 + mimeLength);
        const mimeType = new TextDecoder().decode(mimeBytes) || "application/octet-stream";
        
        const offset = 2 + mimeLength;
        const iv = combined.slice(offset, offset + 12);
        const ciphertext = combined.slice(offset + 12);

        const cipher = gcm(sessionKey, iv);
        const decrypted = cipher.decrypt(ciphertext);

        // ✅ ИСПРАВЛЕНО: Uint8Array напрямую + гарантированно новый буфер
        resolve(new Blob([new Uint8Array(decrypted)], { type: mimeType }));
      } catch (e) {
        console.error("decryptMediaBlob failed:", e);
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read encrypted blob"));
    reader.readAsArrayBuffer(encryptedBlob);
  });
}