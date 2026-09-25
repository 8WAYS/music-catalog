import type { Page } from '@playwright/test';

export interface SeedTag {
  id: string;
  name: string;
  group: 'mood' | 'genre' | 'place' | 'time' | 'other';
}

export interface SeedRelease {
  id: string;
  title: string;
  artist: string;
  year?: number;
  description?: string;
  tagIds?: string[];
  tracks?: string[];
  createdAt: string;
}

/** Кладёт релизы и теги прямо в IndexedDB приложения и перезагружает страницу. */
export async function seed(page: Page, data: { tags: SeedTag[]; releases: SeedRelease[] }): Promise<void> {
  await page.goto('./');
  await page.getByRole('heading', { name: 'Картотека пуста' }).waitFor();
  await page.evaluate(async ({ tags, releases }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('music-catalog');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction(['tags', 'releases'], 'readwrite');
    for (const t of tags) tx.objectStore('tags').put(t);
    for (const r of releases)
      tx.objectStore('releases').put({
        type: 'album',
        links: [],
        updatedAt: r.createdAt,
        ...r,
        tagIds: r.tagIds ?? [],
        tracks: (r.tracks ?? []).map((title, i) => ({
          id: `${r.id}-${i}`,
          position: i + 1,
          title,
          favorite: false,
        })),
      });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, data);
  await page.reload();
}

export const TAGS: SeedTag[] = [
  { id: 't-autumn', name: 'осень', group: 'time' },
  { id: 't-evening', name: 'вечер', group: 'time' },
  { id: 't-calm', name: 'спокойное', group: 'mood' },
  { id: 't-road', name: 'дорога', group: 'place' },
];

export const RELEASES: SeedRelease[] = [
  {
    id: 'r-rainbows',
    title: 'In Rainbows',
    artist: 'Radiohead',
    year: 2007,
    description: 'Слушал осенью на велике вдоль Невы',
    tagIds: ['t-autumn', 't-evening', 't-calm'],
    tracks: ['15 Step', 'Nude'],
    createdAt: '2026-09-01T10:00:00Z',
  },
  {
    id: 'r-blood',
    title: 'Группа крови',
    artist: 'Кино',
    year: 1988,
    tagIds: ['t-autumn', 't-road'],
    tracks: ['Группа крови', 'Звезда по имени Солнце'],
    createdAt: '2026-09-03T10:00:00Z',
  },
  {
    id: 'r-elka',
    title: 'Ёлка',
    artist: 'Аквариум',
    tagIds: ['t-calm'],
    createdAt: '2026-09-02T10:00:00Z',
  },
];
