import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalSource } from '../../src/data/localSource';
import { decideMode } from '../../src/data/mode';
import { coverPath, createRelease, createTrack, newId } from '../../src/data/schema';
import { GitHubError, checkAccess, fromBase64, gitBlobSha, toBase64 } from '../../src/services/github';
import { PublishConflict, importPublished, publish } from '../../src/services/publisher';
import { formatAgo } from '../../src/utils/time';
import { FakeGitHub } from '../fakeGithub';

let local: LocalSource;
let gh: FakeGitHub;
let n = 0;
const cfg = () => ({ repo: gh.repo, branch: gh.branch, token: 'test-token' });
const cover = (text: string) => new Blob([text], { type: 'image/webp' });

async function addRelease(title: string, coverText?: string) {
  const r = createRelease({ title, artist: 'Radiohead', tracks: [createTrack('Nude', 1)] });
  if (coverText) {
    await local.saveCover(r.id, cover(coverText));
    r.cover = coverPath(r.id, 'image/webp');
  }
  return local.saveRelease(r);
}
const catalog = () => JSON.parse(gh.text('data/catalog.json')!);
const blobUploads = () => gh.log.filter((l) => l === 'POST /git/blobs').length;

beforeEach(async () => {
  local = await LocalSource.open(`pub-${++n}`);
  gh = await FakeGitHub.create();
});
afterEach(() => local.close());

describe('кодирование', () => {
  it('git-хэш blob совпадает с git hash-object', async () => {
    expect(await gitBlobSha(new Uint8Array())).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
    expect(await gitBlobSha(new TextEncoder().encode('hello\n'))).toBe(
      'ce013625030ba8dba906f756967f9e9ca394464a',
    );
  });
  it('base64 туда и обратно, включая большие файлы', () => {
    const bytes = new Uint8Array(200_000).map((_, i) => (i * 31) % 256);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });
});

describe('publish', () => {
  it('первая публикация: catalog.json и обложка одним коммитом', async () => {
    const r = await addRelease('In Rainbows', 'cover-1');
    const res = await publish(local, cfg(), { fetchFn: gh.fetch });

    expect(gh.dataCommits).toHaveLength(1);
    expect(gh.dataCommits[0]!.message).toBe(`data: publish rev ${res.revision}`);
    expect(catalog().releases[0].title).toBe('In Rainbows');
    expect(gh.text(`data/${r.cover}`)).toBe('cover-1');
    expect(gh.text('app/index.html')).toBe('<html>'); // код не тронут
    expect(res.uploadedCovers).toBe(1);
    expect(await local.getMeta('dirty')).toBe(false);
    expect(await local.getMeta('publishedRevision')).toBe(res.revision);
    expect(await local.getMeta('catalogSha')).toBe(gh.files().get('data/catalog.json'));
  });

  it('неизменённые обложки повторно не загружаются, удалённые убираются', async () => {
    const a = await addRelease('A', 'cover-a');
    const b = await addRelease('B', 'cover-b');
    await publish(local, cfg(), { fetchFn: gh.fetch });
    expect(blobUploads()).toBe(2);

    gh.log = [];
    await local.saveRelease({ ...a, description: 'новое описание' });
    await local.deleteRelease(b.id);
    const res = await publish(local, cfg(), { fetchFn: gh.fetch });
    expect(blobUploads()).toBe(0);
    expect(res).toMatchObject({ uploadedCovers: 0, deletedCovers: 1 });
    expect(gh.files().has(`data/${b.cover}`)).toBe(false);
    expect(gh.files().has(`data/${a.cover}`)).toBe(true);
    expect(gh.files().has('data/covers/.gitkeep')).toBe(true);
    expect(catalog().releases.map((r: { title: string }) => r.title)).toEqual(['A']);
  });

  it('коммит кода в ветку — не конфликт', async () => {
    await addRelease('A');
    await publish(local, cfg(), { fetchFn: gh.fetch });
    await gh.commitFiles({ 'app/index.html': '<html v2>' }, 'feat: код');
    await addRelease('B');
    await publish(local, cfg(), { fetchFn: gh.fetch });
    expect(catalog().releases).toHaveLength(2);
    expect(gh.text('app/index.html')).toBe('<html v2>');
  });

  it('catalog.json изменили в другом месте — конфликт; force перезаписывает', async () => {
    await addRelease('A');
    await publish(local, cfg(), { fetchFn: gh.fetch });
    await gh.commitFiles({ 'data/catalog.json': '{"другое устройство":true}' }, 'data: publish rev 99');
    await addRelease('B');

    await expect(publish(local, cfg(), { fetchFn: gh.fetch })).rejects.toBeInstanceOf(PublishConflict);
    expect(await local.getMeta('dirty')).toBe(true);

    await publish(local, cfg(), { fetchFn: gh.fetch, force: true });
    expect(catalog().releases).toHaveLength(2);
  });

  it('новое устройство: на сайте уже есть картотека — конфликт, а не молчаливая перезапись', async () => {
    await gh.commitFiles({ 'data/catalog.json': '{}' }, 'data: publish rev 1');
    await addRelease('A');
    await expect(publish(local, cfg(), { fetchFn: gh.fetch })).rejects.toBeInstanceOf(PublishConflict);
  });

  it('ветку сдвинули во время публикации — перечитывает и публикует', async () => {
    await addRelease('A');
    gh.failNextPatch = 1;
    await publish(local, cfg(), { fetchFn: gh.fetch });
    expect(gh.dataCommits).toHaveLength(2); // первая попытка не попала в ветку
    expect(catalog().releases).toHaveLength(1);
    expect(gh.text('app/other.txt')).toBeDefined();
  });

  it('понятные ошибки: токен, права, сеть', async () => {
    await addRelease('A');
    gh.forceStatus = 401;
    await expect(publish(local, cfg(), { fetchFn: gh.fetch })).rejects.toMatchObject({ kind: 'auth' });
    gh.forceStatus = 403;
    await expect(publish(local, cfg(), { fetchFn: gh.fetch })).rejects.toMatchObject({ kind: 'forbidden' });
    const offline = (() => Promise.reject(new TypeError('Load failed'))) as typeof fetch;
    const err = await publish(local, cfg(), { fetchFn: offline }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GitHubError);
    expect((err as GitHubError).retryable).toBe(true);
    expect(await local.getMeta('dirty')).toBe(true);
  });
});

