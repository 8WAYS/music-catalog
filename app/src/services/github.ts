// Клиент GitHub REST API для публикации (раздел 5.3): токен только на устройстве владельца.

const API = 'https://api.github.com';
export const TIMEOUT_MS = 20_000;

export interface GitHubConfig {
  repo: string; // владелец/имя
  branch: string;
  token: string;
}

export type GitHubErrorKind =
  'offline' | 'timeout' | 'auth' | 'forbidden' | 'notFound' | 'limit' | 'race' | 'http';

/** Ошибка с текстом для человека; kind решает, стоит ли повторять автоматически. */
export class GitHubError extends Error {
  constructor(
    readonly kind: GitHubErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
  /** Сеть и сбои GitHub проходят сами — повторим; неверный токен или адрес — нет. */
  get retryable(): boolean {
    return this.kind === 'offline' || this.kind === 'timeout' || this.kind === 'http' || this.kind === 'race';
  }
}

type Fetch = typeof fetch;

export const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

export function githubApi(cfg: GitHubConfig, fetchFn: Fetch = fetch) {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetchFn(`${API}/repos/${cfg.repo}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === 'TimeoutError' || name === 'AbortError')
        throw new GitHubError('timeout', 'GitHub не отвечает — повторим позже.');
      throw new GitHubError('offline', 'Нет связи с GitHub — опубликуем, когда появится сеть.');
    }
    if (res.ok) return (await res.json()) as T;
    const status = res.status;
    if (status === 401)
      throw new GitHubError('auth', 'Токен не подходит или истёк — создай новый на GitHub.', status);
    if (status === 403 || status === 429) {
      if (res.headers.get('x-ratelimit-remaining') === '0')
        throw new GitHubError('limit', 'Исчерпан лимит запросов к GitHub — повторим через час.', status);
      throw new GitHubError(
        'forbidden',
        'У токена нет права записи — нужно Contents: Read and write для этого репозитория.',
        status,
      );
    }
    if (status === 404)
      throw new GitHubError(
        'notFound',
        'Репозиторий или ветка не найдены — проверь адрес и что токен выдан на этот репозиторий.',
        status,
      );
    // 422 на сдвиге ветки: между чтением и записью в ветку кто-то закоммитил
    if (status === 422 && method === 'PATCH')
      throw new GitHubError('race', 'Ветка изменилась во время публикации.', status);
    throw new GitHubError('http', `GitHub ответил ошибкой ${status} — повторим позже.`, status);
  }
  return {
    get: <T>(path: string) => call<T>('GET', path),
    post: <T>(path: string, body: unknown) => call<T>('POST', path, body),
    patch: <T>(path: string, body: unknown) => call<T>('PATCH', path, body),
  };
}

/**
 * Проверка доступа: чтение репозитория и пробная запись безвредного blob.
 * Права fine-grained токена из GET /repos не видны, поэтому пишем по-настоящему — blob без коммита
 * ни на что не влияет и со временем удаляется сборщиком мусора git.
 */
export async function checkAccess(cfg: GitHubConfig, fetchFn: Fetch = fetch): Promise<void> {
  if (!REPO_RE.test(cfg.repo)) throw new GitHubError('notFound', 'Адрес репозитория — в виде владелец/имя.');
  if (!cfg.token.trim()) throw new GitHubError('auth', 'Вставь токен.');
  const api = githubApi(cfg, fetchFn);
  await api.get(`/git/ref/heads/${cfg.branch}`);
  await api.post('/git/blobs', { content: 'music-catalog access check', encoding: 'utf-8' });
}

// ---------- Кодирование ----------

/** Git-хэш файла: sha1("blob <размер>\0" + содержимое) — так без скачивания видно, изменилась ли обложка. */
export async function gitBlobSha(bytes: Uint8Array): Promise<string> {
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const all = new Uint8Array(header.length + bytes.length);
  all.set(header);
  all.set(bytes, header.length);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', all));
  return [...hash].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  // Кусками: String.fromCharCode(...огромный массив) переполняет стек
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64.replace(/\s/g, ''));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
