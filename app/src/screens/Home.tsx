import { Fragment } from 'preact';
import { useState } from 'preact/hooks';
import { Cover } from '../components/Cover';
import { Icon } from '../components/Icon';
import { Shuffle } from '../components/Shuffle';
import { TagChip } from '../components/TagChip';
import { RELEASE_TYPE_LABEL, TAG_GROUP_LABEL, type Release, type Tag, type TagGroup } from '../data/schema';
import { href, navigate, replaceHash, routeQuery } from '../router';
import {
  SORT_KEYS,
  SORT_LABEL,
  chipTags,
  filtersHash,
  parseFilters,
  selectReleases,
  shuffleFrames,
  type Filters,
  type SortKey,
} from '../services/search';
import { isOwner, ownerName, reduceMotion, releases, tags } from '../store/app';
import { pluralize } from '../utils/normalize';
import s from './Home.module.css';

/** Главная (раздел 6.1): поиск, чипы тегов, сортировка, сетка, «Удиви меня». Фильтры живут в адресе. */
export function Home() {
  const all = releases.value;
  const owner = isOwner.value;
  const title = ownerName.value ? `Картотека ${ownerName.value}` : 'Картотека';
  const f = parseFilters(routeQuery.value, tags.value);
  const list = selectReleases(all, f);
  const filtered = f.q.trim() !== '' || f.tagIds.length > 0;
  const [shuffle, setShuffle] = useState<Release[] | null>(null);

  const update = (patch: Partial<Filters>) => replaceHash(filtersHash({ ...f, ...patch }, tags.value));
  const toggleTag = (id: string) =>
    update({ tagIds: f.tagIds.includes(id) ? f.tagIds.filter((t) => t !== id) : [...f.tagIds, id] });
  const reset = () => update({ q: '', tagIds: [] });

  const surprise = () => {
    if (!list.length) return;
    const pick = list[Math.floor(Math.random() * list.length)]!;
    const reduce = reduceMotion.value || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || list.length === 1) navigate(href.release(pick.id));
    else setShuffle(shuffleFrames(list, pick));
  };

  return (
    <div class="page">
      <header class="topbar">
        <h1 class={s.title}>{title}</h1>
        <a class="icon-btn" href={href.settings()} aria-label="Настройки">
          <Icon name="settings" />
        </a>
      </header>

      {!owner && <p class={s.viewer}>Только просмотр</p>}

      {all.length === 0 ? (
        <EmptyCatalog owner={owner} />
      ) : (
        <>
          <SearchBox value={f.q} onChange={(q) => update({ q })} />
          <TagStrip tags={chipTags(tags.value, list, f.tagIds)} selected={f.tagIds} onToggle={toggleTag} />

          <div class={s.toolbar}>
            <p class={s.count} aria-live="polite">
              {filtered
                ? `${list.length} из ${all.length}`
                : `${all.length} ${pluralize(all.length, 'релиз', 'релиза', 'релизов')}`}
            </p>
            <label class={s.sort}>
              <span class="visually-hidden">Сортировка</span>
              <select value={f.sort} onChange={(e) => update({ sort: e.currentTarget.value as SortKey })}>
                {SORT_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {SORT_LABEL[k]}
                  </option>
                ))}
              </select>
              <Icon name="chevron" size={16} />
            </label>
          </div>

          {list.length === 0 ? (
            <div class={s.noResults}>
              <h2>{f.tagIds.length ? 'Под это настроение пока пусто' : 'Ничего не нашлось'}</h2>
              <p>
                {f.q.trim()
                  ? `По запросу «${f.q.trim()}»${f.tagIds.length ? ' с выбранными тегами' : ''} релизов нет.`
                  : 'Попробуй убрать один из тегов.'}
              </p>
              <button type="button" class="btn" onClick={reset}>
                Сбросить фильтры
              </button>
            </div>
          ) : (
            <ul class={s.grid}>
              {list.map((r) => (
                <li key={r.id}>
                  <a class={s.item} href={href.release(r.id)}>
                    <Cover release={r} />
                    <span class={s.name}>{r.title}</span>
                    <span class={s.meta}>
                      {r.artist}
                      {f.sort === 'year' && r.year && ` · ${r.year}`}
                      {r.type !== 'album' && <span class={s.type}> · {RELEASE_TYPE_LABEL[r.type]}</span>}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}

          <nav class={s.dock} aria-label="Действия">
            <button type="button" class={s.dockBtn} onClick={surprise} disabled={!list.length}>
              <Icon name="dice" size={20} /> Удиви меня
            </button>
            {owner && (
              <a class={`${s.dockBtn} ${s.add}`} href={href.new()} aria-label="Добавить релиз">
                <Icon name="plus" size={24} />
              </a>
            )}
          </nav>
        </>
      )}

      {shuffle && (
        <Shuffle
          frames={shuffle}
          onDone={() => {
            const pick = shuffle[shuffle.length - 1]!;
            setShuffle(null);
            navigate(href.release(pick.id));
          }}
        />
      )}
    </div>
  );
}

function EmptyCatalog({ owner }: { owner: boolean }) {
  return (
    <div class={s.empty}>
      <div class={s.emptyArt} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <h2>Картотека пуста</h2>
      <p>
        {owner
          ? 'Добавь первый альбом — обложку, треки и пару слов о нём.'
          : 'Владелец ещё ничего не добавил.'}
      </p>
      {owner && (
        <a class="btn btn-primary" href={href.new()}>
          <Icon name="plus" size={20} /> Добавить альбом
        </a>
      )}
    </div>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (q: string) => void }) {
  return (
    <div class={s.search}>
      <Icon name="search" size={18} />
      <input
        type="search"
        class={s.searchInput}
        value={value}
        placeholder="Альбом, исполнитель, трек…"
        aria-label="Поиск по картотеке"
        enterKeyHint="search"
        autoComplete="off"
        onInput={(e) => onChange(e.currentTarget.value)}
        // Enter прячет клавиатуру — результаты уже на экране
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      {value && (
        <button type="button" class={s.clear} onClick={() => onChange('')} aria-label="Очистить поиск">
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );
}

/** Лента чипов по группам; показываются выбранные и те, что есть в текущей выборке. */
function TagStrip(props: { tags: Tag[]; selected: string[]; onToggle: (id: string) => void }) {
  if (!props.tags.length) return null;
  let prev: TagGroup | null = null;
  return (
    <div class={s.chips} role="group" aria-label="Фильтр по тегам">
      {props.tags.map((t) => {
        const label = t.group !== prev ? <span class={s.groupLabel}>{TAG_GROUP_LABEL[t.group]}</span> : null;
        prev = t.group;
        return (
          <Fragment key={t.id}>
            {label}
            <TagChip tag={t} active={props.selected.includes(t.id)} onClick={() => props.onToggle(t.id)} />
          </Fragment>
        );
      })}
    </div>
  );
}
