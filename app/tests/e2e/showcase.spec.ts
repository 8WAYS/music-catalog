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
  // Обе вкладки смонтированы одновременно (свайп ADR 0011) — те же тексты («3 релиза» и т.п.)
  // могут повториться на Витрине, поэтому запросы уточняем через tabpanel с именем вкладки.
  const catalog = page.getByRole('tabpanel', { name: 'Картотека' });
  const showcase = page.getByRole('tabpanel', { name: 'Витрина' });
  await expect(catalog.getByText('3 релиза')).toBeVisible();

  const cover = catalog.getByRole('list').getByRole('link').filter({ hasText: 'In Rainbows' });
  await longPress(cover);
  await expect(page.getByText('Закреплено на витрине')).toBeVisible();
  // Клик после долгого нажатия погашен — на карточку релиза не перешли
  await expect(page).not.toHaveURL(/#\/release\//);

  await page.getByRole('tab', { name: 'Витрина' }).click();
  await expect(showcase.getByRole('heading', { name: 'Любимые альбомы' })).toBeVisible();
  await expect(showcase.getByText('In Rainbows')).toBeVisible();
  await expect(showcase.getByRole('heading', { name: 'Синглы и EP' })).toBeVisible();
  await expect(showcase.getByText('Долгим нажатием на обложку сингла или EP')).toBeVisible();

  // Повторное долгое нажатие открепляет
  await page.getByRole('tab', { name: 'Картотека' }).click();
  await longPress(cover);
  await expect(page.getByText('Откреплено с витрины')).toBeVisible();
});

test('свайп переключает Картотеку и Витрину', async ({ page, browserName }) => {
  // Playwright WebKit не доставляет pointerup после многошагового синтетического drag (проверено
  // отдельно: события обрываются на середине пути, воспроизводимо и без setPointerCapture) — то же
  // переключение вкладок уже покрыто кликом по табу выше и вручную проверено в реальном браузере.
  test.skip(
    browserName === 'webkit',
    'известное ограничение синтетического pointer-драга в Playwright WebKit',
  );
  await seed(page, { tags: TAGS, releases: RELEASES });
  // Тянем на уровне сетки релизов, а не тулбара — правее там select сортировки, и mousedown на
  // нём в Chromium сам открывает нативный попап, до наших pointer-обработчиков жест не доходит.
  const grid = page.getByRole('tabpanel', { name: 'Картотека' }).getByRole('list');
  const y = (await grid.boundingBox())!.y + 10;
  const width = page.viewportSize()!.width;

  await page.mouse.move(width - 20, y);
  await page.mouse.down();
  await page.mouse.move(20, y, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByRole('tab', { name: 'Витрина', selected: true })).toBeVisible();
  await expect(page).toHaveURL(/#\/showcase/);

  // Небольшой сдвиг, не дотянувший до порога, — вкладка остаётся той же
  await page.mouse.move(200, y);
  await page.mouse.down();
  await page.mouse.move(220, y, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole('tab', { name: 'Витрина', selected: true })).toBeVisible();

  await page.mouse.move(20, y);
  await page.mouse.down();
  await page.mouse.move(width - 20, y, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByRole('tab', { name: 'Картотека', selected: true })).toBeVisible();
  await expect(page).toHaveURL(/#\/(\?.*)?$/);
});

test('долгое нажатие на имя исполнителя закрепляет артиста', async ({ page }) => {
  await seed(page, { tags: TAGS, releases: RELEASES });
  await page.goto(`./#/release/${ID.rainbows}`);

  await longPress(page.getByText('Radiohead', { exact: true }));
  await expect(page.getByText('Артист закреплён на витрине')).toBeVisible();
  await expect(page.getByText('— закреплено на витрине')).toBeAttached();

  await page.goto('./#/showcase');
  const showcase = page.getByRole('tabpanel', { name: 'Витрина' });
  await expect(showcase.getByRole('heading', { name: 'Любимые артисты' })).toBeVisible();
  await expect(showcase.getByRole('link', { name: /Radiohead/ })).toBeVisible();
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
  await expect(page.getByRole('tab', { name: 'Витрина', selected: true })).toBeVisible();
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
