import s from './Disc.module.css';

interface Props {
  /** Надпись на диске — по ней видно вращение */
  label?: string;
  /** Секунд на оборот; 0 — не вращается */
  spin?: number;
  class?: string;
}

/** Компакт-диск: серебро и приглушённая дифракция (ADR 0008). Только CSS, без картинок. */
export function Disc({ label, spin = 0, class: cls = '' }: Props) {
  return (
    <div class={`${s.disc} ${cls}`} aria-hidden="true">
      {label && (
        <div
          class={s.print}
          style={{ animationDuration: spin ? `${spin}s` : undefined }}
          data-spin={spin > 0}
        >
          <span>{label}</span>
        </div>
      )}
    </div>
  );
}
