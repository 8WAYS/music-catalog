import { expect, test, type Page } from '@playwright/test';
import { ID, RELEASES, TAGS, seed } from './seed';

const chip = (page: Page, name: string) =>
  page.getByRole('group', { name: 'Фильтр по тегам' }).getByRole('button', { name, exact: true });
const grid = (page: Page) => page.getByRole('list').getByRole('link');
// Тот же текст встречается и на Витрине (вторая вкладка главной, ADR 0011) — уточняем через tabpanel.
const count = (page: Page) =>
  page.getByRole('tabpanel', { name: 'Картотека' }).getByText(/^\d+ (из \d+|релиз[а-я]*)$/);

test.beforeEach(async ({ page }) => {
  await seed(page, { tags: TAGS, releases: RELEASES });
  await expect(count(page)).toHaveText('3 релиза');
});

test('подбор по двум тегам: пересечение, адрес, перезапуск', async ({ page }) => {
  await chip(page, 'осень').click();
  await expect(count(page)).toHaveText('2 из 3');
  await expect(chip(page, 'осень')).toHaveAttribute('aria-pressed', 'true');

  await chip(page, 'вечер').click();
  await expect(count(page)).toHaveText('1 из 3');
  await expect(grid(page)).toHaveCount(1);
  await expect(grid(page).first()).toContainText('In Rainbows');
  // «дорога» есть только у «Группы крови» — с «вечером» дала бы пустоту, поэтому скрыта
  await expect(chip(page, 'дорога')).toHaveCount(0);
  expect(decodeURIComponent(page.url())).toContain('#/?tags=осень,вечер');

  await page.reload();
  await expect(count(page)).toHaveText('1 из 3');

  // Повторное нажатие снимает тег
  await chip(page, 'вечер').click();
  await expect(count(page)).toHaveText('2 из 3');
});

test('ссылка на выборку открывается сразу отфильтрованной', async ({ page }) => {
  await page.goto('./#/?tags=' + encodeURIComponent('дорога'));
  await expect(count(page)).toHaveText('1 из 3');
  await expect(grid(page).first()).toContainText('Группа крови');
});

test('поиск: ё/е, треки, пустой результат и сброс', async ({ page }) => {
  const search = page.getByRole('searchbox', { name: 'Поиск по картотеке' });

  await search.fill('елка');
  await expect(count(page)).toHaveText('1 из 3');
  await expect(grid(page).first()).toContainText('Ёлка');

  await search.fill('солнце');
  await expect(grid(page).first()).toContainText('Группа крови');

  await search.fill('невы');
  await expect(grid(page).first()).toContainText('In Rainbows');

  await search.fill('джаз');
  await expect(page.getByRole('heading', { name: 'Ничего не нашлось' })).toBeVisible();
  await page.getByRole('button', { name: 'Сбросить фильтры' }).click();
  await expect(count(page)).toHaveText('3 релиза');
  await expect(search).toHaveValue('');
});

test('сортировки', async ({ page }) => {
  const sort = page.getByLabel('Сортировка');
  await expect(grid(page).first()).toContainText('Группа крови'); // добавлена последней

  await sort.selectOption('title');
  await expect(grid(page).first()).toContainText('Группа крови');
  await expect(grid(page).nth(1)).toContainText('Ёлка');
  await expect(grid(page).nth(2)).toContainText('In Rainbows');

  await sort.selectOption('year');
  await expect(grid(page).first()).toContainText('In Rainbows');
  await expect(grid(page).last()).toContainText('Ёлка'); // без года — в конце
  expect(page.url()).toContain('sort=year');
});

test('«Удиви меня» выбирает из текущей выборки', async ({ page }) => {
  await chip(page, 'дорога').click();
  await page.getByRole('button', { name: 'Удиви меня' }).click();
  await expect(page.getByRole('heading', { name: 'Группа крови', level: 1 })).toBeVisible();
});

test('«Удиви меня»: проигрыватель выбирает из текущей выборки и открывает карточку', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await chip(page, 'осень').click();
  await page.getByRole('button', { name: 'Удиви меня' }).click();
  await expect(page.getByRole('dialog', { name: 'Удиви меня' })).toBeVisible();
  await expect(page.getByText('Выбираю…')).toBeAttached();
  await expect(page.getByRole('heading', { level: 1, name: /In Rainbows|Группа крови/ })).toBeVisible();
  expect(page.url()).toMatch(new RegExp(`#/release/(${ID.rainbows}|${ID.blood})$`));
});

test('«Удиви меня»: нажатие сразу открывает карточку', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await chip(page, 'дорога').click();
  await page.getByRole('button', { name: 'Удиви меня' }).click();
  // Дека анимируется — Playwright ждёт «стабильности»; человек нажимает сразу
  await page.getByRole('dialog', { name: 'Удиви меня' }).click({ force: true });
  await expect(page.getByRole('heading', { name: 'Группа крови', level: 1 })).toBeVisible({ timeout: 1_000 });
});

test('без анимаций сразу открывает карточку', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Удиви меня' }).click();
  await expect(page).toHaveURL(/#\/release\//);
  await expect(page.getByText('Выбираю…')).toHaveCount(0);
});

test('тег на карточке открывает выборку, «Назад» возвращает к карточке', async ({ page }) => {
  await grid(page).filter({ hasText: 'In Rainbows' }).click();
  await page.getByRole('button', { name: 'спокойное' }).click();
  await expect(count(page)).toHaveText('2 из 3');
  await expect(chip(page, 'спокойное')).toHaveAttribute('aria-pressed', 'true');
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'In Rainbows', level: 1 })).toBeVisible();
});
