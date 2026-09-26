// Витрина (ADR 0011): закреплённые релизы и артисты — владелец сам выделяет лучшее.
import { computed } from '@preact/signals';
import type { Release } from '../data/schema';
import { pinnedArtists, releases, repo } from './app';

export const pinnedReleases = computed(() => releases.value.filter((r) => r.pinned));
export const pinnedAlbums = computed(() => pinnedReleases.value.filter((r) => r.type === 'album'));
export const pinnedSingles = computed(() =>
  pinnedReleases.value.filter((r) => r.type === 'single' || r.type === 'ep'),
);

/** Закрепить/открепить весь релиз — общий флаг, полка на витрине зависит от `release.type`. */
export async function toggleReleasePin(release: Release): Promise<Release> {
  return repo().saveRelease({ ...release, pinned: !release.pinned });
}

/** Через Repository: запись меняет ревизию и уходит в автопубликацию — друзья увидят артиста. */
export async function pinArtist(name: string, releaseId: string): Promise<void> {
  const next = [...pinnedArtists.value.filter((a) => a.name !== name), { name, releaseId }];
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
