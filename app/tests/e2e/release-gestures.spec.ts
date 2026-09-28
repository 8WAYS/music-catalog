import { expect, test, type Page } from '@playwright/test';
import { ID, RELEASES, TAGS, seed } from './seed';

/**
 * Жесты на карточке релиза (макет v3, useReleaseSwipe.ts): свайп влево/вправо — соседний релиз из
 * того же порядка, что только что видели на Картотеке (browsingOrder); свайп вниз с самого верха —
 * закрыть карточку. Порядок сортировки по умолчанию («Сначала новые») для RELEASES (seed.ts):
 * Группа крови (03-09, новее всех) → Ёлка (02-09) → In Rainbows (01-09, старше всех).
 */
async function dragOnHero(page: Page, dx: number, dy = 0): Promise<void> {
  const hero = page.getByRole('img').first();
  const box = (await hero.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 10 });
  await page.mouse.up();
}

test.describe('свайп между релизами и закрытие карточки', () => {
  test('свайп по горизонтали переключает на соседний релиз из выборки Картотеки', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName === 'webkit',
      'известное ограничение синтетического pointer-драга в Playwright WebKit',
    );
    await seed(page, { tags: TAGS, releases: RELEASES });
    // Заходим со списка — иначе browsingOrder (store/app.ts) не заполнится
    await page.goto('./');
    await page.getByRole('list').getByRole('link').filter({ hasText: 'Ёлка' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Ёлка' })).toBeVisible();

    // Влево — следующий по порядку (Ёлка → In Rainbows, старше)
    await dragOnHero(page, -200);
    await expect(page.getByRole('heading', { level: 1, name: 'In Rainbows' })).toBeVisible();

    // Вправо — обратно (In Rainbows → Ёлка)
    await dragOnHero(page, 200);
    await expect(page.getByRole('heading', { level: 1, name: 'Ёлка' })).toBeVisible();

    // Вправо ещё раз — предыдущий по порядку (Ёлка → Группа крови, новее всех)
    await dragOnHero(page, 200);
    await expect(page.getByRole('heading', { level: 1, name: 'Группа крови' })).toBeVisible();
  });

  test('на границе выборки свайп в невозможную сторону не переключает', async ({ page, browserName }) => {
    test.skip(
      browserName === 'webkit',
      'известное ограничение синтетического pointer-драга в Playwright WebKit',
    );
    await seed(page, { tags: TAGS, releases: RELEASES });
    await page.goto('./');
    // Группа крови — самый первый (новее всех), дальше «вправо» (к предыдущему) идти некуда
    await page.getByRole('list').getByRole('link').filter({ hasText: 'Группа крови' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Группа крови' })).toBeVisible();

    await dragOnHero(page, 200);
    await expect(page.getByRole('heading', { level: 1, name: 'Группа крови' })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(ID.blood));
  });

  test('открытие карточки напрямую по ссылке — свайп по горизонтали не работает', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName === 'webkit',
      'известное ограничение синтетического pointer-драга в Playwright WebKit',
    );
    await seed(page, { tags: TAGS, releases: RELEASES });
    // seed() оставляет открытой Картотеку — переход по хэшу внутри того же документа её бы не
    // размонтировал, а именно её эффект и заполняет browsingOrder. Настоящая прямая ссылка —
    // свежая загрузка сразу на хэше карточки, Картотека вообще не успевает смонтироваться.
    await page.goto(`./#/release/${ID.elka}`);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Ёлка' })).toBeVisible();

    await dragOnHero(page, -200);
    await expect(page.getByRole('heading', { level: 1, name: 'Ёлка' })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(ID.elka));
  });

  test('свайп вниз с самого верха закрывает карточку', async ({ page, browserName }) => {
    test.skip(
      browserName === 'webkit',
      'известное ограничение синтетического pointer-драга в Playwright WebKit',
    );
    await seed(page, { tags: TAGS, releases: RELEASES });
    await page.goto(`./#/release/${ID.elka}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Ёлка' })).toBeVisible();

    await dragOnHero(page, 0, 250);
    await expect(page.getByRole('tabpanel', { name: 'Картотека' })).toBeVisible();
    await expect(page).not.toHaveURL(/#\/release\//);
  });

  test('свайп вниз, не дотянутый до порога, возвращает карточку на место', async ({ page, browserName }) => {
    test.skip(
      browserName === 'webkit',
      'известное ограничение синтетического pointer-драга в Playwright WebKit',
    );
    await seed(page, { tags: TAGS, releases: RELEASES });
    await page.goto(`./#/release/${ID.elka}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Ёлка' })).toBeVisible();

    await dragOnHero(page, 0, 60);
    await expect(page.getByRole('heading', { level: 1, name: 'Ёлка' })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(ID.elka));
  });

  test('свайп вниз не с самого верха страницы не закрывает карточку', async ({ page, browserName }) => {
    test.skip(
      browserName === 'webkit',
      'известное ограничение синтетического pointer-драга в Playwright WebKit',
    );
    await seed(page, {
      tags: TAGS,
      releases: [{ ...RELEASES[0]!, tracks: Array.from({ length: 20 }, (_, i) => `Трек ${i + 1}`) }],
    });
    await page.goto(`./#/release/${ID.rainbows}`);
    await expect(page.getByRole('heading', { level: 1, name: 'In Rainbows' })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 300));

    await dragOnHero(page, 0, 250);
    await expect(page.getByRole('heading', { level: 1, name: 'In Rainbows' })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(ID.rainbows));
  });
});
