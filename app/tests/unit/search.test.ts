import { describe, expect, it } from 'vitest';
import { createRelease, type Release, type Tag } from '../../src/data/schema';
import {
  EMPTY_FILTERS,
  chipTags,
  filtersHash,
  matchesQuery,
  parseFilters,
  selectReleases,
  sortReleases,
} from '../../src/services/search';

const tag = (id: string, name: string, group: Tag['group']): Tag => ({ id, name, group });
const autumn = tag('t1', 'осень', 'time');
const evening = tag('t2', 'вечер', 'time');
const calm = tag('t3', 'спокойное', 'mood');
const comma = tag('t4', 'рок, но мягкий', 'genre');
const TAGS = [autumn, evening, calm, comma];

const track = (title: string) => ({ id: title, position: 1, title, favorite: false });

const rainbows = createRelease({
  title: 'In Rainbows',
  artist: 'Radiohead',
  year: 2007,
  description: 'Слушал осенью на велике вдоль Невы',
  tracks: [track('15 Step'), track('Nude')],
  tagIds: ['t1', 't2', 't3'],
  createdAt: '2026-09-01T10:00:00Z',
});
const blood = createRelease({
  title: 'Группа крови',
  artist: 'Кино',
  year: 1988,
  tracks: [track('Звезда по имени Солнце')],
  tagIds: ['t1'],
  createdAt: '2026-09-03T10:00:00Z',
});
const elka = createRelease({
  title: 'Ёлка',
  artist: 'Аквариум',
  tagIds: ['t4'],
  createdAt: '2026-09-02T10:00:00Z',
});
const ALL: Release[] = [rainbows, blood, elka];
const titles = (list: Release[]) => list.map((r) => r.title);

describe('поиск', () => {
  it('по названию, исполнителю, описанию и трекам', () => {
    expect(matchesQuery(rainbows, 'rainbows')).toBe(true);
    expect(matchesQuery(rainbows, 'RADIOHEAD')).toBe(true);
    expect(matchesQuery(rainbows, 'невы')).toBe(true);
    expect(matchesQuery(rainbows, 'nude')).toBe(true);
    expect(matchesQuery(blood, 'солнце')).toBe(true);
    expect(matchesQuery(blood, 'radiohead')).toBe(false);
  });
  it('ё/е, регистр и лишние пробелы', () => {
    expect(matchesQuery(elka, 'елка')).toBe(true);
    expect(matchesQuery(elka, '  ЁЛКА ')).toBe(true);
  });
  it('все слова запроса, в любом порядке', () => {
    expect(matchesQuery(blood, 'кино крови')).toBe(true);
    expect(matchesQuery(blood, 'кино радио')).toBe(false);
  });
  it('пустой запрос пропускает всё', () => {
    expect(matchesQuery(elka, '   ')).toBe(true);
  });
  it('после изменения релиза ищется новый текст', () => {
    const edited = { ...blood, title: 'Звезда по имени Солнце (альбом)' };
    expect(matchesQuery(blood, 'альбом')).toBe(false);
    expect(matchesQuery(edited, 'альбом')).toBe(true);
  });
});

describe('фильтры и сортировка', () => {
  it('несколько тегов — пересечение', () => {
    expect(titles(selectReleases(ALL, { ...EMPTY_FILTERS, tagIds: ['t1'] }))).toEqual([
      'Группа крови',
      'In Rainbows',
    ]);
    expect(titles(selectReleases(ALL, { ...EMPTY_FILTERS, tagIds: ['t1', 't2'] }))).toEqual(['In Rainbows']);
    expect(selectReleases(ALL, { ...EMPTY_FILTERS, tagIds: ['t2', 't4'] })).toEqual([]);
  });
  it('теги и поиск вместе', () => {
    expect(titles(selectReleases(ALL, { q: 'кино', tagIds: ['t1'], sort: 'added' }))).toEqual([
      'Группа крови',
    ]);
  });
  it('по дате добавления — новые сверху', () => {
    expect(titles(sortReleases(ALL, 'added'))).toEqual(['Группа крови', 'Ёлка', 'In Rainbows']);
  });
  it('по году — новые сверху, без года в конце', () => {
    expect(titles(sortReleases(ALL, 'year'))).toEqual(['In Rainbows', 'Группа крови', 'Ёлка']);
  });
  it('по названию — словарный русский порядок: кириллица, потом латиница, ё как е', () => {
    const e = createRelease({ title: 'Ель', artist: 'x' });
    expect(titles(sortReleases([...ALL, e], 'title'))).toEqual([
      'Группа крови',
      'Ёлка',
      'Ель',
      'In Rainbows',
    ]);
  });
  it('не меняет исходный массив', () => {
    const copy = [...ALL];
    sortReleases(ALL, 'title');
    expect(ALL).toEqual(copy);
  });
});

describe('чипы', () => {
  it('только теги из выборки и выбранные, по группам', () => {
    expect(chipTags(TAGS, ALL, []).map((t) => t.name)).toEqual([
      'спокойное',
      'рок, но мягкий',
      'осень',
      'вечер',
    ]);
    // Выбрана «осень»: «рок, но мягкий» дал бы пустой результат — скрыт
    const sel = selectReleases(ALL, { ...EMPTY_FILTERS, tagIds: ['t1'] });
    expect(chipTags(TAGS, sel, ['t1']).map((t) => t.name)).toEqual(['спокойное', 'осень', 'вечер']);
  });
  it('выбранный тег виден, даже если выборка пуста', () => {
    expect(chipTags(TAGS, [], ['t4']).map((t) => t.name)).toEqual(['рок, но мягкий']);
  });
});

describe('фильтры в адресе', () => {
  it('туда и обратно', () => {
    const f = { q: 'кино 1988 & co', tagIds: ['t1', 't4'], sort: 'year' as const };
    const hash = filtersHash(f, TAGS);
    // Запятая между именами — разделитель, запятая внутри имени закодирована
    expect(hash).toBe(
      `#/?tags=${encodeURIComponent('осень')},${encodeURIComponent('рок, но мягкий')}` +
        `&q=${encodeURIComponent('кино 1988 & co')}&sort=year`,
    );
    expect(parseFilters(hash.split('?')[1]!, TAGS)).toEqual(f);
  });
  it('без фильтров — просто главная', () => {
    expect(filtersHash(EMPTY_FILTERS, TAGS)).toBe('#/');
    expect(parseFilters('', TAGS)).toEqual(EMPTY_FILTERS);
  });
  it('имена без учёта регистра и ё, незнакомые и повторы пропускаются', () => {
    expect(parseFilters('tags=ОСЕНЬ,нет-такого,осень&sort=chaos', TAGS)).toEqual({
      ...EMPTY_FILTERS,
      tagIds: ['t1'],
    });
  });
  it('ручной ввод адреса: незакодированная кириллица и плюс как пробел', () => {
    expect(parseFilters('q=группа+крови&tags=вечер', TAGS)).toEqual({
      ...EMPTY_FILTERS,
      q: 'группа крови',
      tagIds: ['t2'],
    });
  });
  it('битая кодировка не роняет разбор', () => {
    expect(parseFilters('q=%E0%A4%A', TAGS).q).toBe('%E0%A4%A');
  });
});
