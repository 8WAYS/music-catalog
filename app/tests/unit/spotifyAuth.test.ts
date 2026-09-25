import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SpotifyAuthError,
  disconnect,
  getValidToken,
  handleAuthCallback,
  isConnected,
  redirectUri,
  startAuth,
} from '../../src/services/spotifyAuth';

/** Хранилище meta в памяти — тот же интерфейс, что у LocalSource.getMeta/setMeta. */
function fakeStore() {
  const data = new Map<string, unknown>();
  return {
    getMeta: (key: string) => Promise.resolve(data.get(key)),
    setMeta: (key: string, value: unknown) => {
      data.set(key, value);
      return Promise.resolve();
    },
    data,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  sessionStorage.clear();
  history.pushState({}, '', '/');
});

function mockTokenEndpoint(respond: (params: URLSearchParams) => unknown) {
  global.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    const params = new URLSearchParams(init?.body as string);
    const body = respond(params);
    return new Response(JSON.stringify(body), {
      status: body && (body as { error?: string }).error ? 400 : 200,
    });
  }) as typeof fetch;
}

describe('startAuth', () => {
  it('кладёт verifier/state/clientId в sessionStorage перед редиректом', async () => {
    // location.href = … в jsdom не настоящая навигация — просто проверяем побочный эффект
    await startAuth('my-client-id').catch(() => {});
    expect(sessionStorage.getItem('spotifyPkceClientId')).toBe('my-client-id');
    expect(sessionStorage.getItem('spotifyPkceVerifier')).toMatch(/^[A-Za-z0-9]{64}$/);
    expect(sessionStorage.getItem('spotifyPkceState')).toMatch(/^[A-Za-z0-9]{16}$/);
  });
});

describe('handleAuthCallback', () => {
  beforeEach(() => {
    sessionStorage.setItem('spotifyPkceClientId', 'client-1');
    sessionStorage.setItem('spotifyPkceVerifier', 'verifier-1');
    sessionStorage.setItem('spotifyPkceState', 'state-1');
  });

  it('без code в адресе — не трогает сеть и sessionStorage', async () => {
    let called = false;
    global.fetch = (async () => {
      called = true;
      return new Response('{}');
    }) as typeof fetch;
    const store = fakeStore();
    await handleAuthCallback(store);
    expect(called).toBe(false);
    expect(sessionStorage.getItem('spotifyPkceVerifier')).toBe('verifier-1');
  });

  it('верный code и state — меняет на токены, чистит адрес и sessionStorage', async () => {
    history.pushState({}, '', '/?code=abc123&state=state-1');
    mockTokenEndpoint((p) => {
      expect(p.get('grant_type')).toBe('authorization_code');
      expect(p.get('code')).toBe('abc123');
      expect(p.get('code_verifier')).toBe('verifier-1');
      expect(p.get('client_id')).toBe('client-1');
      expect(p.get('redirect_uri')).toBe(redirectUri());
      return { access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3600 };
    });
    const store = fakeStore();
    const before = Date.now();
    await handleAuthCallback(store);
    expect(location.search).toBe('');
    expect(sessionStorage.getItem('spotifyPkceVerifier')).toBeNull();
    expect(await store.getMeta('spotifyClientId')).toBe('client-1');
    expect(await store.getMeta('spotifyAccessToken')).toBe('at-1');
    expect(await store.getMeta('spotifyRefreshToken')).toBe('rt-1');
    expect(await store.getMeta('spotifyTokenExpiresAt')).toBeGreaterThanOrEqual(before + 3_600_000);
  });

  it('state не совпадает — не меняет code на токены, но адрес чистит', async () => {
    history.pushState({}, '', '/?code=abc123&state=wrong');
    let called = false;
    global.fetch = (async () => {
      called = true;
      return new Response('{}');
    }) as typeof fetch;
    const store = fakeStore();
    await handleAuthCallback(store);
    expect(called).toBe(false);
    expect(location.search).toBe('');
    expect(await store.getMeta('spotifyAccessToken')).toBeUndefined();
  });

  it('Spotify отклонил обмен — тихо, без исключения наружу', async () => {
    history.pushState({}, '', '/?code=abc123&state=state-1');
    mockTokenEndpoint(() => ({ error: 'invalid_grant', error_description: 'плохой code' }));
    const store = fakeStore();
    await expect(handleAuthCallback(store)).resolves.toBeUndefined();
    expect(await store.getMeta('spotifyAccessToken')).toBeUndefined();
  });
});

describe('getValidToken', () => {
  it('не подключено — null, без сети', async () => {
    let called = false;
    global.fetch = (async () => {
      called = true;
      return new Response('{}');
    }) as typeof fetch;
    expect(await getValidToken(fakeStore())).toBeNull();
    expect(called).toBe(false);
  });

  it('токен ещё годен — отдаёт как есть, без рефреша', async () => {
    const store = fakeStore();
    await store.setMeta('spotifyClientId', 'c');
    await store.setMeta('spotifyAccessToken', 'at-old');
    await store.setMeta('spotifyTokenExpiresAt', Date.now() + 10 * 60_000);
    let called = false;
    global.fetch = (async () => {
      called = true;
      return new Response('{}');
    }) as typeof fetch;
    expect(await getValidToken(store)).toBe('at-old');
    expect(called).toBe(false);
  });

  it('истекает через минуту — тихо рефрешит', async () => {
    const store = fakeStore();
    await store.setMeta('spotifyClientId', 'c');
    await store.setMeta('spotifyAccessToken', 'at-old');
    await store.setMeta('spotifyRefreshToken', 'rt-old');
    await store.setMeta('spotifyTokenExpiresAt', Date.now() + 10_000);
    mockTokenEndpoint((p) => {
      expect(p.get('grant_type')).toBe('refresh_token');
      expect(p.get('refresh_token')).toBe('rt-old');
      return { access_token: 'at-new', expires_in: 3600 };
    });
    expect(await getValidToken(store)).toBe('at-new');
    expect(await store.getMeta('spotifyAccessToken')).toBe('at-new');
    // Spotify не всегда присылает новый refresh_token — старый остаётся
    expect(await store.getMeta('spotifyRefreshToken')).toBe('rt-old');
  });

  it('рефреш не удался — null', async () => {
    const store = fakeStore();
    await store.setMeta('spotifyClientId', 'c');
    await store.setMeta('spotifyAccessToken', 'at-old');
    await store.setMeta('spotifyRefreshToken', 'rt-old');
    await store.setMeta('spotifyTokenExpiresAt', Date.now() - 1000);
    global.fetch = (async () => new Response('{}', { status: 400 })) as typeof fetch;
    expect(await getValidToken(store)).toBeNull();
  });
});

describe('disconnect / isConnected', () => {
  it('disconnect чистит все ключи', async () => {
    const store = fakeStore();
    await store.setMeta('spotifyClientId', 'c');
    await store.setMeta('spotifyAccessToken', 'at');
    expect(await isConnected(store)).toBe(true);
    await disconnect(store);
    expect(await isConnected(store)).toBe(false);
    expect(await store.getMeta('spotifyClientId')).toBe('');
  });
});

describe('SpotifyAuthError', () => {
  it('название класса', () => {
    expect(new SpotifyAuthError('x').name).toBe('SpotifyAuthError');
  });
});
