import { describe, expect, it } from 'vitest';
import {
  createRelease,
  createTrack,
  newId,
  validateCatalog,
  validateRelease,
  coverPath,
} from '../../src/data/schema';

describe('schema', () => {
  it('новый релиз с названием и исполнителем валиден', () => {
    const r = createRelease({ title: 'In Rainbows', artist: 'Radiohead' });
    expect(validateRelease(r)).toEqual([]);
  });

  it('без названия и исполнителя — ошибки', () => {
    const issues = validateRelease(createRelease());
    expect(issues.some((i) => i.includes('title'))).toBe(true);
    expect(issues.some((i) => i.includes('artist'))).toBe(true);
  });

  it('проверяет год, ссылки, треки и цвета', () => {
    const r = createRelease({
      title: 'x',
      artist: 'y',
      year: 1800,
      links: [{ service: 'yandex', url: 'http://music.yandex.ru' }],
      tracks: [{ ...createTrack('a', 1), position: 1.5 }],
      coverColors: { bg: 'red', accent: '#fff', text: '#000000' },
    });
    const issues = validateRelease(r).join('\n');
    expect(issues).toMatch(/year/);
    expect(issues).toMatch(/links\[0\]\.url/);
    expect(issues).toMatch(/tracks\[0\]\.position/);
    expect(issues).toMatch(/coverColors/);
  });

  it('каталог: теги релиза должны существовать', () => {
    const tagId = newId();
    const catalog = {
      version: 1,
      revision: 1,
      publishedAt: new Date().toISOString(),
      owner: { name: 'W' },
      tags: [],
      releases: [createRelease({ title: 'a', artist: 'b', tagIds: [tagId] })],
    };
    expect(validateCatalog(catalog).join()).toMatch(/нет тега/);
  });

  it('каталог: закреплённые артисты необязательны, но если есть — корректные', () => {
    const base = {
      version: 2,
      revision: 1,
      publishedAt: new Date().toISOString(),
      owner: { name: 'W' },
      tags: [],
      releases: [],
    };
    expect(validateCatalog(base)).toEqual([]);
    expect(validateCatalog({ ...base, pinnedArtists: [{ name: 'Кино', releaseId: newId() }] })).toEqual([]);
    expect(validateCatalog({ ...base, pinnedArtists: 'Кино' }).join()).toMatch(/pinnedArtists/);
    expect(validateCatalog({ ...base, pinnedArtists: [{ name: '', releaseId: 1 }] }).join()).toMatch(
      /pinnedArtists\[0\]/,
    );
  });

  it('имя файла обложки зависит от формата', () => {
    expect(coverPath('abc', 'image/webp')).toBe('covers/abc.webp');
    expect(coverPath('abc', 'image/jpeg')).toBe('covers/abc.jpg');
  });
});
