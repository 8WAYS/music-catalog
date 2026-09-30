import { useState } from 'preact/hooks';
import { LINK_SERVICE_LABEL, isHttpsUrl, type Link } from '../data/schema';
import { SpotifyError, searchAlbums } from '../services/spotify';
import { getValidToken } from '../services/spotifyAuth';
import {
  detectService,
  normalizeUrl,
  spotifyAlbumUrl,
  vkSearchUrl,
  yandexSearchUrl,
} from '../services/links';
import { repo } from '../store/app';
import { spotifyConnected } from '../store/spotify';
import { Icon } from './Icon';
import s from './LinksEditor.module.css';

interface Props {
  value: Link[];
  onChange: (links: Link[]) => void;
  /** Для поиска ссылок на других площадках — название и артист уже известны из карточки. */
  title: string;
  artist: string;
  /** Релиз добавлен через поиск по Spotify (services/spotify.ts) — ссылку можно построить
   * напрямую по id, без похода в поиск. */
  spotifyId?: string;
}

/** Ссылки «Слушать» (F-07): сервис распознаётся по домену. Кнопки поиска на других площадках —
 * ADR 0014: точного кросс-платформенного сопоставления треков без своего бэкенда не существует
 * (song.link/Odesli публично недоступен), поэтому Spotify ищем по-настоящему (свой Web API поиск),
 * а для Яндекс/VK просто открываем их поиск с готовым текстом — ссылку выбирает сам человек. */
export function LinksEditor({ value, onChange, title, artist, spotifyId }: Props) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [spotifyBusy, setSpotifyBusy] = useState(false);
  const [spotifyError, setSpotifyError] = useState('');

  const add = () => {
    const url = normalizeUrl(draft);
    if (!url) return;
    if (!isHttpsUrl(url)) {
      setError('Нужна ссылка вида https://…');
      return;
    }
    onChange([...value, { service: detectService(url), url }]);
    setDraft('');
    setError('');
  };

  const hasService = (service: Link['service']) => value.some((l) => l.service === service);
  const query = `${artist} ${title}`.replace(/\s+/g, ' ').trim();

  const findSpotify = async () => {
    if (spotifyBusy) return;
    setSpotifyBusy(true);
    setSpotifyError('');
    try {
      let url: string;
      if (spotifyId) {
        url = spotifyAlbumUrl(spotifyId);
      } else {
        const token = await getValidToken(repo());
        if (!token) {
          setSpotifyError('Вход в Spotify истёк — зайди заново в настройках.');
          return;
        }
        const [album] = await searchAlbums(title, artist, token);
        if (!album) {
          setSpotifyError('Ничего не нашлось на Spotify. Добавь ссылку вручную.');
          return;
        }
        url = spotifyAlbumUrl(album.id);
      }
      onChange([...value, { service: 'spotify', url }]);
    } catch (e) {
      setSpotifyError(e instanceof SpotifyError ? e.message : 'Поиск не удался. Заполни вручную.');
    } finally {
      setSpotifyBusy(false);
    }
  };

  return (
    <div class={s.wrap}>
      {value.map((l, i) => (
        <div key={i} class={s.item}>
          <span class={s.badge} data-service={l.service}>
            {LINK_SERVICE_LABEL[l.service]}
          </span>
          <span class={s.url}>{l.url.replace(/^https:\/\/(www\.)?/, '')}</span>
          <button
            type="button"
            class="icon-btn"
            aria-label={`Удалить ссылку ${LINK_SERVICE_LABEL[l.service]}`}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
      ))}
      <div class={s.add}>
        <input
          class="input"
          type="url"
          inputMode="url"
          placeholder="Ссылка на Яндекс Музыку, VK, Spotify…"
          aria-label="Добавить ссылку"
          value={draft}
          onInput={(e) => {
            setDraft(e.currentTarget.value);
            setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" class="btn" onClick={add} disabled={!draft.trim()}>
          Добавить
        </button>
      </div>
      {error && (
        <p class={s.error} role="alert">
          {error}
        </p>
      )}
      {query && (
        <div class={s.search}>
          {!hasService('spotify') && (spotifyConnected.value || !!spotifyId) && (
            <button type="button" class="btn" onClick={() => void findSpotify()} disabled={spotifyBusy}>
              <Icon name="search" size={18} />
              {spotifyBusy ? 'Ищу…' : 'Найти на Spotify'}
            </button>
          )}
          {!hasService('yandex') && (
            <a class="btn" href={yandexSearchUrl(query)} target="_blank" rel="noopener noreferrer">
              <Icon name="search" size={18} />
              Искать на Яндекс Музыке
            </a>
          )}
          {!hasService('vk') && (
            <a class="btn" href={vkSearchUrl(query)} target="_blank" rel="noopener noreferrer">
              <Icon name="search" size={18} />
              Искать в VK Музыке
            </a>
          )}
        </div>
      )}
      {spotifyError && (
        <p class={s.error} role="alert">
          {spotifyError}
        </p>
      )}
    </div>
  );
}
