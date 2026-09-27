// Витрина (ADR 0011): закреплённые релизы и артисты — владелец сам выделяет лучшее.
import { computed } from '@preact/signals';
import type { Release } from '../data/schema';
import { pinnedArtists, releases, repo, toast, toastError } from './app';

/** Ровно 3 места у альбомов и у артистов (ADR 0011) — это и делает список «топ», а не полкой без предела. */
export const TOP_LIMIT = 3;

export const pinnedReleases = computed(() => releases.value.filter((r) => r.pinned));
/** Самый недавно закреплённый — первым (ранг №1): порядок задаёт `pinnedAt`, а не порядок в картотеке. */
export const pinnedAlbums = computed(() =>
  pinnedReleases.value
    .filter((r) => r.type === 'album')
    .sort((a, b) => (b.pinnedAt ?? '').localeCompare(a.pinnedAt ?? ''))
    .slice(0, TOP_LIMIT),
);
export const pinnedSingles = computed(() =>
  pinnedReleases.value.filter((r) => r.type === 'single' || r.type === 'ep'),
);
/** Топ-3 артистов — первые 3 элемента массива, порядок которого уже «самый свежий — первый» (см. pinArtist). */
export const topArtists = computed(() => pinnedArtists.value.slice(0, TOP_LIMIT));

/** Топ-3 занят: закрепить ещё один альбом/артиста нельзя, пока не откреплён кто-то из уже закреплённых. */
export class TopLimitError extends Error {}

/** Закрепить/открепить весь релиз — общий флаг, полка на витрине зависит от `release.type`. */
export async function toggleReleasePin(release: Release): Promise<Release> {
  const pinning = !release.pinned;
  if (pinning && release.type === 'album') {
    // Из репозитория, а не из releases.value: сигнал обновляется асинхронно через
    // subscribe → refresh (store/app.ts), и при двух закреплениях подряд ещё не успел бы —
    // счётчик занятых мест устаревал бы и пропускал бы больше 3.
    const all = await repo().getReleases();
    const count = all.filter((r) => r.pinned && r.type === 'album').length;
    if (count >= TOP_LIMIT)
      throw new TopLimitError('Топ-3 альбомов уже занят — открепи один, чтобы добавить другой');
  }
  return repo().saveRelease({
    ...release,
    pinned: pinning,
    pinnedAt: pinning ? new Date().toISOString() : undefined,
  });
}

/** Через Repository: запись меняет ревизию и уходит в автопубликацию — друзья увидят артиста. */
export async function pinArtist(name: string, releaseId: string): Promise<void> {
  if (pinnedArtists.value.length >= TOP_LIMIT && !isArtistPinned(name))
    throw new TopLimitError('Топ-3 артистов уже занят — открепи одного, чтобы добавить другого');
  // В начало — самый свежий закреплённый становится рангом №1, как и у альбомов (pinnedAt).
  const next = [{ name, releaseId }, ...pinnedArtists.value.filter((a) => a.name !== name)];
  await repo().setPinnedArtists(next);
  // Подписка сама перечитает список; здесь — чтобы звезда появилась без ожидания
  pinnedArtists.value = next;
}

export async function unpinArtist(name: string): Promise<void> {
  const next = pinnedArtists.value.filter((a) => a.name !== name);
  await repo().setPinnedArtists(next);
  pinnedArtists.value = next;
}

export function isArtistPinned(name: string): boolean {
  return pinnedArtists.value.some((a) => a.name === name);
}

/** Занятый топ-3 — не баг, а отказ по правилу: без «Ошибка:»-префикса, просто сообщение. */
export function pinErrorToast(e: unknown): void {
  if (e instanceof TopLimitError) toast(e.message, 'error');
  else toastError(e);
}
