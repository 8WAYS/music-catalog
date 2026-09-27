import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalSource } from '../../src/data/localSource';
import { createRelease, type Release } from '../../src/data/schema';
import { initWith, pinnedArtists, releases } from '../../src/store/app';
import {
  TOP_LIMIT,
  TopLimitError,
  isArtistPinned,
  pinArtist,
  pinnedAlbums,
  pinnedReleases,
  pinnedSingles,
  toggleReleasePin,
  topArtists,
  unpinArtist,
} from '../../src/store/showcase';

afterEach(() => {
  releases.value = [];
  pinnedArtists.value = [];
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

  it('топ-3 альбомов: не больше 3, самый недавно закреплённый — первым', () => {
    const at = (h: number) => new Date(2024, 0, 1, h).toISOString();
    releases.value = ['A', 'B', 'C', 'D'].map((title, i) =>
      createRelease({ title, artist: 'X', type: 'album', pinned: true, pinnedAt: at(i) }),
    );
    expect(pinnedAlbums.value.map((r) => r.title)).toEqual(['D', 'C', 'B']);
  });
});

describe('pinArtist / unpinArtist / isArtistPinned', () => {
  let local: LocalSource;
  let n = 0;

  beforeEach(async () => {
    local = await LocalSource.open(`showcase-${++n}`);
    await initWith(local, 'owner');
  });
  afterEach(() => local.close());

  it('закрепляет артиста и сохраняет его в картотеке, а не только в памяти', async () => {
    expect(isArtistPinned('Кино')).toBe(false);
    await pinArtist('Кино', 'release-1');
    expect(isArtistPinned('Кино')).toBe(true);
    expect(await local.getPinnedArtists()).toEqual([{ name: 'Кино', releaseId: 'release-1' }]);
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
    expect(await local.getPinnedArtists()).toEqual([{ name: 'Radiohead', releaseId: 'release-2' }]);
    expect(isArtistPinned('Кино')).toBe(false);
  });

  it('при запуске список читается из картотеки', async () => {
    await local.setPinnedArtists([{ name: 'Кино', releaseId: 'r1' }]);
    pinnedArtists.value = [];
    await initWith(local, 'owner');
    expect(pinnedArtists.value).toEqual([{ name: 'Кино', releaseId: 'r1' }]);
  });

  it('топ-3 занят — закрепить четвёртого артиста нельзя, список не меняется', async () => {
    await pinArtist('A1', 'r1');
    await pinArtist('A2', 'r2');
    await pinArtist('A3', 'r3');
    await expect(pinArtist('A4', 'r4')).rejects.toBeInstanceOf(TopLimitError);
    expect(pinnedArtists.value).toHaveLength(TOP_LIMIT);
    expect(await local.getPinnedArtists()).toHaveLength(TOP_LIMIT);
  });

  it('топ-3 занят, но повторное закрепление уже закреплённого — не отказ', async () => {
    await pinArtist('A1', 'r1');
    await pinArtist('A2', 'r2');
    await pinArtist('A3', 'r3');
    await expect(pinArtist('A1', 'r1-new')).resolves.toBeUndefined();
    expect(topArtists.value[0]).toEqual({ name: 'A1', releaseId: 'r1-new' });
  });

  it('открепление освобождает место в топ-3', async () => {
    await pinArtist('A1', 'r1');
    await pinArtist('A2', 'r2');
    await pinArtist('A3', 'r3');
    await unpinArtist('A2');
    await expect(pinArtist('A4', 'r4')).resolves.toBeUndefined();
    expect(pinnedArtists.value.map((a) => a.name)).toEqual(['A4', 'A3', 'A1']);
  });
});

describe('toggleReleasePin — топ-3 альбомов', () => {
  let local: LocalSource;
  let n = 0;

  beforeEach(async () => {
    local = await LocalSource.open(`showcase-albums-${++n}`);
    await initWith(local, 'owner');
  });
  afterEach(() => local.close());

  async function seedAlbum(title: string): Promise<Release> {
    return local.saveRelease(createRelease({ title, artist: 'X', type: 'album' }));
  }

  it('проставляет и снимает pinnedAt вместе с pinned', async () => {
    const album = await seedAlbum('A');
    const pinned = await toggleReleasePin(album);
    expect(pinned.pinned).toBe(true);
    expect(pinned.pinnedAt).toBeDefined();
    const unpinned = await toggleReleasePin(pinned);
    expect(unpinned.pinned).toBe(false);
    expect(unpinned.pinnedAt).toBeUndefined();
  });

  it('топ-3 занят — закрепить четвёртый альбом нельзя, данные не меняются', async () => {
    const [a, b, c, d] = await Promise.all(['A', 'B', 'C', 'D'].map(seedAlbum));
    await toggleReleasePin(a!);
    await toggleReleasePin(b!);
    await toggleReleasePin(c!);
    await expect(toggleReleasePin(d!)).rejects.toBeInstanceOf(TopLimitError);
    expect(pinnedAlbums.value).toHaveLength(TOP_LIMIT);
    expect(releases.value.find((r) => r.id === d!.id)?.pinned).toBeFalsy();
  });

  it('синглы/EP — без предела в 3', async () => {
    const singles = await Promise.all(
      ['S1', 'S2', 'S3', 'S4'].map((title) =>
        local.saveRelease(createRelease({ title, artist: 'X', type: 'single' })),
      ),
    );
    for (const s of singles) await toggleReleasePin(s);
    // releases.value обновляется через асинхронную подписку (store/app.ts) — не гарантированно
    // успевает к этому моменту, поэтому проверяем напрямую по репозиторию, а не по сигналу.
    const stored = await local.getReleases();
    expect(stored.filter((r) => r.pinned)).toHaveLength(4);
  });
});
