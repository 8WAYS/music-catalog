import { useRef, useState } from 'preact/hooks';
import { reduceMotion } from '../store/app';

const AXIS_TOLERANCE_PX = 10;
const H_THRESHOLD_RATIO = 0.22;
const V_THRESHOLD_PX = 120;

function motionReduced(): boolean {
  return reduceMotion.value || matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface ReleaseSwipeOptions {
  /** Соседние релизы в том порядке, в котором их только что видели на Картотеке (browsingOrder,
   * store/app.ts); null — граница выборки или карточку открыли напрямую, свайп в эту сторону не наш. */
  prevId: string | null;
  nextId: string | null;
  onNavigate: (id: string) => void;
  onDismiss: () => void;
}

/**
 * Свайп на карточке релиза (макет v3): влево/вправо — соседний релиз, вниз с самого верха
 * страницы — закрыть карточку, как оттянуть модалку. Тот же приём, что `useSwipeTabs.ts` (ref для
 * состояния жеста без лишних ре-рендеров, ось решается один раз по превышению порога), но с двумя
 * отличиями:
 * - осей тут три смысла, не два: горизонталь — своя, вниз с прокруткой в самом верху — тоже своя,
 *   а вверх (или вниз не с самого верха) — просто прокрутка, жест отпускается сразу;
 * - соседние релизы заранее не отрендерены (в отличие от вкладок Картотеки/Витрины), поэтому по
 *   порогу просто зовём `onNavigate`/`onDismiss` — дальше переход берёт на себя View Transition
 *   (`router.ts`), а не собственная анимация трека; оттянутое смещение специально не сбрасывается
 *   перед вызовом — так снимок «до» у перехода получается ровно из того, где палец отпустил карточку.
 */
export function useReleaseSwipe({ prevId, nextId, onNavigate, onDismiss }: ReleaseSwipeOptions) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [settling, setSettling] = useState(false);
  const drag = useRef<{ startX: number; startY: number; axis: 'h' | 'v' | null; atTop: boolean } | null>(
    null,
  );

  function place(dx: number, dy: number, axis: 'h' | 'v'): void {
    const el = cardRef.current;
    if (!el) return;
    if (axis === 'h') {
      el.style.transform = `translateX(${dx}px)`;
    } else {
      const y = Math.max(0, dy);
      el.style.transform = `translateY(${y}px) scale(${1 - Math.min(y / 2000, 0.06)})`;
      el.style.opacity = `${1 - Math.min(y / 500, 0.5)}`;
    }
  }

  // Только для «не дотянул» — отпустить обратно на место. Для настоящего перехода/закрытия смещение
  // не сбрасываем (см. комментарий выше).
  function springBack(): void {
    const el = cardRef.current;
    if (el) {
      el.style.transform = '';
      el.style.opacity = '';
    }
    if (motionReduced()) return;
    setSettling(true);
    setTimeout(() => setSettling(false), 260);
  }

  function onPointerMove(e: PointerEvent): void {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    if (!drag.current.axis) {
      if (Math.abs(dx) < AXIS_TOLERANCE_PX && Math.abs(dy) < AXIS_TOLERANCE_PX) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        drag.current.axis = 'h';
      } else if (dy > 0 && drag.current.atTop) {
        drag.current.axis = 'v';
      } else {
        drag.current = null; // обычная прокрутка — дальше жест не наш
        endDrag(e);
        return;
      }
    }
    place(dx, dy, drag.current.axis);
  }

  function endDrag(e: PointerEvent): void {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
    const state = drag.current;
    drag.current = null;
    if (!state?.axis) return;
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    if (state.axis === 'h') {
      const width = cardRef.current?.clientWidth || 1;
      const threshold = width * H_THRESHOLD_RATIO;
      const targetId = dx < -threshold ? nextId : dx > threshold ? prevId : null;
      if (targetId) onNavigate(targetId);
      else springBack();
    } else if (dy > V_THRESHOLD_PX) {
      onDismiss();
    } else {
      springBack();
    }
  }

  function onPointerDown(e: PointerEvent): void {
    drag.current = { startX: e.clientX, startY: e.clientY, axis: null, atTop: window.scrollY === 0 };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  }

  // Как в useSwipeTabs.ts — иначе мышь на ПК начинает нативный drag обложки вместо жеста.
  const onDragStart = (e: DragEvent) => e.preventDefault();

  return { cardRef, pointerHandlers: { onPointerDown, onDragStart }, settling };
}
