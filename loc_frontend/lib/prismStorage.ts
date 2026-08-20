const DB_NAME = 'TrelodPrismDB';
const DB_VERSION = 1;
const STORE_NAME = 'shards';
const isValidBase64 = (str: string) => {
  if (!str || str === "undefined" || str === "null" || str === "[object Object]") return false;
  return /^[A-Za-z0-9+/=]+$/.test(str) && str.length % 4 === 0;
};

class PrismStorage {
  private db: IDBDatabase | null = null;

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'chatId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }


  async saveShard(chatId: number, shard3: string): Promise<void> {
    // 🔥 Очищаем строку перед проверкой и сохранением
    const cleanShard = (shard3 || "").trim();
    console.log(`💾 [PrismStorage] Сохраняем shard3 для чата ${chatId}. Длина: ${cleanShard.length}`);
    
    if (!isValidBase64(cleanShard)) {
      console.error(`❌ [PrismStorage] Попытка сохранить невалидный shard3!`, cleanShard);
      throw new Error("Невозможно сохранить: shard3 не является валидной Base64 строкой");
    }

    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ chatId, shard3: cleanShard, createdAt: Date.now() });
      await new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn(`⚠️ [PrismStorage] Ошибка IndexedDB:`, e);
    }

    try {
      localStorage.setItem(`prism_shard3_${chatId}`, cleanShard);
    } catch (e) {
      console.error(`❌ [PrismStorage] Ошибка localStorage:`, e);
    }
  }



  async getShard(chatId: number): Promise<string | null> {
    console.log(`🔍 [PrismStorage] Ищем shard3 для чата ${chatId}`);

    // 1. Сначала проверяем localStorage (самый надежный fallback)
    const localShard = localStorage.getItem(`prism_shard3_${chatId}`);
    if (localShard) {
      console.log(`✅ [PrismStorage] Найдено в localStorage`);
      return localShard;
    }

    // 2. Если нет, ищем в IndexedDB
    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(chatId);
      
      return new Promise((resolve) => {
        request.onsuccess = () => {
          const result = request.result?.shard3 || null;
          if (result) console.log(`✅ [PrismStorage] Найдено в IndexedDB`);
          else console.warn(`⚠️ [PrismStorage] Не найдено нигде`);
          resolve(result);
        };
        request.onerror = () => {
          console.error(`❌ [PrismStorage] Ошибка чтения IndexedDB`);
          resolve(null);
        };
      });
    } catch (e) {
      console.error(`❌ [PrismStorage] Ошибка доступа к базе:`, e);
      return null;
    }
  }
}

export const prismStorage = new PrismStorage();