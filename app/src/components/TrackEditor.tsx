import { useRef, useState } from 'preact/hooks';
import { createTrack, type Track } from '../data/schema';
import { formatDuration } from '../utils/normalize';
import { parseTrackLines } from '../utils/tracks';
import { Icon } from './Icon';
import s from './TrackEditor.module.css';

interface Props {
  value: Track[];
  onChange: (tracks: Track[]) => void;
}

function move<T>(arr: T[], from: number, to: number): T[] {
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** Треклист: добавить (в т. ч. вставкой списка), удалить, перетащить, звёздочка (F-02, F-03). */
export function TrackEditor({ value, onChange }: Props) {
  const [draft, setDraft] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const tracksRef = useRef(value);
  tracksRef.current = value;

  const renumber = (tracks: Track[]) => tracks.map((t, i) => ({ ...t, position: i + 1 }));
  const update = (id: string, patch: Partial<Track>) =>
    onChange(value.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const addFromText = (text: string) => {
    const parsed = parseTrackLines(text);
    if (!parsed.length) return;
    const added = parsed.map((p, i) => ({ ...createTrack(p.title, value.length + i + 1), ...p }));
    onChange(renumber([...value, ...added]));
    setDraft('');
  };

  // ---------- Перетаскивание за ручку (pointer events: мышь, палец, стилус) ----------
  const onPointerDown = (e: PointerEvent, id: string) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragId(id);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragId || !listRef.current) return;
    const rows = [...listRef.current.children] as HTMLElement[];
    const from = tracksRef.current.findIndex((t) => t.id === dragId);
    let to = from;
    rows.forEach((row, i) => {
      const r = row.getBoundingClientRect();
      if (e.clientY > r.top && e.clientY < r.bottom) to = i;
    });
    if (to !== from && from >= 0) onChange(renumber(move(tracksRef.current, from, to)));
  };
  const endDrag = () => setDragId(null);

  const onHandleKey = (e: KeyboardEvent, index: number) => {
    const to = e.key === 'ArrowUp' ? index - 1 : e.key === 'ArrowDown' ? index + 1 : -1;
    if (to < 0 || to >= value.length) return;
    e.preventDefault();
    onChange(renumber(move(value, index, to)));
    requestAnimationFrame(() =>
      (listRef.current?.children[to]?.querySelector('[data-handle]') as HTMLElement | null)?.focus(),
    );
  };

  return (
    <div class={s.wrap}>
      {value.length > 0 && (
        <ol class={s.list} ref={listRef}>
          {value.map((t, i) => (
            <li key={t.id} class={`${s.row} ${dragId === t.id ? s.dragging : ''}`}>
              <button
                type="button"
                class={s.handle}
                data-handle
                aria-label={`Переместить «${t.title}», сейчас ${i + 1}. Стрелки вверх и вниз`}
                onPointerDown={(e) => onPointerDown(e, t.id)}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={(e) => onHandleKey(e, i)}
              >
                <Icon name="grip" size={18} />
              </button>
              <span class={s.pos}>{i + 1}</span>
              <input
                class={s.title}
                value={t.title}
                aria-label={`Название трека ${i + 1}`}
                onInput={(e) => update(t.id, { title: e.currentTarget.value })}
              />
              {t.durationSec !== undefined && <span class={s.dur}>{formatDuration(t.durationSec)}</span>}
              <button
                type="button"
                class={s.star}
                aria-pressed={t.favorite}
                aria-label={t.favorite ? 'Убрать из любимых' : 'Любимый трек'}
                onClick={() => update(t.id, { favorite: !t.favorite })}
              >
                <Icon name="star" size={20} filled={t.favorite} />
              </button>
              <button
                type="button"
                class={s.remove}
                aria-label={`Удалить трек «${t.title}»`}
                onClick={() => onChange(renumber(value.filter((x) => x.id !== t.id)))}
              >
                <Icon name="close" size={18} />
              </button>
            </li>
          ))}
        </ol>
      )}

      <div class={s.add}>
        <textarea
          class="input"
          rows={1}
          placeholder={value.length ? 'Ещё трек…' : 'Название трека или вставь весь треклист'}
          aria-label="Добавить трек"
          value={draft}
          enterkeyhint="enter"
          onInput={(e) => {
            const v = e.currentTarget.value;
            // Вставка списка: сразу разбираем на треки
            if (v.includes('\n') && v.trim().includes('\n')) addFromText(v);
            else setDraft(v.replace(/\n/g, ''));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              addFromText(draft);
            }
          }}
        />
        <button type="button" class="btn" onClick={() => addFromText(draft)} disabled={!draft.trim()}>
          Добавить
        </button>
      </div>
      <p class={s.hint}>Можно вставить список целиком — номера и длительности распознаются сами.</p>
    </div>
  );
}
