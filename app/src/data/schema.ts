// Модель данных (раздел 4 документации). Структура совпадает с будущими таблицами базы.

export const FORMAT_VERSION = 1;

export const RELEASE_TYPES = ['album', 'ep', 'single'] as const;
export type ReleaseType = (typeof RELEASE_TYPES)[number];

export const TAG_GROUPS = ['mood', 'genre', 'place', 'time', 'other'] as const;
export type TagGroup = (typeof TAG_GROUPS)[number];

export const LINK_SERVICES = ['yandex', 'vk', 'spotify', 'other'] as const;
export type LinkService = (typeof LINK_SERVICES)[number];

export const LIMITS = { title: 200, artist: 200, description: 5000, tagName: 40 } as const;

export const RELEASE_TYPE_LABEL: Record<ReleaseType, string> = { album: 'Альбом', ep: 'EP', single: 'Сингл' };
export const TAG_GROUP_LABEL: Record<TagGroup, string> = {
  mood: 'Настроение',
  genre: 'Жанр',
  place: 'Место',
  time: 'Время',
  other: 'Другое',
};
export const LINK_SERVICE_LABEL: Record<LinkService, string> = {
  yandex: 'Яндекс Музыка',
  vk: 'VK Музыка',
  spotify: 'Spotify',
  other: 'Слушать',
};

export interface CoverColors {
  bg: string;
  accent: string;
  text: string;
}

export interface Track {
  id: string;
  position: number;
  title: string;
  durationSec?: number;
  favorite: boolean;
}

export interface Link {
  service: LinkService;
  url: string;
}

export interface Tag {
  id: string;
  name: string;
  group: TagGroup;
}

