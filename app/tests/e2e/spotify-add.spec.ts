import { expect, test, type Page } from '@playwright/test';
import { vkSearchUrl, yandexSearchUrl } from '../../src/services/links';
import { ID, RELEASES, TAGS, seed } from './seed';

const CORS = { 'access-control-allow-origin': '*' };

const album = {
  id: '7DQVAOZgpb1lHU2wY9Xztq',
  name: 'In Rainbows',
  artists: [{ name: 'Radiohead' }],
  release_date: '2007-10-10',
  total_tracks: 3,
  album_type: 'album',
  images: [{ url: 'https://i.scdn.co/image/big.jpg' }, { url: 'https://i.scdn.co/image/small.jpg' }],
};

async function mockSpotify(page: Page) {
  await page.route('https://api.spotify.com/v1/search**', (r) =>
    r.fulfill({ json: { albums: { items: [album] } }, headers: CORS }),
  );
  await page.route(`https://api.spotify.com/v1/albums/${album.id}/tracks**`, (r) =>
    r.fulfill({
      json: {
        items: [
          { name: '15 Step', track_number: 1, disc_number: 1, duration_ms: 237_000 },
          { name: 'Bodysnatchers', track_number: 2, disc_number: 1, duration_ms: 242_000 },
          { name: 'Nude', track_number: 3, disc_number: 1, duration_ms: 255_000 },
        ],
        next: null,
      },
      headers: CORS,
    }),
  );
}

/** Как будто вход через PKCE уже пройден — кладём токен прямо в meta, минуя редирект (ADR 0010). */
async function seedSpotifyConnected(page: Page): Promise<void> {
  await page.goto('./');
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('music-catalog');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put('test-client-id', 'spotifyClientId');
    tx.objectStore('meta').put('test-access-token', 'spotifyAccessToken');
    tx.objectStore('meta').put('test-refresh-token', 'spotifyRefreshToken');
    tx.objectStore('meta').put(Date.now() + 3_600_000, 'spotifyTokenExpiresAt');
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
}

test('Spotify не подключён — вкладка ведёт в настройки вместо поиска', async ({ page }) => {
  await page.goto('./#/add');
  await page.getByRole('radio', { name: 'Spotify' }).click();
  await expect(page.getByText('Spotify не подключён')).toBeVisible();
  await expect(page.getByLabel('Альбом или сингл')).toHaveCount(0);

  await page.getByRole('link', { name: 'настройках' }).click();
  await expect(page.getByRole('heading', { name: 'Источники' })).toBeVisible();
  await expect(page.getByLabel('Client ID')).toBeVisible();
});

test('поиск и выбор в Spotify: треклист заполнен, обложки нет — можно свою', async ({ page }) => {
  await mockSpotify(page);
  await seedSpotifyConnected(page);
  await page.goto('./#/add');
  await page.getByRole('radio', { name: 'Spotify' }).click();

  await page.getByLabel('Альбом или сингл').fill('In Rainbows');
  await page.getByLabel('Исполнитель').fill('Radiohead');
  await page.getByRole('button', { name: 'Найти' }).click();

  const results = page.getByRole('list', { name: 'Результаты поиска' }).getByRole('button');
  await expect(results).toHaveCount(1);
  await results.first().click();

  await expect(page.getByRole('heading', { name: 'Новый релиз' })).toBeVisible();
  await expect(page.getByLabel('Название', { exact: true })).toHaveValue('In Rainbows');
  await expect(page.getByLabel('Исполнитель')).toHaveValue('Radiohead');
  await expect(page.getByPlaceholder('Год')).toHaveValue('2007');
  await expect(page.getByLabel('Название трека 1')).toHaveValue('15 Step');
  await expect(page.getByLabel('Название трека 3')).toHaveValue('Nude');
  // Обложки от Spotify не бывает (CORS) — кнопка предлагает загрузить, а не «заменить»
  await expect(page.getByRole('button', { name: 'Загрузить обложку' })).toBeVisible();

  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('heading', { name: 'In Rainbows', level: 1 })).toBeVisible();
  await expect(page.getByText('3 трека · 12 мин')).toBeVisible();
});

