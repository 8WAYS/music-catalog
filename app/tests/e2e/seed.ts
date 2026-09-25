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
          id: `${r.id.slice(0, 24)}${r.id.slice(-2)}${String(i).padStart(10, '0')}`,
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

/** Идентификаторы — UUID, как в настоящем приложении: иначе валидация не даст сохранить правку */
export const ID = {
  rainbows: '00000000-0000-4000-8000-0000000000b1',
  blood: '00000000-0000-4000-8000-0000000000b2',
  elka: '00000000-0000-4000-8000-0000000000b3',
};

export const TAGS: SeedTag[] = [
  { id: '00000000-0000-4000-8000-0000000000a1', name: 'осень', group: 'time' },
  { id: '00000000-0000-4000-8000-0000000000a2', name: 'вечер', group: 'time' },
  { id: '00000000-0000-4000-8000-0000000000a3', name: 'спокойное', group: 'mood' },
  { id: '00000000-0000-4000-8000-0000000000a4', name: 'дорога', group: 'place' },
];

export const RELEASES: SeedRelease[] = [
  {
    id: '00000000-0000-4000-8000-0000000000b1',
    title: 'In Rainbows',
    artist: 'Radiohead',
    year: 2007,
    description: 'Слушал осенью на велике вдоль Невы',
    tagIds: [
      '00000000-0000-4000-8000-0000000000a1',
      '00000000-0000-4000-8000-0000000000a2',
      '00000000-0000-4000-8000-0000000000a3',
    ],
    tracks: ['15 Step', 'Nude'],
    createdAt: '2026-09-01T10:00:00Z',
  },
  {
    id: '00000000-0000-4000-8000-0000000000b2',
    title: 'Группа крови',
    artist: 'Кино',
    year: 1988,
    tagIds: ['00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a4'],
    tracks: ['Группа крови', 'Звезда по имени Солнце'],
    createdAt: '2026-09-03T10:00:00Z',
  },
  {
    id: '00000000-0000-4000-8000-0000000000b3',
    title: 'Ёлка',
    artist: 'Аквариум',
    tagIds: ['00000000-0000-4000-8000-0000000000a3'],
    createdAt: '2026-09-02T10:00:00Z',
  },
];
