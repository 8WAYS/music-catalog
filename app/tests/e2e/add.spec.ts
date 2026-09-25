import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Ответы iTunes подменяются: тесты не зависят от сети и лимитов (ADR 0004)
const ART = readFileSync(new URL('../../public/icons/icon-512.png', import.meta.url));
const album = {
  wrapperType: 'collection',
  collectionId: 1109714933,
  collectionName: 'In Rainbows',
  artistName: 'Radiohead',
  releaseDate: '2007-10-10T07:00:00Z',
  primaryGenreName: 'Alternative',
  trackCount: 3,
  artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/test/100x100bb.jpg',
  collectionViewUrl: 'https://music.apple.com/us/album/in-rainbows/1109714933',
};
const ep = { ...album, collectionId: 7, collectionName: 'In Rainbows Disk 2 - EP', trackCount: 8 };
const song = (n: number, name: string, ms: number) => ({
  wrapperType: 'track',
  kind: 'song',
  discNumber: 1,
  trackNumber: n,
  trackName: name,
  trackTimeMillis: ms,
});

async function mockItunes(page: Page, search: unknown[] = [album, ep]) {
  const cors = { 'access-control-allow-origin': '*' };
  await page.route('https://itunes.apple.com/search?**', (r) =>
    r.fulfill({ json: { resultCount: search.length, results: search }, headers: cors }),
  );
  await page.route('https://itunes.apple.com/lookup?**', (r) =>
    r.fulfill({
      json: {
        results: [
          album,
          song(2, 'Bodysnatchers', 242_000),
          song(1, '15 Step', 237_000),
          song(3, 'Nude', 255_000),
        ],
      },
      headers: cors,
    }),
  );
  await page.route('https://is1-ssl.mzstatic.com/**', (r) =>
    r.fulfill({ body: ART, contentType: 'image/png', headers: cors }),
  );
}

test('«+» → поиск → выбор → редактор заполнен → сохранить', async ({ page }) => {
  await mockItunes(page);
  await page.goto('./');
  await page.getByRole('link', { name: 'Добавить альбом' }).click();
  await expect(page.getByRole('heading', { name: 'Добавить релиз' })).toBeVisible();

  await page.getByLabel('Альбом или сингл').fill('In Rainbows');
  await page.getByLabel('Исполнитель').fill('Radiohead');
  await page.getByRole('button', { name: 'Найти' }).click();

  const results = page.getByRole('list', { name: 'Результаты поиска' }).getByRole('button');
  await expect(results).toHaveCount(2);
  await expect(results.nth(1)).toContainText('In Rainbows Disk 2');
  await expect(results.nth(1)).toContainText('EP');
  await results.first().click();

  // Редактор: поля, треклист по порядку, обложка
  await expect(page.getByRole('heading', { name: 'Новый релиз' })).toBeVisible();
  await expect(page.getByLabel('Название', { exact: true })).toHaveValue('In Rainbows');
  await expect(page.getByLabel('Исполнитель')).toHaveValue('Radiohead');
  await expect(page.getByPlaceholder('Год')).toHaveValue('2007');
  await expect(page.getByLabel('Название трека 1')).toHaveValue('15 Step');
  await expect(page.getByLabel('Название трека 3')).toHaveValue('Nude');
  await expect(page.getByRole('button', { name: 'Заменить обложку' })).toBeVisible();

  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('heading', { name: 'In Rainbows', level: 1 })).toBeVisible();
  await expect(page.getByText('3 трека · 12 мин')).toBeVisible();
  await expect(page.locator('img').first()).toBeVisible();

  // Следующее добавление начинается с чистого листа
  await page.goto('./#/add');
  await expect(page.getByLabel('Альбом или сингл')).toHaveValue('');
});

test('«Назад» из редактора возвращает к результатам', async ({ page }) => {
  await mockItunes(page);
  await page.goto('./#/add');
  await page.getByLabel('Альбом или сингл').fill('In Rainbows');
  await page.getByLabel('Альбом или сингл').press('Enter');
  await page.getByRole('list', { name: 'Результаты поиска' }).getByRole('button').first().click();
  await expect(page.getByRole('heading', { name: 'Новый релиз' })).toBeVisible();

  await page.getByRole('button', { name: 'Закрыть' }).click();
  await page.getByRole('button', { name: 'Выйти' }).click();
  await expect(page.getByRole('list', { name: 'Результаты поиска' }).getByRole('button')).toHaveCount(2);
});

test('нет связи с iTunes → понятная ошибка → ручной ввод с набранным', async ({ page }) => {
  await page.route('https://itunes.apple.com/**', (r) => r.abort('internetdisconnected'));
  await page.goto('./#/add');
  await page.getByLabel('Альбом или сингл').fill('Группа крови');
  await page.getByLabel('Исполнитель').fill('Кино');
  await page.getByRole('button', { name: 'Найти' }).click();
  await expect(page.getByText('Нет связи с iTunes. Проверь интернет или заполни вручную.')).toBeVisible();

  await page.getByRole('button', { name: 'Заполнить вручную' }).click();
  await expect(page.getByLabel('Название', { exact: true })).toHaveValue('Группа крови');
  await expect(page.getByLabel('Исполнитель')).toHaveValue('Кино');
});

test('ничего не нашлось', async ({ page }) => {
  await mockItunes(page, []);
  await page.goto('./#/add');
  await page.getByLabel('Исполнитель').fill('Никому не известная группа');
  await page.getByRole('button', { name: 'Найти' }).click();
  await expect(page.getByText(/ничего не нашлось/)).toBeVisible();
});
