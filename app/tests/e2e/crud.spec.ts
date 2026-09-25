import { expect, test } from '@playwright/test';

test('пустая картотека → добавить альбом вручную → карточка → перезапуск', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Картотека пуста' })).toBeVisible();
  await page.getByRole('link', { name: 'Добавить альбом' }).click();

  await page.getByLabel('Название', { exact: true }).fill('In Rainbows');
  await page.getByLabel('Исполнитель').fill('Radiohead');
  await page.getByPlaceholder('Год').fill('2007');

  // Треклист вставкой списка
  await page.getByText('Треклист').click();
  await page.getByLabel('Добавить трек').fill('1. 15 Step 3:57\n2. Bodysnatchers 4:02\n3. Nude 4:15');
  await expect(page.getByLabel('Название трека 3')).toHaveValue('Nude');
  await page.getByRole('button', { name: 'Любимый трек' }).nth(2).click();

  // Новый тег с группой
  await page.getByLabel('Добавить тег').fill('осень');
  await page.getByLabel('Добавить тег').press('Enter');
  await page.getByRole('button', { name: 'Время' }).click();
  await expect(page.getByRole('button', { name: 'Убрать тег осень' })).toBeVisible();

  // Ссылка
  await page.getByText('Ссылки «Слушать»').click();
  await page.getByLabel('Добавить ссылку').fill('music.yandex.ru/album/1');
  await page.getByLabel('Добавить ссылку').press('Enter');

  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('heading', { name: 'In Rainbows' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Яндекс Музыка' })).toHaveAttribute(
    'href',
    'https://music.yandex.ru/album/1',
  );
  await expect(page.getByRole('button', { name: 'Убрать «Nude» из любимых' })).toBeVisible();

  // Звёздочка на карточке
  await page.getByRole('button', { name: 'Отметить «15 Step» как любимый' }).click();
  await expect(page.getByRole('button', { name: 'Убрать «15 Step» из любимых' })).toBeVisible();

  // Данные переживают перезапуск
  await page.reload();
  await expect(page.getByRole('heading', { name: 'In Rainbows' })).toBeVisible();
  await expect(page.getByText('★ 2')).toBeVisible();
  await page.getByRole('button', { name: 'Назад' }).click();
  await expect(page.getByText('1 релиз')).toBeVisible();
});

test('защита несохранённых изменений и удаление с подтверждением', async ({ page }) => {
  await page.goto('./#/new');
  await page.getByLabel('Название', { exact: true }).fill('Группа крови');
  await page.getByRole('button', { name: 'Закрыть' }).click();
  await expect(page.getByRole('heading', { name: 'Выйти без сохранения?' })).toBeVisible();
  await page.getByRole('button', { name: 'Остаться' }).click();
  await expect(page.getByLabel('Название', { exact: true })).toHaveValue('Группа крови');

  await page.getByLabel('Исполнитель').fill('Кино');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await page.getByRole('link', { name: 'Изменить' }).click();
  await page.getByRole('button', { name: 'Удалить релиз' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Удалить' }).click();
  await expect(page.getByRole('heading', { name: 'Картотека пуста' })).toBeVisible();
});

test('без названия сохранить нельзя', async ({ page }) => {
  await page.goto('./#/new');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText('Без названия никак')).toBeVisible();
  await expect(page.getByText('Укажи исполнителя')).toBeVisible();
});
