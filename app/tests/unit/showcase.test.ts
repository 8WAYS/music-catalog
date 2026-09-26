import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalSource } from '../../src/data/localSource';
import { createRelease } from '../../src/data/schema';
import { initWith, pinnedArtists, releases } from '../../src/store/app';
import {
  isArtistPinned,
  pinArtist,
  pinnedAlbums,
  pinnedReleases,
  pinnedSingles,
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
});
