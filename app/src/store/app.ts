import { computed, signal } from '@preact/signals';
import { LocalSource } from '../data/localSource';
import { RemoteSource } from '../data/remoteSource';
import type { Mode, Repository } from '../data/repository';
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
}

async function publishedCatalogExists(): Promise<boolean> {
  try {
    const res = await fetch(new URL('data/catalog.json', document.baseURI), {
      method: 'HEAD',
      cache: 'no-cache',
    });
    return res.ok && (res.headers.get('content-type') ?? '').includes('json');
  } catch {
    return false;
  }
}

/**
 * Выбор режима (раздел 3.2). Владелец — если на устройстве есть токен GitHub или локальные данные;
 * иначе, если картотека опубликована, — зритель; иначе — новая пустая картотека владельца.
 */
export async function init(): Promise<void> {
  try {
    const local = await LocalSource.open();
    const token = await local.getMeta('token');
    const hasLocal = (await local.getReleases()).length > 0 || (await local.getTags()).length > 0;
    if (token || hasLocal || !(await publishedCatalogExists())) {
      repository = local;
      mode.value = 'owner';
    } else {
      local.close();
      repository = new RemoteSource();
      mode.value = 'viewer';
    }
    repository.subscribe(() => void refresh());
    await refresh();
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    ready.value = true;
  }
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
    ?.setAttribute('content', t === 'light' ? '#f6f2ec' : '#0f0e0d');
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
