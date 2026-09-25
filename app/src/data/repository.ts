import type { Catalog, Release, Tag } from './schema';

export type Mode = 'owner' | 'viewer';

/** Ключи служебного хранилища meta (раздел 4.6). */
export interface MetaValues {
  token: string;
  repo: string; // owner/name
  branch: string;
  revision: number;
  lastCommitSha: string;
  dirty: boolean;
  ownerName: string;
  publishWarningShown: boolean;
  /** Ревизия, опубликованная последней */
  publishedRevision: number;
  /** Время последней публикации, ISO 8601 */
  publishedAt: string;
  /** Git-хэш data/catalog.json после нашей последней публикации — по нему видно чужие изменения */
  catalogSha: string;
}
export type MetaKey = keyof MetaValues;

/**
 * Единая точка доступа к данным. UI знает только этот интерфейс,
 * поэтому переход на ApiSource (бэкенд, Telegram Mini App) не затрагивает экраны.
 */
export interface Repository {
  readonly readOnly: boolean;

  getReleases(): Promise<Release[]>;
  getRelease(id: string): Promise<Release | undefined>;
  saveRelease(release: Release): Promise<Release>;
  deleteRelease(id: string): Promise<void>;

  getTags(): Promise<Tag[]>;
  /** Создаёт тег; если тег с таким именем (без учёта регистра) уже есть — возвращает существующий. */
  saveTag(tag: Tag): Promise<Tag>;
  deleteTag(id: string): Promise<void>;

  getCover(releaseId: string): Promise<Blob | undefined>;
  /** Адрес картинки для <img>: blob: у владельца, https: у зрителя. */
  coverUrl(release: Release): Promise<string | undefined>;
  /** Адрес обложки, если он уже известен, — без ожидания: переход «обложка → карточка» не мигает */
  peekCoverUrl?(release: Release): string | undefined;
  saveCover(releaseId: string, blob: Blob): Promise<void>;

  getMeta<K extends MetaKey>(key: K): Promise<MetaValues[K] | undefined>;
  setMeta<K extends MetaKey>(key: K, value: MetaValues[K]): Promise<void>;

  /** Снимок в формате catalog.json (для публикации и экспорта). */
  snapshot(): Promise<Catalog>;

  /** Подписка на любые изменения данных. */
  subscribe(listener: () => void): () => void;
}

export class ReadOnlyError extends Error {
  constructor() {
    super('Картотека открыта только для просмотра');
    this.name = 'ReadOnlyError';
  }
}
