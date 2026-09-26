import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { FakeGitHub } from '../fakeGithub';
import { RELEASES, TAGS, seed } from './seed';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
};

async function mockGitHub(page: Page): Promise<FakeGitHub> {
  const gh = await FakeGitHub.create();
  await page.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = req.postData();
    const r = await gh.handle(req.method(), req.url(), body ? JSON.parse(body) : undefined);
    await route.fulfill({ status: r.status, json: r.json, headers: CORS });
  });
  return gh;
}

test('экспорт ZIP → очистка IndexedDB → восстановление из архива без потерь', async ({ page }) => {
  await seed(page, { tags: TAGS, releases: RELEASES });
  await page.goto('./#/settings');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать резервную копию' }).click();
  const download = await downloadPromise;
  const zipPath = await download.path();
  expect(zipPath).toBeTruthy();

  // Как будто телефон потерян: чистим IndexedDB и убеждаемся, что картотека пуста. Ждём само удаление:
  // приложение уступает базу по versionchange (db.ts) — раньше запрос висел в «blocked», и reload
  // в WebKit иногда обгонял его, оставляя старые данные (флейк под параллельной нагрузкой)
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase('music-catalog');
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
  );
  await page.reload();
  await expect(page.getByText('0 релизов · 0 тегов')).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles(zipPath!);
  await expect(page.getByRole('heading', { name: 'Заменить картотеку на этом устройстве?' })).toBeVisible();
  await expect(page.getByText('В архиве 3 релиза.')).toBeVisible();
  await page.getByRole('button', { name: 'Заменить' }).click();
  await expect(page.getByText('3 релиза')).toBeVisible();

  await page.goto('./');
  await expect(page.getByRole('list').getByRole('link').filter({ hasText: 'In Rainbows' })).toBeVisible();
  await expect(page.getByRole('list').getByRole('link').filter({ hasText: 'Группа крови' })).toBeVisible();
  await expect(page.getByRole('list').getByRole('link').filter({ hasText: 'Ёлка' })).toBeVisible();
});

test('импорт ZIP можно отменить в диалоге подтверждения', async ({ page }) => {
  await seed(page, { tags: TAGS, releases: RELEASES.slice(0, 1) });
  await page.goto('./#/settings');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать резервную копию' }).click();
  const zipPath = await (await downloadPromise).path();

  await page.locator('input[type="file"]').setInputFiles(zipPath!);
  await expect(page.getByRole('heading', { name: 'Заменить картотеку на этом устройстве?' })).toBeVisible();
  await page.getByRole('button', { name: 'Отмена' }).click();
  await expect(page.getByText('1 релиз')).toBeVisible();
});

test('загрузить версию с сайта заменяет неопубликованные правки', async ({ page }) => {
  const gh = await mockGitHub(page);
  await seed(page, { tags: TAGS, releases: RELEASES });
  await page.goto('./#/settings');
  await page.getByLabel('Репозиторий на GitHub').fill(gh.repo);
  await page.getByLabel('Токен GitHub').fill('github_pat_test');
  await page.getByRole('button', { name: 'Подключить и опубликовать' }).click();
  await page.getByRole('button', { name: 'Публиковать' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Опубликовано' })).toBeVisible();

  // Неопубликованное изменение: добавляем альбом, но не ждём автопубликацию
  await page.goto('./#/add');
  await page.getByRole('button', { name: 'Заполнить вручную' }).click();
  await page.getByLabel('Название', { exact: true }).fill('Черновик');
  await page.getByLabel('Исполнитель').fill('Тест');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('heading', { name: 'Черновик' })).toBeVisible();

  await page.goto('./#/settings');
  await expect(page.getByText('4 релиза')).toBeVisible();
  await page.getByRole('button', { name: 'Загрузить версию с сайта' }).click();
  await expect(page.getByRole('heading', { name: 'Загрузить картотеку с сайта?' })).toBeVisible();
  await page.getByRole('button', { name: 'Загрузить с сайта' }).click();
  await expect(page.getByText('3 релиза')).toBeVisible();

  await page.goto('./');
  await expect(page.getByRole('list').getByRole('link').filter({ hasText: 'Черновик' })).toHaveCount(0);
});
