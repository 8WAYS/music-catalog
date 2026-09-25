import { useState } from 'preact/hooks';
import { LINK_SERVICE_LABEL, isHttpsUrl, type Link } from '../data/schema';
import { detectService, normalizeUrl } from '../services/links';
import { Icon } from './Icon';
import s from './LinksEditor.module.css';

interface Props {
  value: Link[];
  onChange: (links: Link[]) => void;
}

/** Ссылки «Слушать» (F-07): сервис распознаётся по домену. */
export function LinksEditor({ value, onChange }: Props) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const add = () => {
    const url = normalizeUrl(draft);
    if (!url) return;
    if (!isHttpsUrl(url)) {
      setError('Нужна ссылка вида https://…');
      return;
    }
    onChange([...value, { service: detectService(url), url }]);
    setDraft('');
    setError('');
  };

  const preview = draft.trim() ? detectService(normalizeUrl(draft)) : null;

  return (
    <div class={s.wrap}>
      {value.map((l, i) => (
        <div key={i} class={s.item}>
          <span class={s.badge} data-service={l.service}>
            {LINK_SERVICE_LABEL[l.service]}
          </span>
          <span class={s.url}>{l.url.replace(/^https:\/\/(www\.)?/, '')}</span>
          <button
            type="button"
            class="icon-btn"
            aria-label={`Удалить ссылку ${LINK_SERVICE_LABEL[l.service]}`}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
      ))}
      <div class={s.add}>
        <input
          class="input"
          type="url"
          inputMode="url"
          placeholder="Ссылка на Яндекс Музыку, VK, Spotify…"
          aria-label="Добавить ссылку"
          value={draft}
          onInput={(e) => {
            setDraft(e.currentTarget.value);
            setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" class="btn" onClick={add} disabled={!draft.trim()}>
          {preview && preview !== 'other' ? LINK_SERVICE_LABEL[preview] : 'Добавить'}
        </button>
      </div>
      {error && (
        <p class={s.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
