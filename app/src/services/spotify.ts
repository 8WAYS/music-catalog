// Автозаполнение релиза из Spotify Web API (ADR 0010): поиск альбомов и треклист.
// Обложка не загружается — у i.scdn.co/spotifycdn.com нет CORS для fetch (проверено), только
// для <img>; частичный успех лучше отказа (ADR 0006, п.3) — редактор открывается без обложки.
import { LIMITS, newId, type Release, type ReleaseType, type Track } from '../data/schema';

const API = 'https://api.spotify.com/v1';
export const TIMEOUT_MS = 10_000;

export interface SpotifyAlbum {
  id: string;
  title: string;
  artist: string;
  type: ReleaseType;
  year?: number;
  trackCount?: number;
  /** Миниатюра для списка результатов */
  thumb?: string;
}

export type SpotifyErrorKind = 'offline' | 'timeout' | 'authExpired' | 'limit' | 'http';

/** Ошибка с текстом для пользователя. */
export class SpotifyError extends Error {
  constructor(
    readonly kind: SpotifyErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'SpotifyError';
  }
}

type Fetch = typeof fetch;

interface RawImage {
  url: string;
  width?: number;
  height?: number;
}
interface RawAlbum {
  id: string;
  name: string;
  artists?: { name: string }[];
  release_date?: string;
  total_tracks?: number;
  album_type?: string;
  images?: RawImage[];
}
interface RawTrack {
  name: string;
  track_number?: number;
  disc_number?: number;
  duration_ms?: number;
}

/**
 * Текст ошибки для человека. Обычный ответ Web API — {error: {status, message}}, message часто
 * прямо называет причину (например, что приложение в Development Mode и аккаунт не в списке
 * пользователей). Но 403 бывает и с CDN/защиты Spotify ещё до самого API — тогда тело не JSON,
 * а HTML; в этом случае показываем сырой текст, чтобы было по чему разбираться дальше.
 */
async function errorDetail(res: Response): Promise<string> {
  const fallback = `Spotify ответил ошибкой ${res.status}. Попробуй позже.`;
  let text: string;
  try {
    text = await res.text();
  } catch {
    return fallback;
  }
  if (!text.trim()) return fallback;
  try {
    const body = JSON.parse(text) as { error?: { message?: string } | string };
    const reason = typeof body.error === 'string' ? body.error : body.error?.message;
    return reason ? `Spotify отказал (${res.status}): ${reason}` : fallback;
  } catch {
    return `Spotify отказал (${res.status}): ${text.slice(0, 200)}`;
  }
}

async function call<T>(url: string, token: string, fetchFn: Fetch): Promise<T> {
  let res: Response;
  try {
    res = await fetchFn(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const name = (e as DOMException)?.name;
    if (name === 'TimeoutError' || name === 'AbortError')
      throw new SpotifyError('timeout', 'Spotify не отвечает. Попробуй ещё раз или заполни вручную.');
    throw new SpotifyError('offline', 'Нет связи со Spotify. Проверь интернет или заполни вручную.');
  }
  if (res.status === 401)
    throw new SpotifyError('authExpired', 'Вход в Spotify истёк — зайди заново в настройках.');
  if (res.status === 429)
    throw new SpotifyError('limit', 'Слишком много запросов к Spotify — подожди немного.');
  if (!res.ok) throw new SpotifyError('http', await errorDetail(res));
  try {
    return (await res.json()) as T;
  } catch {
    throw new SpotifyError('http', 'Spotify прислал непонятный ответ. Попробуй позже.');
  }
}

/** Тип релиза Spotify не различает EP отдельно от сингла — оставляем на правку владельцу в редакторе. */
function releaseType(albumType: string | undefined): ReleaseType {
  return albumType === 'single' ? 'single' : 'album';
}

function toAlbum(item: RawAlbum): SpotifyAlbum | null {
  if (!item.id || !item.name || !item.artists?.length) return null;
  const year = Number(item.release_date?.slice(0, 4));
  const images = item.images ?? [];
  return {
    id: item.id,
    title: item.name,
    artist: item.artists.map((a) => a.name).join(', '),
    type: releaseType(item.album_type),
    year: Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : undefined,
    trackCount: item.total_tracks,
    // Изображения отсортированы от большего к меньшему — последнее обычно самое маленькое
    thumb: images.at(-1)?.url,
  };
}

/** Поиск альбомов по названию и исполнителю. */
export async function searchAlbums(
  title: string,
  artist: string,
  token: string,
  fetchFn: Fetch = fetch,
): Promise<SpotifyAlbum[]> {
  const term = `${artist} ${title}`.replace(/\s+/g, ' ').trim();
  if (!term) return [];
  const url = `${API}/search?q=${encodeURIComponent(term)}&type=album&limit=20`;
  const data = await call<{ albums?: { items: RawAlbum[] } }>(url, token, fetchFn);
  return (data.albums?.items ?? []).map(toAlbum).filter((a) => a !== null);
}

/** Треклист альбома: по дискам и номерам, сквозная нумерация; страницы по 50 треков. */
export async function loadTracks(
  album: SpotifyAlbum,
  token: string,
  fetchFn: Fetch = fetch,
): Promise<Track[]> {
  const items: RawTrack[] = [];
  let url: string | null = `${API}/albums/${album.id}/tracks?limit=50`;
  while (url) {
    const page: { items: RawTrack[]; next: string | null } = await call(url, token, fetchFn);
    items.push(...page.items);
    url = page.next;
  }
  items.sort(
    (a, b) => (a.disc_number ?? 1) - (b.disc_number ?? 1) || (a.track_number ?? 0) - (b.track_number ?? 0),
  );
  return items.map((t, i) => ({
    id: newId(),
    position: i + 1,
    title: t.name,
    ...(t.duration_ms ? { durationSec: Math.round(t.duration_ms / 1000) } : {}),
    favorite: false,
  }));
}

/** Поля релиза из найденного альбома (без обложки — её нет смысла запрашивать, см. заголовок файла). */
export function albumToRelease(album: SpotifyAlbum, tracks: Track[]): Partial<Release> {
  return {
    title: album.title.slice(0, LIMITS.title),
    artist: album.artist.slice(0, LIMITS.artist),
    type: album.type,
    ...(album.year ? { year: album.year } : {}),
    tracks,
    spotifyId: album.id,
  };
}
