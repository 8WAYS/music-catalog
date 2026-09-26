import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Release, Tag } from './schema';
import type { MetaKey } from './repository';

export const DB_NAME = 'music-catalog';
export const DB_VERSION = 1;

export interface QueueTask {
  id?: number;
  kind: 'publish';
  revision: number;
  createdAt: string;
  attempts: number;
}

/**
 * Обложка в IndexedDB — байты и тип, а не Blob: WebKit в приватном режиме (и в Playwright)
 * не умеет класть Blob в IndexedDB. Старые записи-Blob читаются как есть.
 */
export interface StoredCover {
  type: string;
  data: ArrayBuffer;
}

export interface CatalogDB extends DBSchema {
  releases: {
    key: string;
    value: Release;
    indexes: { artist: string; year: number; createdAt: string; tagIds: string };
  };
  tags: { key: string; value: Tag; indexes: { name: string } };
  covers: { key: string; value: StoredCover | Blob };
  meta: { key: MetaKey; value: unknown };
  queue: { key: number; value: QueueTask };
}

export type DB = IDBPDatabase<CatalogDB>;

/**
 * `onYield` — другая вкладка (или тест) хочет обновить схему или удалить базу. Соединение закрываем
 * сразу: иначе её запрос висит в «blocked», пока эта вкладка открыта, — обновление DB_VERSION в новой
 * версии приложения зависло бы у всех, кто держит вторую вкладку.
 */
export function openCatalogDB(name = DB_NAME, onYield?: () => void): Promise<DB> {
  const dbPromise: Promise<DB> = openDB<CatalogDB>(name, DB_VERSION, {
    blocking() {
      void dbPromise.then((db) => db.close());
      onYield?.();
    },
    upgrade(db, oldVersion) {
      // Миграции схемы IndexedDB: каждая версия добавляет свои изменения.
      if (oldVersion < 1) {
        const releases = db.createObjectStore('releases', { keyPath: 'id' });
        releases.createIndex('artist', 'artist');
        releases.createIndex('year', 'year');
        releases.createIndex('createdAt', 'createdAt');
        releases.createIndex('tagIds', 'tagIds', { multiEntry: true });
        // Уникальный индекс по name; уникальность без учёта регистра дополнительно проверяет Repository.
        db.createObjectStore('tags', { keyPath: 'id' }).createIndex('name', 'name', { unique: true });
        db.createObjectStore('covers');
        db.createObjectStore('meta');
        db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
      }
    },
  });
  return dbPromise;
}
