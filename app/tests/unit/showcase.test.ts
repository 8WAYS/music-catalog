import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRelease } from '../../src/data/schema';
import { releases } from '../../src/store/app';
import {
  initShowcase,
  isArtistPinned,
  pinArtist,
  pinnedAlbums,
  pinnedArtists,
  pinnedReleases,
  pinnedSingles,
  resetShowcaseForTests,
  unpinArtist,
} from '../../src/store/showcase';

/** Хранилище meta в памяти — тот же интерфейс, что у LocalSource.getMeta/setMeta. */
function fakeStore() {
  const data = new Map<string, unknown>();
  return {
    getMeta: (key: string) => Promise.resolve(data.get(key)),
    setMeta: (key: string, value: unknown) => {
      data.set(key, value);
      return Promise.resolve();
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

afterEach(() => {
  releases.value = [];
  resetShowcaseForTests();
});

describe('pinnedReleases / pinnedAlbums / pinnedSingles', () => {
  it('фильтрует по флагу pinned и разбивает по типу', () => {
    const album = { ...createRelease({ title: 'A', artist: 'X', type: 'album' }), pinned: true };
    const single = { ...createRelease({ title: 'B', artist: 'X', type: 'single' }), pinned: true };
    const ep = { ...createRelease({ title: 'C', artist: 'X', type: 'ep' }), pinned: true };
    const unpinned = createRelease({ title: 'D', artist: 'X', type: 'album' });
    releases.value = [album, single, ep, unpinned];

    expect(pinnedReleases.value.map((r) => r.title)).toEqual(['A', 'B', 'C']);
    expect(pinnedAlbums.value.map((r) => r.title)).toEqual(['A']);
    expect(pinnedSingles.value.map((r) => r.title)).toEqual(['B', 'C']);
  });

  it('пусто, если ничего не закреплено', () => {
    releases.value = [createRelease({ title: 'A', artist: 'X' })];
    expect(pinnedReleases.value).toEqual([]);
  });
});

describe('pinArtist / unpinArtist / isArtistPinned', () => {
  beforeEach(async () => {
    await initShowcase(fakeStore());
  });

  it('закрепляет, читается из meta при следующем initShowcase', async () => {
    expect(isArtistPinned('Кино')).toBe(false);
    await pinArtist('Кино', 'release-1');
    expect(isArtistPinned('Кино')).toBe(true);
    expect(pinnedArtists.value).toEqual([{ name: 'Кино', releaseId: 'release-1' }]);
  });

  it('повторное закрепление того же имени заменяет представительный релиз', async () => {
    await pinArtist('Кино', 'release-1');
    await pinArtist('Кино', 'release-2');
    expect(pinnedArtists.value).toEqual([{ name: 'Кино', releaseId: 'release-2' }]);
  });

  it('открепление убирает только этого артиста', async () => {
    await pinArtist('Кино', 'release-1');
    await pinArtist('Radiohead', 'release-2');
    await unpinArtist('Кино');
    expect(pinnedArtists.value).toEqual([{ name: 'Radiohead', releaseId: 'release-2' }]);
    expect(isArtistPinned('Кино')).toBe(false);
  });

  it('initShowcase восстанавливает список из meta', async () => {
    const store = fakeStore();
    await store.setMeta('pinnedArtists', [{ name: 'Кино', releaseId: 'r1' }]);
    await initShowcase(store);
    expect(pinnedArtists.value).toEqual([{ name: 'Кино', releaseId: 'r1' }]);
  });

  it('без сохранённого meta — пустой список, не падает', async () => {
    await initShowcase(fakeStore());
    expect(pinnedArtists.value).toEqual([]);
  });
});
