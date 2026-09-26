import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:4173/',
    locale: 'ru-RU',
    // Запросы через service worker не видит page.route — в тестах подменяем сеть напрямую
    serviceWorkers: 'block',
    // Переходы между экранами на полсекунды перекрывают клики — в тестах без анимаций; дека проверяется отдельно
    contextOptions: { reducedMotion: 'reduce' },
    // На CI при падении — полный трейс (таймлайн, скриншоты, консоль) в артефакт playwright-report:
    // одного текстового снимка не хватало, чтобы понять падения, которых нет локально
    trace: process.env.CI ? 'retain-on-failure' : 'off',
    // Локально можно указать свой Chromium: PW_CHROMIUM_PATH=/path/to/chrome npm run e2e
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: true,
  },
  projects: [
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'] } },
    { name: 'webkit-mobile', use: { ...devices['iPhone 14'] } },
  ],
});
