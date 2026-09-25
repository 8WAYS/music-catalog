// Автопубликация и статус синхронизации (раздел 3.3, F-18, F-19).
import { signal } from '@preact/signals';
import type { LocalSource } from '../data/localSource';
import { GitHubError, checkAccess, type GitHubConfig } from '../services/github';
import { PublishConflict, importPublished, publish } from '../services/publisher';

export type SyncStatus = 'off' | 'published' | 'dirty' | 'publishing' | 'error' | 'conflict';

export interface SyncState {
  status: SyncStatus;
  message?: string;
  publishedAt?: string;
  repo?: string;
}

export const SYNC_LABEL: Record<SyncStatus, string> = {
  off: 'Не опубликована',
  published: 'Опубликовано',
  dirty: 'Есть изменения',
  publishing: 'Публикация…',
  error: 'Ошибка',
  conflict: 'Нужно решение',
};

export const syncState = signal<SyncState>({ status: 'off' });

export const PUBLISH_DELAY_MS = 5_000;
const RETRY_MS = 60_000;

let local: LocalSource | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let running: Promise<void> | null = null;
/** Ошибка или конфликт держатся до успешной публикации или смены настроек */
let sticky: Pick<SyncState, 'status' | 'message'> | null = null;

async function config(): Promise<GitHubConfig | null> {
  if (!local) return null;
  const [token, repo, branch] = await Promise.all([
    local.getMeta('token'),
    local.getMeta('repo'),
    local.getMeta('branch'),
  ]);
  return token && repo ? { token, repo, branch: branch || 'main' } : null;
}

export async function refreshSync(): Promise<void> {
  if (!local) return;
  const cfg = await config();
  if (!cfg) {
    syncState.value = { status: 'off' };
    return;
  }
  const [dirty, publishedAt] = await Promise.all([local.getMeta('dirty'), local.getMeta('publishedAt')]);
  const base = { repo: cfg.repo, publishedAt };
  if (running) syncState.value = { ...base, status: 'publishing' };
  else if (sticky) syncState.value = { ...base, ...sticky };
  else syncState.value = { ...base, status: dirty || !publishedAt ? 'dirty' : 'published' };
}

function schedule(ms: number): void {
  clearTimeout(timer);
  timer = setTimeout(() => void run(), ms);
}

async function run({ force = false, always = false } = {}): Promise<void> {
  if (!local) return;
  if (running) {
    // Уже публикуем — после окончания проверим, не появилось ли новое
    await running;
    return run({ force, always });
  }
  const cfg = await config();
  if (!cfg || (sticky?.status === 'conflict' && !force)) return refreshSync();
  if (!always && !force && !(await local.getMeta('dirty'))) return refreshSync();

  running = (async () => {
    syncState.value = { ...syncState.value, status: 'publishing', message: undefined };
    try {
      await publish(local!, cfg, { force });
      sticky = null;
    } catch (e) {
      if (e instanceof PublishConflict) sticky = { status: 'conflict', message: e.message };
      else if (e instanceof GitHubError) {
        sticky = { status: 'error', message: e.message };
        // Без сети ждём события online; сбои GitHub повторяем через минуту
        if (e.retryable && e.kind !== 'offline') schedule(RETRY_MS);
      } else sticky = { status: 'error', message: e instanceof Error ? e.message : String(e) };
    }
  })();
  await running;
  running = null;
  await refreshSync();
  if (!sticky && (await local.getMeta('dirty'))) schedule(PUBLISH_DELAY_MS);
}

/** Подключить автопубликацию к хранилищу владельца. */
export function startSync(src: LocalSource): void {
  local = src;
  src.subscribe(() => {
    if (syncState.value.status === 'off') return;
    if (syncState.value.status !== 'conflict' && syncState.value.status !== 'publishing')
      syncState.value = { ...syncState.value, status: 'dirty' };
    schedule(PUBLISH_DELAY_MS);
  });
  // Очередь при офлайне (F-18): неопубликованное уходит при появлении сети и при возврате в приложение
  addEventListener('online', () => schedule(500));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(1_000);
  });
  void refreshSync().then(() => schedule(1_500));
}

/** Изменение вне релизов и тегов (имя владельца) — тоже публикуем. */
export async function markChanged(): Promise<void> {
  if (!local) return;
  await local.setMeta('dirty', true);
  if (syncState.value.status === 'off') return;
  if (syncState.value.status === 'published') syncState.value = { ...syncState.value, status: 'dirty' };
  schedule(PUBLISH_DELAY_MS);
}

/** «Опубликовать сейчас»: без паузы и даже если изменений нет. */
export async function publishNow(): Promise<void> {
  clearTimeout(timer);
  sticky = sticky?.status === 'conflict' ? sticky : null;
  await run({ always: true });
}

/** Конфликт: взять опубликованную версию или перезаписать её своей. */
export async function resolveConflict(choice: 'import' | 'overwrite'): Promise<void> {
  const cfg = await config();
  if (!local || !cfg) return;
  clearTimeout(timer);
  sticky = null;
  if (choice === 'overwrite') return run({ force: true });
  syncState.value = { ...syncState.value, status: 'publishing', message: undefined };
  try {
    await importPublished(local, cfg);
  } catch (e) {
    sticky = { status: 'error', message: e instanceof Error ? e.message : String(e) };
  }
  await refreshSync();
}

/** Проверить доступ и сохранить настройки публикации. Ошибки — GitHubError с текстом для человека. */
export async function connect(target: LocalSource, cfg: GitHubConfig): Promise<void> {
  await checkAccess(cfg);
  await target.setMeta('repo', cfg.repo);
  await target.setMeta('branch', cfg.branch);
  await target.setMeta('token', cfg.token);
  sticky = null;
  if (local === target) await run({ always: true });
}

/** Отключить публикацию на этом устройстве: токен удаляется, опубликованное остаётся на GitHub. */
export async function disconnect(): Promise<void> {
  if (!local) return;
  clearTimeout(timer);
  await local.setMeta('token', '');
  sticky = null;
  await refreshSync();
}

/** Для тестов */
export function resetSyncForTests(): void {
  clearTimeout(timer);
  local = null;
  running = null;
  sticky = null;
  syncState.value = { status: 'off' };
}
