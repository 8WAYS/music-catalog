import { migrateCatalog } from './migrations';
import { ReadOnlyError, type MetaKey, type MetaValues, type Repository } from './repository';
import type { Catalog, Release, Tag } from './schema';

const CACHE = 'catalog';
const TIMEOUT_MS = 10_000;

/**
 * Repository поверх опубликованного catalog.json — источник данных зрителя (только чтение).
 * Сайт не ответил (через VPN GitHub Pages бывает нестабилен, ADR 0001) — повтор, затем сохранённая копия.
 */
export class RemoteSource implements Repository {
  readonly readOnly = true;
  /** Показана сохранённая копия, а не свежая версия с сайта */
  stale = false;
  private catalog?: Catalog;

  constructor(
    private readonly baseUrl = new URL('data/', document.baseURI).href,
    private readonly fetchFn: typeof fetch = (...a) => fetch(...a),
  ) {}

  private async fetchFresh(): Promise<Catalog> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 1_500));
      try {
        // Параметр версии обходит кэш CDN: Pages отдаёт файлы с max-age 10 минут
        const res = await this.fetchFn(`${this.baseUrl}catalog.json?v=${Date.now()}`, {
          cache: 'no-cache',
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`Не удалось загрузить картотеку (${res.status})`);
        const text = await res.text();
        const catalog = migrateCatalog(JSON.parse(text));
        await this.saveCopy(text);
        return catalog;
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError;
  }

  private async saveCopy(text: string): Promise<void> {
    try {
      const cache = await caches.open(CACHE);
      await cache.put(
        `${this.baseUrl}catalog.json`,
        new Response(text, { headers: { 'Content-Type': 'application/json' } }),
      );
    } catch {
      /* Cache Storage недоступен — просто без офлайн-копии */
    }
  }

  private async readCopy(): Promise<Catalog | undefined> {
    try {
      const res = await (await caches.open(CACHE)).match(`${this.baseUrl}catalog.json`);
      return res ? migrateCatalog(await res.json()) : undefined;
    } catch {
      return undefined;
    }
  }

  private async load(): Promise<Catalog> {
    if (this.catalog) return this.catalog;
    try {
      this.catalog = await this.fetchFresh();
      this.stale = false;
    } catch (e) {
      const copy = await this.readCopy();
      if (!copy)
        throw new Error('Не удалось загрузить картотеку — проверь интернет и попробуй ещё раз.', {
          cause: e,
        });
      this.catalog = copy;
      this.stale = true;
    }
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
    // Ждём загрузку: имя владельца спрашивают параллельно с релизами
    if (key === 'ownerName') return (await this.load()).owner.name as MetaValues[K];
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
