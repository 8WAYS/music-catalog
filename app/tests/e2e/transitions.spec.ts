import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { RELEASES, TAGS, seed, type SeedRelease } from './seed';

// Переходы с анимацией: в остальных тестах движение уменьшено (playwright.config.ts)
const chip = (page: Page, name: string) =>
  page.getByRole('group', { name: 'Фильтр по тегам' }).getByRole('button', { name, exact: true });
const grid = (page: Page) => page.getByRole('list').getByRole('link');

test('переход «обложка → карточка» и обратно с анимацией на короткой странице', async ({ page }) => {
  // Два релиза — страница не длиннее экрана: здесь WebKit зависал на View Transition
  await seed(page, { tags: TAGS, releases: RELEASES.slice(0, 2) });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await grid(page).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Группа крови' })).toBeVisible();
  await page.getByRole('button', { name: 'Назад' }).click();
  await expect(page.getByText('2 релиза')).toBeVisible();
  await chip(page, 'осень').click();
  await page.getByRole('button', { name: 'Удиви меня' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /In Rainbows|Группа крови/ })).toBeVisible();
});

test('релиз с треклистом открывается сверху, даже если главная была прокручена вниз', async ({ page }) => {
  // Длинная главная (есть что прокручивать) + длинная карточка (есть куда сдвинуться): без сброса
  // прокрутки в несколько точек багу негде проявиться на короткой странице (ADR router.ts)
  const many: SeedRelease[] = Array.from({ length: 12 }, (_, i) => ({
    id: randomUUID(),
    title: `Альбом ${i + 1}`,
    artist: 'Тест',
    createdAt: `2026-01-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
    tracks: Array.from({ length: 10 }, (_, t) => `Трек ${t + 1}`),
  }));
  await seed(page, { tags: TAGS, releases: many });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => window.scrollTo(0, 2000));
  await expect(async () => expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)).toPass();

  await page.getByRole('list').getByRole('link').filter({ hasText: 'Альбом 12' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Альбом 12' })).toBeVisible();
  await expect(page.getByText('Трек 10')).toBeVisible();
  // Сброс прокрутки повторяется до 300 мс (router.ts) — ждём дольше и проверяем итог
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});
