import type { LinkService } from '../data/schema';

const RULES: { service: LinkService; hosts: string[] }[] = [
  { service: 'yandex', hosts: ['music.yandex.ru', 'music.yandex.com', 'music.yandex.by', 'music.yandex.kz'] },
  { service: 'vk', hosts: ['vk.com', 'vk.ru', 'm.vk.com', 'music.vk.com', 'boom.ru'] },
  { service: 'spotify', hosts: ['open.spotify.com', 'spotify.link', 'spotify.com'] },
];

/** Распознаёт сервис по домену ссылки (раздел 5.4). */
export function detectService(url: string): LinkService {
  let host: string;
  try {
    host = new URL(url.trim()).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return 'other';
  }
  for (const rule of RULES) {
    if (rule.hosts.some((h) => host === h || host.endsWith('.' + h))) return rule.service;
  }
  return 'other';
}

/** Добавляет https:// к ссылке без протокола; http → https. */
export function normalizeUrl(url: string): string {
  const u = url.trim();
  if (!u) return u;
  if (/^http:\/\//i.test(u)) return 'https://' + u.slice(7);
  if (!/^[a-z]+:\/\//i.test(u)) return 'https://' + u;
  return u;
}
