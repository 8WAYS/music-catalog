# CLAUDE.md — Музыкальная картотека

Отвечай и пиши комментарии в коде на русском.

## Что это

PWA-картотека любимой музыки: владелец ведёт её на телефоне, друзья смотрят по ссылке на GitHub Pages.
Полная спецификация — `docs/Музыкальная картотека — документация для разработки.docx` (разделы 1–13).
Решения по ходу — `docs/adr/`. Перед работой прочитай README.md и все ADR.

## Статус (на 2026-09-26)

- Этап 0 — проверено с iPhone через домашний Wi-Fi, с VPN и без (ADR 0001). **Метаданные, треклист и обложки —
  из iTunes** (ADR 0003, 0004), MusicBrainz не используем. GitHub API и Pages работают.
  Не проверены Android и мобильная сеть.
- Этапы 1–6 готовы (каркас, CRUD, подбор — ADR 0005, автозаполнение из iTunes — ADR 0006,
  публикация и режим зрителя — ADR 0007, резервные копии — ADR 0009). Этап 7 начат: визуал
  «Перламутр и стекло» (ADR 0008). 137 unit-тестов, 34 e2e-сценария, сборка зелёная. Формат данных — версия 2.
- Витрина (`#/showcase`, ADR 0011): владелец долгим нажатием на обложку или на имя исполнителя закрепляет
  лучшее — экран показывает закреплённых артистов, любимые альбомы и синглы/EP отдельными полками.
  Ссылка — иконка рядом с настройками на главной, видна и владельцу, и зрителю.
- Публикацию владелец подключает сам в настройках (токен вводит только он); первая реальная публикация —
  с его телефона.
- Резервные копии (`src/services/backup.ts`, настройки → «Резервные копии»): экспорт `catalog.json` + `covers/`
  в ZIP (fflate), импорт из ZIP с миграцией и полной заменой, «Загрузить версию с сайта» (ADR 0009).
- Spotify — второй источник автозаполнения вдобавок к iTunes (`src/services/spotify.ts`,
  `src/services/spotifyAuth.ts`, настройки → «Источники»): вход через PKCE без secret, без обложек
  (нет CORS у CDN Spotify) — ADR 0010. **Сейчас не работает**: Spotify Web API отвечает 403 — у
  аккаунта, на котором создано приложение в кабинете Spotify, нет Premium (ограничение самого
  Spotify, не баг). Код готов, заработает сам, когда на том аккаунте появится Premium.
- Дальше: этапы 7–8 по спецификации (полировка, запуск).

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
- Визуал «Перламутр и стекло» (ADR 0008, макет `docs/design/cd-design-v3.html`): утилиты `.glass`, `.pearl`,
  `.chrome-text`, `.aura` в `base.css`; компоненты `Disc`, `Aura`, `Deck`. Стекло — только в элементах управления.
- Дизайн-макеты и исследования — версиями в `docs/design/` (см. README там).
- Роутер — hash (`src/router.ts`): `#/`, `#/release/<id>`, `#/edit/<id>`, `#/new`, `#/add`, `#/settings`.
  Защита несохранённых изменений — `setLeaveGuard`.
- **UI обращается к данным только через `Repository`** (`src/data/repository.ts`) и сигналы из `src/store/app.ts`.
  `LocalSource` — IndexedDB владельца, `RemoteSource` — `data/catalog.json` для зрителя (только чтение).
  Это точка расширения под будущий бэкенд и Telegram Mini App — не обходить.
- Модель и валидация — `src/data/schema.ts`; любое изменение формата catalog.json → `FORMAT_VERSION++` и миграция
  в `src/data/migrations.ts` + тест.
- Каждое изменение данных в LocalSource: `revision++` и `dirty = true` (нужно для публикации, этап 5).
- Обложки: 600×600, ≤100 КБ, WebP, в Safari — JPEG (`src/services/image.ts`); в IndexedDB — байты, не Blob
  (ADR 0006, п. 8); цвета — `src/services/palette.ts`
  (accent ≥ 3:1 и text ≥ 4.5:1 к bg, покрыто тестами).
- Режим владелец/зритель — `decideMode` в `src/data/mode.ts`, выбирает `init()` в `src/store/app.ts` (ADR 0007):
  владелец — устройство с токеном GitHub.
- Публикация — `src/services/publisher.ts` (Git Data API, один коммит), автопубликация и статус — `src/store/sync.ts`.
  Конфликт определяется по git-хэшу `data/catalog.json`, не по голове ветки: коммиты кода — не конфликт.
- Резервные копии — `src/services/backup.ts` (ZIP через fflate, ADR 0009): `exportZip`/`parseZip`/`applyBackup`.
  Импорт — только полная замена (`LocalSource.replaceAll`), не слияние; после импорта из ZIP картотека
  помечается «грязной», чтобы автопубликация отправила восстановленное на сайт.
- Spotify (ADR 0010) — второй источник автозаполнения в `#/add` рядом с iTunes. Вход — PKCE
  (`src/services/spotifyAuth.ts`, без client secret на устройстве), поиск и треклист —
  `src/services/spotify.ts`. Обложку не запрашивает — у CDN Spotify нет CORS для `fetch`.
- Доступность: зоны касания ≥ 44 px, подписи для диктора, `prefers-reduced-motion` и переключатель в настройках.
- Тексты интерфейса — на русском, дружелюбные и короткие.
- Коммиты — Conventional Commits (`feat:`, `fix:`, `docs:`); коммиты данных приложение подписывает `data: publish rev N`.
- Новые архитектурные решения — короткий ADR в `docs/adr/`.

## Известные мелочи на потом (этап 7)

- Удобство из макета v3: шторка с тегами у большого пальца, свайп между релизами, закрытие карточки жестом вниз,
  долгое нажатие на обложку, плотность сетки.
- Экраны редактора, поиска и настроек пока без ауры — только новые токены и шрифты.