export interface Release {
  id: string;
  title: string;
  artist: string;
  type: ReleaseType;
  year?: number;
  cover?: string;
  coverColors?: CoverColors;
  description?: string;
  tagIds: string[];
  tracks: Track[];
  links: Link[];
  mbid?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Catalog {
  version: number;
  revision: number;
  publishedAt: string;
  owner: { name: string };
  tags: Tag[];
  releases: Release[];
}

// ---------- Валидация ----------

export class ValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(issues.join('; '));
    this.name = 'ValidationError';
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_RE = /^#[0-9a-f]{6}$/i;

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isIso = (v: unknown): v is string => isStr(v) && !Number.isNaN(Date.parse(v));

export function isHttpsUrl(v: string): boolean {
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateTag(t: unknown, path = 'tag'): string[] {
  const issues: string[] = [];
  const o = t as Partial<Tag> | null;
  if (!o || typeof o !== 'object') return [`${path}: не объект`];
  if (!isUuid(o.id)) issues.push(`${path}.id: нужен UUID`);
  if (!isStr(o.name) || !o.name.trim()) issues.push(`${path}.name: пусто`);
  else if (o.name.length > LIMITS.tagName) issues.push(`${path}.name: длиннее ${LIMITS.tagName}`);
  if (!TAG_GROUPS.includes(o.group as TagGroup)) issues.push(`${path}.group: неизвестная группа`);
  return issues;
}

export function validateRelease(r: unknown, path = 'release'): string[] {
  const issues: string[] = [];
  const o = r as Partial<Release> | null;
  if (!o || typeof o !== 'object') return [`${path}: не объект`];
  if (!isUuid(o.id)) issues.push(`${path}.id: нужен UUID`);
  if (!isStr(o.title) || !o.title.trim()) issues.push(`${path}.title: обязательное поле`);
  else if (o.title.length > LIMITS.title) issues.push(`${path}.title: длиннее ${LIMITS.title}`);
  if (!isStr(o.artist) || !o.artist.trim()) issues.push(`${path}.artist: обязательное поле`);
  else if (o.artist.length > LIMITS.artist) issues.push(`${path}.artist: длиннее ${LIMITS.artist}`);
  if (!RELEASE_TYPES.includes(o.type as ReleaseType)) issues.push(`${path}.type: неизвестный тип`);
  if (o.year !== undefined && (!Number.isInteger(o.year) || o.year < 1900 || o.year > 2100))
    issues.push(`${path}.year: некорректный год`);
  if (o.cover !== undefined && !isStr(o.cover)) issues.push(`${path}.cover: должна быть строкой`);
  if (o.coverColors !== undefined) {
    const c = o.coverColors;
    if (!c || !HEX_RE.test(c.bg) || !HEX_RE.test(c.accent) || !HEX_RE.test(c.text))
      issues.push(`${path}.coverColors: нужны hex-цвета bg, accent, text`);
  }
  if (o.description !== undefined && (!isStr(o.description) || o.description.length > LIMITS.description))
    issues.push(`${path}.description: длиннее ${LIMITS.description}`);
  if (!Array.isArray(o.tagIds) || !o.tagIds.every(isUuid)) issues.push(`${path}.tagIds: нужен массив UUID`);
  if (!Array.isArray(o.tracks)) issues.push(`${path}.tracks: нужен массив`);
  else
    o.tracks.forEach((t, i) => {
      if (!isUuid(t?.id)) issues.push(`${path}.tracks[${i}].id: нужен UUID`);
      if (!isStr(t?.title)) issues.push(`${path}.tracks[${i}].title: нужна строка`);
      if (!Number.isInteger(t?.position)) issues.push(`${path}.tracks[${i}].position: нужно целое`);
      if (typeof t?.favorite !== 'boolean') issues.push(`${path}.tracks[${i}].favorite: нужно boolean`);
    });
  if (!Array.isArray(o.links)) issues.push(`${path}.links: нужен массив`);
  else
    o.links.forEach((l, i) => {
      if (!LINK_SERVICES.includes(l?.service)) issues.push(`${path}.links[${i}].service: неизвестный сервис`);
      if (!isStr(l?.url) || !isHttpsUrl(l.url)) issues.push(`${path}.links[${i}].url: нужен https-адрес`);
    });
  if (!isIso(o.createdAt)) issues.push(`${path}.createdAt: нужна дата ISO 8601`);
  if (!isIso(o.updatedAt)) issues.push(`${path}.updatedAt: нужна дата ISO 8601`);
  return issues;
}

export function assertValidRelease(r: Release): void {
  const issues = validateRelease(r);
  if (issues.length) throw new ValidationError(issues);
}

export function validateCatalog(c: unknown): string[] {
  const o = c as Partial<Catalog> | null;
  if (!o || typeof o !== 'object') return ['catalog: не объект'];
  const issues: string[] = [];
  if (o.version !== FORMAT_VERSION) issues.push(`version: ожидается ${FORMAT_VERSION}`);
  if (!Number.isInteger(o.revision)) issues.push('revision: нужно целое');
  if (!Array.isArray(o.tags)) issues.push('tags: нужен массив');
  else o.tags.forEach((t, i) => issues.push(...validateTag(t, `tags[${i}]`)));
  if (!Array.isArray(o.releases)) issues.push('releases: нужен массив');
  else o.releases.forEach((r, i) => issues.push(...validateRelease(r, `releases[${i}]`)));
  if (Array.isArray(o.tags) && Array.isArray(o.releases)) {
    const tagIds = new Set(o.tags.map((t) => t.id));
    o.releases.forEach((r, i) =>
      r.tagIds?.forEach((id) => {
        if (!tagIds.has(id)) issues.push(`releases[${i}].tagIds: нет тега ${id}`);
      }),
    );
  }
  return issues;
}

// ---------- Фабрики ----------

export function newId(): string {
  return crypto.randomUUID();
}

export function createRelease(partial: Partial<Release> = {}): Release {
  const now = new Date().toISOString();
  return {
    id: newId(),
    title: '',
    artist: '',
    type: 'album',
    tagIds: [],
    tracks: [],
    links: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export function createTrack(title: string, position: number): Track {
  return { id: newId(), position, title, favorite: false };
}

export function coverPath(releaseId: string, mime: string): string {
  return `covers/${releaseId}.${mime === 'image/webp' ? 'webp' : 'jpg'}`;
}
