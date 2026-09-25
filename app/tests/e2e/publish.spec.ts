import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { FakeGitHub } from '../fakeGithub';
import { RELEASES, TAGS, seed } from './seed';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
};

/** api.github.com в памяти теста */
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

const tagId = randomUUID();
const PUBLISHED = {
  version: 2,
  revision: 12,
  publishedAt: '2026-09-25T12:00:00Z',
  owner: { name: 'Wailee' },
  tags: [{ id: tagId, name: 'осень', group: 'time' }],
  releases: [
    {
      id: randomUUID(),
      title: 'In Rainbows',
      artist: 'Radiohead',
      type: 'album',
      year: 2007,
      tagIds: [tagId],
      tracks: [{ id: randomUUID(), position: 1, title: '15 Step', favorite: true }],
      links: [],
      createdAt: '2026-09-01T10:00:00Z',
      updatedAt: '2026-09-01T10:00:00Z',
    },
    {
      id: randomUUID(),
      title: 'Группа крови',
      artist: 'Кино',
      type: 'album',
      tagIds: [],
      tracks: [],
      links: [],
      createdAt: '2026-09-02T10:00:00Z',
      updatedAt: '2026-09-02T10:00:00Z',
    },
  ],
};

const publishCatalog = (page: Page) =>
  page.route('**/data/catalog.json*', (r) => r.fulfill({ json: PUBLISHED }));

test('владелец подключает GitHub: публикация и автопубликация изменений', async ({ page }) => {
  const gh = await mockGitHub(page);
  await seed(page, { tags: TAGS, releases: RELEASES });
  await expect(page.getByRole('link', { name: 'Не опубликована' })).toBeVisible();

  await page.getByRole('link', { name: 'Не опубликована' }).click();
  await page.getByLabel('Репозиторий на GitHub').fill(gh.repo);
  await page.getByLabel('Токен GitHub').fill('github_pat_test');
  await page.getByRole('button', { name: 'Подключить и опубликовать' }).click();
  await expect(page.getByRole('heading', { name: 'Картотека станет публичной' })).toBeVisible();
  await page.getByRole('button', { name: 'Публиковать' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Опубликовано' })).toBeVisible();
  expect(gh.dataCommits).toHaveLength(1);
  expect(JSON.parse(gh.text('data/catalog.json')!).releases).toHaveLength(3);

  // Изменение уходит само через несколько секунд
  await page.getByRole('button', { name: 'Назад' }).click();
  await expect(page.getByRole('link', { name: 'Опубликовано' })).toBeVisible();
  await page.getByRole('list').getByRole('link').filter({ hasText: 'In Rainbows' }).click();
  await page.getByRole('button', { name: 'Отметить «Nude» как любимый' }).click();
  await page.getByRole('button', { name: 'Назад' }).click();
  await expect(page.getByRole('link', { name: 'Есть изменения' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Опубликовано' })).toBeVisible({ timeout: 15_000 });
  expect(gh.dataCommits).toHaveLength(2);
  const tracks = JSON.parse(gh.text('data/catalog.json')!).releases.find(
    (r: { title: string }) => r.title === 'In Rainbows',
  ).tracks;
  expect(tracks.find((t: { title: string }) => t.title === 'Nude').favorite).toBe(true);

  // После перезапуска устройство остаётся владельцем, изменений нет
  await page.reload();
  await expect(page.getByRole('link', { name: 'Опубликовано' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Добавить релиз' })).toBeVisible();
});

test('неверный токен — понятная ошибка, публикация не подключается', async ({ page }) => {
  const gh = await mockGitHub(page);
  gh.forceStatus = 401;
  await page.goto('./#/settings');
  await page.getByLabel('Репозиторий на GitHub').fill(gh.repo);
  await page.getByLabel('Токен GitHub').fill('github_pat_wrong');
  await page.getByRole('button', { name: 'Подключить и опубликовать' }).click();
  await page.getByRole('button', { name: 'Публиковать' }).click();
  await expect(page.getByRole('alert')).toHaveText('Токен не подходит или истёк — создай новый на GitHub.');
  await expect(page.getByRole('button', { name: 'Подключить и опубликовать' })).toBeVisible();
});

test('друг открывает ссылку: картотека владельца только для просмотра', async ({ page }) => {
  await publishCatalog(page);
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Картотека Wailee' })).toBeVisible();
  await expect(page.getByText('Только просмотр')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Добавить релиз' })).toHaveCount(0);

  await page.getByRole('group', { name: 'Фильтр по тегам' }).getByRole('button', { name: 'осень' }).click();
  await page.getByRole('list').getByRole('link').first().click();
  await expect(page.getByRole('heading', { name: 'In Rainbows', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Изменить' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /любимый|из любимых/ })).toHaveCount(0);

  await page.goto('./#/settings');
  await expect(page.getByText('Это моя картотека')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Публикация' })).toHaveCount(0);
});

test('у друга есть своя картотека: видит опубликованную, может переключиться на свою', async ({ page }) => {
  await seed(page, { tags: TAGS, releases: RELEASES });
  await publishCatalog(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Картотека Wailee' })).toBeVisible();

  await page.goto('./#/settings');
  await expect(page.getByText('своя неопубликованная картотека: 3 релиза')).toBeVisible();
  await page.getByRole('button', { name: 'Открыть свою картотеку' }).click();
  await expect(page.getByRole('link', { name: 'Добавить релиз' })).toBeVisible();
  await expect(page.getByText('3 релиза')).toBeVisible();

  await page.goto('./#/settings');
  await page.getByRole('button', { name: 'Смотреть опубликованную картотеку' }).click();
  await expect(page.getByRole('heading', { name: 'Картотека Wailee' })).toBeVisible();
});

test('новое устройство владельца: вход по токену загружает опубликованную картотеку', async ({ page }) => {
  const gh = await mockGitHub(page);
  await gh.commitFiles({ 'data/catalog.json': JSON.stringify(PUBLISHED) }, 'data: publish rev 12');
  await publishCatalog(page);
  await page.goto('./#/settings');
  await page.getByText('Это моя картотека').click();
  await page.getByLabel('Репозиторий на GitHub').fill(gh.repo);
  await page.getByLabel('Токен GitHub').fill('github_pat_test');
  await page.getByRole('button', { name: 'Войти как владелец' }).click();
  await expect(page.getByRole('link', { name: 'Добавить релиз' })).toBeVisible();
  await expect(page.getByText('2 релиза')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Опубликовано' })).toBeVisible();
  expect(gh.dataCommits).toHaveLength(1); // только исходный — после загрузки публиковать нечего
});
