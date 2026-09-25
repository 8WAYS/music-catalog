/** Нормализация строки для поиска и сравнения: регистр, ё/е, лишние пробелы. */
export function normalize(s: string): string {
  return s.toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

/** Инициалы для плейсхолдера обложки: «In Rainbows» → «IR». */
export function initials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => [...w][0] ?? '');
  return letters.join('').toLocaleUpperCase('ru') || '♪';
}

/** Стабильный оттенок 0–359 из строки (для плейсхолдера обложки). */
export function hueFromString(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return h % 360;
}

export function pluralize(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export function formatDuration(sec?: number): string {
  if (sec === undefined) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
