import { zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalSource } from '../../src/data/localSource';
import { coverPath, createRelease, createTrack } from '../../src/data/schema';
import { applyBackup, exportZip, parseZip } from '../../src/services/backup';

let local: LocalSource;
let n = 0;
const cover = (text: string) => new Blob([text], { type: 'image/webp' });

async function addRelease(title: string, coverText?: string) {
  const r = createRelease({ title, artist: 'Radiohead', tracks: [createTrack('Nude', 1)] });
  if (coverText) {
    await local.saveCover(r.id, cover(coverText));
    r.cover = coverPath(r.id, 'image/webp');
  }
  return local.saveRelease(r);
}

beforeEach(async () => {
  local = await LocalSource.open(`backup-${++n}`);
});
afterEach(() => local.close());

describe('exportZip / parseZip', () => {
  it('туда и обратно: релизы, теги и обложки совпадают', async () => {
    const tag = await local.saveTag({ id: crypto.randomUUID(), name: 'осень', group: 'time' });
    const r = await addRelease('In Rainbows', 'cover-bytes');
    await local.saveRelease({ ...r, tagIds: [tag.id] });
    await local.setMeta('ownerName', 'Wailee');

    const zip = await exportZip(local);
    const parsed = parseZip(new Uint8Array(await zip.arrayBuffer()));

    expect(parsed.catalog.releases.map((x) => x.title)).toEqual(['In Rainbows']);
    expect(parsed.catalog.tags.map((t) => t.name)).toEqual(['осень']);
    expect(parsed.catalog.owner.name).toBe('Wailee');
    expect(await parsed.covers.get(r.id)?.text()).toBe('cover-bytes');
  });

  it('релиз без обложки не требует файла в архиве', async () => {
    await addRelease('Без обложки');
    const zip = await exportZip(local);
    const parsed = parseZip(new Uint8Array(await zip.arrayBuffer()));
    expect(parsed.catalog.releases).toHaveLength(1);
    expect(parsed.covers.size).toBe(0);
  });

  it('старый формат (версия 1) мигрирует при импорте', async () => {
    const old = { ...createRelease({ title: 'Kid A', artist: 'Radiohead' }), mbid: 'abc-123' };
    const zip = zipSync({
      'catalog.json': new TextEncoder().encode(
        JSON.stringify({ version: 1, revision: 1, tags: [], releases: [old] }),
      ),
    });
    const parsed = parseZip(zip);
    expect(parsed.catalog.version).toBe(2);
    expect(parsed.catalog.releases[0]).not.toHaveProperty('mbid');
    expect(parsed.catalog.releases[0]).toMatchObject({ title: 'Kid A' });
  });

  it('отклоняет файл без catalog.json и повреждённый архив', () => {
    const zip = zipSync({ 'readme.txt': new TextEncoder().encode('привет') });
    expect(() => parseZip(zip)).toThrow(/catalog\.json/);
    expect(() => parseZip(new Uint8Array([1, 2, 3]))).toThrow(/не ZIP/);
  });
});

describe('applyBackup', () => {
  it('заменяет картотеку и помечает изменение как непубликованное', async () => {
    await addRelease('Старое');
    await local.setMeta('revision', 5);
    await local.setMeta('dirty', false);

    const other = await LocalSource.open(`backup-src-${n}`);
    try {
      const r = await other.saveRelease(createRelease({ title: 'Новое', artist: 'x' }));
      await other.saveCover(r.id, cover('bytes'));
      await other.saveRelease({ ...r, cover: coverPath(r.id, 'image/webp') });
      await other.setMeta('ownerName', 'Друг');
      const parsed = parseZip(new Uint8Array(await (await exportZip(other)).arrayBuffer()));

      await applyBackup(local, parsed);

      const releases = await local.getReleases();
      expect(releases.map((x) => x.title)).toEqual(['Новое']);
      expect(await local.getMeta('ownerName')).toBe('Друг');
      expect(await local.getMeta('revision')).toBe(6);
      expect(await local.getMeta('dirty')).toBe(true);
    } finally {
      other.close();
    }
  });
});
