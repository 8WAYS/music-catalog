import { describe, expect, it } from 'vitest';
import {
  LookupError,
  albumToRelease,
  artworkUrl,
  loadArtwork,
  loadTracks,
  parseCollectionName,
  searchAlbums,
  storefronts,
  type ItunesAlbum,
} from '../../src/services/itunes';

const json = (results: unknown[], status = 200) =>
  new Response(JSON.stringify({ resultCount: results.length, results }), { status });

/** Поддельный fetch: отвечает по первому подходящему правилу и запоминает адреса. */
function fakeFetch(rules: [RegExp, () => Response | Promise<Response>][]) {
  const calls: string[] = [];
  const fn = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const rule = rules.find(([re]) => re.test(url));
    if (!rule) throw new TypeError('Failed to fetch');
    return rule[1]();
  }) as typeof fetch;
  return { fn, calls };
}

const rainbows = {
  wrapperType: 'collection',
  collectionId: 1109714933,
  collectionName: 'In Rainbows',
  artistName: 'Radiohead',
  releaseDate: '2007-10-10T07:00:00Z',
  primaryGenreName: 'Alternative',
  trackCount: 10,
  artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music/x/100x100bb.jpg',
  collectionViewUrl: 'https://music.apple.com/us/album/in-rainbows/1109714933?uo=4',
};

describe('разбор ответа iTunes', () => {
  it('тип релиза по суффиксу названия', () => {
    expect(parseCollectionName('In Rainbows')).toEqual({ title: 'In Rainbows', type: 'album' });
    expect(parseCollectionName('Группа крови - EP')).toEqual({ title: 'Группа крови', type: 'ep' });
    expect(parseCollectionName('Creep - Single')).toEqual({ title: 'Creep', type: 'single' });
    // Дефис внутри названия — не суффикс
    expect(parseCollectionName('Live - EP Sessions')).toEqual({ title: 'Live - EP Sessions', type: 'album' });
  });
  it('размер обложки в адресе', () => {
    expect(artworkUrl(rainbows.artworkUrl100, 600)).toBe(
      'https://is1-ssl.mzstatic.com/image/thumb/Music/x/600x600bb.jpg',
    );
    expect(artworkUrl(undefined, 600)).toBeUndefined();
  });
  it('витрина по языку запроса', () => {
    expect(storefronts('Radiohead In Rainbows')).toEqual(['US', 'RU']);
    expect(storefronts('Кино Группа крови')).toEqual(['RU', 'US']);
  });
});

