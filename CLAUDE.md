# CLAUDE.md — Музыкальная картотека

Отвечай и пиши комментарии в коде на русском.

## Что это

PWA-картотека любимой музыки: владелец ведёт её на телефоне, друзья смотрят по ссылке на GitHub Pages.
Полная спецификация — `docs/Музыкальная картотека — документация для разработки.docx` (разделы 1–13).
Решения по ходу — `docs/adr/`. Перед работой прочитай README.md и все ADR.

## Статус (на 2026-09-25)

- Этап 0 — проверено с iPhone через домашний Wi-Fi, с VPN и без (ADR 0001). **Метаданные, треклист и обложки —
  из iTunes** (ADR 0003, 0004), MusicBrainz не используем. GitHub API и Pages работают.
  Не проверены Android и мобильная сеть.
- Этапы 1–3 готовы (каркас, CRUD, главная и подбор — ADR 0005): 58 unit-тестов, 11 e2e-сценариев, сборка зелёная.
- Дальше: **этап 4** — автозаполнение из iTunes (ADR 0004): `src/services/itunes.ts` (поиск, lookup треклиста,
  таймаут, понятные ошибки), экран `#/add` с результатами и «Заполнить вручную», обложка 600×600 → сжатие,
  `mbid` → `itunesId` с `FORMAT_VERSION` 2 и миграцией.
- Потом этапы 5–8 по спецификации.

## Репозиторий

https://github.com/8WAYS/music-catalog, сайт — https://8ways.github.io/music-catalog/ (Pages из GitHub Actions).

## Команды (из папки `app/`)

```bash
npm install
npm run dev          # dev-сервер; --host для телефона в той же сети
npm run lint && npx prettier --check . && npm run typecheck
npm test             # Vitest + fake-indexeddb
npm run build
npx playwright install chromium webkit   # один раз
npm run e2e
```

Перед тем как сказать «готово» — прогнать lint, typecheck, test, build и e2e.

## Архитектура и правила

- Стек: Vite, TypeScript strict, Preact + Signals, CSS Modules + токены (`src/styles/tokens.css`), idb, vite-plugin-pwa.
- Роутер — hash (`src/router.ts`): `#/`, `#/release/<id>`, `#/edit/<id>`, `#/new`, `#/add`, `#/settings`.
  Защита несохранённых изменений — `setLeaveGuard`.
- **UI обращается к данным только через `Repository`** (`src/data/repository.ts`) и сигналы из `src/store/app.ts`.
  `LocalSource` — IndexedDB владельца, `RemoteSource` — `data/catalog.json` для зрителя (только чтение).
  Это точка расширения под будущий бэкенд и Telegram Mini App — не обходить.
- Модель и валидация — `src/data/schema.ts`; любое изменение формата catalog.json → `FORMAT_VERSION++` и миграция
  в `src/data/migrations.ts` + тест.
- Каждое изменение данных в LocalSource: `revision++` и `dirty = true` (нужно для публикации, этап 5).
- Обложки: 600×600, ≤100 КБ, WebP, в Safari — JPEG (`src/services/image.ts`); цвета — `src/services/palette.ts`
  (accent ≥ 3:1 и text ≥ 4.5:1 к bg, покрыто тестами).
- Режим владелец/зритель — `init()` в `src/store/app.ts` (см. ADR 0002, п. 2).
- Доступность: зоны касания ≥ 44 px, подписи для диктора, `prefers-reduced-motion` и переключатель в настройках.
- Тексты интерфейса — на русском, дружелюбные и короткие.
- Коммиты — Conventional Commits (`feat:`, `fix:`, `docs:`); коммиты данных приложение подписывает `data: publish rev N`.
- Новые архитектурные решения — короткий ADR в `docs/adr/`.

## Известные мелочи на потом (этап 7)

- В светлой теме акцент из обложки бывает светлым — звёздочки и кнопки на светлом фоне могут терять контраст.
- View Transitions «обложка → карточка» ещё не сделаны.
- Экран поиска iTunes (`#/add`) пока открывает ручной редактор (этап 4, ADR 0004).
