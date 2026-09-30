import { expect, test } from '@playwright/test';
import { ID, RELEASES, TAGS, seed } from './seed';

/**
 * Фильтр отображаемых площадок в Настройках (ADR 0014) — личная настройка устройства
 * (localStorage, store/app.ts), не часть catalog.json: влияет только на то, какие ссылки
 * «Слушать» видно на карточке релиза, ничего не удаляет из данных.
 */
const release = {
  ...RELEASES[0]!,
  links: [
    { service: 'yandex' as const, url: 'https://music.yandex.ru/album/1' },
    { service: 'spotify' as const, url: 'https://open.spotify.com/album/1' },
  ],
};

test('скрытая в настройках площадка не отображается на карточке релиза', async ({ page }) => {
  await seed(page, { tags: TAGS, releases: [release] });

  await page.goto(`./#/release/${ID.rainbows}`);
  await expect(page.getByRole('link', { name: 'Яндекс Музыка' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Spotify' })).toBeVisible();

  await page.goto('./#/settings');
  await page.getByRole('switch', { name: 'Яндекс Музыка' }).click();

  await page.goto(`./#/release/${ID.rainbows}`);
  await expect(page.getByRole('link', { name: 'Яндекс Музыка' })).not.toBeVisible();
  await expect(page.getByRole('link', { name: 'Spotify' })).toBeVisible();
});

test('скрыть все площадки — блок ссылок не рендерится вовсе', async ({ page }) => {
  await seed(page, { tags: TAGS, releases: [release] });

  await page.goto('./#/settings');
  await page.getByRole('switch', { name: 'Яндекс Музыка' }).click();
  await page.getByRole('switch', { name: 'Spotify' }).click();

  await page.goto(`./#/release/${ID.rainbows}`);
  await expect(page.getByRole('link', { name: 'Яндекс Музыка' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Spotify' })).toHaveCount(0);
});

test('настройка переживает перезагрузку страницы', async ({ page }) => {
  await seed(page, { tags: TAGS, releases: [release] });

  await page.goto('./#/settings');
  await page.getByRole('switch', { name: 'Яндекс Музыка' }).click();
  await expect(page.getByRole('switch', { name: 'Яндекс Музыка' })).not.toBeChecked();

  await page.reload();
  await expect(page.getByRole('switch', { name: 'Яндекс Музыка' })).not.toBeChecked();

  await page.goto(`./#/release/${ID.rainbows}`);
  await expect(page.getByRole('link', { name: 'Яндекс Музыка' })).not.toBeVisible();
});
