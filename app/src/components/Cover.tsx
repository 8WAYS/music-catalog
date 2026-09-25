import { useEffect, useRef, useState } from 'preact/hooks';
import type { Release } from '../data/schema';
import { repo } from '../store/app';
import { hueFromString, initials } from '../utils/normalize';
import s from './Cover.module.css';

interface Props {
  release: Pick<Release, 'id' | 'title' | 'artist' | 'cover' | 'updatedAt' | 'coverColors'>;
  /** Явный адрес картинки (например, превью ещё не сохранённой обложки). */
  src?: string;
  size?: 'grid' | 'hero' | 'thumb';
  eager?: boolean;
  /** Имя для View Transitions: обложка перетекает между главной и карточкой */
  vtName?: string;
}

/** Обложка с плейсхолдером из инициалов и цвета (раздел 7.5). */
export function Cover({ release, src, size = 'grid', eager, vtName }: Props) {
  const peek = () => src ?? repo().peekCoverUrl?.(release as Release);
  const [url, setUrl] = useState<string | undefined>(peek);
  // Проявляем из цвета только то, что грузилось; уже известная картинка появляется сразу
  const fade = useRef(!url);

  useEffect(() => {
    const now = peek();
    if (now) {
      setUrl(now);
      return;
    }
    let alive = true;
    setUrl(undefined);
    if (release.cover)
      void repo()
        .coverUrl(release as Release)
        .then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [src, release.id, release.cover, release.updatedAt]);

  const hue = hueFromString(release.artist + release.title);
  const alt = `Обложка: ${release.title || 'без названия'} — ${release.artist || 'исполнитель не указан'}`;

  return (
    <div
      class={`${s.cover} ${s[size]}`}
      style={
        {
          '--ph-hue': String(hue),
          background: release.coverColors?.bg,
          viewTransitionName: vtName,
        } as Record<string, string>
      }
      role="img"
      aria-label={alt}
    >
      {url ? (
        <img
          src={url}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          class={fade.current ? s.fade : undefined}
        />
      ) : (
        <span class={s.initials} aria-hidden="true">
          {initials(release.title)}
        </span>
      )}
    </div>
  );
}
