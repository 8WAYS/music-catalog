// Автозаполнение релиза из iTunes Search API (ADR 0004): поиск альбомов, треклист, обложка.
import { LIMITS, newId, type Release, type ReleaseType, type Track } from '../data/schema';
import { normalize } from '../utils/normalize';

const API = 'https://itunes.apple.com';
export const TIMEOUT_MS = 10_000;
const COVER_PX = 600;

export interface ItunesAlbum {
  id: number;
  title: string;
  artist: string;
  type: ReleaseType;
  year?: number;
  genre?: string;
  trackCount?: number;
  /** Миниатюра для списка результатов */
  thumb?: string;
  /** Обложка 600×600 для сохранения */
  artwork?: string;
  /** Витрина, где найден альбом: us, ru… — треклист запрашиваем там же */
  country: string;
}

export type LookupErrorKind = 'offline' | 'timeout' | 'limit' | 'http';

/** Ошибка с текстом для пользователя: «Load failed» никому ничего не говорит. */
export class LookupError extends Error {
  constructor(
    readonly kind: LookupErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'LookupError';
  }
}

type Fetch = typeof fetch;

interface RawItem {
  wrapperType?: string;
  kind?: string;
  collectionId?: number;
  collectionName?: string;
  artistName?: string;
  releaseDate?: string;
  primaryGenreName?: string;
  trackCount?: number;
  artworkUrl100?: string;
  collectionViewUrl?: string;
  trackName?: string;
  trackNumber?: number;
  discNumber?: number;
  trackTimeMillis?: number;
}

async function getJson(url: string, fetchFn: Fetch): Promise<RawItem[]> {
  let res: Response;
  try {
    res = await fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    // Safari сообщает о таймауте как AbortError
    const name = (e as DOMException)?.name;
    if (name === 'TimeoutError' || name === 'AbortError')
      throw new LookupError('timeout', 'iTunes не отвечает. Попробуй ещё раз или заполни вручную.');
    throw new LookupError('offline', 'Нет связи с iTunes. Проверь интернет или заполни вручную.');
  }
  // iTunes отвечает 403 при превышении лимита (около 20 запросов в минуту)
  if (res.status === 403 || res.status === 429)
    throw new LookupError('limit', 'Слишком много запросов к iTunes — подожди минуту.');
  if (!res.ok) throw new LookupError('http', `iTunes ответил ошибкой ${res.status}. Попробуй позже.`);
  try {
    return ((await res.json()) as { results?: RawItem[] }).results ?? [];
  } catch {
    throw new LookupError('http', 'iTunes прислал непонятный ответ. Попробуй позже.');
  }
}

/** « - EP» и « - Single» в конце названия → тип релиза; суффикс убираем. */
export function parseCollectionName(name: string): { title: string; type: ReleaseType } {
  const m = / - (EP|Single)$/.exec(name);
  if (!m) return { title: name, type: 'album' };
  return { title: name.slice(0, m.index), type: m[1] === 'EP' ? 'ep' : 'single' };
}

/** Размер картинки задаётся в адресе: …/100x100bb.jpg → …/600x600bb.jpg */
export function artworkUrl(url: string | undefined, px: number): string | undefined {
  return url?.replace(/\/\d+x\d+bb\.(jpg|png|webp)$/, `/${px}x${px}bb.$1`);
}

function countryOf(item: RawItem, fallback: string): string {
  try {
    return new URL(item.collectionViewUrl ?? '').pathname.split('/')[1] || fallback;
  } catch {
    return fallback;
  }
}

function toAlbum(item: RawItem, country: string): ItunesAlbum | null {
  if (!item.collectionId || !item.collectionName || !item.artistName) return null;
  const { title, type } = parseCollectionName(item.collectionName);
  const year = Number(item.releaseDate?.slice(0, 4));
  return {
    id: item.collectionId,
    title,
    artist: item.artistName,
    type,
    year: Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : undefined,
    genre: item.primaryGenreName,
    trackCount: item.trackCount,
    thumb: artworkUrl(item.artworkUrl100, 200),
    artwork: artworkUrl(item.artworkUrl100, COVER_PX),
    country: countryOf(item, country.toLowerCase()),
  };
}

/** Кириллица в запросе → сначала российская витрина, иначе американская; пусто — пробуем вторую. */
export function storefronts(term: string): string[] {
  return /[а-яё]/i.test(term) ? ['RU', 'US'] : ['US', 'RU'];
}

/**
 * Поиск альбомов. Версии одного альбома (например, clean и explicit) схлопываются в одну строку.
 */
export async function searchAlbums(
  title: string,
  artist: string,
  fetchFn: Fetch = fetch,
): Promise<ItunesAlbum[]> {
  const term = `${artist} ${title}`.replace(/\s+/g, ' ').trim();
  if (!term) return [];
  for (const country of storefronts(term)) {
    const url = `${API}/search?term=${encodeURIComponent(term)}&entity=album&limit=20&country=${country}`;
    const albums = (await getJson(url, fetchFn))
      .map((item) => toAlbum(item, country))
      .filter((a) => a !== null);
    const seen = new Set<string>();
    const unique = albums.filter((a) => {
      const key = [normalize(a.title), normalize(a.artist), a.year, a.trackCount].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (unique.length) return unique;
  }
  return [];
}

/** Треклист альбома: по дискам и номерам, сквозная нумерация. */
export async function loadTracks(album: ItunesAlbum, fetchFn: Fetch = fetch): Promise<Track[]> {
  const url = `${API}/lookup?id=${album.id}&entity=song&country=${album.country}`;
  const songs = (await getJson(url, fetchFn)).filter((r) => r.wrapperType === 'track' && r.trackName);
  songs.sort(
    (a, b) => (a.discNumber ?? 1) - (b.discNumber ?? 1) || (a.trackNumber ?? 0) - (b.trackNumber ?? 0),
  );
  return songs.map((s, i) => ({
    id: newId(),
    position: i + 1,
    title: s.trackName!,
    ...(s.trackTimeMillis ? { durationSec: Math.round(s.trackTimeMillis / 1000) } : {}),
    favorite: false,
  }));
}

/** Обложка как Blob — дальше её сжимает processCover. */
export async function loadArtwork(album: ItunesAlbum, fetchFn: Fetch = fetch): Promise<Blob | undefined> {
  if (!album.artwork) return undefined;
  let res: Response;
  try {
    res = await fetchFn(album.artwork, { mode: 'cors', signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    return undefined;
  }
  return res.ok ? res.blob() : undefined;
}

/** Поля релиза из найденного альбома (без обложки — её сохраняет редактор). */
export function albumToRelease(album: ItunesAlbum, tracks: Track[]): Partial<Release> {
  return {
    title: album.title.slice(0, LIMITS.title),
    artist: album.artist.slice(0, LIMITS.artist),
    type: album.type,
    ...(album.year ? { year: album.year } : {}),
    tracks,
    itunesId: album.id,
  };
}
