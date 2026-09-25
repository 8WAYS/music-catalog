import { signal } from '@preact/signals';
import { useState } from 'preact/hooks';
import { Icon } from '../components/Icon';
import { RELEASE_TYPE_LABEL, type Release, type Track } from '../data/schema';
import { processCover } from '../services/image';
import {
  LookupError,
  albumToRelease as itunesAlbumToRelease,
  loadArtwork as itunesLoadArtwork,
  loadTracks as itunesLoadTracks,
  searchAlbums as itunesSearchAlbums,
  type ItunesAlbum,
} from '../services/itunes';
import {
  SpotifyError,
  albumToRelease as spotifyAlbumToRelease,
  loadTracks as spotifyLoadTracks,
  searchAlbums as spotifySearchAlbums,
  type SpotifyAlbum,
} from '../services/spotify';
import { getValidToken } from '../services/spotifyAuth';
import { goBack, href, navigate } from '../router';
import { repo, setEditorSeed, toast, type EditorSeed } from '../store/app';
import { spotifyConnected } from '../store/spotify';
import s from './AddSearch.module.css';

type Source = 'itunes' | 'spotify';
type Album = ItunesAlbum | SpotifyAlbum;

const SOURCE_KEY = 'addSource';
function readSource(): Source {
  try {
    return localStorage.getItem(SOURCE_KEY) === 'spotify' ? 'spotify' : 'itunes';
  } catch {
    return 'itunes';
  }
}

// Состояние живёт между заходами: «Назад» из редактора возвращает к тем же результатам
const source = signal<Source>(readSource());
const title = signal('');
const artist = signal('');
const results = signal<Album[] | null>(null);
const error = signal<string | null>(null);
const searched = signal('');

/** После сохранения нового релиза следующее добавление начинается с чистого листа. */
export function resetAddSearch(): void {
  title.value = artist.value = searched.value = '';
  results.value = error.value = null;
}

function setSource(next: Source): void {
  if (next === source.value) return;
  source.value = next;
  results.value = error.value = null;
  searched.value = '';
  try {
    localStorage.setItem(SOURCE_KEY, next);
  } catch {
    /* хранилище недоступно — выбор живёт до перезагрузки */
  }
}

/** Адаптер источника — одинаковый набор шагов для iTunes и Spotify (ADR 0004, ADR 0010). */
interface Provider {
  search(title: string, artist: string): Promise<Album[]>;
  loadTracks(album: Album): Promise<Track[]>;
  loadArtwork(album: Album): Promise<Blob | undefined>;
  toRelease(album: Album, tracks: Track[]): Partial<Release>;
  errorMessage(e: unknown): string;
}

const itunesProvider: Provider = {
  search: (t, a) => itunesSearchAlbums(t, a),
  loadTracks: (album) => itunesLoadTracks(album as ItunesAlbum),
  loadArtwork: (album) => itunesLoadArtwork(album as ItunesAlbum),
  toRelease: (album, tracks) => itunesAlbumToRelease(album as ItunesAlbum, tracks),
  errorMessage: (e) => (e instanceof LookupError ? e.message : 'Поиск не удался. Заполни вручную.'),
};

/** null — Spotify не подключён (зайди в настройках). Обложку Spotify не отдаёт браузеру (ADR 0010). */
async function spotifyProvider(): Promise<Provider | null> {
  const token = await getValidToken(repo());
  if (!token) return null;
  return {
    search: (t, a) => spotifySearchAlbums(t, a, token),
    loadTracks: (album) => spotifyLoadTracks(album as SpotifyAlbum, token),
    loadArtwork: async () => undefined,
    toRelease: (album, tracks) => spotifyAlbumToRelease(album as SpotifyAlbum, tracks),
    errorMessage: (e) => (e instanceof SpotifyError ? e.message : 'Поиск не удался. Заполни вручную.'),
  };
}

