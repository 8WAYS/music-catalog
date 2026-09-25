import type { ComponentChildren } from 'preact';
import { TAG_GROUP_LABEL, type Tag } from '../data/schema';
import s from './TagChip.module.css';

interface Props {
  tag: Tag;
  active?: boolean;
  showGroup?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  children?: ComponentChildren;
}

/** Чип тега: обычный, активный, с подписью группы (раздел 7.5). */
export function TagChip({ tag, active, showGroup, onClick, onRemove }: Props) {
  const label = (
    <>
      <span class={s.dot} data-group={tag.group} aria-hidden="true" />
      {tag.name}
      {showGroup && <span class={s.group}>{TAG_GROUP_LABEL[tag.group].toLowerCase()}</span>}
    </>
  );
  return (
    <span class={`${s.chip} ${active ? s.active : ''}`}>
      {onClick ? (
        <button type="button" class={s.main} onClick={onClick} aria-pressed={active}>
          {label}
        </button>
      ) : (
        <span class={s.main}>{label}</span>
      )}
      {onRemove && (
        <button type="button" class={s.remove} onClick={onRemove} aria-label={`Убрать тег ${tag.name}`}>
          ×
        </button>
      )}
    </span>
  );
}
