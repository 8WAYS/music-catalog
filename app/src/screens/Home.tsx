import { Fragment } from 'preact';
import { useState } from 'preact/hooks';
import { Aura } from '../components/Aura';
import { Cover } from '../components/Cover';
import { Deck } from '../components/Deck';
import { Disc } from '../components/Disc';
import { Icon } from '../components/Icon';
import { TagChip } from '../components/TagChip';
import { RELEASE_TYPE_LABEL, TAG_GROUP_LABEL, type Release, type Tag, type TagGroup } from '../data/schema';
import { href, navigate, replaceHash, route, routeQuery } from '../router';
import {
  SORT_KEYS,
  SORT_LABEL,
  chipTags,
  filtersHash,
  parseFilters,
  selectReleases,
  type Filters,
  type SortKey,
} from '../services/search';
import {
  isOwner,
  lastOpened,
  ownerName,
  reduceMotion,
  releases,
  staleCatalog,
  tags,
  toast,
  toastError,
} from '../store/app';
import { SYNC_LABEL, syncState } from '../store/sync';
import { toggleReleasePin } from '../store/showcase';
import { useLongPress } from '../hooks/useLongPress';
import { useSwipeTabs } from '../hooks/useSwipeTabs';
import { pluralize } from '../utils/normalize';
import { Showcase, showcaseAuraColors } from './Showcase';
import s from './Home.module.css';

/** Вкладки главной (ADR 0011): Картотека — своя, Витрина — вторая половина того же экрана. */
const TAB_LABEL = ['Картотека', 'Витрина'] as const;

/** Закрепить/открепить релиз на витрине долгим нажатием (ADR 0011) — только у владельца. */
function pinFeedback(release: Release): void {
  void toggleReleasePin(release)
    .then((next) => toast(next.pinned ? 'Закреплено на витрине' : 'Откреплено с витрины'))
    .catch(toastError);
}

function GridItem({ release: r, owner, sortYear }: { release: Release; owner: boolean; sortYear: boolean }) {
  const longPress = useLongPress(() => pinFeedback(r));
  return (
    <li>
      <a
        class={s.item}
        href={href.release(r.id)}
        onClick={() => (lastOpened.value = r.id)}
        {...(owner ? longPress : {})}
      >
        <Cover release={r} vtName={lastOpened.value === r.id ? `cover-${r.id}` : undefined} />
        <span class={s.name}>{r.title}</span>
        <span class={s.meta}>
          {r.artist}
          {sortYear && r.year && ` · ${r.year}`}
          {r.type !== 'album' && <span class={s.type}> · {RELEASE_TYPE_LABEL[r.type]}</span>}
        </span>
      </a>
    </li>
  );
}

