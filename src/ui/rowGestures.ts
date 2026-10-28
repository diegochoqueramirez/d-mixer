import { GESTURE_SLOP, LONG_PRESS_MS, SWIPE_REVEAL_WIDTH, reorderTargetIndex, swipeReleaseAction } from '../lib/gestures';
import { SPRING, animate, animateNumber, createVelocityTracker, currentTranslate, prefersReducedMotion, resetTransform, springAxis, type Animation } from './motion';

// ---------- y animations shared by FLIP and reordering ----------

const yAnims = new WeakMap<Element, Animation>();

/** Springs an element's translateY, replacing any running one. */
export function animateY(el: Element, from: number, to: number, spring = SPRING.rowMove): void {
  yAnims.get(el)?.stop();
  yAnims.set(el, springAxis(el, 'y', from, to, spring));
}

export function stopY(el: HTMLElement): void {
  yAnims.get(el)?.stop();
  yAnims.delete(el);
  resetTransform(el);
}

// ---------- swipe to delete ----------

/** The only row that may show "Eliminar"; opening another one closes it. */
let openRow: SwipeRow | null = null;

interface SwipeRow {
  root: HTMLElement;
  close(): void;
}

// A tap outside the open row only closes it, like iOS.
document.addEventListener(
  'pointerdown',
  (e) => {
    if (!openRow || openRow.root.contains(e.target as Node)) return;
    openRow.close();
    // a swipe on another row goes on (and opens that one); anything else only closes
    if ((e.target as Element).closest('.row')) return;
    e.stopPropagation();
    const swallow = (c: Event) => {
      c.preventDefault();
      c.stopPropagation();
    };
    document.addEventListener('click', swallow, { capture: true, once: true });
    // the click may never come (e.g. a scroll); forget the listener soon after
    setTimeout(() => document.removeEventListener('click', swallow, { capture: true }), 400);
  },
  { capture: true },
);

export interface RowGestureOptions {
  /** li that holds the row; used to tell rows apart. */
  root: HTMLElement;
  /** Sliding content of the row. */
  content: HTMLElement;
  /** Red "Eliminar" button revealed behind the content. */
  deleteBtn: HTMLButtonElement;
  /** ≡ handle: lifts the row at once. */
  handle: HTMLElement;
  /** Remove the track (after the swipe animation when it was a full swipe). */
  onDelete(): void;
  /** Lift the row for reordering; the pointer is already captured by `captureEl`. */
  onLift(e: { pointerId: number; clientY: number; captureEl: HTMLElement }): void;
}

export function attachRowGestures(o: RowGestureOptions): void {
  const { content, deleteBtn, handle } = o;
  const tracker = createVelocityTracker();
  let offset = 0;
  let anim: Animation | null = null;
  let g: { id: number; x: number; y: number; lastY: number; base: number; axis: 'x' | 'y' | null; lifted: boolean; timer: number } | null = null;

  const self: SwipeRow = { root: o.root, close: () => settle(0) };

  function show(off: number) {
    offset = off;
    content.style.transform = off ? `translateX(${-off}px)` : '';
    deleteBtn.style.width = `${Math.max(SWIPE_REVEAL_WIDTH, off)}px`;
    // closed rows hide it, or its red bleeds through the rounded corners
    deleteBtn.style.visibility = off > 0 ? 'visible' : 'hidden';
  }

  function setRevealed(revealed: boolean) {
    deleteBtn.tabIndex = revealed ? 0 : -1;
    deleteBtn.toggleAttribute('aria-hidden', !revealed);
    if (revealed) {
      if (openRow && openRow !== self) openRow.close();
      openRow = self;
    } else if (openRow === self) {
      openRow = null;
    }
  }

  function settle(target: number, velocity = 0) {
    anim?.stop();
    const from = offset;
    setRevealed(target > 0);
    if (prefersReducedMotion()) {
      show(target);
      return;
    }
    // animate the offset as a number so the button width follows the content
    anim = animateNumber(from, target, SPRING.sheetRestore, show, velocity);
  }

  function release(cancelled: boolean) {
    if (!g) return;
    window.clearTimeout(g.timer);
    content.classList.remove('is-pressed');
    const { axis, base, lifted } = g;
    g = null;
    if (lifted) return;
    if (axis === 'x' && !cancelled) {
      const v = -tracker.velocity().x;
      const width = content.offsetWidth;
      const action = swipeReleaseAction(offset, v, width);
      if (action === 'delete') {
        anim?.stop();
        setRevealed(false);
        const done = () => o.onDelete();
        if (prefersReducedMotion()) done();
        else {
          anim = animateNumber(offset, width, SPRING.sheetClose, show, v);
          void anim.then(done);
        }
      } else {
        settle(action === 'reveal' ? SWIPE_REVEAL_WIDTH : 0, v);
      }
    } else if (axis === 'x' || base > 0) {
      // a tap on an open row closes it
      settle(axis === 'x' ? base : 0);
    }
  }

  content.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || e.button !== 0) return;
    if ((e.target as Element).closest('button, .row-handle')) return;
    anim?.stop();
    tracker.reset();
    tracker.add(e.clientX, e.clientY);
    content.classList.add('is-pressed');
    const pointerId = e.pointerId;
    g = {
      id: pointerId,
      x: e.clientX,
      y: e.clientY,
      lastY: e.clientY,
      base: offset,
      axis: null,
      lifted: false,
      timer: window.setTimeout(() => {
        if (!g || g.axis || offset > 0) return;
        g.lifted = true;
        content.classList.remove('is-pressed');
        content.setPointerCapture(pointerId);
        o.onLift({ pointerId, clientY: g.lastY, captureEl: content });
      }, LONG_PRESS_MS),
    };
  });

  content.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id || g.lifted) return;
    g.lastY = e.clientY;
    tracker.add(e.clientX, e.clientY);
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.axis) {
      if (Math.hypot(dx, dy) < GESTURE_SLOP) return;
      window.clearTimeout(g.timer);
      content.classList.remove('is-pressed');
      if (Math.abs(dx) > Math.abs(dy) && (dx < 0 || g.base > 0)) {
        g.axis = 'x';
        content.setPointerCapture(e.pointerId);
      } else {
        // vertical: the page scrolls, the row stays
        g.axis = 'y';
        if (g.base > 0) settle(0);
        g = null;
        return;
      }
    }
    show(Math.min(content.offsetWidth, Math.max(0, g.base - dx)));
  });

  content.addEventListener('pointerup', () => release(false));
  content.addEventListener('pointercancel', () => release(true));

  // While swiping or lifted the page must not scroll (iOS ignores touch-action after the fact).
  content.addEventListener(
    'touchmove',
    (e) => {
      if (g && (g.axis === 'x' || g.lifted)) e.preventDefault();
    },
    { passive: false },
  );
  content.addEventListener('contextmenu', (e) => e.preventDefault());
  o.root.addEventListener('contextmenu', (e) => e.preventDefault());

  handle.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || e.button !== 0) return;
    e.preventDefault();
    if (offset > 0) settle(0);
    handle.setPointerCapture(e.pointerId);
    o.onLift({ pointerId: e.pointerId, clientY: e.clientY, captureEl: handle });
  });

  deleteBtn.addEventListener('click', () => {
    setRevealed(false);
    o.onDelete();
  });
  setRevealed(false);
  show(0);
}

