import { describe, it, expect, beforeEach } from "vitest";
import {
  generateSessionKey,
  encryptMessage,
  decryptMessage,
  encryptSessionKeyForUser,
  decryptSessionKey,
} from "../lib/crypto";

// 📌 ВАЖНО: Если твои функции в crypto.ts читают приватный ключ напрямую из localStorage,
// этот тест проверит математику шифрования (самую частую причину багов).
// Если они принимают ключи как аргументы — передай их туда напрямую.

describe("🔒 E2EE Chat Cryptography", () => {
  
  it("1. Генерация Session Key должна создавать случайный ключ", () => {
    const sk1 = generateSessionKey();
    const sk2 = generateSessionKey();
    
    expect(sk1).toBeInstanceOf(Uint8Array);
    expect(sk2).toBeInstanceOf(Uint8Array);
    // Ключи никогда не должны совпадать!
    expect(Buffer.from(sk1).toString("hex")).not.toBe(Buffer.from(sk2).toString("hex"));
  });

  it("2. Алиса шифрует текст, Боб расшифровывает (симметричное)", () => {
    const sessionKey = generateSessionKey();
    const originalText = "Привет, Боб! Это секретное сообщение.";
    
    // Алиса шифрует
    const ciphertext = encryptMessage(originalText, sessionKey);
    
    expect(ciphertext).not.toBe(originalText);
    expect(ciphertext).toBeTruthy();
    
    // Боб расшифровывает тем же ключом
    const decryptedText = decryptMessage(ciphertext, sessionKey);
    
    expect(decryptedText).toBe(originalText);
  });

  it("3. Если изменить зашифрованный текст, расшифровка сломается (защита от подмены)", () => {
    const sessionKey = generateSessionKey();
    const originalText = "Не менять меня!";
    
    const ciphertext = encryptMessage(originalText, sessionKey);
    
    // Меняем один символ в зашифрованной строке
    const tamperedCiphertext = ciphertext.slice(0, -2) + "XX";
    
    // Функция должна либо выдать другой текст, либо упасть (зависит от libsodium/tweetnacl),
    // но она НЕ должна выдать оригинальный текст.
    let result;
    try {
      result = decryptMessage(tamperedCiphertext, sessionKey);
    } catch (e) {
      result = null; // Ошибка расшифровки — это норма при подмене
    }
    
    expect(result).not.toBe(originalText);
  });

  it("4. Разные сообщения, зашифрованные одним ключом, дают разный шифротекст", () => {
    const sessionKey = generateSessionKey();
    
    const cipher1 = encryptMessage("Первое сообщение", sessionKey);
    const cipher2 = encryptMessage("Второе сообщение", sessionKey);
    
    // Даже если текст одинаковый, шифротекст должен отличаться (из-за Nonce/IV)
    expect(cipher1).not.toBe(cipher2);
  });
});