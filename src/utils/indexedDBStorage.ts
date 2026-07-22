/**
 * Enterprise-Grade IndexedDB Storage Utility for Long Video Generation
 * Safely persists heavy HD video clips, TTS audio buffers, and intermediate FFmpeg rendered chunks 
 * to browser disk storage, preventing Out-Of-Memory (OOM) RAM crashes during 10-30+ min processing.
 */

const DB_NAME = "VideoGenStorageDB";
const DB_VERSION = 1;
const STORE_ASSETS = "media_assets";
const STORE_CHUNKS = "rendered_chunks";

class IndexedDBStorageManager {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === "undefined" || !window.indexedDB) {
        return reject(new Error("IndexedDB is not supported in this environment"));
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_ASSETS)) {
          db.createObjectStore(STORE_ASSETS, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
          db.createObjectStore(STORE_CHUNKS, { keyPath: "index" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.error("[IndexedDB] Failed to open database:", request.error);
        reject(request.error);
      };
    });

    return this.dbPromise;
  }

  /**
   * Save a media asset (Video / TTS Audio Blob) to IndexedDB
   */
  public async saveAsset(key: string, blob: Blob, mimeType: string = "video/mp4"): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_ASSETS, "readwrite");
        const store = tx.objectStore(STORE_ASSETS);
        const req = store.put({
          key,
          blob,
          mimeType,
          timestamp: Date.now(),
        });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn("[IndexedDB] Error saving asset:", e);
    }
  }

  /**
   * Retrieve a media asset Blob from IndexedDB
   */
  public async getAsset(key: string): Promise<Blob | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_ASSETS, "readonly");
        const store = tx.objectStore(STORE_ASSETS);
        const req = store.get(key);
        req.onsuccess = () => {
          resolve(req.result ? req.result.blob : null);
        };
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /**
   * Save a rendered video chunk (e.g. 3-5 min segment)
   */
  public async saveChunk(index: number, blob: Blob): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_CHUNKS, "readwrite");
        const store = tx.objectStore(STORE_CHUNKS);
        const req = store.put({ index, blob, timestamp: Date.now() });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn("[IndexedDB] Error saving chunk:", e);
    }
  }

  /**
   * Retrieve all rendered chunks ordered by index
   */
  public async getAllChunks(): Promise<Blob[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_CHUNKS, "readonly");
        const store = tx.objectStore(STORE_CHUNKS);
        const req = store.getAll();
        req.onsuccess = () => {
          const items = req.result || [];
          items.sort((a, b) => a.index - b.index);
          resolve(items.map((item) => item.blob));
        };
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  /**
   * Completely wipe temporary cached media assets & rendered chunks to reclaim disk space
   */
  public async clearAll(): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction([STORE_ASSETS, STORE_CHUNKS], "readwrite");
      tx.objectStore(STORE_ASSETS).clear();
      tx.objectStore(STORE_CHUNKS).clear();
      await new Promise((res) => {
        tx.oncomplete = res;
      });
      console.log("[IndexedDB] Storage cache completely purged.");
    } catch (e) {
      console.warn("[IndexedDB] Error clearing cache:", e);
    }
  }
}

export const mediaStorage = new IndexedDBStorageManager();
