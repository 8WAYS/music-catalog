import { useRef } from 'preact/hooks';

const DURATION_MS = 500;
const MOVE_TOLERANCE_PX = 10;

/**
 * Долгое нажатие — закрепление на витрине (ADR 0011). Таймер отменяется, если палец/курсор
 * сдвинулся дальше небольшого порога или отпустили раньше срока — не путает жест с обычной
 * прокруткой. Когда долгое нажатие сработало, следующий click (переход по ссылке/кнопке) этой же
 * последовательности гасится сам — не открывает карточку вдобавок к закреплению.
 */
export function useLongPress(onLongPress: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const clear = () => {
    clearTimeout(timer.current);
    start.current = null;
  };

  const onPointerDown = (e: PointerEvent) => {
    fired.current = false;
    start.current = { x: e.clientX, y: e.clientY };
    timer.current = setTimeout(() => {
      fired.current = true;
      onLongPress();
    }, DURATION_MS);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    if (Math.hypot(dx, dy) > MOVE_TOLERANCE_PX) clear();
  };

  const onClickCapture = (e: Event) => {
    if (!fired.current) return;
    fired.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: clear,
    onPointerCancel: clear,
    onClickCapture,
  };
}