/** Главная (раздел 6.1): поиск, чипы тегов, сортировка, сетка, «Удиви меня». Фильтры живут в адресе. */
export function Home() {
  const all = releases.value;
  const owner = isOwner.value;
  const title = ownerName.value ? `Картотека ${ownerName.value}` : 'Картотека';
  const f = parseFilters(routeQuery.value, tags.value);
  const list = selectReleases(all, f);
  const filtered = f.q.trim() !== '' || f.tagIds.length > 0;
  const [pick, setPick] = useState<Release | null>(null);
  // Аура — из свежих обложек на Картотеке, из закреплённого на Витрине (ADR 0011)
  const catalogAuraColors = [...all]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((r) => r.coverColors)
    .filter(Boolean)
    .slice(0, 3);

  const swipe = useSwipeTabs(
    2,
    (i) => {
      const query = location.hash.split('?')[1];
      const base = i === 1 ? href.showcase() : href.home();
      replaceHash(query ? `${base}?${query}` : base);
    },
    route.value.name === 'showcase' ? 1 : 0,
  );

  const open = (id: string) => {
    lastOpened.value = id;
    navigate(href.release(id));
  };

  const update = (patch: Partial<Filters>) => replaceHash(filtersHash({ ...f, ...patch }, tags.value));
  const toggleTag = (id: string) =>
    update({ tagIds: f.tagIds.includes(id) ? f.tagIds.filter((t) => t !== id) : [...f.tagIds, id] });
  const reset = () => update({ q: '', tagIds: [] });

  const surprise = () => {
    if (!list.length) return;
    const chosen = list[Math.floor(Math.random() * list.length)]!;
    const reduce = reduceMotion.value || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) open(chosen.id);
    else setPick(chosen);
  };

  return (
    <div class="page">
      <Aura colors={swipe.index === 1 ? showcaseAuraColors() : catalogAuraColors} />
      <header class={`topbar ${s.tabsHead}`}>
        <div class={s.tabsRow} role="tablist" aria-label="Разделы">
          {TAB_LABEL.map((label, i) => (
            <button
              key={label}
              type="button"
              role="tab"
              id={`tab-${i}`}
              aria-selected={swipe.index === i}
              aria-controls={`panel-${i}`}
              class={s.tabLabel}
              onClick={() => swipe.goTo(i)}
            >
              {label}
            </button>
          ))}
          <span
            class={s.underline}
            style={{ transform: `translateX(${swipe.index * 100}%)` }}
            aria-hidden="true"
          />
        </div>
        <a class="icon-btn" href={href.settings()} aria-label="Настройки">
          <Icon name="settings" />
        </a>
      </header>
      <div class={s.tabsLine} />

      <div class={s.viewport} ref={swipe.viewportRef} {...swipe.pointerHandlers}>
        <div
          class={`${s.track} ${swipe.animating ? s.animating : ''}`}
          ref={swipe.trackRef}
          style={swipe.style}
        >
          <div
            class={s.panel}
            id="panel-0"
            role="tabpanel"
            aria-labelledby="tab-0"
            inert={swipe.index !== 0}
            aria-hidden={swipe.index !== 0}
          >
            <h1 class={`${s.title} chrome-text`}>{title}</h1>
            {owner ? (
              <SyncBadge hasReleases={all.length > 0} />
            ) : (
              <p class={s.viewer}>
                Только просмотр
                {staleCatalog.value && ' · сайт не ответил, показана сохранённая версия'}
              </p>
            )}

            {all.length === 0 ? (
              <EmptyCatalog owner={owner} />
            ) : (
              <>
                <SearchBox value={f.q} onChange={(q) => update({ q })} />
                <TagStrip
                  tags={chipTags(tags.value, list, f.tagIds)}
                  selected={f.tagIds}
                  onToggle={toggleTag}
                />

                <div class={s.toolbar}>
                  <p class={s.count} aria-live="polite">
                    {filtered
                      ? `${list.length} из ${all.length}`
                      : `${all.length} ${pluralize(all.length, 'релиз', 'релиза', 'релизов')}`}
                  </p>
                  <label class={s.sort}>
                    <span class="visually-hidden">Сортировка</span>
                    <select
                      value={f.sort}
                      onChange={(e) => update({ sort: e.currentTarget.value as SortKey })}
                    >
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
                      <GridItem key={r.id} release={r} owner={owner} sortYear={f.sort === 'year'} />
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <div
            class={s.panel}
            id="panel-1"
            role="tabpanel"
            aria-labelledby="tab-1"
            inert={swipe.index !== 1}
            aria-hidden={swipe.index !== 1}
          >
            <Showcase />
          </div>
        </div>
      </div>

      {swipe.index === 0 && !swipe.dragging && all.length > 0 && (
        <nav class={`${s.dock} glass`} aria-label="Действия">
          <button
            type="button"
            class={`${s.dockBtn} ${s.surprise}`}
            onClick={surprise}
            disabled={!list.length}
          >
            <Icon name="dice" size={20} /> Удиви меня
          </button>
          {owner && (
            <a class={`${s.dockBtn} ${s.add}`} href={href.add()} aria-label="Добавить релиз">
              <Icon name="plus" size={24} />
            </a>
          )}
        </nav>
      )}

      {pick && (
        <Deck
          pick={pick}
          onDone={() => {
            setPick(null);
            open(pick.id);
          }}
        />
      )}
    </div>
  );
}

/** Индикатор синхронизации (раздел 7.5): ведёт в настройки публикации. */
function SyncBadge({ hasReleases }: { hasReleases: boolean }) {
  const st = syncState.value.status;
  // Пока публикация не подключена и публиковать нечего — не отвлекаем
  if (st === 'off' && !hasReleases) return null;
  return (
    <a class={s.sync} href={href.settings()} data-status={st}>
      <span class={s.syncDot} aria-hidden="true" />
      {SYNC_LABEL[st]}
    </a>
  );
}

function EmptyCatalog({ owner }: { owner: boolean }) {
  return (
    <div class={s.empty}>
      <Disc class={s.emptyDisc} label="КАРТОТЕКА" spin={30} />
      <h2>Картотека пуста</h2>
      <p>
        {owner
          ? 'Добавь первый альбом — обложку, треки и пару слов о нём.'
          : 'Владелец ещё ничего не добавил.'}
      </p>
      {owner && (
        <a class="btn btn-primary" href={href.add()}>
          <Icon name="plus" size={20} /> Добавить альбом
        </a>
      )}
    </div>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (q: string) => void }) {
  return (
    <div class={`${s.search} glass`}>
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
