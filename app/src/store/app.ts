import { computed, signal } from '@preact/signals';
import { LocalSource } from '../data/localSource';
import { RemoteSource } from '../data/remoteSource';
import type { Mode, Repository } from '../data/repository';
import { decideMode, type Published } from '../data/mode';
import type { GitHubConfig } from '../services/github';
import { importPublished } from '../services/publisher';
import { connect, startSync } from './sync';
import type { CoverColors, Release, Tag } from '../data/schema';

// ---------- Данные ----------

export const mode = signal<Mode>('owner');
export const ready = signal(false);
export const loadError = signal<string | null>(null);
export const releases = signal<Release[]>([]);
export const tags = signal<Tag[]>([]);
export const ownerName = signal('');

export const tagsById = computed(() => new Map(tags.value.map((t) => [t.id, t])));
export const releasesById = computed(() => new Map(releases.value.map((r) => [r.id, r])));
export const isOwner = computed(() => mode.value === 'owner');

let repository: Repository | null = null;

export function repo(): Repository {
  if (!repository) throw new Error('Repository ещё не инициализирован');
  return repository;
}

async function refresh(): Promise<void> {
  const r = repo();
  const [rel, tg, name] = await Promise.all([r.getReleases(), r.getTags(), r.getMeta('ownerName')]);
  releases.value = rel;
  tags.value = tg;
  ownerName.value = name ?? '';
  if (r instanceof RemoteSource) staleCatalog.value = r.stale;
}

/** Есть ли на сайте опубликованная картотека. Нет ответа за 6 с (VPN, офлайн) — «неизвестно». */
async function publishedState(): Promise<Published> {
  try {
    const res = await fetch(new URL('data/catalog.json', document.baseURI), {
      method: 'HEAD',
      cache: 'no-cache',
      signal: AbortSignal.timeout(6_000),
    });
    return res.ok && (res.headers.get('content-type') ?? '').includes('json') ? 'yes' : 'no';
  } catch {
    return 'unknown';
  }
}

const PREFER_LOCAL_KEY = 'preferLocal';

function readPreferLocal(): boolean {
  try {
    return localStorage.getItem(PREFER_LOCAL_KEY) === '1';
  } catch {
    return false;
  }
}

/** Зритель со своими данными на устройстве может переключиться на них и обратно. */
export function setPreferLocal(on: boolean): void {
  try {
    if (on) localStorage.setItem(PREFER_LOCAL_KEY, '1');
    else localStorage.removeItem(PREFER_LOCAL_KEY);
  } catch {
    /* хранилище недоступно */
  }
  // Сменился режим — перезапускаемся сразу на главной: ради неё и переключались
  history.replaceState(null, '', '#/');
  location.reload();
}

/** Сколько релизов лежит в локальной картотеке — зритель видит это в настройках. */
export const localReleaseCount = signal(0);
/** Зритель видит сохранённую копию: сайт не ответил. */
export const staleCatalog = signal(false);
/** Последний открытый релиз: его обложка на главной перетекает в карточку и обратно (View Transitions) */
export const lastOpened = signal<string | null>(null);
/** Зритель открыл свою локальную картотеку вместо опубликованной. */
export const preferLocalOn = signal(false);
/** Картотека опубликована на сайте (для подсказок в настройках). */
export const publishedOnSite = signal<Published>('unknown');

export async function init(): Promise<void> {
  try {
    const local = await LocalSource.open();
    const [token, localReleases, localTags] = await Promise.all([
      local.getMeta('token'),
      local.getReleases(),
      local.getTags(),
    ]);
    const hasLocal = localReleases.length > 0 || localTags.length > 0;
    localReleaseCount.value = localReleases.length;
    const preferLocal = readPreferLocal();
    preferLocalOn.value = preferLocal;
    // Без токена сеть спрашиваем всегда: нужно знать, есть ли что смотреть
    const published = token ? 'unknown' : await publishedState();
    publishedOnSite.value = published;
    mode.value = decideMode({ token: !!token, hasLocal, published, preferLocal });
    if (mode.value === 'owner') {
      repository = local;
      startSync(local);
    } else {
      local.close();
      repository = new RemoteSource();
    }
    repository.subscribe(() => void refresh());
    await refresh();
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    ready.value = true;
  }
}

