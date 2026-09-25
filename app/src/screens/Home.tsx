import { Cover } from '../components/Cover';
import { Icon } from '../components/Icon';
import { href, navigate } from '../router';
import { isOwner, ownerName, releases } from '../store/app';
import { RELEASE_TYPE_LABEL } from '../data/schema';
import { pluralize } from '../utils/normalize';
import s from './Home.module.css';

/**
 * Главная (раздел 6.1). На этапе 2 — сетка по дате добавления;
 * поиск, чипы тегов и сортировки добавляются на этапе 3.
 */
export function Home() {
  const list = [...releases.value].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const owner = isOwner.value;
  const title = ownerName.value ? `Картотека ${ownerName.value}` : 'Картотека';

  const surprise = () => {
    if (!list.length) return;
    const pick = list[Math.floor(Math.random() * list.length)]!;
    navigate(href.release(pick.id));
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

      {list.length === 0 ? (
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
      ) : (
        <>
          <p class={s.count}>
            {list.length} {pluralize(list.length, 'релиз', 'релиза', 'релизов')}
          </p>
          <ul class={s.grid}>
            {list.map((r) => (
              <li key={r.id}>
                <a class={s.item} href={href.release(r.id)}>
                  <Cover release={r} />
                  <span class={s.name}>{r.title}</span>
                  <span class={s.meta}>
                    {r.artist}
                    {r.type !== 'album' && <span class={s.type}> · {RELEASE_TYPE_LABEL[r.type]}</span>}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      {list.length > 0 && (
        <nav class={s.dock} aria-label="Действия">
          <button type="button" class={s.dockBtn} onClick={surprise}>
            <Icon name="dice" size={20} /> Удиви меня
          </button>
          {owner && (
            <a class={`${s.dockBtn} ${s.add}`} href={href.new()} aria-label="Добавить релиз">
              <Icon name="plus" size={24} />
            </a>
          )}
        </nav>
      )}
    </div>
  );
}