// ---------- reorder ----------

export interface ReorderItem {
  root: HTMLElement;
  /** Part that grows while lifted (the row, not the chip below it). */
  visual: HTMLElement;
}

/** Height of the fixed bars that hide the list's edges, for auto-scroll. */
export interface ReorderEdges {
  top(): number;
  bottom(): number;
}

/**
 * Drags a lifted row through the list: the others step aside, the list scrolls near the edges
 * and `onDrop(toIndex)` runs on release (only when the index changed).
 */
export function liftRow(
  items: ReorderItem[],
  fromIndex: number,
  start: { pointerId: number; clientY: number; captureEl: HTMLElement },
  edges: ReorderEdges,
  onDrop: (toIndex: number) => void,
): void {
  const dragged = items[fromIndex];
  const tops = items.map((it) => it.root.getBoundingClientRect().top - currentTranslate(it.root).y + window.scrollY);
  const heights = items.map((it) => it.root.offsetHeight);
  const midpoints = tops.map((t, i) => t + heights[i] / 2);
  const draggedHeight = heights[fromIndex];
  const startPageY = start.clientY + window.scrollY;
  const shifts = items.map(() => 0);
  let lastClientY = start.clientY;
  let target = fromIndex;
  let frame = 0;
  let done = false;

  for (const it of items) stopY(it.root);
  dragged.root.classList.add('is-lifted');
  if (!prefersReducedMotion()) animate(dragged.visual, { scale: 1.03 }, SPRING.rowLift);

  function place() {
    const dy = lastClientY + window.scrollY - startPageY;
    dragged.root.style.transform = `translateY(${dy}px)`;
    target = reorderTargetIndex(midpoints[fromIndex] + dy, midpoints, fromIndex);
    items.forEach((it, i) => {
      if (i === fromIndex) return;
      let shift = 0;
      if (fromIndex < target && i > fromIndex && i <= target) shift = -draggedHeight;
      if (target < fromIndex && i >= target && i < fromIndex) shift = draggedHeight;
      if (shift !== shifts[i]) {
        animateY(it.root, currentTranslate(it.root).y, shift);
        shifts[i] = shift;
      }
    });
  }

  function autoScroll() {
    if (done) return;
    const zone = 48;
    const top = edges.top() + zone;
    const bottom = window.innerHeight - edges.bottom() - zone;
    let speed = 0;
    if (lastClientY < top) speed = -Math.min(16, (top - lastClientY) / 3);
    else if (lastClientY > bottom) speed = Math.min(16, (lastClientY - bottom) / 3);
    if (speed) {
      window.scrollBy(0, speed);
      place();
    }
    frame = requestAnimationFrame(autoScroll);
  }
  frame = requestAnimationFrame(autoScroll);

  const el = start.captureEl;
  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== start.pointerId) return;
    lastClientY = e.clientY;
    place();
  };
  const onEnd = (e: PointerEvent) => {
    if (e.pointerId !== start.pointerId) return;
    done = true;
    cancelAnimationFrame(frame);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onEnd);
    el.removeEventListener('pointercancel', onEnd);
    dragged.root.classList.remove('is-lifted');
    if (prefersReducedMotion()) resetTransform(dragged.visual);
    else animate(dragged.visual, { scale: 1 }, SPRING.rowLift);
    if (target !== fromIndex && e.type === 'pointerup') {
      // the list re-renders and FLIP carries every row from where it is now
      onDrop(target);
    } else {
      items.forEach((it) => animateY(it.root, currentTranslate(it.root).y, 0));
    }
  };
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onEnd);
  el.addEventListener('pointercancel', onEnd);
  place();
}