/**
 * «Это моя картотека» на устройстве зрителя: проверить токен, сохранить его и открыть как владелец.
 * Своих данных на устройстве нет — сразу загружаем опубликованную версию (раздел 3.2, новое устройство);
 * есть — после перезапуска публикация покажет конфликт, и владелец выберет, какую версию оставить.
 */
export async function becomeOwner(cfg: GitHubConfig): Promise<void> {
  const local = await LocalSource.open();
  try {
    await connect(local, cfg);
    if ((await local.getReleases()).length === 0) await importPublished(local, cfg);
  } finally {
    local.close();
  }
  setPreferLocal(false);
}

/** Для тестов: подставить источник данных. */
export async function initWith(r: Repository, m: Mode): Promise<void> {
  repository = r;
  mode.value = m;
  r.subscribe(() => void refresh());
  await refresh();
  ready.value = true;
}

// ---------- Черновик для редактора ----------

/** Что передать в редактор нового релиза: поля и обложка из поиска или набранное вручную. */
export interface EditorSeed {
  release: Partial<Release>;
  cover?: { blob: Blob; colors: CoverColors };
}

let editorSeed: EditorSeed | null = null;

export function setEditorSeed(seed: EditorSeed | null): void {
  editorSeed = seed;
}

/** Забрать черновик один раз: при повторном открытии редактор снова пустой. */
export function takeEditorSeed(): EditorSeed | null {
  const s = editorSeed;
  editorSeed = null;
  return s;
}

// ---------- Тосты ----------

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
}
export const toasts = signal<Toast[]>([]);
let toastSeq = 0;

export function toast(text: string, kind: Toast['kind'] = 'info', ms = 3200): void {
  const t = { id: ++toastSeq, text, kind };
  toasts.value = [...toasts.value.slice(-1), t]; // не больше двух одновременно
  setTimeout(() => (toasts.value = toasts.value.filter((x) => x.id !== t.id)), ms);
}

export function toastError(e: unknown, prefix = 'Ошибка'): void {
  console.error(e);
  toast(`${prefix}: ${e instanceof Error ? e.message : String(e)}`, 'error', 5000);
}

// ---------- Диалог подтверждения ----------

export interface ConfirmRequest {
  title: string;
  text?: string;
  confirm: string;
  cancel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}
export const confirmRequest = signal<ConfirmRequest | null>(null);

export function confirmDialog(opts: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    confirmRequest.value = {
      ...opts,
      resolve: (ok) => {
        confirmRequest.value = null;
        resolve(ok);
      },
    };
  });
}

// ---------- Оформление ----------

export type ThemePref = 'dark' | 'light' | 'system';

function readPref<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}

export const theme = signal<ThemePref>(readPref('theme', 'dark'));
export const reduceMotion = signal(readPref<string>('reduceMotion', 'off') === 'on');

export function applyAppearance(): void {
  const root = document.documentElement;
  const t =
    theme.value === 'system'
      ? matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
      : theme.value;
  root.dataset.theme = t;
  root.dataset.motion = reduceMotion.value ? 'reduce' : 'auto';
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', t === 'light' ? '#eef0f4' : '#0e1014');
}

export function setTheme(t: ThemePref): void {
  theme.value = t;
  try {
    localStorage.setItem('theme', t);
  } catch {
    /* хранилище недоступно — настройка живёт до перезагрузки */
  }
  applyAppearance();
}

export function setReduceMotion(on: boolean): void {
  reduceMotion.value = on;
  try {
    localStorage.setItem('reduceMotion', on ? 'on' : 'off');
  } catch {
    /* см. выше */
  }
  applyAppearance();
}

matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if (theme.value === 'system') applyAppearance();
});
