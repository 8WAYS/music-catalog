import { useState } from 'preact/hooks';
import { redirectUri, startAuth, SpotifyAuthError } from '../services/spotifyAuth';
import { confirmDialog, toast, toastError } from '../store/app';
import { disconnectSpotify, spotifyConnected } from '../store/spotify';
import s from './SpotifySettings.module.css';

/** Подключение Spotify как второго источника автозаполнения (ADR 0010): вход через PKCE, без секрета. */
export function SpotifySettings() {
  const [clientId, setClientId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const connect = async (e: Event) => {
    e.preventDefault();
    setError('');
    const id = clientId.trim();
    if (!id) {
      setError('Вставь Client ID из кабинета Spotify');
      return;
    }
    setBusy(true);
    try {
      await startAuth(id); // редиректит на Spotify — до возврата код ниже не выполнится
    } catch (err) {
      setBusy(false);
      setError(err instanceof SpotifyAuthError ? err.message : 'Не получилось начать вход в Spotify');
    }
  };

  const disconnect = async () => {
    const ok = await confirmDialog({
      title: 'Отключить Spotify?',
      text: 'Поиск и автозаполнение останутся только через iTunes.',
      confirm: 'Отключить',
      danger: true,
    });
    if (!ok) return;
    try {
      await disconnectSpotify();
      toast('Spotify отключён');
    } catch (e) {
      toastError(e);
    }
  };

  if (spotifyConnected.value)
    return (
      <div class={s.actions}>
        <p class={s.muted}>Подключено — при добавлении релиза можно искать и в Spotify.</p>
        <p class={s.hint}>
          Поиск отвечает, только если на аккаунте, где создано приложение в кабинете Spotify, есть Premium —
          иначе Spotify отказывает всем запросам (ограничение самого Spotify, ADR 0010).
        </p>
        <button type="button" class="btn" onClick={() => void disconnect()}>
          Отключить
        </button>
      </div>
    );

  return (
    <form class={s.form} onSubmit={connect}>
      <p class={s.hint}>
        Ищет альбомы и треклисты в Spotify — вдобавок к iTunes (обложки Spotify не отдаёт напрямую браузеру,
        останутся из iTunes или свои). Нужна активная <strong>Spotify Premium</strong> на аккаунте, где
        создано приложение в кабинете, — без неё Spotify отказывает всем запросам поиска. Создай приложение на{' '}
        <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer">
          developer.spotify.com
        </a>{' '}
        и добавь в Redirect URIs: <code>{redirectUri()}</code>
      </p>
      <label class="field">
        <span>Client ID</span>
        <input
          class="input"
          value={clientId}
          onInput={(e) => setClientId(e.currentTarget.value)}
          placeholder="из кабинета Spotify"
          autoComplete="off"
          autoCapitalize="off"
          spellcheck={false}
        />
      </label>
      {error && (
        <p class={s.error} role="alert">
          {error}
        </p>
      )}
      <button type="submit" class="btn btn-primary" disabled={busy}>
        {busy ? 'Открываю Spotify…' : 'Войти через Spotify'}
      </button>
    </form>
  );
}
