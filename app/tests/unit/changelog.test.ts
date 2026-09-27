import { afterEach, describe, expect, it } from 'vitest';
import { CHANGELOG, unseenChangelog } from '../../src/services/changelog';

afterEach(() => localStorage.clear());

describe('unseenChangelog', () => {
  it('на первом запуске (ключа ещё нет) ничего не показывает', () => {
    expect(unseenChangelog()).toEqual([]);
    // но версию запоминает — иначе следующий вызов в этой же сессии решил бы, что обновились
    expect(localStorage.getItem('changelogSeen')).toBe(__APP_VERSION__);
  });

  it('если версия не изменилась — пусто', () => {
    localStorage.setItem('changelogSeen', __APP_VERSION__);
    expect(unseenChangelog()).toEqual([]);
  });

  it('версия, которой нет в списке (очень старый профиль или дыра в истории) — хотя бы последняя запись', () => {
    localStorage.setItem('changelogSeen', '0.0.1-очень-древняя');
    expect(unseenChangelog()).toEqual([CHANGELOG[0]]);
  });

  it('известная старая версия — только записи новее неё', () => {
    // Синтетическая запись в конец списка (самая старая — CHANGELOG отсортирован «новое сверху»),
    // чтобы проверить именно срез между версиями, а не запасной путь «версии нет в списке».
    // Восстанавливаем список сразу после проверки.
    const newerEntries = [...CHANGELOG];
    const older = { version: '0.0.0', date: '2000-01-01', items: ['до всего'] };
    CHANGELOG.push(older);
    try {
      localStorage.setItem('changelogSeen', older.version);
      expect(unseenChangelog()).toEqual(newerEntries);
    } finally {
      CHANGELOG.pop();
    }
  });
});
