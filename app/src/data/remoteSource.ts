import { migrateCatalog } from './migrations';
import { ReadOnlyError, type MetaKey, type MetaValues, type Repository } from './repository';
import type { Catalog, Release, Tag } from './schema';

/**
 * Repository поверх опубликованного catalog.json — источник данных зрителя (только чтение).
 * Полноценная версия с офлайн-кэшем — этап 5.
 */
export class RemoteSource implements Repository {
  readonly readOnly = true;
  private catalog?: Catalog;

  constructor(private readonly baseUrl = new URL('data/', document.baseURI).href) {}

  private async load(): Promise<Catalog> {
    if (this.catalog) return this.catalog;
    const res = await fetch(`${this.baseUrl}catalog.json?v=${Date.now()}`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Не удалось загрузить картотеку (${res.status})`);
    this.catalog = migrateCatalog(await res.json());
    return this.catalog;
  }

  async getReleases(): Promise<Release[]> {
    return (await this.load()).releases;
  }
  async getRelease(id: string): Promise<Release | undefined> {
    return (await this.load()).releases.find((r) => r.id === id);
  }
  async getTags(): Promise<Tag[]> {
    return (await this.load()).tags;
  }
  async getCover(): Promise<Blob | undefined> {
    return undefined;
  }
  async coverUrl(release: Release): Promise<string | undefined> {
    return release.cover
      ? `${this.baseUrl}${release.cover}?v=${encodeURIComponent(release.updatedAt)}`
      : undefined;
  }
  async getMeta<K extends MetaKey>(key: K): Promise<MetaValues[K] | undefined> {
    if (key === 'ownerName') return this.catalog?.owner.name as MetaValues[K];
    return undefined;
  }
  async snapshot(): Promise<Catalog> {
    return this.load();
  }
  subscribe(): () => void {
    return () => {};
  }

  saveRelease(): Promise<Release> {
    return Promise.reject(new ReadOnlyError());
  }
  deleteRelease(): Promise<void> {
    return Promise.reject(new ReadOnlyError());
  }
  saveTag(): Promise<Tag> {
    return Promise.reject(new ReadOnlyError());
  }
  deleteTag(): Promise<void> {
    return Promise.reject(new ReadOnlyError());
  }
  saveCover(): Promise<void> {
    return Promise.reject(new ReadOnlyError());
  }
  setMeta(): Promise<void> {
    return Promise.reject(new ReadOnlyError());
  }
}
