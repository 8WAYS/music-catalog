import { openCatalogDB, type DB } from './db';
import type { MetaKey, MetaValues, Repository } from './repository';
import {
  FORMAT_VERSION,
  ValidationError,
  assertValidRelease,
  validateTag,
  type Catalog,
  type Release,
  type Tag,
} from './schema';

/** Repository поверх IndexedDB — источник данных владельца. */
export class LocalSource implements Repository {
  readonly readOnly = false;
  private listeners = new Set<() => void>();
  private urlCache = new Map<string, { key: string; url: string }>();

  private constructor(private readonly db: DB) {}

  static async open(dbName?: string): Promise<LocalSource> {
    return new LocalSource(await openCatalogDB(dbName));
  }

  close(): void {
    this.db.close();
  }

  // ---------- Релизы ----------

  async getReleases(): Promise<Release[]> {
    return this.db.getAll('releases');
  }

  async getRelease(id: string): Promise<Release | undefined> {
    return this.db.get('releases', id);
  }

  async saveRelease(input: Release): Promise<Release> {
    const release: Release = {
      ...input,
      title: input.title.trim(),
      artist: input.artist.trim(),
      description: input.description?.trim() || undefined,
      tagIds: [...new Set(input.tagIds)],
      // Позиции всегда 1..N в порядке массива
      tracks: input.tracks.map((t, i) => ({ ...t, title: t.title.trim(), position: i + 1 })),
      links: input.links.filter((l) => l.url.trim()),
      updatedAt: new Date().toISOString(),
    };
    assertValidRelease(release);
    const tx = this.db.transaction(['releases', 'tags', 'covers', 'meta'], 'readwrite');
    for (const tagId of release.tagIds) {
      if (!(await tx.objectStore('tags').get(tagId))) {
        tx.done.catch(() => {});
        tx.abort();
        throw new ValidationError([`Тег ${tagId} не найден`]);
      }
    }
    await tx.objectStore('releases').put(release);
    if (!release.cover) {
      // Обложку убрали — удаляем и файл
      await tx.objectStore('covers').delete(release.id);
      this.revokeUrl(release.id);
    }
    await this.bumpRevision(tx.objectStore('meta'));
    await tx.done;
    this.emit();
    return release;
  }

  async deleteRelease(id: string): Promise<void> {
    const tx = this.db.transaction(['releases', 'covers', 'meta'], 'readwrite');
    await tx.objectStore('releases').delete(id);
    await tx.objectStore('covers').delete(id);
    await this.bumpRevision(tx.objectStore('meta'));
    await tx.done;
    this.revokeUrl(id);
    this.emit();
  }

  // ---------- Теги ----------

  async getTags(): Promise<Tag[]> {
    const tags = await this.db.getAll('tags');
    return tags.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }

  async saveTag(input: Tag): Promise<Tag> {
    const tag: Tag = { ...input, name: input.name.trim().replace(/\s+/g, ' ') };
    const issues = validateTag(tag);
    if (issues.length) throw new ValidationError(issues);
    const tx = this.db.transaction(['tags', 'meta'], 'readwrite');
    const all = await tx.objectStore('tags').getAll();
    const same = all.find(
      (t) => t.id !== tag.id && t.name.toLocaleLowerCase('ru') === tag.name.toLocaleLowerCase('ru'),
    );
    if (same) {
      await tx.done;
      return same;
    }
    await tx.objectStore('tags').put(tag);
    await this.bumpRevision(tx.objectStore('meta'));
    await tx.done;
    this.emit();
    return tag;
  }

  async deleteTag(id: string): Promise<void> {
    const tx = this.db.transaction(['tags', 'releases', 'meta'], 'readwrite');
    const releases = await tx.objectStore('releases').index('tagIds').getAll(id);
    for (const r of releases) {
      await tx.objectStore('releases').put({ ...r, tagIds: r.tagIds.filter((t) => t !== id) });
    }
    await tx.objectStore('tags').delete(id);
    await this.bumpRevision(tx.objectStore('meta'));
    await tx.done;
    this.emit();
  }

  // ---------- Обложки ----------

