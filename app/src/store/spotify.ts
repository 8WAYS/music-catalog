// Статус подключения к Spotify (ADR 0010) — сигнал, общий для Settings и AddSearch.
import { signal } from '@preact/signals';
import type { LocalSource } from '../data/localSource';
import { disconnect as authDisconnect, isConnected } from '../services/spotifyAuth';

export const spotifyConnected = signal(false);

let local: LocalSource | null = null;

/** Вызывается при старте у владельца — после handleAuthCallback, чтобы увидеть свежее состояние. */
export async function initSpotifyStatus(src: LocalSource): Promise<void> {
  local = src;
  spotifyConnected.value = await isConnected(src);
}

export async function disconnectSpotify(): Promise<void> {
  if (!local) return;
  await authDisconnect(local);
  spotifyConnected.value = false;
}

/** Для тестов */
export function resetSpotifyForTests(): void {
  local = null;
  spotifyConnected.value = false;
}