/** Добавление: поиск в iTunes или Spotify. Поиск по кнопке — у обоих есть лимит запросов в минуту. */
export function AddSearch() {
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const term = `${artist.value} ${title.value}`.trim();
  const spotifyReady = spotifyConnected.value;

  const search = async (e: Event) => {
    e.preventDefault();
    if (!term || busy) return;
    (document.activeElement as HTMLElement | null)?.blur(); // спрятать клавиатуру
    setBusy(true);
    error.value = null;
    try {
      const provider = source.value === 'itunes' ? itunesProvider : await spotifyProvider();
      if (!provider) {
        error.value = 'Вход в Spotify истёк или не выполнен — зайди в настройках.';
        return;
      }
      try {
        results.value = await provider.search(title.value, artist.value);
        searched.value = term;
      } catch (err) {
        results.value = null;
        error.value = provider.errorMessage(err);
      }
    } finally {
      setBusy(false);
    }
  };

  const pick = async (album: Album) => {
    if (picking !== null) return;
    setPicking(String(album.id));
    const provider = source.value === 'itunes' ? itunesProvider : await spotifyProvider();
    if (!provider) {
      toast('Вход в Spotify истёк — зайди заново в настройках', 'error');
      setPicking(null);
      return;
    }
    const seed: EditorSeed = { release: provider.toRelease(album, []) };
    const [tracks, artwork] = await Promise.allSettled([
      provider.loadTracks(album),
      provider.loadArtwork(album),
    ]);
    if (tracks.status === 'fulfilled') seed.release.tracks = tracks.value;
    else toast('Треклист не загрузился — можно вставить списком', 'error');
    if (artwork.status === 'fulfilled' && artwork.value) {
      try {
        seed.cover = await processCover(artwork.value);
      } catch {
        toast('Обложку обработать не удалось — можно загрузить свою', 'error');
      }
    } else if (source.value === 'itunes' && (album as ItunesAlbum).artwork) {
      toast('Обложка не загрузилась — можно загрузить свою', 'error');
    }
    setEditorSeed(seed);
    setPicking(null);
    navigate(href.new());
  };

  const manual = () => {
    const t = title.value.trim();
    const a = artist.value.trim();
    setEditorSeed(t || a ? { release: { title: t, artist: a } } : null);
    navigate(href.new());
  };

  return (
    <div class="page">
      <header class="topbar">
        <button type="button" class="icon-btn" onClick={() => goBack()} aria-label="Назад">
          <Icon name="back" />
        </button>
        <h1>Добавить релиз</h1>
      </header>

      <div class={s.sourceRow} role="radiogroup" aria-label="Источник">
        <button
          type="button"
          role="radio"
          aria-checked={source.value === 'itunes'}
          class={s.sourceBtn}
          onClick={() => setSource('itunes')}
        >
          iTunes
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={source.value === 'spotify'}
          class={s.sourceBtn}
          onClick={() => setSource('spotify')}
        >
          Spotify
        </button>
      </div>

      {source.value === 'spotify' && !spotifyReady ? (
        <p class={s.muted}>
          Spotify не подключён — зайди в{' '}
          <a href={href.settings()} onClick={(e) => (e.preventDefault(), navigate(href.settings()))}>
            настройках
          </a>
          .
        </p>
      ) : (
        <>
          <form class={s.form} onSubmit={search} role="search">
            <label class="field">
              <span>Альбом или сингл</span>
              <input
                class="input"
                value={title.value}
                onInput={(e) => (title.value = e.currentTarget.value)}
                autoFocus={!results.value}
                enterKeyHint="search"
                autoComplete="off"
              />
            </label>
            <label class="field">
              <span>Исполнитель</span>
              <input
                class="input"
                value={artist.value}
                onInput={(e) => (artist.value = e.currentTarget.value)}
                enterKeyHint="search"
                autoComplete="off"
              />
            </label>
            <button type="submit" class="btn btn-primary" disabled={!term || busy}>
              <Icon name="search" size={18} /> {busy ? 'Ищу…' : 'Найти'}
            </button>
          </form>

          <div aria-live="polite">
            {error.value && <p class={s.error}>{error.value}</p>}

            {results.value?.length === 0 && (
              <p class={s.muted}>
                По запросу «{searched.value}» ничего не нашлось. Проверь написание или заполни вручную — тут
                есть не всё.
              </p>
            )}

            {!!results.value?.length && (
              <ul class={s.results} aria-label="Результаты поиска">
                {results.value.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      class={s.result}
                      onClick={() => void pick(a)}
                      disabled={picking !== null}
                      aria-busy={picking === String(a.id)}
                    >
                      <span class={s.thumb}>
                        {a.thumb && <img src={a.thumb} alt="" loading="lazy" decoding="async" />}
                      </span>
                      <span class={s.text}>
                        <span class={s.name}>{a.title}</span>
                        <span class={s.meta}>{a.artist}</span>
                        <span class={s.meta}>
                          {[a.year, RELEASE_TYPE_LABEL[a.type], a.trackCount && `${a.trackCount} тр.`]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      {picking === String(a.id) && <span class={s.loading}>Загружаю…</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <div class={s.manual}>
        <button type="button" class="btn" onClick={manual}>
          <Icon name="edit" size={18} /> Заполнить вручную
        </button>
      </div>
    </div>
  );
}
