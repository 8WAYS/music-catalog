import { describe, expect, it } from 'vitest';
import { migrateCatalog } from '../../src/data/migrations';
import { FORMAT_VERSION, createRelease } from '../../src/data/schema';

describe('migrateCatalog', () => {
  it('принимает текущую версию', () => {
    const c = migrateCatalog({
      version: FORMAT_VERSION,
      revision: 3,
      tags: [],
      releases: [createRelease({ title: 'a', artist: 'b', itunesId: 1109714933 })],
    });
    expect(c.releases).toHaveLength(1);
    expect(c.releases[0]!.itunesId).toBe(1109714933);
    expect(c.revision).toBe(3);
  });
  it('1 → 2: mbid убирается, остальное сохраняется', () => {
    const old = {
      ...createRelease({ title: 'In Rainbows', artist: 'Radiohead', year: 2007 }),
      mbid: 'abc-123',
    };
    const c = migrateCatalog({ version: 1, revision: 7, tags: [], releases: [old] });
    expect(c.version).toBe(2);
    expect(c.revision).toBe(7);
    expect(c.releases[0]).not.toHaveProperty('mbid');
    expect(c.releases[0]).toMatchObject({ title: 'In Rainbows', artist: 'Radiohead', year: 2007 });
  });
  it('itunesId проверяется', () => {
    const bad = createRelease({ title: 'a', artist: 'b', itunesId: -1 });
    expect(() => migrateCatalog({ version: FORMAT_VERSION, revision: 0, tags: [], releases: [bad] })).toThrow(
      /itunesId/,
    );
  });
  it('отклоняет будущую версию и мусор', () => {
    expect(() => migrateCatalog({ version: 99, tags: [], releases: [] })).toThrow(/более новой/);
    expect(() => migrateCatalog('abc')).toThrow();
    expect(() =>
      migrateCatalog({ version: FORMAT_VERSION, revision: 0, tags: [{ id: 1 }], releases: [] }),
    ).toThrow();
  });
});
