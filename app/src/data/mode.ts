import type { Mode } from './repository';

export type Published = 'yes' | 'no' | 'unknown';

/**
 * Выбор режима (раздел 3.2, ADR 0007). Владелец — устройство с токеном GitHub.
 * Без токена: картотека опубликована — зритель (свои локальные данные остаются, их можно открыть в настройках);
 * не опубликована — своя картотека владельца (как до настройки публикации);
 * сайт не ответил — владелец, если на устройстве есть свои данные, иначе зритель с сохранённой копией.
 */
export function decideMode(o: {
  token: boolean;
  hasLocal: boolean;
  published: Published;
  preferLocal: boolean;
}): Mode {
  if (o.token || o.preferLocal) return 'owner';
  if (o.published === 'yes') return 'viewer';
  if (o.published === 'no') return 'owner';
  return o.hasLocal ? 'owner' : 'viewer';
}
