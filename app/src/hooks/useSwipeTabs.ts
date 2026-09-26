import { useRef, useState } from 'preact/hooks';
import { reduceMotion } from '../store/app';

const SWIPE_THRESHOLD_RATIO = 0.22;
const AXIS_TOLERANCE_PX = 10;
// Чтобы решить «это вертикаль», вертикальный сдвиг должен явно перевешивать — иначе у медленного,
// неторопливого свайпа обычное дрожание руки в первых пикселях случайно запирает жест в «вертикаль»
// и дальше движение просто не подхватывается (сообщили: «свайпать медленно — может сбиться»).
const VERTICAL_BIAS = 1.2;

function motionReduced(): boolean {
  return reduceMotion.value || matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Свайп между вкладками (ADR 0011): во время перетаскивания трек двигают напрямую через ref, минуя
 * ре-рендер на каждый pointermove — иначе на слабом устройстве жест дёргается (тот же класс проблем,
 * что лаги фоновых анимаций на iPhone 14 в этой сессии). Ре-рендер — только при смене вкладки (goTo).
 *
 * Направление решает сам жест: до срабатывания порога ничего не решено, после — раз и навсегда,
 * horizontal или vertical; при vertical управление отдаётся браузеру (`touch-action: pan-y` на
 * области жеста), preventDefault() не нужен — как и в макете `docs/design/tabs-swipe-v1.html`.
 *
 * pointermove/pointerup слушаются на `window`, а не только на `.viewport`: `.viewport` ловит лишь
 * pointerdown (жест должен начаться внутри свайпаемой области), а дальше окно — иначе на ПК быстрая
 * мышь легко выходит за пределы `.viewport` во время движения (мимо шапки, за край окна), дальнейшие
 * события до нас не долетают, и жест «залипает» навсегда (трек застревает на середине пути, курсор
 * будто в перетаскивании) — setPointerCapture() эту же задачу не решает: в паре с автоматизацией её
 * захват уже ломал доставку событий (см. ниже), а без неё .viewport один не гарантирует продолжение
 * жеста при выходе курсора за его границы.
 *
 * Без захвата курсора у настоящей (не синтетической) мыши на ПК браузер всё равно шлёт click после
 * mouseup — по элементу, где было mousedown, даже если трек под курсором уже уехал на другую вкладку.
 * `onClickCapture` (перехват на фазе погружения, тот же приём, что `useLongPress.ts`) гасит этот клик,
 * если только что состоялся настоящий горизонтальный свайп — иначе он открывал бы карточку релиза
 * поверх уже переключившейся вкладки.
 */
export function useSwipeTabs(count: number, onSettle: (index: number) => void, initialIndex = 0) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndexState] = useState(initialIndex);
  const indexRef = useRef(initialIndex);
  const [animating, setAnimating] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startX: number; startY: number; axis: 'h' | 'v' | null } | null>(null);
  const suppressClick = useRef(false);

  // Трек шириной count*100% — свой «шаг» в процентах считаем от его собственной ширины,
  // иначе translateX(-100%) сдвинет на всю ширину трека, а не на один экран (было -718px вместо -359px).
  const stepPercent = 100 / count;

  function setIndex(i: number): void {
    indexRef.current = i;
    setIndexState(i);
  }

  function place(i: number, dragPx: number, animate: boolean): void {
    const track = trackRef.current;
    if (!track) return;
    track.style.transform = `translateX(calc(${-i * stepPercent}% + ${dragPx}px))`;
    setAnimating(animate && !motionReduced());
  }

  function goTo(i: number, animate = true): void {
    const clamped = Math.max(0, Math.min(count - 1, i));
    place(clamped, 0, animate);
    setIndex(clamped);
    onSettle(clamped);
  }

  function onPointerMove(e: PointerEvent): void {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    if (!drag.current.axis) {
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      if (absDx < AXIS_TOLERANCE_PX && absDy < AXIS_TOLERANCE_PX) return;
      drag.current.axis = absDy > absDx * VERTICAL_BIAS ? 'v' : 'h';
      if (drag.current.axis === 'v') {
        drag.current = null; // обычная вертикальная прокрутка — дальше жест не наш
        endDrag(e);
        return;
      }
      // На время свайпа фоновые анимации (аура, диск, перламутр) не крутятся — не отнимают
      // кадр у самого жеста, тот же приём, что router.ts использует для смены экрана (html.
      // transitioning); иначе на слабом устройстве медленный свайп выглядит рвано.
      document.documentElement.classList.add('transitioning');
      // Плавающий док/шапка конкретной вкладки — только у осевшей позиции (index), не у той,
      // куда жест ещё только тянется: иначе в момент перетаскивания чужой floating-элемент
      // наплывает на содержимое соседней вкладки (плохая «склейка» посередине жеста).
      setDragging(true);
    }
    place(indexRef.current, dx, false);
  }

  function endDrag(e: PointerEvent): void {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
    document.documentElement.classList.remove('transitioning');
    setDragging(false);
    if (!drag.current || drag.current.axis !== 'h') {
      drag.current = null;
      return;
    }
    // Без setPointerCapture (см. выше) на реальной мыши, а не в синтетическом тесте, браузер
    // после mouseup всё равно шлёт click — по элементу, на котором было mousedown, хотя трек
    // под курсором уже успел уехать. Гасим этот клик, тем же приёмом, что useLongPress.ts —
    // capture-фаза на .viewport перехватывает его раньше, чем он дойдёт до ссылки под курсором.
    suppressClick.current = true;
    const dx = e.clientX - drag.current.startX;
    drag.current = null;
    const width = viewportRef.current?.clientWidth || 1;
    const threshold = width * SWIPE_THRESHOLD_RATIO;
    if (dx < -threshold) goTo(indexRef.current + 1);
    else if (dx > threshold) goTo(indexRef.current - 1);
    else goTo(indexRef.current);
  }

  function onPointerDown(e: PointerEvent): void {
    drag.current = { startX: e.clientX, startY: e.clientY, axis: null };
    setAnimating(false); // иначе CSS-переход тянется за пальцем вместо честного 1:1
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  }

  // Ссылки и картинки перетаскиваемы по умолчанию — без этого мышь на ПК начинала нативный
  // drag ссылки вместо свайпа: курсор переключался в режим перетаскивания, а обычные
  // pointermove/pointerup подменялись событиями drag/dragend, до нас не долетая вовсе.
  const onDragStart = (e: DragEvent) => e.preventDefault();

  const onClickCapture = (e: Event) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  return {
    trackRef,
    viewportRef,
    pointerHandlers: { onPointerDown, onDragStart, onClickCapture },
    index,
    animating,
    dragging,
    goTo,
    // Осевшая позиция — как обычный реактивный стиль; во время перетаскивания её временно
    // перекрывает прямая правка transform через trackRef (см. place()), без ре-рендера.
    style: { transform: `translateX(${-index * stepPercent}%)` },
  };
}
