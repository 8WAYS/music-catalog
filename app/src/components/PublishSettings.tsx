import { useEffect, useState } from 'preact/hooks';
import { LocalSource } from '../data/localSource';
import { GitHubError, REPO_RE, type GitHubConfig } from '../services/github';
import { href, shareUrl } from '../router';
import { becomeOwner, confirmDialog, repo, toast } from '../store/app';
import {
  SYNC_LABEL,
  connect,
  disconnect,
  publishNow,
  resolveConflict,
  syncState,
  type SyncStatus,
} from '../store/sync';
import { formatAgo } from '../utils/time';
import s from './PublishSettings.module.css';

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

/** Репозиторий по адресу сайта: <login>.github.io/<repo>/ → login/repo */
function repoFromLocation(): string {
  if (!location.hostname.endsWith('.github.io')) return '';
  const name = location.pathname.split('/').filter(Boolean)[0];
  return name ? `${location.hostname.split('.')[0]}/${name}` : '';
}

function errorText(e: unknown): string {
  return e instanceof GitHubError || e instanceof Error ? e.message : String(e);
}

/** Форма «репозиторий + токен» — у владельца для подключения, у зрителя для «это моя картотека». */
function ConnectForm(props: { submitLabel: string; onSubmit: (cfg: GitHubConfig) => Promise<void> }) {
  const [repoName, setRepoName] = useState(repoFromLocation);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Владелец мог уже подключаться раньше — подставим сохранённый репозиторий
    if (repo() instanceof LocalSource)
      void repo()
        .getMeta('repo')
        .then((r) => r && setRepoName(r));
  }, []);

  const submit = async (e: Event) => {
    e.preventDefault();
    setError('');
    if (!REPO_RE.test(repoName.trim()))
      return setError('Репозиторий — в виде владелец/имя, например 8WAYS/music-catalog');
    if (!token.trim()) return setError('Вставь токен');
    setBusy(true);
    try {
      await props.onSubmit({ repo: repoName.trim(), branch: 'main', token: token.trim() });
      setToken('');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form class={s.form} onSubmit={submit}>
      <label class="field">
        <span>Репозиторий на GitHub</span>
        <input
          class="input"
          value={repoName}
          onInput={(e) => setRepoName(e.currentTarget.value)}
          placeholder="владелец/music-catalog"
          autoComplete="off"
          autoCapitalize="off"
          spellcheck={false}
        />
      </label>
      <label class="field">
        <span>Токен GitHub</span>
        <input
          class="input"
          type="password"
          value={token}
          onInput={(e) => setToken(e.currentTarget.value)}
          placeholder="github_pat_…"
          autoComplete="off"
        />
      </label>
      <p class={s.hint}>
        Fine-grained токен только на этот репозиторий, право Contents: Read and write.{' '}
        <a href={TOKEN_URL} target="_blank" rel="noopener noreferrer">
          Создать на GitHub
        </a>
        . Токен хранится только на этом устройстве.
      </p>
      {error && (
        <p class={s.error} role="alert">
          {error}
        </p>
      )}
      <button type="submit" class="btn btn-primary" disabled={busy}>
        {busy ? 'Проверяю доступ…' : props.submitLabel}
      </button>
    </form>
  );
}

function StatusLine({
  status,
  message,
  publishedAt,
}: {
  status: SyncStatus;
  message?: string;
  publishedAt?: string;
}) {
  const detail =
    status === 'published' && publishedAt
      ? `${formatAgo(publishedAt)}. Друзья увидят изменения примерно через минуту.`
      : status === 'dirty'
        ? 'Изменения уйдут на сайт через несколько секунд.'
        : status === 'publishing'
          ? 'Отправляю на GitHub…'
          : message;
  return (
    <div class={s.status} data-status={status} role="status">
      <span class={s.dot} aria-hidden="true" />
      <div>
        <strong>{SYNC_LABEL[status]}</strong>
        {detail && <p>{detail}</p>}
      </div>
    </div>
  );
}

