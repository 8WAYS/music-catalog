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

export interface CatalogDB extends DBSchema {
  releases: {
    key: string;
    value: Release;
    indexes: { artist: string; year: number; createdAt: string; tagIds: string };
  };
  tags: { key: string; value: Tag; indexes: { name: string } };
  covers: { key: string; value: Blob };
  meta: { key: MetaKey; value: unknown };
  queue: { key: number; value: QueueTask };
}

export type DB = IDBPDatabase<CatalogDB>;

export function openCatalogDB(name = DB_NAME): Promise<DB> {
  return openDB<CatalogDB>(name, DB_VERSION, {
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
}
