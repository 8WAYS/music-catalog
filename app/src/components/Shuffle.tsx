import { useEffect, useState } from 'preact/hooks';
import type { Release } from '../data/schema';
import { Cover } from './Cover';
import s from './Shuffle.module.css';

export const SHUFFLE_MS = 800;
const STEP_MS = 170;

/**
 * «Удиви меня» (раздел 7.4): быстрое перелистывание 3–4 обложек и остановка на выбранной.
 * Последний кадр — выбранный релиз; через SHUFFLE_MS вызывается onDone.
 */
export function Shuffle({ frames, onDone }: { frames: Release[]; onDone: () => void }) {
  const [i, setI] = useState(0);
  const last = frames.length - 1;

  useEffect(() => {
    const timers = frames.slice(1).map((_, k) => setTimeout(() => setI(k + 1), (k + 1) * STEP_MS));
    timers.push(setTimeout(onDone, SHUFFLE_MS));
    return () => timers.forEach(clearTimeout);
  }, []);

  const r = frames[i]!;
  const done = i === last;
  return (
    <div class={s.backdrop}>
      <div class={s.stage}>
        <div key={i} class={`${s.frame} ${done ? s.final : ''}`}>
          <Cover release={r} size="hero" eager />
        </div>
        <p class={s.caption} role="status" aria-live="polite">
          {done ? (
            <>
              <strong>{r.title}</strong>
              <span>{r.artist}</span>
            </>
          ) : (
            <span>Выбираю…</span>
          )}
        </p>
      </div>
    </div>
  );
}
