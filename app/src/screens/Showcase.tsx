import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Cover } from '../components/Cover';
import { Disc } from '../components/Disc';
import { Icon } from '../components/Icon';
import overlay from '../components/Overlays.module.css';
import { QrCode } from '../components/QrCode';
import type { Release } from '../data/schema';
import { href, shareUrl } from '../router';
import { shareOrCopy } from '../services/share';
import { isOwner, ownerName, releases, releasesById, toast } from '../store/app';
import { pinnedAlbums, pinnedReleases, pinnedSingles, topArtists } from '../store/showcase';
import { syncState } from '../store/sync';
import { initials, pluralize } from '../utils/normalize';
import s from './Showcase.module.css';

/** Цвета обложек закреплённого — для фоновой ауры вкладки (см. Home). */
export function showcaseAuraColors() {
  return pinnedReleases.value.slice(0, 3).map((r) => r.coverColors);
}

/**
 * Витрина (ADR 0011) — вторая вкладка главной, не отдельный экран: подборка, которую владелец
 * закрепляет сам долгим нажатием в картотеке. Заголовок и переключение — в Home, здесь только
 * содержимое вкладки.
 */
export function Showcase() {
  const owner = isOwner.value;
  const name = ownerName.value || 'Картотека';
  // У владельца ссылка ведёт друга на пустой сайт, пока публикация не подключена (раздел «Публикация»,
  // настройки) — до первой публикации кнопку не показываем, а не отправляем на нерабочий адрес.
  const canShare = !owner || syncState.value.status !== 'off';
  const [shareOpen, setShareOpen] = useState(false);

  const artists = topArtists.value
    .map((a) => ({ ...a, release: releasesById.value.get(a.releaseId) }))
    .filter((a): a is typeof a & { release: Release } => !!a.release);

  return (
    <div>
      <div class={s.top}>
        <div class={s.avatarWrap} aria-hidden="true">
          <Disc class={s.avatarDisc} />
          <span class={s.avatarLabel}>{initials(name)}</span>
        </div>
        <div class={s.who}>
          <p class={s.name}>{name}</p>
          <p class={s.stat}>
            {releases.value.length} {pluralize(releases.value.length, 'релиз', 'релиза', 'релизов')}
          </p>
        </div>
        {canShare && (
          <button
            type="button"
            class={`icon-btn glass ${s.shareBtn}`}
            onClick={() => setShareOpen(true)}
            aria-label="Поделиться витриной"
          >
            <Icon name="share" />
          </button>
        )}
      </div>
      {shareOpen && <ShareDialog name={name} onClose={() => setShareOpen(false)} />}

      <ArtistShelf artists={artists} owner={owner} />
      <ReleaseShelf
        title="Топ-3 альбома"
        list={pinnedAlbums.value}
        hero
        rank
        owner={owner}
        emptyHint="Долгим нажатием на обложку альбома в картотеке — закрепить в топ-3"
      />
      <ReleaseShelf
        title="Синглы и EP"
        list={pinnedSingles.value}
        owner={owner}
        emptyHint="Долгим нажатием на обложку сингла или EP в картотеке — закрепить первый"
      />
    </div>
  );
}

/** Ссылка на витрину — QR для сканирования рядом (в гостях, на визитке) и обычный шэринг/копия. */
function ShareDialog({ name, onClose }: { name: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const url = shareUrl(href.showcase());

  // Синхронно с рендером, тем же приёмом, что ConfirmDialog в Overlays.tsx
  useLayoutEffect(() => ref.current?.showModal(), []);

  const share = async () => {
    const outcome = await shareOrCopy({ title: `${name} — витрина`, url });
    if (outcome === 'copied') toast('Ссылка скопирована');
    else if (outcome === 'unavailable') toast(url);
  };

  return (
    <dialog
      ref={ref}
      class={overlay.dialog}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      aria-labelledby="share-title"
    >
      <div class={overlay.body}>
        <h2 id="share-title">Поделиться витриной</h2>
        <div class={s.qrWrap}>
          <QrCode value={url} />
        </div>
        <p class={s.shareUrl}>{url}</p>
        <div class={overlay.actions}>
          <button type="button" class="btn" onClick={() => ref.current?.close()}>
            Закрыть
          </button>
          <button type="button" class="btn btn-primary" onClick={share}>
            <Icon name="share" size={18} /> Поделиться
          </button>
        </div>
      </div>
    </dialog>
  );
}

/** Ранговая метка (ADR 0011) — тот же материал, что у Disc, а не отдельная плашка: настоящий диск в
 * миниатюре с цветной «печатью» ранга (золото/серебро/бронза) поверх, как у CD — бумажная наклейка
 * с текстом на отражающем поле, а не рисованный кружок. */
function RankBadge({ rank }: { rank: number }) {
  return (
    <span class={s.rankBadge}>
      <Disc class={s.rankBadgeDisc} />
      <span class={s.rankNum} data-rank={rank} aria-label={`Ранг ${rank}`}>
        {rank}
      </span>
    </span>
  );
}

function ArtistShelf({
  artists,
  owner,
}: {
  artists: { name: string; releaseId: string; release: Release }[];
  owner: boolean;
}) {
  if (!artists.length) {
    if (!owner) return null;
    return (
      <section class={s.section}>
        <h2 class={s.title}>Топ-3 артиста</h2>
        <p class={s.hint}>Долгим нажатием на имя исполнителя в карточке релиза — закрепить в топ-3</p>
      </section>
    );
  }
  // «Пьедестал» — вторая позиция слева, первая (крупнее) в центре, третья справа — только когда
  // мест ровно 3: с одним-двумя закреплёнными строить пьедестал не из чего, обычный порядок честнее.
  const podium = artists.length === 3;
  const podiumOrder = [2, 1, 3];
  return (
    <section class={s.section}>
      <h2 class={s.title}>Топ-3 артиста</h2>
      <ul class={`${s.shelf} ${podium ? s.podium : ''}`}>
        {artists.map((a, i) => (
          <li
            key={a.name}
            class={s.artist}
            data-rank={i + 1}
            style={podium ? { order: podiumOrder[i] } : undefined}
          >
            <a class={s.artistLink} href={href.release(a.release.id)}>
              <span class={s.rankWrap}>
                <Cover release={a.release} size="grid" />
                <RankBadge rank={i + 1} />
              </span>
              <span class={s.artistName}>{a.name}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReleaseShelf({
  title,
  list,
  hero,
  rank,
  owner,
  emptyHint,
}: {
  title: string;
  list: Release[];
  hero?: boolean;
  rank?: boolean;
  owner: boolean;
  emptyHint: string;
}) {
  if (!list.length) {
    if (!owner) return null;
    return (
      <section class={s.section}>
        <h2 class={s.title}>{title}</h2>
        <p class={s.hint}>{emptyHint}</p>
      </section>
    );
  }
  return (
    <section class={s.section}>
      <h2 class={s.title}>{title}</h2>
      <ul class={s.shelf}>
        {list.map((r, i) => (
          <li key={r.id} class={`${s.rel} ${rank ? s.ranked : ''} ${hero && i === 0 ? s.hero : ''}`}>
            <a class={s.relLink} href={href.release(r.id)}>
              {rank && <Disc class={s.peekDisc} />}
              <span class={s.rankWrap}>
                <Cover release={r} size="grid" />
                {rank && <RankBadge rank={i + 1} />}
              </span>
              <span class={s.relName}>{r.title}</span>
              <span class={s.relArtist}>{r.artist}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
