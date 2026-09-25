import { useLayoutEffect, useRef } from 'preact/hooks';
import { confirmRequest, toasts } from '../store/app';
import s from './Overlays.module.css';

export function Toasts() {
  return (
    <div class={s.toasts} role="status" aria-live="polite">
      {toasts.value.map((t) => (
        <div key={t.id} class={`${s.toast} ${t.kind === 'error' ? s.error : ''}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function ConfirmDialog() {
  const req = confirmRequest.value;
  const ref = useRef<HTMLDialogElement>(null);

  // Синхронно с рендером: иначе до отложенного close() страница остаётся inert и ввод теряется (WebKit)
  useLayoutEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (req && !d.open) d.showModal();
    if (!req && d.open) d.close();
  }, [req]);

  return (
    <dialog
      ref={ref}
      class={s.dialog}
      onCancel={(e) => {
        e.preventDefault();
        req?.resolve(false);
      }}
      onClick={(e) => {
        if (e.target === ref.current) req?.resolve(false);
      }}
      aria-labelledby="confirm-title"
    >
      {req && (
        <div class={s.body}>
          <h2 id="confirm-title">{req.title}</h2>
          {req.text && <p>{req.text}</p>}
          <div class={s.actions}>
            <button type="button" class="btn" onClick={() => req.resolve(false)}>
              {req.cancel ?? 'Отмена'}
            </button>
            <button
              type="button"
              class={`btn ${req.danger ? s.danger : 'btn-primary'}`}
              onClick={() => req.resolve(true)}
              autofocus
            >
              {req.confirm}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
