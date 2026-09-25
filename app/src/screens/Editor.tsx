import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { Cover } from '../components/Cover';
import { Icon } from '../components/Icon';
import { LinksEditor } from '../components/LinksEditor';
import { TagInput } from '../components/TagInput';
import { TrackEditor } from '../components/TrackEditor';
import {
  LIMITS,
  RELEASE_TYPES,
  RELEASE_TYPE_LABEL,
  coverPath,
  createRelease,
  type CoverColors,
  type Release,
} from '../data/schema';
import { processCover } from '../services/image';
import { goBack, href, navigate, setLeaveGuard } from '../router';
import { confirmDialog, releasesById, repo, takeEditorSeed, toast, toastError } from '../store/app';
import { resetAddSearch } from './AddSearch';
import s from './Editor.module.css';

type CoverDraft = { blob: Blob; url: string; colors: CoverColors } | 'remove' | null;

/** Редактор релиза (раздел 6.4): #/new и #/edit/<id>. */
export function Editor({ id }: { id?: string }) {
  const original = id ? releasesById.value.get(id) : undefined;
  // Новый релиз может прийти с полями и обложкой из поиска iTunes (#/add)
  const [seed] = useState(() => (id ? null : takeEditorSeed()));
  const initial = useMemo(() => original ?? createRelease(seed?.release), [id]);
  const [draft, setDraft] = useState<Release>(initial);
  const [cover, setCover] = useState<CoverDraft>(() =>
    seed?.cover ? { ...seed.cover, url: URL.createObjectURL(seed.cover.blob) } : null,
  );
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; artist?: string; year?: string }>({});
  const [yearText, setYearText] = useState(initial.year ? String(initial.year) : '');
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty =
    !!seed ||
    cover !== null ||
    yearText !== (initial.year ? String(initial.year) : '') ||
    JSON.stringify(draft) !== JSON.stringify(initial);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // Защита от потери несохранённых изменений
  useEffect(() => {
    setLeaveGuard(() =>
      dirtyRef.current
        ? confirmDialog({
            title: 'Выйти без сохранения?',
            text: 'Изменения в этом релизе пропадут.',
            confirm: 'Выйти',
            cancel: 'Остаться',
            danger: true,
          })
        : Promise.resolve(true),
    );
    return () => setLeaveGuard(null);
  }, []);

  useEffect(() => () => (cover && cover !== 'remove' ? URL.revokeObjectURL(cover.url) : undefined), [cover]);

  if (id && !original) {
    return (
      <div class="page">
        <p>Релиз не найден.</p>
        <a class="btn" href={href.home()}>
          На главную
        </a>
      </div>
    );
  }

  const set = <K extends keyof Release>(key: K, v: Release[K]) => setDraft((d) => ({ ...d, [key]: v }));

  const pickCover = async (file: File | undefined) => {
    if (!file) return;
    setProcessing(true);
    try {
      const { blob, colors } = await processCover(file);
      setCover({ blob, url: URL.createObjectURL(blob), colors });
    } catch (e) {
      toastError(e, 'Обложка');
    } finally {
      setProcessing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const validate = (): boolean => {
    const e: typeof errors = {};
    if (!draft.title.trim()) e.title = 'Без названия никак';
    if (!draft.artist.trim()) e.artist = 'Укажи исполнителя';
    if (yearText && (!/^\d{4}$/.test(yearText) || +yearText < 1900 || +yearText > 2100))
      e.year = 'Год — четыре цифры';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) {
      toast('Заполни название и исполнителя', 'error');
      return;
    }
    setBusy(true);
    try {
      const next: Release = { ...draft, year: yearText ? +yearText : undefined };
      if (cover === 'remove') {
        next.cover = undefined;
        next.coverColors = undefined;
      } else if (cover) {
        await repo().saveCover(next.id, cover.blob);
        next.cover = coverPath(next.id, cover.blob.type);
        next.coverColors = cover.colors;
      }
      await repo().saveRelease(next);
      setLeaveGuard(null);
      if (!original) resetAddSearch();
      toast(original ? 'Сохранено' : 'Релиз добавлен');
      navigate(href.release(next.id), { replace: true });
    } catch (e) {
      toastError(e, 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!original) return;
    const ok = await confirmDialog({
      title: `Удалить «${original.title}»?`,
      text: 'Релиз, треклист и обложка удалятся из картотеки.',
      confirm: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    try {
      await repo().deleteRelease(original.id);
      setLeaveGuard(null);
      toast('Релиз удалён');
      navigate(href.home(), { replace: true });
    } catch (e) {
      toastError(e, 'Не удалось удалить');
    }
  };

  const coverSrc = cover && cover !== 'remove' ? cover.url : undefined;
  const hasCover = cover === 'remove' ? false : !!(coverSrc || draft.cover);
  const favCount = draft.tracks.filter((t) => t.favorite).length;

  return (
    <div class="page">
      <header class="topbar">
        <button type="button" class="icon-btn" onClick={() => goBack()} aria-label="Закрыть">
          <Icon name="close" />
        </button>
        <h1>{original ? 'Изменить' : 'Новый релиз'}</h1>
        <button type="button" class="btn btn-primary" onClick={save} disabled={busy || processing}>
          {busy ? 'Сохраняю…' : 'Сохранить'}
        </button>
      </header>

      <form
        class={s.form}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        noValidate
      >
        {/* ---------- Главное ---------- */}
        <div class={s.main}>
          <div class={s.coverBox}>
            <button
              type="button"
              class={s.coverBtn}
              onClick={() => fileRef.current?.click()}
              aria-label={hasCover ? 'Заменить обложку' : 'Загрузить обложку'}
              disabled={processing}
            >
              {hasCover ? (
                <Cover
                  release={{ ...draft, cover: cover === 'remove' ? undefined : draft.cover }}
                  src={coverSrc}
                  size="hero"
                />
              ) : (
                <span class={s.coverEmpty}>
                  <Icon name="image" size={28} />
                  <span>{processing ? 'Обрабатываю…' : 'Обложка'}</span>
                </span>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              class="visually-hidden"
              tabIndex={-1}
              onChange={(e) => void pickCover(e.currentTarget.files?.[0])}
            />
            {hasCover && (
              <button
                type="button"
                class={`btn btn-ghost ${s.coverRemove}`}
                onClick={() => setCover('remove')}
              >
                Убрать обложку
              </button>
            )}
          </div>

          <div class={s.fields}>
            <label class="field">
              <span>Название</span>
              <input
                class="input"
                value={draft.title}
                maxLength={LIMITS.title}
                aria-invalid={!!errors.title}
                autoFocus={!original}
                onInput={(e) => set('title', e.currentTarget.value)}
              />
              {errors.title && <em class={s.err}>{errors.title}</em>}
            </label>
            <label class="field">
              <span>Исполнитель</span>
              <input
                class="input"
                value={draft.artist}
                maxLength={LIMITS.artist}
                aria-invalid={!!errors.artist}
                onInput={(e) => set('artist', e.currentTarget.value)}
              />
              {errors.artist && <em class={s.err}>{errors.artist}</em>}
            </label>
            <div class={s.row}>
              <fieldset class={s.segmented}>
                <legend class="visually-hidden">Тип релиза</legend>
                {RELEASE_TYPES.map((t) => (
                  <label key={t}>
                    <input
                      type="radio"
                      name="type"
                      value={t}
                      checked={draft.type === t}
                      onChange={() => set('type', t)}
                    />
                    <span>{RELEASE_TYPE_LABEL[t]}</span>
                  </label>
                ))}
              </fieldset>
              <label class={`field ${s.year}`}>
                <span class="visually-hidden">Год</span>
                <input
                  class="input"
                  inputMode="numeric"
                  placeholder="Год"
                  maxLength={4}
                  value={yearText}
                  aria-invalid={!!errors.year}
                  onInput={(e) => setYearText(e.currentTarget.value.replace(/\D/g, ''))}
                />
              </label>
            </div>
            {errors.year && <em class={s.err}>{errors.year}</em>}
          </div>
        </div>

        {/* ---------- Раскрываемые блоки ---------- */}
        <Section
          title="Описание"
          summary={draft.description ? `${draft.description.length} симв.` : ''}
          open={!!draft.description}
        >
          <textarea
            class="input"
            rows={5}
            maxLength={LIMITS.description}
            placeholder="Что это за музыка для тебя, где и когда слушал…"
            value={draft.description ?? ''}
            onInput={(e) => set('description', e.currentTarget.value)}
          />
        </Section>

        <Section title="Теги" summary={draft.tagIds.length ? String(draft.tagIds.length) : ''} open>
          <TagInput value={draft.tagIds} onChange={(v) => set('tagIds', v)} />
        </Section>

        <Section
          title="Треклист"
          summary={draft.tracks.length ? `${draft.tracks.length}${favCount ? ` · ★ ${favCount}` : ''}` : ''}
          open={draft.tracks.length > 0}
        >
          <TrackEditor value={draft.tracks} onChange={(v) => set('tracks', v)} />
        </Section>

        <Section
          title="Ссылки «Слушать»"
          summary={draft.links.length ? String(draft.links.length) : ''}
          open={draft.links.length > 0}
        >
          <LinksEditor value={draft.links} onChange={(v) => set('links', v)} />
        </Section>

        {original && (
          <button type="button" class={`btn btn-danger ${s.delete}`} onClick={() => void remove()}>
            <Icon name="trash" size={18} /> Удалить релиз
          </button>
        )}
      </form>
    </div>
  );
}

function Section(props: { title: string; summary: string; open?: boolean; children: ComponentChildren }) {
  // Раскрытость задаётся один раз при открытии редактора, дальше — как решит пользователь
  const [initialOpen] = useState(props.open);
  return (
    <details class={s.section} open={initialOpen}>
      <summary>
        <span>{props.title}</span>
        {props.summary && <span class={s.summary}>{props.summary}</span>}
        <Icon name="chevron" size={18} class={s.chev} />
      </summary>
      <div class={s.sectionBody}>{props.children}</div>
    </details>
  );
}
