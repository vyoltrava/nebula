import { describe, it, expect } from "vitest";
import {
  generatePrismKey,
  splitKeyIntoTwoShards,
  reconstructKey,
  encryptAnchorWithPin,
  decryptAnchorWithPin,
  encryptPrismMessage,
  decryptPrismMessage,
} from "../lib/prismCrypto";

// Вспомогательная функция для сравнения Uint8Array (так как toBe() сравнивает ссылки)
const arraysEqual = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((val, i) => val === b[i]);

describe("🔒 Trelod Prism Cryptography", () => {
  
  it("1. Генерация ключа и корректное восстановление из двух спектров", () => {
    // Генерируем исходный ключ
    const originalKey = generatePrismKey();
    expect(originalKey).toBeInstanceOf(Uint8Array);
    expect(originalKey.length).toBe(32); // 256 бит

    // Делим на спектры
    const { shard1_anchor, shard2_genesis } = splitKeyIntoTwoShards(originalKey);
    expect(typeof shard1_anchor).toBe("string");
    expect(typeof shard2_genesis).toBe("string");

    // Восстанавливаем ключ
    const reconstructedKey = reconstructKey(shard1_anchor, shard2_genesis);
    
    // Проверяем, что восстановленный ключ бит-в-бит совпадает с исходным
    expect(arraysEqual(originalKey, reconstructedKey)).toBe(true);
  });

  it("2. Шифрование Якоря (Спектр 1) PIN-кодом и успешная расшифровка", async () => {
    const originalKey = generatePrismKey();
    const { shard1_anchor } = splitKeyIntoTwoShards(originalKey);
    const pin = "1234";

    // Шифруем (эмуляция отправки на сервер)
    const encryptedAnchor = await encryptAnchorWithPin(shard1_anchor, pin);
    expect(encryptedAnchor).not.toBe(shard1_anchor); // Должно быть изменено
    expect(encryptedAnchor.length).toBeGreaterThan(0);

    // Расшифровываем (эмуляция получения на новом устройстве)
    const decryptedShard1 = await decryptAnchorWithPin(encryptedAnchor, pin);
    expect(decryptedShard1).toBe(shard1_anchor);
  });

  it("3. Защита: расшифровка Якоря с НЕПРАВИЛЬНЫМ PIN-кодом должна падать", async () => {
    const originalKey = generatePrismKey();
    const { shard1_anchor } = splitKeyIntoTwoShards(originalKey);
    const correctPin = "1234";
    const wrongPin = "9999";

    const encryptedAnchor = await encryptAnchorWithPin(shard1_anchor, correctPin);

    // Ожидаем, что функция выбросит ошибку (AES-GCM не сможет проверить тег аутентификации)
    await expect(decryptAnchorWithPin(encryptedAnchor, wrongPin)).rejects.toThrow();
  });

  it("4. Шифрование и расшифровка сообщения восстановленным ключом", async () => {
    const originalKey = generatePrismKey();
    const { shard1_anchor, shard2_genesis } = splitKeyIntoTwoShards(originalKey);

    // Имитируем потерю ключа и его восстановление из спектров
    const restoredKey = reconstructKey(shard1_anchor, shard2_genesis);

    const message = "Это сверхсекретное сообщение Призмы! 🌌";
    
    // Шифруем
    const ciphertext = await encryptPrismMessage(message, restoredKey);
    expect(ciphertext).not.toBe(message);
    
    // Расшифровываем
    const decryptedMessage = await decryptPrismMessage(ciphertext, restoredKey);
    expect(decryptedMessage).toBe(message);
  });

  it("5. Защита целостности: подмена шифротекста приводит к ошибке расшифровки", async () => {
    const originalKey = generatePrismKey();
    const message = "Не менять меня!";
    
    const ciphertext = await encryptPrismMessage(message, originalKey);
    
    // Портим шифротекст (меняем последние символы)
    const tamperedCiphertext = ciphertext.slice(0, -2) + "XX";
    
    // AES-GCM должен обнаружить подмену и выбросить ошибку
    await expect(decryptPrismMessage(tamperedCiphertext, originalKey)).rejects.toThrow();
  });

  it("6. 🏆 ПОЛНЫЙ СЦЕНАРИЙ: Создание на Устройстве А и восстановление на Устройстве Б только по PIN", async () => {
    // ==========================================
    // ЭТАП 1: УСТРОЙСТВО А (Создание чата)
    // ==========================================
    const userPin = "4321";
    const chatKey = generatePrismKey();
    const { shard1_anchor, shard2_genesis } = splitKeyIntoTwoShards(chatKey);

    // Устройство А шифрует Якорь и "сохраняет" его в профиль на сервере
    const serverStoredEncryptedAnchor = await encryptAnchorWithPin(shard1_anchor, userPin);
    
    // Устройство А сохраняет Спектр 2 в мета-данные первого сообщения чата на сервере
    const serverStoredGenesis = shard2_genesis;

    // Устройство А шифрует и "отправляет" сообщение
    const sentMessage = await encryptPrismMessage("Привет! Это начало истории.", chatKey);

    // ==========================================
    // ЭТАП 2: УСТРОЙСТВО Б (Новый телефон, нет локального ключа)
    // ==========================================
    
    // 1. Пользователь вводит свой PIN
    const enteredPin = "4321";

    // 2. Клиент скачивает зашифрованный Якорь из профиля и расшифровывает его
    const decryptedShard1 = await decryptAnchorWithPin(serverStoredEncryptedAnchor, enteredPin);

    // 3. Клиент скачивает Спектр 2 из первого сообщения чата
    const downloadedShard2 = serverStoredGenesis;

    // 4. МАГИЯ: Клиент собирает ключ из двух частей!
    const restoredKeyOnDeviceB = reconstructKey(decryptedShard1, downloadedShard2);

    // 5. Проверяем, что ключ на новом устройстве идентичен исходному
    expect(arraysEqual(chatKey, restoredKeyOnDeviceB)).toBe(true);

    // 6. Проверяем, что мы можем прочитать старую историю!
    const readableHistory = await decryptPrismMessage(sentMessage, restoredKeyOnDeviceB);
    expect(readableHistory).toBe("Привет! Это начало истории.");
    
    // 7. Проверяем, что мы можем писать новые сообщения
    const newMessage = await encryptPrismMessage("Я успешно восстановил чат!", restoredKeyOnDeviceB);
    const verifiedNewMessage = await decryptPrismMessage(newMessage, restoredKeyOnDeviceB);
    expect(verifiedNewMessage).toBe("Я успешно восстановил чат!");
  });
});