describe('searchAlbums', () => {
  it('поля альбома, год, миниатюра и витрина', async () => {
    const { fn, calls } = fakeFetch([[/\/search/, () => json([rainbows])]]);
    const [a] = await searchAlbums('In Rainbows', 'Radiohead', fn);
    expect(a).toEqual({
      id: 1109714933,
      title: 'In Rainbows',
      artist: 'Radiohead',
      type: 'album',
      year: 2007,
      genre: 'Alternative',
      trackCount: 10,
      thumb: 'https://is1-ssl.mzstatic.com/image/thumb/Music/x/200x200bb.jpg',
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music/x/600x600bb.jpg',
      country: 'us',
    });
    expect(calls[0]).toContain('term=Radiohead%20In%20Rainbows');
    expect(calls[0]).toContain('country=US');
    expect(calls[0]).toContain('entity=album');
  });
  it('пусто в первой витрине — ищет во второй', async () => {
    const { fn, calls } = fakeFetch([
      [/country=RU/, () => json([])],
      [/country=US/, () => json([{ ...rainbows, collectionName: 'Группа крови', artistName: 'Кино' }])],
    ]);
    const res = await searchAlbums('Группа крови', 'Кино', fn);
    expect(res).toHaveLength(1);
    expect(calls.map((c) => new URL(c).searchParams.get('country'))).toEqual(['RU', 'US']);
  });
  it('версии одного альбома схлопываются, записи без названия пропускаются', async () => {
    const { fn } = fakeFetch([
      [
        /\/search/,
        () =>
          json([
            rainbows,
            { ...rainbows, collectionId: 2 }, // clean-версия
            { ...rainbows, collectionId: 3, trackCount: 18 }, // делюкс — оставляем
            { wrapperType: 'collection', collectionId: 4 },
          ]),
      ],
    ]);
    expect((await searchAlbums('In Rainbows', 'Radiohead', fn)).map((a) => a.id)).toEqual([1109714933, 3]);
  });
  it('пустой запрос не ходит в сеть', async () => {
    const { fn, calls } = fakeFetch([]);
    expect(await searchAlbums('  ', '', fn)).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe('ошибки — понятным текстом', () => {
  it.each([
    ['нет сети', () => Promise.reject(new TypeError('Load failed')), 'offline', /Нет связи/],
    ['таймаут', () => Promise.reject(new DOMException('', 'TimeoutError')), 'timeout', /не отвечает/],
    ['таймаут в Safari', () => Promise.reject(new DOMException('', 'AbortError')), 'timeout', /не отвечает/],
    ['лимит', () => Promise.resolve(json([], 403)), 'limit', /подожди минуту/],
    ['сбой сервера', () => Promise.resolve(json([], 500)), 'http', /ошибкой 500/],
    ['не JSON', () => Promise.resolve(new Response('<html>')), 'http', /непонятный ответ/],
  ])('%s', async (_, respond, kind, text) => {
    const { fn } = fakeFetch([[/./, respond]]);
    const err = await searchAlbums('a', 'b', fn).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LookupError);
    expect((err as LookupError).kind).toBe(kind);
    expect((err as LookupError).message).toMatch(text);
  });
});

describe('треклист и обложка', () => {
  const album: ItunesAlbum = {
    id: 42,
    title: 'Double',
    artist: 'X',
    type: 'album',
    country: 'ru',
    artwork: 'https://is1-ssl.mzstatic.com/a/600x600bb.jpg',
  };
  const song = (disc: number, n: number, name: string, ms?: number) => ({
    wrapperType: 'track',
    kind: 'song',
    discNumber: disc,
    trackNumber: n,
    trackName: name,
    ...(ms ? { trackTimeMillis: ms } : {}),
  });

  it('по дискам и номерам, сквозная нумерация, длительность в секундах', async () => {
    const { fn, calls } = fakeFetch([
      [
        /\/lookup/,
        () =>
          json([
            { wrapperType: 'collection', collectionId: 42 },
            song(2, 1, 'C'),
            song(1, 2, 'B', 242_499),
            song(1, 1, 'A', 237_000),
          ]),
      ],
    ]);
    const tracks = await loadTracks(album, fn);
    expect(tracks.map((t) => [t.position, t.title, t.durationSec])).toEqual([
      [1, 'A', 237],
      [2, 'B', 242],
      [3, 'C', undefined],
    ]);
    expect(tracks.every((t) => !t.favorite && /^[0-9a-f-]{36}$/.test(t.id))).toBe(true);
    expect(calls[0]).toContain('/lookup?id=42&entity=song&country=ru');
  });
  it('обложка: не загрузилась — undefined, без исключения', async () => {
    expect(await loadArtwork(album, fakeFetch([]).fn)).toBeUndefined();
    expect(
      await loadArtwork(album, fakeFetch([[/./, () => new Response('', { status: 404 })]]).fn),
    ).toBeUndefined();
    const blob = await loadArtwork(album, fakeFetch([[/./, () => new Response('x')]]).fn);
    expect(blob?.size).toBe(1);
  });
  it('поля релиза для редактора', () => {
    const long = 'x'.repeat(300);
    expect(albumToRelease({ ...album, title: long, year: 1999 }, [])).toEqual({
      title: 'x'.repeat(200),
      artist: 'X',
      type: 'album',
      year: 1999,
      tracks: [],
      itunesId: 42,
    });
  });
});
