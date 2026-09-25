import { useMemo, useRef, useState } from 'preact/hooks';
import { TAG_GROUP_LABEL, TAG_GROUPS, LIMITS, newId, type Tag, type TagGroup } from '../data/schema';
import { repo, tags as allTags, tagsById, toastError } from '../store/app';
import { normalize } from '../utils/normalize';
import { TagChip } from './TagChip';
import s from './TagInput.module.css';

interface Props {
  value: string[];
  onChange: (tagIds: string[]) => void;
}

/** Ввод тегов с подсказками из существующих (F-05, F-06). Новый тег требует выбора группы. */
export function TagInput({ value, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [pendingName, setPendingName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = value.map((id) => tagsById.value.get(id)).filter((t): t is Tag => !!t);
  const q = normalize(query);

  const suggestions = useMemo(() => {
    const pool = allTags.value.filter((t) => !value.includes(t.id));
    if (!q) return pool.slice(0, 12);
    return pool
      .map((t) => ({ t, n: normalize(t.name) }))
      .filter(({ n }) => n.includes(q))
      .sort((a, b) => Number(!b.n.startsWith(q)) - Number(!a.n.startsWith(q)) || a.n.localeCompare(b.n, 'ru'))
      .map(({ t }) => t)
      .slice(0, 12);
  }, [q, value, allTags.value]);

  const exact = allTags.value.find((t) => normalize(t.name) === q);

  // Последнее значение — чтобы асинхронное создание тега не затёрло теги, добавленные за это время
  const valueRef = useRef(value);
  valueRef.current = value;

  const add = (t: Tag) => {
    if (!valueRef.current.includes(t.id)) onChange([...valueRef.current, t.id]);
    setQuery('');
    setPendingName(null);
    inputRef.current?.focus();
  };

  const create = async (group: TagGroup) => {
    if (!pendingName) return;
    const name = pendingName;
    setPendingName(null);
    setQuery('');
    inputRef.current?.focus();
    try {
      const tag = await repo().saveTag({ id: newId(), name, group });
      if (!valueRef.current.includes(tag.id)) onChange([...valueRef.current, tag.id]);
    } catch (e) {
      toastError(e, 'Не удалось создать тег');
    }
  };

  const submit = () => {
    const name = query.trim();
    if (!name) return;
    if (exact) add(exact);
    else setPendingName(name);
  };

  return (
    <div class={s.wrap}>
      {selected.length > 0 && (
        <div class={s.selected}>
          {selected.map((t) => (
            <TagChip key={t.id} tag={t} active onRemove={() => onChange(value.filter((id) => id !== t.id))} />
          ))}
        </div>
      )}

      <label class="visually-hidden" for="tag-input">
        Добавить тег
      </label>
      <input
        id="tag-input"
        ref={inputRef}
        class="input"
        placeholder="осень, джаз, дача…"
        value={query}
        maxLength={LIMITS.tagName}
        autocomplete="off"
        enterkeyhint="done"
        onInput={(e) => {
          setQuery(e.currentTarget.value);
          setPendingName(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
      />

      {pendingName ? (
        <div class={s.create} role="group" aria-label={`Группа для тега «${pendingName}»`}>
          <p>
            Новый тег <b>«{pendingName}»</b> — к какой группе он относится?
          </p>
          <div class={s.groups}>
            {TAG_GROUPS.map((g) => (
              <button key={g} type="button" class={s.groupBtn} data-group={g} onClick={() => void create(g)}>
                {TAG_GROUP_LABEL[g]}
              </button>
            ))}
          </div>
        </div>
      ) : (
        (suggestions.length > 0 || (q && !exact)) && (
          <div class={s.suggest}>
            {suggestions.map((t) => (
              <TagChip key={t.id} tag={t} showGroup={!!q} onClick={() => add(t)} />
            ))}
            {q && !exact && (
              <button type="button" class={s.new} onClick={submit}>
                + Создать «{query.trim()}»
              </button>
            )}
          </div>
        )
      )}
    </div>
  );
}
