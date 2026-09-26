import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalSource } from '../../src/data/localSource';
import { FORMAT_VERSION, createRelease, createTrack, newId, ValidationError } from '../../src/data/schema';

let repo: LocalSource;
let n = 0;

beforeEach(async () => {
  repo = await LocalSource.open(`test-${++n}`);
});
afterEach(() => repo.close());

/** Удаление базы из другого контекста: 'success', либо 'blocked', если кто-то держит соединение. */
function deleteDatabase(name: string): Promise<'success' | 'blocked'> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve('success');
    req.onblocked = () => resolve('blocked');
    req.onerror = () => reject(req.error);
  });
}

describe('LocalSource', () => {
  it('уступает базу другой вкладке: закрывает соединение по versionchange и сообщает об этом', async () => {
    const name = `test-yield-${++n}`;
    let yielded = false;
    const src = await LocalSource.open(name, () => (yielded = true));
    // Без этого обновление схемы (DB_VERSION++) в новой вкладке зависло бы навсегда, пока открыта старая
    expect(await deleteDatabase(name)).toBe('success');
    expect(yielded).toBe(true);
    src.close();
  });

  it('закреплённые артисты — часть картотеки: revision++, dirty, попадают в снимок и восстанавливаются', async () => {
    const r = await repo.saveRelease(createRelease({ title: 'Kid A', artist: 'Radiohead' }));
    const before = (await repo.getMeta('revision')) ?? 0;
    await repo.setMeta('dirty', false);
    let notified = 0;
    repo.subscribe(() => notified++);

    await repo.setPinnedArtists([{ name: 'Radiohead', releaseId: r.id }]);
    // Иначе закрепление не уйдёт в автопубликацию и друзья его не увидят (ADR 0011)
    expect(await repo.getMeta('revision')).toBe(before + 1);
    expect(await repo.getMeta('dirty')).toBe(true);
    expect(notified).toBe(1);
    const snap = await repo.snapshot();
    expect(snap.pinnedArtists).toEqual([{ name: 'Radiohead', releaseId: r.id }]);

    // Бэкап и «загрузить с сайта» идут через replaceAll — артисты должны вернуться вместе с релизами
    await repo.setPinnedArtists([]);
    await repo.replaceAll(snap, new Map());
    expect(await repo.getPinnedArtists()).toEqual([{ name: 'Radiohead', releaseId: r.id }]);
    // Каталог без поля (старый формат) — пустая витрина, а не старые артисты с этого устройства
    await repo.replaceAll({ ...snap, pinnedArtists: undefined }, new Map());
    expect(await repo.getPinnedArtists()).toEqual([]);
  });

  it('сохраняет и читает релиз, нормализует позиции треков', async () => {
    const r = createRelease({
      title: '  In Rainbows ',
      artist: 'Radiohead',
      tracks: [createTrack('Nude', 7), createTrack('15 Step', 1)],
    });
    const saved = await repo.saveRelease(r);
    expect(saved.title).toBe('In Rainbows');
    expect(saved.tracks.map((t) => t.position)).toEqual([1, 2]);
    expect(await repo.getRelease(r.id)).toEqual(saved);
    expect(await repo.getReleases()).toHaveLength(1);
  });

  it('невалидный релиз не сохраняется', async () => {
    await expect(repo.saveRelease(createRelease())).rejects.toBeInstanceOf(ValidationError);
    expect(await repo.getReleases()).toHaveLength(0);
  });

  it('релиз с несуществующим тегом отклоняется', async () => {
    await expect(
      repo.saveRelease(createRelease({ title: 'a', artist: 'b', tagIds: [newId()] })),
    ).rejects.toThrow(/Тег/);
  });

  it('каждое изменение увеличивает revision и ставит флаг «грязно»', async () => {
    expect(await repo.getMeta('revision')).toBeUndefined();
    const r = await repo.saveRelease(createRelease({ title: 'a', artist: 'b' }));
    await repo.saveRelease({ ...r, year: 2007 });
    expect(await repo.getMeta('revision')).toBe(2);
    expect(await repo.getMeta('dirty')).toBe(true);
  });

  it('теги уникальны без учёта регистра', async () => {
    const a = await repo.saveTag({ id: newId(), name: 'Осень', group: 'time' });
    const b = await repo.saveTag({ id: newId(), name: '  осень ', group: 'mood' });
    expect(b.id).toBe(a.id);
    expect(await repo.getTags()).toHaveLength(1);
  });

  it('удаление тега убирает его из релизов', async () => {
    const t = await repo.saveTag({ id: newId(), name: 'джаз', group: 'genre' });
    const r = await repo.saveRelease(createRelease({ title: 'a', artist: 'b', tagIds: [t.id] }));
    await repo.deleteTag(t.id);
    expect((await repo.getRelease(r.id))!.tagIds).toEqual([]);
  });

  it('обложка хранится и удаляется вместе с релизом', async () => {
    const r = await repo.saveRelease(createRelease({ title: 'a', artist: 'b' }));
    await repo.saveCover(r.id, new Blob(['x'], { type: 'image/webp' }));
    await repo.saveRelease({ ...r, cover: `covers/${r.id}.webp` });
    const stored = await repo.getCover(r.id);
    expect(stored?.type).toBe('image/webp');
    expect(await stored?.text()).toBe('x');
    await repo.deleteRelease(r.id);
    expect(await repo.getCover(r.id)).toBeUndefined();
    expect(await repo.getRelease(r.id)).toBeUndefined();
  });

  it('если обложку убрали, файл удаляется', async () => {
    const r = await repo.saveRelease(createRelease({ title: 'a', artist: 'b' }));
    await repo.saveCover(r.id, new Blob(['x'], { type: 'image/webp' }));
    const withCover = await repo.saveRelease({ ...r, cover: `covers/${r.id}.webp` });
    await repo.saveRelease({ ...withCover, cover: undefined });
    expect(await repo.getCover(r.id)).toBeUndefined();
  });

  it('снимок в формате catalog.json', async () => {
    const t = await repo.saveTag({ id: newId(), name: 'осень', group: 'time' });
    await repo.saveRelease(createRelease({ title: 'a', artist: 'b', tagIds: [t.id] }));
    await repo.setMeta('ownerName', 'Wailee');
    const snap = await repo.snapshot();
    expect(snap).toMatchObject({ version: FORMAT_VERSION, revision: 2, owner: { name: 'Wailee' } });
    expect(snap.tags).toHaveLength(1);
    expect(snap.releases).toHaveLength(1);
  });

  it('подписчики получают уведомления', async () => {
    let calls = 0;
    const off = repo.subscribe(() => calls++);
    await repo.saveRelease(createRelease({ title: 'a', artist: 'b' }));
    off();
    await repo.saveRelease(createRelease({ title: 'c', artist: 'd' }));
    expect(calls).toBe(1);
  });
});
