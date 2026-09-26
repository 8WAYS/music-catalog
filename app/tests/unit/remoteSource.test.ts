import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoteSource } from '../../src/data/remoteSource';
import { FORMAT_VERSION, createRelease } from '../../src/data/schema';

const BASE = 'https://me.github.io/music-catalog/data/';
const catalog = {
  version: FORMAT_VERSION,
  revision: 5,
  publishedAt: '2026-09-25T12:00:00Z',
  owner: { name: 'Wailee' },
  tags: [],
  releases: [createRelease({ title: 'In Rainbows', artist: 'Radiohead' })],
};
const ok = () => new Response(JSON.stringify(catalog), { status: 200 });

// Cache Storage в jsdom нет — простая замена в памяти
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  vi.stubGlobal('caches', {
    open: async () => ({
      put: async (url: string, res: Response) => void store.set(url, await res.text()),
      match: async (url: string) => (store.has(url) ? new Response(store.get(url)) : undefined),
    }),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function source(responses: (() => Response | Promise<Response>)[]) {
  const calls: string[] = [];
  const fetchFn = (async (url: RequestInfo | URL) => {
    calls.push(String(url));
    const next = responses.shift();
    if (!next) throw new TypeError('Failed to fetch');
    return next();
  }) as typeof fetch;
  return { src: new RemoteSource(BASE, fetchFn), calls };
}

async function run<T>(p: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return p;
}

describe('RemoteSource', () => {
  it('свежая версия с параметром в обход кэша CDN; копия сохраняется', async () => {
    const { src, calls } = source([ok]);
    expect((await run(src.getReleases())).map((r) => r.title)).toEqual(['In Rainbows']);
    expect(calls[0]).toMatch(/catalog\.json\?v=\d+$/);
    expect(src.stale).toBe(false);
    expect(store.has(`${BASE}catalog.json`)).toBe(true);
    expect(await src.getMeta('ownerName')).toBe('Wailee');
  });

  it('сбой — повтор через полторы секунды', async () => {
    const { src, calls } = source([() => Promise.reject(new TypeError('Load failed')), ok]);
    expect(await run(src.getReleases())).toHaveLength(1);
    expect(calls).toHaveLength(2);
    expect(src.stale).toBe(false);
  });

  it('сайт не отвечает — сохранённая копия', async () => {
    store.set(`${BASE}catalog.json`, JSON.stringify(catalog));
    const { src } = source([() => new Response('', { status: 503 })]);
    expect(await run(src.getReleases())).toHaveLength(1);
    expect(src.stale).toBe(true);
  });

  it('ни сайта, ни копии — понятная ошибка', async () => {
    const { src } = source([]);
    const check = expect(src.getReleases()).rejects.toThrow(
      'Не удалось загрузить картотеку — проверь интернет',
    );
    await vi.runAllTimersAsync();
    await check;
  });

  it('только чтение', async () => {
    const { src } = source([ok]);
    await expect(src.saveRelease()).rejects.toThrow('только для просмотра');
    await expect(src.setPinnedArtists()).rejects.toThrow('только для просмотра');
  });

  it('зритель видит закреплённых артистов из опубликованного каталога (ADR 0011)', async () => {
    const pinned = [{ name: 'Radiohead', releaseId: catalog.releases[0]!.id }];
    const { src } = source([() => new Response(JSON.stringify({ ...catalog, pinnedArtists: pinned }))]);
    expect(await run(src.getPinnedArtists())).toEqual(pinned);
  });

  it('каталог без поля pinnedArtists (опубликован старой версией) — пустая витрина', async () => {
    const { src } = source([ok]);
    expect(await run(src.getPinnedArtists())).toEqual([]);
  });
});
