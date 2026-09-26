// Витрина (ADR 0011): закреплённые релизы и артисты — владелец сам выделяет лучшее.
import { computed, signal } from '@preact/signals';
import type { LocalSource } from '../data/localSource';
import type { PinnedArtist } from '../data/repository';
import type { Release } from '../data/schema';
import { releases, repo } from './app';

export const pinnedArtists = signal<PinnedArtist[]>([]);

export const pinnedReleases = computed(() => releases.value.filter((r) => r.pinned));
export const pinnedAlbums = computed(() => pinnedReleases.value.filter((r) => r.type === 'album'));
export const pinnedSingles = computed(() =>
  pinnedReleases.value.filter((r) => r.type === 'single' || r.type === 'ep'),
);

let local: LocalSource | null = null;

/** Вызывается при старте у владельца (`store/app.ts`), как и `initSpotifyStatus`. */
export async function initShowcase(src: LocalSource): Promise<void> {
  local = src;
  pinnedArtists.value = (await src.getMeta('pinnedArtists')) ?? [];
}

/** Закрепить/открепить весь релиз — общий флаг, полка на витрине зависит от `release.type`. */
export async function toggleReleasePin(release: Release): Promise<Release> {
  return repo().saveRelease({ ...release, pinned: !release.pinned });
}

export async function pinArtist(name: string, releaseId: string): Promise<void> {
  if (!local) return;
  const next = [...pinnedArtists.value.filter((a) => a.name !== name), { name, releaseId }];
  await local.setMeta('pinnedArtists', next);
  pinnedArtists.value = next;
}

export async function unpinArtist(name: string): Promise<void> {
  if (!local) return;
  const next = pinnedArtists.value.filter((a) => a.name !== name);
  await local.setMeta('pinnedArtists', next);
  pinnedArtists.value = next;
}

export function isArtistPinned(name: string): boolean {
  return pinnedArtists.value.some((a) => a.name === name);
}

/** Для тестов */
export function resetShowcaseForTests(): void {
  local = null;
  pinnedArtists.value = [];
}
