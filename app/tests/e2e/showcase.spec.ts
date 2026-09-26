import { expect, test, type Locator, type Page } from '@playwright/test';
import { ID, RELEASES, TAGS, seed } from './seed';

/**
 * Долгое нажатие (ADR 0011): настоящий клик с задержкой между mousedown/mouseup — так же, как
 * держит палец пользователь. Это же проверяет, что сам клик после долгого нажатия гасится
 * (иначе сработали бы и закрепление, и обычный переход по ссылке одновременно).
 */
async function longPress(locator: Locator, ms = 650): Promise<void> {
  await locator.click({ delay: ms });
}

test('долгое нажатие на обложку закрепляет релиз на витрине', async ({ page }) => {
  await seed(page, { tags: TAGS, releases: RELEASES });
  await expect(page.getByText('3 релиза')).toBeVisible();

  const cover = page.getByRole('list').getByRole('link').filter({ hasText: 'In Rainbows' });
  await longPress(cover);
  await expect(page.getByText('Закреплено на витрине')).toBeVisible();
  // Клик после долгого нажатия погашен — на карточку релиза не перешли
  await expect(page).not.toHaveURL(/#\/release\//);

  await page.getByRole('link', { name: 'Витрина' }).click();
  await expect(page.getByRole('heading', { name: 'Любимые альбомы' })).toBeVisible();
  await expect(page.getByText('In Rainbows')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Синглы и EP' })).toBeVisible();
  await expect(page.getByText('Долгим нажатием на обложку сингла или EP')).toBeVisible();

  // Повторное долгое нажатие открепляет
  await page.goBack();
  await longPress(page.getByRole('list').getByRole('link').filter({ hasText: 'In Rainbows' }));
  await expect(page.getByText('Откреплено с витрины')).toBeVisible();
});

test('долгое нажатие на имя исполнителя закрепляет артиста', async ({ page }) => {
  await seed(page, { tags: TAGS, releases: RELEASES });
  await page.goto(`./#/release/${ID.rainbows}`);

  await longPress(page.getByText('Radiohead', { exact: true }));
  await expect(page.getByText('Артист закреплён на витрине')).toBeVisible();
  await expect(page.getByText('— закреплено на витрине')).toBeAttached();

  await page.goto('./#/showcase');
  await expect(page.getByRole('heading', { name: 'Любимые артисты' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Radiohead/ })).toBeVisible();
});

test('пустая витрина у владельца — подсказки, у зрителя — без них', async ({ page }) => {
  await seed(page, { tags: TAGS, releases: RELEASES });
  await page.goto('./#/showcase');
  await expect(page.getByText('Долгим нажатием на имя исполнителя')).toBeVisible();
  await expect(page.getByText('Долгим нажатием на обложку альбома')).toBeVisible();

  await mockAsViewer(page);
  // Смена хэша не перезагружает документ — нужен полный reload, чтобы режим владелец/зритель пересчитался
  await page.reload();
  await page.goto('./#/showcase');
  await expect(page.getByRole('heading', { name: 'Витрина' })).toBeVisible();
  await expect(page.getByText('Долгим нажатием')).toHaveCount(0);
});

test('у зрителя долгое нажатие ничего не закрепляет — просто переходит по ссылке', async ({ page }) => {
  await mockAsViewer(page);
  await page.goto('./');
  await expect(page.getByRole('link', { name: 'Добавить релиз' })).toHaveCount(0);

  const cover = page.getByRole('list').getByRole('link').filter({ hasText: 'In Rainbows' });
  await longPress(cover);
  // Никакого тоста о закреплении — жест у зрителя не навешан вообще, а клик прошёл как обычный переход
  await expect(page.getByText(/[Зз]акреплен/)).toHaveCount(0);
  await expect(page).toHaveURL(/#\/release\//);
});

/** Друг открывает опубликованную ссылку — картотека только для просмотра (как в publish.spec.ts). */
async function mockAsViewer(page: Page): Promise<void> {
  const published = {
    version: 2,
    revision: 1,
    publishedAt: '2026-09-25T12:00:00Z',
    owner: { name: 'Wailee' },
    tags: TAGS,
    releases: RELEASES.map((r) => ({
      id: r.id,
      title: r.title,
      artist: r.artist,
      type: 'album',
      year: r.year,
      tagIds: r.tagIds ?? [],
      tracks: [],
      links: [],
      createdAt: r.createdAt,
      updatedAt: r.createdAt,
    })),
  };
  await page.route('**/data/catalog.json*', (r) => r.fulfill({ json: published }));
}
