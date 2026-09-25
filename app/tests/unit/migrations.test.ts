import { describe, expect, it } from 'vitest';
import { migrateCatalog } from '../../src/data/migrations';
import { createRelease } from '../../src/data/schema';

describe('migrateCatalog', () => {
  it('принимает текущую версию', () => {
    const c = migrateCatalog({
      version: 1,
      revision: 3,
      tags: [],
      releases: [createRelease({ title: 'a', artist: 'b' })],
    });
    expect(c.releases).toHaveLength(1);
    expect(c.revision).toBe(3);
  });
  it('отклоняет будущую версию и мусор', () => {
    expect(() => migrateCatalog({ version: 99, tags: [], releases: [] })).toThrow(/более новой/);
    expect(() => migrateCatalog('abc')).toThrow();
    expect(() => migrateCatalog({ version: 1, revision: 0, tags: [{ id: 1 }], releases: [] })).toThrow();
  });
});
