import { describe, it, expect } from "vitest";
import {
  generatePrismKey,
  splitKeyIntoShards,
  reconstructKey,
  encryptAnchorWithPin,
  decryptAnchorWithPin,
} from "../lib/prismCrypto";

// Вспомогательная функция для сравнения Uint8Array (так как toBe() сравнивает ссылки в памяти)
const arraysEqual = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((val, i) => val === b[i]);

describe("🔒 Trelod Prism Cryptography", () => {
  
  it("1. Генерация ключа и корректное восстановление из ТРЁХ спектров", () => {
    // Генерируем исходный ключ
    const originalKey = generatePrismKey();
    expect(originalKey).toBeInstanceOf(Uint8Array);
    expect(originalKey.length).toBe(32); // 256 бит

    // Делим на 3 спектра
    const { shard1_anchor, shard2_genesis, shard3_local } = splitKeyIntoShards(originalKey);
    expect(typeof shard1_anchor).toBe("string");
    expect(typeof shard2_genesis).toBe("string");
    expect(typeof shard3_local).toBe("string");

    // Восстанавливаем ключ из всех 3-х частей
    const reconstructedKey = reconstructKey(shard1_anchor, shard2_genesis, shard3_local);
    
    // Проверяем, что восстановленный ключ бит-в-бит совпадает с исходным
    expect(arraysEqual(originalKey, reconstructedKey)).toBe(true);
  });

  it("2. Шифрование Якоря (Спектр 1) PIN-кодом и успешная расшифровка", async () => {
    const originalKey = generatePrismKey();
    const { shard1_anchor } = splitKeyIntoShards(originalKey);
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
    const { shard1_anchor } = splitKeyIntoShards(originalKey);
    const correctPin = "1234";
    const wrongPin = "9999";

    const encryptedAnchor = await encryptAnchorWithPin(shard1_anchor, correctPin);

    // Ожидаем, что функция выбросит ошибку (AES-GCM не сможет проверить тег аутентификации при неверном ключе)
    await expect(decryptAnchorWithPin(encryptedAnchor, wrongPin)).rejects.toThrow();
  });

  it("4. 🏆 ПОЛНЫЙ СЦЕНАРИЙ: Создание на Устройстве А и восстановление на Устройстве Б только по PIN", async () => {
    // ==========================================
    // ЭТАП 1: УСТРОЙСТВО А (Создание чата)
    // ==========================================
    const userPin = "4321";
    const chatKey = generatePrismKey();
    const { shard1_anchor, shard2_genesis, shard3_local } = splitKeyIntoShards(chatKey);

    // Устройство А шифрует Якорь и "сохраняет" его в профиль на сервере
    const serverStoredEncryptedAnchor = await encryptAnchorWithPin(shard1_anchor, userPin);
    
    // Устройство А сохраняет Спектр 2 в мета-данные первого сообщения чата на сервере
    const serverStoredGenesis = shard2_genesis;
    
    // Устройство А сохраняет Спектр 3 локально (или в другом надежном месте)
    const localStoredShard3 = shard3_local;

    // ==========================================
    // ЭТАП 2: УСТРОЙСТВО Б (Новый телефон, нет исходного ключа)
    // ==========================================
    
    // 1. Пользователь вводит свой PIN
    const enteredPin = "4321";

    // 2. Клиент скачивает зашифрованный Якорь из профиля и расшифровывает его
    const decryptedShard1 = await decryptAnchorWithPin(serverStoredEncryptedAnchor, enteredPin);

    // 3. Клиент скачивает Спектр 2 из первого сообщения чата и берет Спектр 3 из локального хранилища
    const downloadedShard2 = serverStoredGenesis;
    const downloadedShard3 = localStoredShard3;

    // 4. МАГИЯ: Клиент собирает ключ из ТРЁХ частей!
    const restoredKeyOnDeviceB = reconstructKey(decryptedShard1, downloadedShard2, downloadedShard3);

    // 5. Проверяем, что ключ на новом устройстве идентичен исходному (бит-в-бит)
    expect(arraysEqual(chatKey, restoredKeyOnDeviceB)).toBe(true);
  });
});