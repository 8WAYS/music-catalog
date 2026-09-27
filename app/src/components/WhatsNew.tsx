import { useLayoutEffect, useRef } from 'preact/hooks';
import type { ChangelogEntry } from '../services/changelog';
import overlay from './Overlays.module.css';
import s from './WhatsNew.module.css';

/** «Что нового» — диалог по образцу ConfirmDialog/ShareDialog (Overlays.module.css): и для
 * автопоказа непрочитанного после обновления, и для ручного просмотра всей истории из настроек. */
export function WhatsNew({ entries, onClose }: { entries: ChangelogEntry[]; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => ref.current?.showModal(), []);

  return (
    <dialog
      ref={ref}
      class={overlay.dialog}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      aria-labelledby="whats-new-title"
    >
      <div class={overlay.body}>
        <h2 id="whats-new-title">Что нового</h2>
        {entries.map((entry) => (
          <section key={entry.version} class={s.entry}>
            <p class={s.meta}>
              Версия {entry.version} · {entry.date}
            </p>
            <ul class={s.list}>
              {entry.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
        <div class={overlay.actions}>
          <button type="button" class="btn btn-primary" onClick={() => ref.current?.close()}>
            Понятно
          </button>
        </div>
      </div>
    </dialog>
  );
}
