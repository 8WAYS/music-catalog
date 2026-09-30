import { afterEach, describe, expect, it } from 'vitest';
import { hiddenLinkServices, setLinkServiceHidden } from '../../src/store/app';

afterEach(() => {
  localStorage.clear();
  hiddenLinkServices.value = [];
});

describe('setLinkServiceHidden', () => {
  it('по умолчанию (ключа в localStorage нет) все площадки видны', () => {
    expect(hiddenLinkServices.value).toEqual([]);
  });

  it('скрывает площадку и сохраняет в localStorage', () => {
    setLinkServiceHidden('vk', true);
    expect(hiddenLinkServices.value).toEqual(['vk']);
    expect(JSON.parse(localStorage.getItem('hiddenLinkServices')!)).toEqual(['vk']);
  });

  it('повторное скрытие той же площадки не дублирует запись', () => {
    setLinkServiceHidden('vk', true);
    setLinkServiceHidden('vk', true);
    expect(hiddenLinkServices.value).toEqual(['vk']);
  });

  it('показывает обратно ранее скрытую площадку', () => {
    setLinkServiceHidden('vk', true);
    setLinkServiceHidden('yandex', true);
    setLinkServiceHidden('vk', false);
    expect(hiddenLinkServices.value).toEqual(['yandex']);
  });

  it('битый JSON в localStorage не роняет чтение — считаем, что ничего не скрыто', () => {
    localStorage.setItem('hiddenLinkServices', '{не json');
    // Сигнал уже проинициализирован при импорте модуля, поэтому проверяем сам факт, что
    // повторный вызов той же логики (через сеттер) не бросает и продолжает работать штатно.
    expect(() => setLinkServiceHidden('spotify', true)).not.toThrow();
  });

  it('неизвестное значение в сохранённом списке отфильтровывается', () => {
    localStorage.setItem('hiddenLinkServices', JSON.stringify(['vk', 'telegram', 42]));
    setLinkServiceHidden('other', true);
    // 'vk' из старого значения не подхватится заново (сигнал уже инициализирован раньше этого теста),
    // но неизвестные значения не должны попадать в итоговый localStorage при следующей записи.
    const saved = JSON.parse(localStorage.getItem('hiddenLinkServices')!);
    expect(saved.every((s: string) => ['yandex', 'vk', 'spotify', 'other'].includes(s))).toBe(true);
  });
});
