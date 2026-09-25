import { Icon } from '../components/Icon';
import { goBack } from '../router';
import {
  isOwner,
  ownerName,
  reduceMotion,
  releases,
  repo,
  setReduceMotion,
  setTheme,
  tags,
  theme,
  toastError,
  type ThemePref,
} from '../store/app';
import { pluralize } from '../utils/normalize';
import s from './Settings.module.css';

const THEMES: { id: ThemePref; label: string }[] = [
  { id: 'dark', label: 'Тёмная' },
  { id: 'light', label: 'Светлая' },
  { id: 'system', label: 'Как в системе' },
];

/** Настройки (раздел 6.5). Публикация — этап 5, резервные копии — этап 6. */
export function Settings() {
  const owner = isOwner.value;

  const saveName = async (name: string) => {
    try {
      await repo().setMeta('ownerName', name.trim());
      ownerName.value = name.trim();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <div class="page">
      <header class="topbar">
        <button type="button" class="icon-btn" onClick={() => goBack()} aria-label="Назад">
          <Icon name="back" />
        </button>
        <h1>Настройки</h1>
      </header>

      <div class={s.wrap}>
        {owner && (
          <section class={s.group}>
            <h2>Картотека</h2>
            <label class="field">
              <span>Имя владельца — видно друзьям в заголовке</span>
              <input
                class="input"
                placeholder="Например, Wailee"
                defaultValue={ownerName.value}
                maxLength={40}
                onBlur={(e) => void saveName(e.currentTarget.value)}
              />
            </label>
            <p class={s.muted}>
              {releases.value.length} {pluralize(releases.value.length, 'релиз', 'релиза', 'релизов')} ·{' '}
              {tags.value.length} {pluralize(tags.value.length, 'тег', 'тега', 'тегов')} · данные хранятся на
              этом устройстве
            </p>
          </section>
        )}

        <section class={s.group}>
          <h2>Оформление</h2>
          <div class={s.options} role="radiogroup" aria-label="Тема">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={theme.value === t.id}
                class={s.option}
                onClick={() => setTheme(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <label class={s.switch}>
            <span>Уменьшить анимации</span>
            <input
              type="checkbox"
              role="switch"
              checked={reduceMotion.value}
              onChange={(e) => setReduceMotion(e.currentTarget.checked)}
            />
          </label>
        </section>

        {owner && (
          <section class={s.group}>
            <h2>Публикация</h2>
            <p class={s.muted}>
              Автопубликация на GitHub Pages появится на этапе 5. Пока картотека живёт только на этом
              устройстве.
            </p>
          </section>
        )}

        <section class={s.group}>
          <h2>О приложении</h2>
          <p class={s.muted}>Музыкальная картотека · версия {__APP_VERSION__}</p>
          <p class={s.muted}>
            Данные об альбомах и обложки —{' '}
            <a href="https://www.apple.com/apple-music/" target="_blank" rel="noopener noreferrer">
              iTunes / Apple Music
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