  async getCover(releaseId: string): Promise<Blob | undefined> {
    const v = await this.db.get('covers', releaseId);
    if (!v || v instanceof Blob) return v;
    return new Blob([v.data], { type: v.type });
  }

  async coverUrl(release: Release): Promise<string | undefined> {
    if (!release.cover) return undefined;
    const key = release.cover + release.updatedAt;
    const cached = this.urlCache.get(release.id);
    if (cached?.key === key) return cached.url;
    const blob = await this.getCover(release.id);
    if (!blob) return undefined;
    this.revokeUrl(release.id);
    const url = URL.createObjectURL(blob);
    this.urlCache.set(release.id, { key, url });
    return url;
  }

  peekCoverUrl(release: Release): string | undefined {
    const cached = this.urlCache.get(release.id);
    return cached?.key === (release.cover ?? '') + release.updatedAt ? cached.url : undefined;
  }

  /** Сохраняет обложку. Поле cover у релиза выставляет вызывающий код (coverPath). */
  async saveCover(releaseId: string, blob: Blob): Promise<void> {
    // Байты читаем до транзакции: IndexedDB закрывает её на первом await
    const data = await blob.arrayBuffer();
    await this.db.put('covers', { type: blob.type, data }, releaseId);
    this.revokeUrl(releaseId);
  }

  private revokeUrl(releaseId: string): void {
    const cached = this.urlCache.get(releaseId);
    if (cached) {
      URL.revokeObjectURL(cached.url);
      this.urlCache.delete(releaseId);
    }
  }

  // ---------- Служебное ----------

  async getMeta<K extends MetaKey>(key: K): Promise<MetaValues[K] | undefined> {
    return (await this.db.get('meta', key)) as MetaValues[K] | undefined;
  }

  async setMeta<K extends MetaKey>(key: K, value: MetaValues[K]): Promise<void> {
    await this.db.put('meta', value, key);
  }

  async snapshot(): Promise<Catalog> {
    const [releases, tags, revision, ownerName] = await Promise.all([
      this.getReleases(),
      this.getTags(),
      this.getMeta('revision'),
      this.getMeta('ownerName'),
    ]);
    return {
      version: FORMAT_VERSION,
      revision: revision ?? 0,
      publishedAt: new Date().toISOString(),
      owner: { name: ownerName ?? '' },
      tags,
      releases: releases.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    };
  }

  /**
   * Заменить всю картотеку (загрузка опубликованной версии, этап 5; импорт, этап 6).
   * Одна транзакция: либо всё, либо ничего. Служебные ключи (токен, ревизия) не трогает.
   */
  async replaceAll(catalog: Catalog, covers: Map<string, Blob>): Promise<void> {
    // Байты обложек читаем заранее: внутри транзакции нельзя ждать посторонних промисов
    const stored = await Promise.all(
      [...covers].map(
        async ([id, blob]) => [id, { type: blob.type, data: await blob.arrayBuffer() }] as const,
      ),
    );
    const tx = this.db.transaction(['releases', 'tags', 'covers'], 'readwrite');
    await Promise.all([
      tx.objectStore('releases').clear(),
      tx.objectStore('tags').clear(),
      tx.objectStore('covers').clear(),
    ]);
    await Promise.all([
      ...catalog.tags.map((t) => tx.objectStore('tags').put(t)),
      ...catalog.releases.map((r) => tx.objectStore('releases').put(r)),
      ...stored.map(([id, v]) => tx.objectStore('covers').put(v, id)),
    ]);
    await tx.done;
    for (const id of [...this.urlCache.keys()]) this.revokeUrl(id);
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    this.listeners.forEach((l) => l());
  }

  /** Любое изменение: revision++ и флаг «грязно» (раздел 3.3). */
  private async bumpRevision(meta: {
    get(key: MetaKey): Promise<unknown>;
    put(value: unknown, key: MetaKey): Promise<unknown>;
  }): Promise<void> {
    const rev = ((await meta.get('revision')) as number | undefined) ?? 0;
    await meta.put(rev + 1, 'revision');
    await meta.put(true, 'dirty');
  }
}
