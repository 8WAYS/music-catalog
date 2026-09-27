import { expect, test } from '@playwright/test';
import { CHANGELOG } from '../../src/services/changelog';
import { RELEASES, TAGS, seed } from './seed';

/** «Что нового» — короткая пользовательская выжимка после обновления (не ADR, см. src/services/changelog.ts). */
test('после обновления показывает то, что не видели, и запоминает, что показали', async ({ page }) => {
  await seed(page, { tags: TAGS, releases: RELEASES });
  await page.evaluate(() => localStorage.setItem('changelogSeen', '0.0.0'));
  await page.reload();

  const dialog = page.getByRole('dialog', { name: 'Что нового' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(CHANGELOG[0]!.items[0]!)).toBeVisible();

  await dialog.getByRole('button', { name: 'Понятно' }).click();
  await expect(dialog).toBeHidden();

  // Закрыли — при следующей загрузке уже не всплывает само
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Что нового' })).toHaveCount(0);
});

test('на новом профиле список не всплывает сам — сравнивать ещё не с чем', async ({ page }) => {
  await seed(page, { tags: TAGS, releases: RELEASES });
  await expect(page.getByRole('dialog', { name: 'Что нового' })).toHaveCount(0);
});

test('«Что нового» в настройках открывает полную историю в любой момент', async ({ page }) => {
  await seed(page, { tags: TAGS, releases: RELEASES });
  // seed() уже открыл приложение (первый запуск) — автопоказа быть не должно
  await expect(page.getByRole('dialog', { name: 'Что нового' })).toHaveCount(0);

  await page.goto('./#/settings');
  await page.getByRole('button', { name: 'Что нового' }).click();
  const dialog = page.getByRole('dialog', { name: 'Что нового' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(CHANGELOG[0]!.items[0]!)).toBeVisible();
});