describe('importPublished', () => {
  it('новое устройство получает релизы, теги и обложки', async () => {
    const tag = await local.saveTag({ id: newId(), name: 'осень', group: 'time' });
    const r = await addRelease('In Rainbows', 'cover-bytes');
    await local.saveRelease({ ...r, tagIds: [tag.id] });
    await local.setMeta('ownerName', 'Wailee');
    await publish(local, cfg(), { fetchFn: gh.fetch });

    const other = await LocalSource.open(`pub-other-${n}`);
    try {
      await other.saveRelease(createRelease({ title: 'Старое', artist: 'x' }));
      await importPublished(other, cfg(), gh.fetch);
      const releases = await other.getReleases();
      expect(releases.map((x) => x.title)).toEqual(['In Rainbows']);
      expect((await other.getTags()).map((t) => t.name)).toEqual(['осень']);
      expect(await (await other.getCover(r.id))?.text()).toBe('cover-bytes');
      expect(await other.getMeta('ownerName')).toBe('Wailee');
      expect(await other.getMeta('dirty')).toBe(false);
      // Сразу после загрузки публикация идёт без конфликта
      await other.saveRelease({ ...releases[0]!, description: 'с нового устройства' });
      await publish(other, cfg(), { fetchFn: gh.fetch });
      expect(catalog().releases[0].description).toBe('с нового устройства');
    } finally {
      other.close();
    }
  });
});

describe('проверка доступа', () => {
  it('чтение ветки и пробная запись', async () => {
    await checkAccess(cfg(), gh.fetch);
    expect(gh.log).toEqual(['GET /git/ref/heads/main', 'POST /git/blobs']);
    gh.forceStatus = 404;
    await expect(checkAccess(cfg(), gh.fetch)).rejects.toMatchObject({ kind: 'notFound' });
    await expect(checkAccess({ ...cfg(), repo: 'без-слеша' }, gh.fetch)).rejects.toThrow(/владелец\/имя/);
  });
});

describe('режим', () => {
  it.each([
    [{ token: true, hasLocal: false, published: 'yes', preferLocal: false }, 'owner'],
    [{ token: false, hasLocal: false, published: 'yes', preferLocal: false }, 'viewer'],
    [{ token: false, hasLocal: true, published: 'yes', preferLocal: false }, 'viewer'],
    [{ token: false, hasLocal: true, published: 'yes', preferLocal: true }, 'owner'],
    [{ token: false, hasLocal: false, published: 'no', preferLocal: false }, 'owner'],
    [{ token: false, hasLocal: true, published: 'unknown', preferLocal: false }, 'owner'],
    [{ token: false, hasLocal: false, published: 'unknown', preferLocal: false }, 'viewer'],
  ] as const)('%o → %s', (input, expected) => expect(decideMode(input)).toBe(expected));
});

describe('formatAgo', () => {
  const now = Date.parse('2026-09-25T12:00:00Z');
  it.each([
    ['2026-09-25T11:59:30Z', 'только что'],
    ['2026-09-25T11:55:00Z', '5 минут назад'],
    ['2026-09-25T11:39:00Z', '21 минуту назад'],
    ['2026-09-25T09:00:00Z', '3 часа назад'],
  ])('%s → %s', (iso, text) => expect(formatAgo(iso, now)).toBe(text));
});
