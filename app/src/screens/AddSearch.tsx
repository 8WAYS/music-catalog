import { signal } from '@preact/signals';
import { useState } from 'preact/hooks';
import { Icon } from '../components/Icon';
import { RELEASE_TYPE_LABEL } from '../data/schema';
import { processCover } from '../services/image';
import {
  LookupError,
  albumToRelease,
  loadArtwork,
  loadTracks,
  searchAlbums,
  type ItunesAlbum,
} from '../services/itunes';
import { goBack, href, navigate } from '../router';
import { setEditorSeed, toast, type EditorSeed } from '../store/app';
import s from './AddSearch.module.css';

// Состояние живёт между заходами: «Назад» из редактора возвращает к тем же результатам
const title = signal('');
const artist = signal('');
const results = signal<ItunesAlbum[] | null>(null);
const error = signal<string | null>(null);
const searched = signal('');

/** После сохранения нового релиза следующее добавление начинается с чистого листа. */
export function resetAddSearch(): void {
  title.value = artist.value = searched.value = '';
  results.value = error.value = null;
}

/** Добавление: поиск в iTunes (раздел 6.3, ADR 0004). Поиск по кнопке — у iTunes лимит ~20 запросов в минуту. */
export function AddSearch() {
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);
  const term = `${artist.value} ${title.value}`.trim();

  const search = async (e: Event) => {
    e.preventDefault();
    if (!term || busy) return;
    (document.activeElement as HTMLElement | null)?.blur(); // спрятать клавиатуру
    setBusy(true);
    error.value = null;
    try {
      results.value = await searchAlbums(title.value, artist.value);
      searched.value = term;
    } catch (err) {
      results.value = null;
      error.value = err instanceof LookupError ? err.message : 'Поиск не удался. Заполни вручную.';
    } finally {
      setBusy(false);
    }
  };

  const pick = async (album: ItunesAlbum) => {
    if (picking !== null) return;
    setPicking(album.id);
    const seed: EditorSeed = { release: albumToRelease(album, []) };
    const [tracks, artwork] = await Promise.allSettled([loadTracks(album), loadArtwork(album)]);
    if (tracks.status === 'fulfilled') seed.release.tracks = tracks.value;
    else toast('Треклист не загрузился — можно вставить списком', 'error');
    if (artwork.status === 'fulfilled' && artwork.value) {
      try {
        seed.cover = await processCover(artwork.value);
      } catch {
        toast('Обложку обработать не удалось — можно загрузить свою', 'error');
      }
    } else if (album.artwork) toast('Обложка не загрузилась — можно загрузить свою', 'error');
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
            По запросу «{searched.value}» ничего не нашлось. Проверь написание или заполни вручную — в iTunes
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
                  aria-busy={picking === a.id}
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
                  {picking === a.id && <span class={s.loading}>Загружаю…</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div class={s.manual}>
        <button type="button" class="btn" onClick={manual}>
          <Icon name="edit" size={18} /> Заполнить вручную
        </button>
      </div>
    </div>
  );
}
