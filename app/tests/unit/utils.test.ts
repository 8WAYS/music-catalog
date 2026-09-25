import { describe, expect, it } from 'vitest';
import { normalize, initials, formatDuration, pluralize } from '../../src/utils/normalize';
import { detectService, normalizeUrl } from '../../src/services/links';
import { parseTrackLines } from '../../src/utils/tracks';

describe('normalize', () => {
  it('регистр, ё/е, пробелы', () => {
    expect(normalize('  Ёлка   Зимой ')).toBe('елка зимой');
    expect(normalize('RADIOHEAD')).toBe('radiohead');
  });
  it('инициалы', () => {
    expect(initials('In Rainbows')).toBe('IR');
    expect(initials('кино')).toBe('К');
    expect(initials('')).toBe('♪');
  });
  it('длительность и склонения', () => {
    expect(formatDuration(245)).toBe('4:05');
    expect(pluralize(1, 'трек', 'трека', 'треков')).toBe('трек');
    expect(pluralize(3, 'трек', 'трека', 'треков')).toBe('трека');
    expect(pluralize(11, 'трек', 'трека', 'треков')).toBe('треков');
    expect(pluralize(22, 'трек', 'трека', 'треков')).toBe('трека');
  });
});

describe('ссылки «Слушать»', () => {
  it.each([
    ['https://music.yandex.ru/album/123', 'yandex'],
    ['https://vk.com/music/album/-2000_1', 'vk'],
    ['https://open.spotify.com/album/xyz', 'spotify'],
    ['https://www.youtube.com/watch?v=1', 'other'],
    ['не ссылка', 'other'],
  ])('%s → %s', (url, service) => expect(detectService(url)).toBe(service));

  it('добавляет https', () => {
    expect(normalizeUrl('music.yandex.ru/album/1')).toBe('https://music.yandex.ru/album/1');
    expect(normalizeUrl('http://vk.com')).toBe('https://vk.com');
  });
});

describe('разбор вставленного треклиста', () => {
  it('нумерация с разделителем и длительности', () => {
    expect(parseTrackLines('1. 15 Step 3:57\n02 - Bodysnatchers (4:02)\nA3. Nude')).toEqual([
      { title: '15 Step', durationSec: 237 },
      { title: 'Bodysnatchers', durationSec: 242 },
      { title: 'Nude' },
    ]);
  });
  it('не портит названия, начинающиеся с цифр', () => {
    expect(parseTrackLines('1999')).toEqual([{ title: '1999' }]);
    expect(parseTrackLines('7 Rings\nThank U, Next')).toEqual([
      { title: '7 Rings' },
      { title: 'Thank U, Next' },
    ]);
  });
  it('нумерация через пробел — только если подряд', () => {
    expect(parseTrackLines('1 Группа крови\n2 Закрой за мной дверь\n3 Война')).toEqual([
      { title: 'Группа крови' },
      { title: 'Закрой за мной дверь' },
      { title: 'Война' },
    ]);
  });
  it('пустые строки пропускаются', () => {
    expect(parseTrackLines('\n  \nТрек\n')).toEqual([{ title: 'Трек' }]);
  });
});
