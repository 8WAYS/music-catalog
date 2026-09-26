import { Cover } from '../components/Cover';
import { Disc } from '../components/Disc';
import type { Release } from '../data/schema';
import { href } from '../router';
import { isOwner, ownerName, releases, releasesById } from '../store/app';
import { pinnedAlbums, pinnedArtists, pinnedReleases, pinnedSingles } from '../store/showcase';
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

  const artists = pinnedArtists.value
    .map((a) => ({ ...a, release: releasesById.value.get(a.releaseId) }))
    .filter((a): a is typeof a & { release: Release } => !!a.release);

  return (
    <div>
      <div class={s.top}>
        <div class={s.avatar} aria-hidden="true">
          {initials(name)}
        </div>
        <div>
          <p class={`${s.name} chrome-text`}>{name}</p>
          <p class={s.stat}>
            {releases.value.length} {pluralize(releases.value.length, 'релиз', 'релиза', 'релизов')}
          </p>
        </div>
      </div>

      <ArtistShelf artists={artists} owner={owner} />
      <ReleaseShelf
        title="Любимые альбомы"
        list={pinnedAlbums.value}
        hero
        owner={owner}
        emptyHint="Долгим нажатием на обложку альбома в картотеке — закрепить первый"
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
        <h2 class={s.title}>Любимые артисты</h2>
        <p class={s.hint}>Долгим нажатием на имя исполнителя в карточке релиза — закрепить первого</p>
      </section>
    );
  }
  return (
    <section class={s.section}>
      <h2 class={s.title}>Любимые артисты</h2>
      <ul class={s.shelf}>
        {artists.map((a) => (
          <li key={a.name} class={s.artist}>
            <a class={s.artistLink} href={href.release(a.release.id)}>
              <Cover release={a.release} size="grid" />
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
  owner,
  emptyHint,
}: {
  title: string;
  list: Release[];
  hero?: boolean;
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
          <li key={r.id} class={`${s.rel} ${hero && i === 0 ? s.hero : ''}`}>
            <a class={s.relLink} href={href.release(r.id)}>
              {hero && i === 0 && <Disc class={s.heroDisc} />}
              <Cover release={r} size="grid" />
              <span class={s.relName}>{r.title}</span>
              <span class={s.relArtist}>{r.artist}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
