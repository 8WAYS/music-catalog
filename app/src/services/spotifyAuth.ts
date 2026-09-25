// Вход через Spotify без бэкенда: Authorization Code + PKCE (ADR 0010) — без client secret,
// он не хранится нигде, ни на устройстве, ни в коде.
import type { MetaKey, MetaValues } from '../data/repository';

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const CLIENT_ID_KEY = 'spotifyPkceClientId';
const VERIFIER_KEY = 'spotifyPkceVerifier';
const STATE_KEY = 'spotifyPkceState';
/** Токен обновляем на минуту раньше срока — не впритык */
const EXPIRY_MARGIN_MS = 60_000;
export const TIMEOUT_MS = 10_000;

export class SpotifyAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpotifyAuthError';
  }
}

/** Что нужно от хранилища (LocalSource). */
export interface TokenStore {
  getMeta<K extends MetaKey>(key: K): Promise<MetaValues[K] | undefined>;
  setMeta<K extends MetaKey>(key: K, value: MetaValues[K]): Promise<void>;
}

function randomString(len: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function base64url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(digest);
}

/** Адрес возврата — тот же, на котором открыто приложение, без пути и хэша: его надо один в один
 * зарегистрировать в дев- и прод-версии в кабинете Spotify (ADR 0010). */
export function redirectUri(): string {
  return location.origin + location.pathname;
}

/** Начинает вход: редирект на страницу авторизации Spotify. Client ID — только что введённый, ещё не сохранён. */
export async function startAuth(clientId: string): Promise<void> {
  const verifier = randomString(64);
  const state = randomString(16);
  sessionStorage.setItem(CLIENT_ID_KEY, clientId);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: await challengeFor(verifier),
    state,
    // Поиск и треклисты — общедоступные данные каталога, пользовательский scope не нужен
    scope: '',
  });
  location.href = `${AUTHORIZE_URL}?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  error?: string;
  error_description?: string;
}

async function requestToken(body: URLSearchParams): Promise<TokenResponse> {
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new SpotifyAuthError('Нет связи со Spotify — попробуй ещё раз.');
  }
  const data = (await res.json().catch(() => null)) as TokenResponse | null;
  if (!res.ok || !data?.access_token)
    throw new SpotifyAuthError(data?.error_description || 'Spotify отклонил запрос — проверь Client ID.');
  return data;
}

async function storeTokens(store: TokenStore, clientId: string, data: TokenResponse): Promise<void> {
  await store.setMeta('spotifyClientId', clientId);
  await store.setMeta('spotifyAccessToken', data.access_token);
  if (data.refresh_token) await store.setMeta('spotifyRefreshToken', data.refresh_token);
  await store.setMeta('spotifyTokenExpiresAt', Date.now() + data.expires_in * 1000);
}

/**
 * Обрабатывает возврат со страницы авторизации Spotify: `?code=…&state=…` — обычная query-строка
 * в адресе, не хэш, поэтому не пересекается с hash-роутером. Вызывается один раз при старте
 * приложения, до остальной инициализации.
 */
export async function handleAuthCallback(store: TokenStore): Promise<void> {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  if (!code) return;
  const state = params.get('state');
  const clientId = sessionStorage.getItem(CLIENT_ID_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  const expectedState = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(CLIENT_ID_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  // ?code=… убираем из адреса в любом случае — иначе перезагрузка страницы повторит обмен
  history.replaceState(null, '', location.pathname + location.hash);
  if (!code || !clientId || !verifier || !state || state !== expectedState) return;
  try {
    const data = await requestToken(
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri(),
        client_id: clientId,
        code_verifier: verifier,
      }),
    );
    await storeTokens(store, clientId, data);
  } catch {
    // Тихо: не получилось — в настройках просто останется «не подключено», попробует снова
  }
}

/** Годный access-токен — тихо обновляет, если он вот-вот истечёт. null — не подключено или рефреш не удался. */
export async function getValidToken(store: TokenStore): Promise<string | null> {
  const [token, expiresAt, refreshToken, clientId] = await Promise.all([
    store.getMeta('spotifyAccessToken'),
    store.getMeta('spotifyTokenExpiresAt'),
    store.getMeta('spotifyRefreshToken'),
    store.getMeta('spotifyClientId'),
  ]);
  if (!token || !clientId) return null;
  if (expiresAt && Date.now() < expiresAt - EXPIRY_MARGIN_MS) return token;
  if (!refreshToken) return null;
  try {
    const data = await requestToken(
      new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId }),
    );
    await storeTokens(store, clientId, data);
    return data.access_token;
  } catch {
    return null;
  }
}

export async function isConnected(store: TokenStore): Promise<boolean> {
  return !!(await store.getMeta('spotifyAccessToken'));
}

/** Отключить: убрать токены и Client ID с устройства. */
export async function disconnect(store: TokenStore): Promise<void> {
  await store.setMeta('spotifyAccessToken', '');
  await store.setMeta('spotifyRefreshToken', '');
  await store.setMeta('spotifyClientId', '');
  await store.setMeta('spotifyTokenExpiresAt', 0);
}
