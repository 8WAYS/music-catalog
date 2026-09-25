# Музыкальная картотека

PWA-картотека любимой музыки: владелец ведёт её на телефоне, друзья смотрят по ссылке.
Полная документация — `docs/Музыкальная картотека — документация для разработки.docx`.

## Статус

| Этап | Что | Статус |
| --- | --- | --- |
| 0 | Разведка: `app/public/probe.html`, ADR 0001, 0003 | iPhone проверен; открыт выбор источника метаданных |
| 1 | Каркас: Vite + TS + Preact, PWA, слой данных, CI/CD | готово |
| 2 | Картотека: создание, редактирование, удаление, треки, теги, ссылки, обложки | готово |
| 3–8 | Подбор, автозаполнение, публикация, резервные копии, полировка, запуск | впереди |

## Запуск

```bash
cd app
npm install
npm run dev          # http://localhost:5173
npm test             # модульные и интеграционные тесты (Vitest + fake-indexeddb)
npm run build        # сборка в app/dist
npx playwright install chromium webkit   # один раз
npm run e2e          # e2e-сценарии на мобильных профилях
```

Чтобы открыть dev-сервер с телефона в той же Wi-Fi-сети: `npm run dev -- --host`.
Для проверки PWA и офлайна нужна продакшен-сборка: `npm run build && npm run preview -- --host`.

## Структура

```
app/            приложение (собирается GitHub Actions)
  public/probe.html   страница этапа 0 — проверка внешних API с телефона
  src/data/           модель, Repository, IndexedDB (localSource), catalog.json (remoteSource), миграции
  src/services/       обложки (сжатие, палитра), ссылки
  src/screens/        Home, Release, Editor, Settings
  src/components/     Cover, TagChip, TagInput, TrackEditor, LinksEditor, диалоги
data/           опубликованные данные картотеки (пишет приложение, этап 5)
docs/adr/       архитектурные решения
.github/workflows/  ci.yml, deploy.yml
```

## Первый деплой (этап 0)

0. Перенести `github-workflows/*.yml` в `.github/workflows/` (папку `github-workflows` потом удалить).
1. Создать на GitHub публичный репозиторий `music-catalog` и запушить проект в `main`.
2. Settings → Pages → Source: **GitHub Actions**.
3. После зелёного `Deploy to GitHub Pages` открыть с телефона `https://<логин>.github.io/music-catalog/probe.html`.
4. Для шага GitHub создать fine-grained token: Settings → Developer settings → Fine-grained tokens,
   доступ только к `music-catalog`, Repository permissions → Contents: Read and write, срок 1 год.
5. Нажать «Скопировать отчёт» и вставить результат в `docs/adr/0001-feasibility.md`.

Свой домен: файл `CNAME` в корне репозитория с именем домена — deploy.yml скопирует его на сайт.
