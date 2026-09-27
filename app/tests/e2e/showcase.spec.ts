import { expect, test, type Locator, type Page } from '@playwright/test';
import { FakeGitHub } from '../fakeGithub';
import { ID, RELEASES, TAGS, seed } from './seed';

/** api.github.com в памяти теста (как в publish.spec.ts) */
async function mockGitHub(page: Page): Promise<FakeGitHub> {
  const gh = await FakeGitHub.create();
  await page.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    const body = req.postData();
    const r = await gh.handle(req.method(), req.url(), body ? JSON.parse(body) : undefined);
    await route.fulfill({ status: r.status, json: r.json });
  });
  return gh;
}

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
  await expect(showcase.getByRole('heading', { name: 'Топ-3 альбома' })).toBeVisible();
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
  await expect(showcase.getByRole('heading', { name: 'Топ-3 артиста' })).toBeVisible();
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

test('владелец без публикации не видит «Поделиться» — ссылка была бы нерабочей у друга', async ({ page }) => {
  await seed(page, { tags: TAGS, releases: RELEASES });
  await page.goto('./#/showcase');
  await expect(page.getByLabel('Поделиться витриной')).toHaveCount(0);
});

test('владелец делится витриной: QR ведёт на ту же ссылку, что показана текстом', async ({ page }) => {
  const gh = await mockGitHub(page);
  await seed(page, { tags: TAGS, releases: RELEASES });
  await page.goto('./#/settings');
  await page.getByLabel('Репозиторий на GitHub').fill(gh.repo);
  await page.getByLabel('Токен GitHub').fill('github_pat_test');
  await page.getByRole('button', { name: 'Подключить и опубликовать' }).click();
  await page.getByRole('button', { name: 'Публиковать' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Опубликовано' })).toBeVisible();

  await page.goto('./#/showcase');
  await page.getByLabel('Поделиться витриной').click();
  const dialog = page.getByRole('dialog', { name: 'Поделиться витриной' });
  await expect(dialog.getByRole('img', { name: 'QR-код со ссылкой на витрину' })).toBeVisible();
  await expect(dialog.getByText(/#\/showcase$/)).toBeVisible();

  await dialog.getByRole('button', { name: 'Закрыть' }).click();
  await expect(dialog).toBeHidden();
});

test('зритель видит закреплённых владельцем артистов — они приходят в опубликованном каталоге', async ({
  page,
}) => {
  // Раньше артисты жили только в IndexedDB владельца: до друзей полка «Любимые артисты» не доходила
  await mockAsViewer(page, { pinnedArtists: [{ name: 'Radiohead', releaseId: ID.rainbows }] });
  await page.goto('./#/showcase');
  const showcase = page.getByRole('tabpanel', { name: 'Витрина' });
  await expect(showcase.getByRole('heading', { name: 'Топ-3 артиста' })).toBeVisible();
  await expect(showcase.getByRole('link', { name: /Radiohead/ })).toHaveAttribute(
    'href',
    `#/release/${ID.rainbows}`,
  );
  // Подсказки «Долгим нажатием…» — только владельцу
  await expect(showcase.getByText('Долгим нажатием')).toHaveCount(0);
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

test('зритель тоже может поделиться ссылкой на витрину — публикация уже есть по определению', async ({
  page,
}) => {
  await mockAsViewer(page);
  await page.goto('./#/showcase');
  await page.getByLabel('Поделиться витриной').click();
  const dialog = page.getByRole('dialog', { name: 'Поделиться витриной' });
  await expect(dialog.getByText(/#\/showcase$/)).toBeVisible();
});

/** Топ-3 (ADR 0011): ровно 3 места, четвёртый не закрепляется, пока не освободить одно. */
test('топ-3 альбомов занят — четвёртый долгим нажатием не закрепляется', async ({ page }) => {
  const at = (h: number) => new Date(2024, 0, 1, h).toISOString();
  const albums = ['Album 1', 'Album 2', 'Album 3', 'Album 4'].map((title, i) => ({
    id: `00000000-0000-4000-8000-0000000000d${i + 1}`,
    title,
    artist: 'X',
    createdAt: at(i),
    pinned: i < 3,
    pinnedAt: i < 3 ? at(i) : undefined,
  }));
  await seed(page, { tags: [], releases: albums });

  const catalog = page.getByRole('tabpanel', { name: 'Картотека' });
  const cover = catalog.getByRole('list').getByRole('link').filter({ hasText: 'Album 4' });
  await longPress(cover);
  await expect(page.getByText('Топ-3 альбомов уже занят')).toBeVisible();

  await page.getByRole('tab', { name: 'Витрина' }).click();
  const showcase = page.getByRole('tabpanel', { name: 'Витрина' });
  await expect(showcase.getByText('Album 4')).toHaveCount(0);
  await expect(showcase.getByRole('listitem').filter({ hasText: 'Album' })).toHaveCount(3);
});

test('топ-3 артистов занят — четвёртый долгим нажатием не закрепляется', async ({ page }) => {
  const release = {
    id: '00000000-0000-4000-8000-0000000000e1',
    title: 'R',
    artist: 'Свежий',
    createdAt: '2024-01-01',
  };
  await seed(page, {
    tags: [],
    releases: [release],
    pinnedArtists: [
      { name: 'A1', releaseId: release.id },
      { name: 'A2', releaseId: release.id },
      { name: 'A3', releaseId: release.id },
    ],
  });

  await page.goto(`./#/release/${release.id}`);
  await longPress(page.getByText('Свежий', { exact: true }));
  await expect(page.getByText('Топ-3 артистов уже занят')).toBeVisible();

  await page.goto('./#/showcase');
  const showcase = page.getByRole('tabpanel', { name: 'Витрина' });
  await expect(showcase.getByText('Свежий')).toHaveCount(0);
});

/** Пьедестал (ADR 0011): при полном топ-3 первое место — по центру и выше (крупнее) остальных, а не
 * первым слева, как в обычном порядке чтения. Ранг тут называет сама позиция/размер, отдельной
 * плашки с цифрой на диске больше нет — проверяем расположение плиток, а не подпись. */
test('пьедестал: первое место по центру и крупнее у топ-3 альбомов и артистов', async ({ page }) => {
  const at = (h: number) => new Date(2024, 0, 1, h).toISOString();
  const albums = ['Album 1', 'Album 2', 'Album 3'].map((title, i) => ({
    id: `00000000-0000-4000-8000-0000000000f${i + 1}`,
    title,
    artist: 'X',
    createdAt: at(i),
    pinned: true,
    pinnedAt: at(i),
  }));
  await seed(page, {
    tags: [],
    releases: albums,
    pinnedArtists: [
      { name: 'A1', releaseId: albums[0]!.id },
      { name: 'A2', releaseId: albums[1]!.id },
      { name: 'A3', releaseId: albums[2]!.id },
    ],
  });

  await page.goto('./#/showcase');
  const showcase = page.getByRole('tabpanel', { name: 'Витрина' });

  for (const heading of ['Топ-3 альбома', 'Топ-3 артиста']) {
    const section = showcase.locator('section', { has: page.getByRole('heading', { name: heading }) });
    const [box1, box2, box3] = await Promise.all([
      section.locator('[data-rank="1"]').boundingBox(),
      section.locator('[data-rank="2"]').boundingBox(),
      section.locator('[data-rank="3"]').boundingBox(),
    ]);
    // Порядок слева направо — второе, первое, третье место
    expect(box2!.x).toBeLessThan(box1!.x);
    expect(box1!.x).toBeLessThan(box3!.x);
    // Первое место крупнее и потому выше остальных (подписи выровнены по нижнему краю)
    expect(box1!.y).toBeLessThan(box2!.y);
    expect(box1!.y).toBeLessThan(box3!.y);
  }
});

/** На большом экране профиль — не тесная строка сверху, а полноценная левая колонка (ADR 0011). */
test('на широком экране профиль становится левой колонкой, а не верхней строкой', async ({ page }) => {
  await seed(page, { tags: TAGS, releases: RELEASES });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('./#/showcase');
  const showcase = page.getByRole('tabpanel', { name: 'Витрина' });

  const heroBox = await showcase.locator('[class*="hero"]').first().boundingBox();
  const contentBox = await showcase.locator('[class*="content"]').first().boundingBox();
  expect(heroBox).toBeTruthy();
  expect(contentBox).toBeTruthy();
  // Колонки рядом на одной высоте, а не профиль над списком
  expect(heroBox!.x + heroBox!.width).toBeLessThanOrEqual(contentBox!.x + 1);
  expect(Math.abs(heroBox!.y - contentBox!.y)).toBeLessThan(40);
});

/** Друг открывает опубликованную ссылку — картотека только для просмотра (как в publish.spec.ts). */
async function mockAsViewer(page: Page, extra: Record<string, unknown> = {}): Promise<void> {
  const published = {
    ...extra,
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
