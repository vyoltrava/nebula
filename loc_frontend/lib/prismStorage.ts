const DB_NAME = 'TrelodPrismDB';
const DB_VERSION = 1;
const STORE_NAME = 'shards';

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
    console.log(`💾 [PrismStorage] Сохраняем shard3 для чата ${chatId}`);
    
    // 1. Пробуем IndexedDB
    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ chatId, shard3, createdAt: Date.now() });
      await new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
      console.log(`✅ [PrismStorage] Успешно сохранено в IndexedDB`);
    } catch (e) {
      console.warn(`⚠️ [PrismStorage] Ошибка IndexedDB, используем fallback:`, e);
    }

    // 2. ВСЕГДА сохраняем в localStorage как страховку
    try {
      localStorage.setItem(`prism_shard3_${chatId}`, shard3);
      console.log(`✅ [PrismStorage] Успешно сохранено в localStorage`);
    } catch (e) {
      console.error(`❌ [PrismStorage] Критическая ошибка сохранения:`, e);
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