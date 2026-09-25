// Локальный поиск, фильтры и сортировки главной (раздел 9, этап 3). Чистые функции — без DOM и хранилища.
import { TAG_GROUPS, type Release, type Tag } from '../data/schema';
import { normalize } from '../utils/normalize';

export const SORT_KEYS = ['added', 'year', 'title'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export const SORT_LABEL: Record<SortKey, string> = {
  added: 'Сначала новые',
  year: 'По году',
  title: 'По названию',
};

export interface Filters {
  q: string;
  tagIds: string[];
  sort: SortKey;
}

export const EMPTY_FILTERS: Filters = { q: '', tagIds: [], sort: 'added' };

// ---------- Поиск ----------

// Релиз при изменении заменяется новым объектом, поэтому WeakMap сам сбрасывает устаревшие строки
const haystacks = new WeakMap<Release, string>();

/** Нормализованный текст релиза: название, исполнитель, описание, треки. */
export function haystack(r: Release): string {
  let h = haystacks.get(r);
  if (h === undefined) {
    h = normalize([r.title, r.artist, r.description ?? '', ...r.tracks.map((t) => t.title)].join('\n'));
    haystacks.set(r, h);
  }
  return h;
}

/** Все слова запроса должны встретиться в тексте релиза (в любом порядке и месте). */
export function matchesQuery(r: Release, q: string): boolean {
  const words = normalize(q).split(' ').filter(Boolean);
  if (!words.length) return true;
  const h = haystack(r);
  return words.every((w) => h.includes(w));
}

/** Несколько тегов — пересечение: у релиза должны быть все выбранные. */
export function hasAllTags(r: Release, tagIds: string[]): boolean {
  return tagIds.every((id) => r.tagIds.includes(id));
}

const collator = new Intl.Collator('ru', { sensitivity: 'base', numeric: true });

export function sortReleases(list: Release[], sort: SortKey): Release[] {
  const byAdded = (a: Release, b: Release) => b.createdAt.localeCompare(a.createdAt);
  const out = [...list];
  if (sort === 'added') return out.sort(byAdded);
  if (sort === 'title')
    return out.sort((a, b) => collator.compare(a.title, b.title) || collator.compare(a.artist, b.artist));
  // По году: новые сверху, без года — в конце
  return out.sort((a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity) || byAdded(a, b));
}

/** Текущая выборка главной. */
export function selectReleases(list: Release[], f: Filters): Release[] {
  return sortReleases(
    list.filter((r) => hasAllTags(r, f.tagIds) && matchesQuery(r, f.q)),
    f.sort,
  );
}

/**
 * Чипы для ленты: выбранные и те, что встречаются в выборке (иначе нажатие даст пустой результат).
 * Порядок — по группам (раздел 4.3), внутри группы — по частоте, затем по имени.
 */
export function chipTags(tags: Tag[], selection: Release[], selected: string[]): Tag[] {
  const count = new Map<string, number>();
  for (const r of selection) for (const id of r.tagIds) count.set(id, (count.get(id) ?? 0) + 1);
  return tags
    .filter((t) => selected.includes(t.id) || count.has(t.id))
    .sort(
      (a, b) =>
        TAG_GROUPS.indexOf(a.group) - TAG_GROUPS.indexOf(b.group) ||
        (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0) ||
        collator.compare(a.name, b.name),
    );
}

/** «Удиви меня»: кадры перелистывания — до трёх случайных других релизов выборки и выбранный последним. */
export function shuffleFrames(pool: Release[], pick: Release, random = Math.random): Release[] {
  const others = pool.filter((r) => r.id !== pick.id);
  const out: Release[] = [];
  for (let k = 0; k < 3 && others.length; k++) {
    // Без повторов подряд, если есть из чего выбирать
    const candidates = others.length > 1 ? others.filter((r) => r !== out[out.length - 1]) : others;
    out.push(candidates[Math.floor(random() * candidates.length)]!);
  }
  return [...out, pick];
}

// ---------- Фильтры в адресе: #/?tags=осень,вечер&q=…&sort=year ----------

/**
 * Теги в адресе — по именам (они уникальны без учёта регистра), чтобы ссылку на выборку можно было прочитать.
 * Незнакомые имена пропускаются.
 */
export function parseFilters(query: string, tags: Tag[]): Filters {
  const byName = new Map(tags.map((t) => [normalize(t.name), t.id]));
  let q = '';
  let sort: SortKey = 'added';
  const tagIds: string[] = [];
  for (const part of query.replace(/^\?/, '').split('&')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq);
    const raw = part.slice(eq + 1);
    const decode = (s: string) => {
      try {
        return decodeURIComponent(s.replace(/\+/g, ' '));
      } catch {
        return s;
      }
    };
    if (key === 'q') q = decode(raw);
    else if (key === 'sort') {
      const v = decode(raw);
      if ((SORT_KEYS as readonly string[]).includes(v)) sort = v as SortKey;
    } else if (key === 'tags') {
      // Запятая разделяет имена; запятая внутри имени закодирована как %2C
      for (const name of raw.split(',')) {
        const id = byName.get(normalize(decode(name)));
        if (id && !tagIds.includes(id)) tagIds.push(id);
      }
    }
  }
  return { q, tagIds, sort };
}

export function filtersHash(f: Filters, tags: Tag[]): string {
  const byId = new Map(tags.map((t) => [t.id, t.name]));
  const names = f.tagIds.map((id) => byId.get(id)).filter((n) => n !== undefined);
  const parts: string[] = [];
  if (names.length) parts.push('tags=' + names.map(encodeURIComponent).join(','));
  if (f.q) parts.push('q=' + encodeURIComponent(f.q));
  if (f.sort !== 'added') parts.push('sort=' + f.sort);
  return '#/' + (parts.length ? '?' + parts.join('&') : '');
}