/** Публикация в настройках владельца (раздел 6.5). */
export function PublishSettings() {
  const st = syncState.value;
  const siteUrl = shareUrl(href.home());

  const connectOwner = async (cfg: GitHubConfig) => {
    const local = repo();
    if (!(local instanceof LocalSource)) return;
    // Раздел 2.2: предупредить о публичности при первой публикации
    if (!(await local.getMeta('publishWarningShown'))) {
      const ok = await confirmDialog({
        title: 'Картотека станет публичной',
        text: 'Всё, что в ней есть, включая описания, увидит любой, у кого есть ссылка.',
        confirm: 'Публиковать',
      });
      if (!ok) return;
      await local.setMeta('publishWarningShown', true);
    }
    await connect(local, cfg);
  };

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Моя музыкальная картотека', url: siteUrl });
      else {
        await navigator.clipboard.writeText(siteUrl);
        toast('Ссылка скопирована');
      }
    } catch (e) {
      if ((e as DOMException)?.name !== 'AbortError') toast(siteUrl);
    }
  };

  if (st.status === 'off')
    return (
      <>
        <p class={s.muted}>
          Картотека живёт только на этом устройстве. Подключи GitHub — и она будет публиковаться сама после
          каждого изменения, а друзья смогут смотреть её по ссылке.
        </p>
        <ConnectForm submitLabel="Подключить и опубликовать" onSubmit={connectOwner} />
      </>
    );

  return (
    <>
      <StatusLine status={st.status} message={st.message} publishedAt={st.publishedAt} />

      {st.status === 'conflict' && (
        <div class={s.conflict}>
          <p>
            Пока это устройство было не в сети или не публиковало, картотеку на сайте изменили в другом месте.
            Какую версию оставить?
          </p>
          <div class={s.actions}>
            <button
              type="button"
              class="btn"
              onClick={async () => {
                const ok = await confirmDialog({
                  title: 'Взять опубликованную версию?',
                  text: 'Неопубликованные изменения на этом устройстве пропадут.',
                  confirm: 'Взять опубликованную',
                  danger: true,
                });
                if (ok) await resolveConflict('import');
              }}
            >
              Взять с сайта
            </button>
            <button
              type="button"
              class="btn"
              onClick={async () => {
                const ok = await confirmDialog({
                  title: 'Перезаписать сайт?',
                  text: 'Версия на сайте заменится версией с этого устройства.',
                  confirm: 'Перезаписать',
                  danger: true,
                });
                if (ok) await resolveConflict('overwrite');
              }}
            >
              Оставить мою
            </button>
          </div>
        </div>
      )}

      <div class={s.link}>
        <span class={s.muted}>Ссылка для друзей</span>
        <a href={siteUrl} target="_blank" rel="noopener noreferrer">
          {siteUrl.replace(/^https:\/\//, '')}
        </a>
      </div>

      <div class={s.actions}>
        <button type="button" class="btn" onClick={share}>
          Поделиться ссылкой
        </button>
        <button
          type="button"
          class="btn"
          onClick={() => void publishNow()}
          disabled={st.status === 'publishing' || st.status === 'conflict'}
        >
          Опубликовать сейчас
        </button>
      </div>

      {st.status === 'error' && (
        <details class={s.reconnect}>
          <summary>Заменить токен или репозиторий</summary>
          <ConnectForm submitLabel="Проверить и сохранить" onSubmit={connectOwner} />
        </details>
      )}

      <p class={s.muted}>
        Репозиторий {st.repo}.{' '}
        <button
          type="button"
          class={s.linkBtn}
          onClick={async () => {
            const ok = await confirmDialog({
              title: 'Отключить публикацию?',
              text: 'Токен удалится с этого устройства. Опубликованная картотека останется на сайте.',
              confirm: 'Отключить',
              danger: true,
            });
            if (ok) await disconnect();
          }}
        >
          Отключить
        </button>
      </p>
    </>
  );
}

/** У зрителя: «это моя картотека» — войти по токену (раздел 3.2, новое устройство владельца). */
export function ClaimOwnership() {
  return (
    <details class={s.reconnect}>
      <summary>Это моя картотека</summary>
      <p class={s.muted}>
        Введи токен — картотека загрузится на это устройство, и её можно будет редактировать.
      </p>
      <ConnectForm submitLabel="Войти как владелец" onSubmit={becomeOwner} />
    </details>
  );
}
