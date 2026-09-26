import { Aura } from '../components/Aura';
import { Cover } from '../components/Cover';
import { Disc } from '../components/Disc';
import { Icon } from '../components/Icon';
import { TagChip } from '../components/TagChip';
import { LINK_SERVICE_LABEL, RELEASE_TYPE_LABEL, TAG_GROUPS, type Release as R } from '../data/schema';
import { goBack, href, navigate, shareUrl } from '../router';
import { EMPTY_FILTERS, filtersHash } from '../services/search';
import {
  tags as allTags,
  isOwner,
  ownerName,
  releasesById,
  repo,
  tagsById,
  toast,
  toastError,
} from '../store/app';
import { isArtistPinned, pinArtist, toggleReleasePin, unpinArtist } from '../store/showcase';
import { useLongPress } from '../hooks/useLongPress';
import { formatDuration, pluralize } from '../utils/normalize';
import s from './Release.module.css';

/** Карточка релиза (раздел 6.2), адрес #/release/<id>. */
export function Release({ id }: { id: string }) {
  const release = releasesById.value.get(id);
  const owner = isOwner.value;
  const artistPinned = release ? isArtistPinned(release.artist) : false;

  // Хуки — до раннего return: релиз может исчезнуть при открытой карточке (импорт, «загрузить с
  // сайта»), и тогда число хуков между рендерами изменилось бы — Preact перепутал бы их состояния.
  // Долгое нажатие — закрепление на витрине (ADR 0011): обложка закрепляет весь релиз,
  // имя исполнителя — самого артиста (представительная обложка — этот же релиз)
  const pinRelease = useLongPress(() => {
    if (!release) return;
    void toggleReleasePin(release)
      .then((next) => toast(next.pinned ? 'Закреплено на витрине' : 'Откреплено с витрины'))
      .catch(toastError);
  });
  const pinArtistPress = useLongPress(() => {
    if (!release) return;
    void (artistPinned ? unpinArtist(release.artist) : pinArtist(release.artist, release.id))
      .then(() => toast(artistPinned ? 'Артист откреплён' : 'Артист закреплён на витрине'))
      .catch(toastError);
  });

  if (!release) {
    return (
      <div class="page">
        <header class="topbar">
          <button type="button" class="icon-btn" onClick={() => goBack()} aria-label="Назад">
            <Icon name="back" />
          </button>
        </header>
        <p class={s.missing}>Такого релиза нет в картотеке — возможно, его удалили.</p>
        <a class="btn" href={href.home()}>
          На главную
        </a>
      </div>
    );
  }

  const tags = release.tagIds
    .map((t) => tagsById.value.get(t))
    .filter((t) => !!t)
    .sort((a, b) => TAG_GROUPS.indexOf(a.group) - TAG_GROUPS.indexOf(b.group));
  const favCount = release.tracks.filter((t) => t.favorite).length;
  const totalSec = release.tracks.reduce((sum, t) => sum + (t.durationSec ?? 0), 0);

  const toggleFavorite = async (trackId: string) => {
    const next: R = {
      ...release,
      tracks: release.tracks.map((t) => (t.id === trackId ? { ...t, favorite: !t.favorite } : t)),
    };
    try {
      await repo().saveRelease(next);
    } catch (e) {
      toastError(e, 'Не удалось сохранить');
    }
  };

  const share = async () => {
    const url = shareUrl(href.release(release.id));
    const data = { title: `${release.artist} — ${release.title}`, url };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(url);
        toast('Ссылка скопирована');
      }
    } catch (e) {
      if ((e as DOMException)?.name !== 'AbortError') {
        try {
          await navigator.clipboard.writeText(url);
          toast('Ссылка скопирована');
        } catch {
          toast(url);
        }
      }
    }
  };

  return (
    <div class={s.card}>
      <Aura colors={[release.coverColors]} />
      <div class="page">
        <header class={`topbar ${s.bar}`}>
          <button
            type="button"
            class={`icon-btn glass ${s.roundBtn}`}
            onClick={() => goBack()}
            aria-label="Назад"
          >
            <Icon name="back" />
          </button>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            class={`icon-btn glass ${s.roundBtn}`}
            onClick={share}
            aria-label="Поделиться"
          >
            <Icon name="share" />
          </button>
          {owner && (
            <a class={`icon-btn glass ${s.roundBtn}`} href={href.edit(release.id)} aria-label="Изменить">
              <Icon name="edit" />
            </a>
          )}
        </header>

        <div class={s.layout}>
          {/* Долгое нажатие — закрепить/открепить на витрине (ADR 0011) */}
          <div class={s.hero} {...(owner ? pinRelease : {})}>
            {/* Диск выезжает из-за обложки и медленно вращается (ADR 0008) */}
            <Disc
              class={s.disc}
              label={ownerName.value ? ownerName.value.toUpperCase() : 'КАРТОТЕКА'}
              spin={14}
            />
            <Cover release={release} size="hero" eager vtName={`cover-${release.id}`} />
          </div>

          <div class={s.info}>
            <p class={s.kicker}>
              {RELEASE_TYPE_LABEL[release.type]}
              {release.year && ` · ${release.year}`}
            </p>
            <h1 class={s.title}>{release.title}</h1>
            <p class={s.artist} {...(owner ? pinArtistPress : {})}>
              {release.artist}
              {artistPinned && (
                <>
                  <Icon name="star" size={13} filled />
                  <span class="visually-hidden">— закреплено на витрине</span>
                </>
              )}
            </p>

            {release.links.length > 0 && (
              <div class={s.links}>
                {release.links.map((l, i) => (
                  <a key={i} class={s.listen} href={l.url} target="_blank" rel="noopener noreferrer">
                    <Icon name="play" size={16} filled />
                    {LINK_SERVICE_LABEL[l.service]}
                  </a>
                ))}
              </div>
            )}

            {release.description && <p class={s.description}>{release.description}</p>}

            {tags.length > 0 && (
              <div class={s.tags} aria-label="Теги">
                {/* Нажатие на тег — выборка по нему на главной (раздел 6.2) */}
                {tags.map((t) => (
                  <TagChip
                    key={t.id}
                    tag={t}
                    onClick={() => navigate(filtersHash({ ...EMPTY_FILTERS, tagIds: [t.id] }, allTags.value))}
                  />
                ))}
              </div>
            )}

            {release.tracks.length > 0 && (
              <section class={`${s.tracks} glass`} aria-labelledby="tracks-h">
                <div class={s.tracksHead}>
                  <h2 id="tracks-h">Треклист</h2>
                  <span>
                    {release.tracks.length} {pluralize(release.tracks.length, 'трек', 'трека', 'треков')}
                    {totalSec > 0 && ` · ${Math.round(totalSec / 60)} мин`}
                    {favCount > 0 && ` · ★ ${favCount}`}
                  </span>
                </div>
                <ol class={s.trackList}>
                  {release.tracks.map((t) => (
                    <li key={t.id} class={`${s.track} ${t.favorite ? s.fav : ''}`}>
                      <span class={s.pos}>{t.position}</span>
                      <span class={s.trackTitle}>{t.title}</span>
                      {t.durationSec !== undefined && (
                        <span class={s.dur}>{formatDuration(t.durationSec)}</span>
                      )}
                      {owner ? (
                        <button
                          type="button"
                          class={s.star}
                          aria-pressed={t.favorite}
                          aria-label={
                            t.favorite
                              ? `Убрать «${t.title}» из любимых`
                              : `Отметить «${t.title}» как любимый`
                          }
                          onClick={() => void toggleFavorite(t.id)}
                        >
                          <Icon name="star" size={20} filled={t.favorite} />
                        </button>
                      ) : (
                        // Всегда резервируем место под звёздочку — иначе у нелюбимых треков
                        // длительность сдвигается относительно любимых (нет отступа под иконку)
                        <span
                          class={s.starStatic}
                          aria-label={t.favorite ? 'Любимый трек' : undefined}
                          aria-hidden={t.favorite ? undefined : true}
                        >
                          {t.favorite && <Icon name="star" size={18} filled />}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {owner && !release.description && !release.tracks.length && !tags.length && (
              <a class={`btn ${s.fill}`} href={href.edit(release.id)}>
                <Icon name="edit" size={18} /> Дописать описание, теги и треки
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
