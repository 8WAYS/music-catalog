import { describe, expect, it } from 'vitest';
import {
  SpotifyError,
  albumToRelease,
  loadTracks,
  searchAlbums,
  type SpotifyAlbum,
} from '../../src/services/spotify';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** Поддельный fetch: отвечает по первому подходящему правилу, проверяет заголовок токена. */
function fakeFetch(rules: [RegExp, () => Response | Promise<Response>][], expectToken = 'test-token') {
  const calls: string[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    expect((init?.headers as Record<string, string>)?.Authorization).toBe(`Bearer ${expectToken}`);
    const rule = rules.find(([re]) => re.test(url));
    if (!rule) throw new TypeError('Failed to fetch');
    return rule[1]();
  }) as typeof fetch;
  return { fn, calls };
}

const rainbows = {
  id: '7DQVAOZgpb1lHU2wY9Xztq',
  name: 'In Rainbows',
  artists: [{ name: 'Radiohead' }],
  release_date: '2007-10-10',
  total_tracks: 10,
  album_type: 'album',
  images: [
    { url: 'https://i.scdn.co/image/big.jpg', width: 640 },
    { url: 'https://i.scdn.co/image/small.jpg', width: 64 },
  ],
};

describe('searchAlbums', () => {
  it('поля альбома, год, миниатюра — самое маленькое изображение', async () => {
    const { fn, calls } = fakeFetch([[/\/search/, () => json({ albums: { items: [rainbows] } })]]);
    const [a] = await searchAlbums('In Rainbows', 'Radiohead', 'test-token', fn);
    expect(a).toEqual({
      id: '7DQVAOZgpb1lHU2wY9Xztq',
      title: 'In Rainbows',
      artist: 'Radiohead',
      type: 'album',
      year: 2007,
      trackCount: 10,
      thumb: 'https://i.scdn.co/image/small.jpg',
    });
    expect(calls[0]).toContain('q=Radiohead%20In%20Rainbows');
    expect(calls[0]).toContain('type=album');
  });
  it('несколько исполнителей — через запятую', async () => {
    const { fn } = fakeFetch([
      [
        /\/search/,
        () => json({ albums: { items: [{ ...rainbows, artists: [{ name: 'A' }, { name: 'B' }] }] } }),
      ],
    ]);
    const [a] = await searchAlbums('x', 'y', 'test-token', fn);
    expect(a?.artist).toBe('A, B');
  });
  it('сингл — тип single, иначе album (EP Spotify не различает)', async () => {
    const { fn } = fakeFetch([
      [
        /\/search/,
        () =>
          json({
            albums: {
              items: [
                { ...rainbows, album_type: 'single' },
                { ...rainbows, id: '2', album_type: 'compilation' },
              ],
            },
          }),
      ],
    ]);
    const res = await searchAlbums('x', 'y', 'test-token', fn);
    expect(res.map((a) => a.type)).toEqual(['single', 'album']);
  });
  it('пустой запрос не ходит в сеть', async () => {
    const { fn, calls } = fakeFetch([]);
    expect(await searchAlbums('  ', '', 'test-token', fn)).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe('ошибки — понятным текстом', () => {
  it.each([
    ['нет сети', () => Promise.reject(new TypeError('Load failed')), 'offline', /Нет связи/],
    ['таймаут', () => Promise.reject(new DOMException('', 'TimeoutError')), 'timeout', /не отвечает/],
    ['токен истёк', () => Promise.resolve(json({}, 401)), 'authExpired', /Вход в Spotify истёк/],
    ['лимит', () => Promise.resolve(json({}, 429)), 'limit', /подожди/],
    ['сбой сервера', () => Promise.resolve(json({}, 500)), 'http', /ошибкой 500/],
    ['не JSON', () => Promise.resolve(new Response('<html>')), 'http', /непонятный ответ/],
  ])('%s', async (_, respond, kind, text) => {
    const { fn } = fakeFetch([[/./, respond]]);
    const err = await searchAlbums('a', 'b', 'test-token', fn).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SpotifyError);
    expect((err as SpotifyError).kind).toBe(kind);
    expect((err as SpotifyError).message).toMatch(text);
  });
});

describe('треклист и поля релиза', () => {
  const album: SpotifyAlbum = { id: '42', title: 'Double', artist: 'X', type: 'album' };
  const track = (disc: number, n: number, name: string, ms?: number) => ({
    disc_number: disc,
    track_number: n,
    name,
    ...(ms ? { duration_ms: ms } : {}),
  });

  it('по дискам и номерам, сквозная нумерация, страницы по next', async () => {
    const { fn, calls } = fakeFetch([
      [
        /\/albums\/42\/tracks\?limit=50$/,
        () =>
          json({
            items: [track(1, 2, 'B', 242_499)],
            next: 'https://api.spotify.com/v1/albums/42/tracks?offset=50',
          }),
      ],
      [/offset=50/, () => json({ items: [track(1, 1, 'A', 237_000), track(2, 1, 'C')], next: null })],
    ]);
    const tracks = await loadTracks(album, 'test-token', fn);
    expect(tracks.map((t) => [t.position, t.title, t.durationSec])).toEqual([
      [1, 'A', 237],
      [2, 'B', 242],
      [3, 'C', undefined],
    ]);
    expect(tracks.every((t) => !t.favorite && /^[0-9a-f-]{36}$/.test(t.id))).toBe(true);
    expect(calls).toHaveLength(2);
  });
  it('поля релиза для редактора — без обложки', () => {
    const long = 'x'.repeat(300);
    expect(albumToRelease({ ...album, title: long, year: 1999 }, [])).toEqual({
      title: 'x'.repeat(200),
      artist: 'X',
      type: 'album',
      year: 1999,
      tracks: [],
      spotifyId: '42',
    });
  });
});
