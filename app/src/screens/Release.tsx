import { Cover } from '../components/Cover';
import { Icon } from '../components/Icon';
import { TagChip } from '../components/TagChip';
import { LINK_SERVICE_LABEL, RELEASE_TYPE_LABEL, TAG_GROUPS, type Release as R } from '../data/schema';
import { goBack, href, shareUrl } from '../router';
import { isOwner, releasesById, repo, tagsById, toast, toastError } from '../store/app';
import { formatDuration, pluralize } from '../utils/normalize';
import s from './Release.module.css';

/** Карточка релиза (раздел 6.2), адрес #/release/<id>. */
export function Release({ id }: { id: string }) {
  const release = releasesById.value.get(id);
  const owner = isOwner.value;

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

  const colors = release.coverColors;
  const style = colors
    ? ({ '--card-bg': colors.bg, '--card-accent': colors.accent, '--card-text': colors.text } as Record<
        string,
        string
      >)
    : undefined;

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
    <div class={`${s.card} ${colors ? s.tinted : ''}`} style={style}>
      <div class="page">
        <header class={`topbar ${s.bar}`}>
          <button type="button" class="icon-btn" onClick={() => goBack()} aria-label="Назад">
            <Icon name="back" />
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" class="icon-btn" onClick={share} aria-label="Поделиться">
            <Icon name="share" />
          </button>
          {owner && (
            <a class="icon-btn" href={href.edit(release.id)} aria-label="Изменить">
              <Icon name="edit" />
            </a>
          )}
        </header>

        <div class={s.layout}>
          <div class={s.hero}>
            <Cover release={release} size="hero" eager />
          </div>

          <div class={s.info}>
            <p class={s.kicker}>
              {RELEASE_TYPE_LABEL[release.type]}
              {release.year && ` · ${release.year}`}
            </p>
            <h1 class={s.title}>{release.title}</h1>
            <p class={s.artist}>{release.artist}</p>

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
                {tags.map((t) => (
                  <TagChip key={t.id} tag={t} />
                ))}
              </div>
            )}

            {release.tracks.length > 0 && (
              <section class={s.tracks} aria-labelledby="tracks-h">
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
                        t.favorite && (
                          <span class={s.starStatic} aria-label="Любимый трек">
                            <Icon name="star" size={18} filled />
                          </span>
                        )
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