test('настройки: подключённый Spotify показывает статус и «Отключить»', async ({ page }) => {
  await seedSpotifyConnected(page);
  await page.goto('./#/settings');
  await expect(page.getByText('Подключено — при добавлении релиза можно искать и в Spotify.')).toBeVisible();
  await page.getByRole('button', { name: 'Отключить' }).click();
  await expect(page.getByRole('heading', { name: 'Отключить Spotify?' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Отключить' }).click();
  await expect(page.getByLabel('Client ID')).toBeVisible();
});

/**
 * Кнопки «Найти на Spotify» / «Искать на Яндекс/VK Музыке» в редакторе ссылок (ADR 0014,
 * LinksEditor.tsx) — переиспользуют mockSpotify/seedSpotifyConnected выше вместо нового файла.
 */
test.describe('LinksEditor: поиск ссылок на других площадках', () => {
  test('без spotifyId — «Найти на Spotify» идёт в поиск и добавляет ссылку', async ({ page }) => {
    await mockSpotify(page);
    await seedSpotifyConnected(page);
    await seed(page, { tags: TAGS, releases: [RELEASES[0]!] });

    await page.goto(`./#/edit/${ID.rainbows}`);
    await page.getByText('Ссылки «Слушать»').click();
    await page.getByRole('button', { name: 'Найти на Spotify' }).click();

    await expect(page.getByText(`open.spotify.com/album/${album.id}`)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Найти на Spotify' })).toHaveCount(0);
  });

  test('с уже известным spotifyId — ссылка строится без обращения к поиску', async ({ page }) => {
    let searchHits = 0;
    await page.route('https://api.spotify.com/v1/search**', (r) => {
      searchHits++;
      return r.fulfill({ json: { albums: { items: [album] } }, headers: CORS });
    });
    await seed(page, {
      tags: TAGS,
      releases: [{ ...RELEASES[0]!, spotifyId: album.id }],
    });

    // Spotify не подключён вовсе — кнопка всё равно доступна: прямой id не требует сети/токена
    await page.goto(`./#/edit/${ID.rainbows}`);
    await page.getByText('Ссылки «Слушать»').click();
    await page.getByRole('button', { name: 'Найти на Spotify' }).click();

    await expect(page.getByText(`open.spotify.com/album/${album.id}`)).toBeVisible();
    expect(searchHits).toBe(0);
  });

  test('Spotify не подключён и spotifyId нет — кнопки не видно', async ({ page }) => {
    await seed(page, { tags: TAGS, releases: [RELEASES[0]!] });
    await page.goto(`./#/edit/${ID.rainbows}`);
    await page.getByText('Ссылки «Слушать»').click();
    await expect(page.getByRole('button', { name: 'Найти на Spotify' })).toHaveCount(0);
  });

  test('Яндекс/VK — ссылки поиска с текстом «артист название», ничего не добавляют сами', async ({
    page,
  }) => {
    await seed(page, { tags: TAGS, releases: [RELEASES[0]!] });
    await page.goto(`./#/edit/${ID.rainbows}`);
    await page.getByText('Ссылки «Слушать»').click();

    const query = 'Radiohead In Rainbows';
    await expect(page.getByRole('link', { name: 'Искать на Яндекс Музыке' })).toHaveAttribute(
      'href',
      yandexSearchUrl(query),
    );
    await expect(page.getByRole('link', { name: 'Искать в VK Музыке' })).toHaveAttribute(
      'href',
      vkSearchUrl(query),
    );
  });

  test('кнопка сервиса исчезает, когда ссылка того сервиса уже добавлена', async ({ page }) => {
    await seed(page, {
      tags: TAGS,
      releases: [{ ...RELEASES[0]!, links: [{ service: 'yandex', url: 'https://music.yandex.ru/album/1' }] }],
    });
    await page.goto(`./#/edit/${ID.rainbows}`);
    // Секция уже раскрыта сама — в релизе есть хотя бы одна ссылка (Editor.tsx: open={draft.links.length > 0})
    await expect(page.getByRole('link', { name: 'Искать на Яндекс Музыке' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Искать в VK Музыке' })).toBeVisible();
  });
});
