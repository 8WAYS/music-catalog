import { expect, test, type Page } from '@playwright/test';
import { RELEASES, TAGS, seed } from './seed';

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
