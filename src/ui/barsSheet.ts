import type { BarsOption } from '../types';
import { BARS_OPTIONS } from '../types';
import { GESTURE_SLOP, sheetReleaseAction } from '../lib/gestures';
import { h } from './dom';
import { FADE, SPRING, animate, createVelocityTracker, currentTranslate, prefersReducedMotion, resetTransform, springAxis, type Animation } from './motion';

export interface BarsSheet {
  el: HTMLElement;
  /** `pill` is the button that opened it: it gets the focus back and toggles the sheet. */
  open(pill: HTMLElement): void;
  close(): void;
  /** Hides it at once (the editor closed). */
  hide(): void;
  isOpen(): boolean;
  update(bars: BarsOption): void;
}

/**
 * Sheet with the transition lengths (Spotify Mix's "8 bars ▾"). It stays open and does not dim the
 * editor, so lengths can be compared while the waves change above it. A tap outside only closes it.
 */
export function createBarsSheet(onPick: (bars: BarsOption) => void): BarsSheet {
  const buttons = new Map<BarsOption, HTMLButtonElement>();
  const row = h('div', { class: 'bars-options', role: 'group', 'aria-labelledby': 'bars-sheet-title' });
  for (const bars of BARS_OPTIONS) {
    const b = h('button', { class: 'bars-option', type: 'button', 'aria-pressed': 'false', 'aria-label': `${bars} ${bars === 1 ? 'compás' : 'compases'}` }, String(bars));
    b.addEventListener('click', () => onPick(bars));
    buttons.set(bars, b);
    row.append(b);
  }
  const grabber = h('div', { class: 'card-grabber', 'aria-hidden': 'true' });
  const title = h('h3', { class: 'bars-sheet-title', id: 'bars-sheet-title' }, 'Compases');
  const el = h(
    'div',
    { class: 'bars-sheet', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'bars-sheet-title', hidden: true },
    grabber,
    title,
    row,
    h('p', { class: 'bars-help' }, 'Elige cuánto dura la transición.'),
  );

  let pillEl: HTMLElement | null = null;
  let anim: Animation | null = null;
  let closing = false;
  let releaseVelocity = 0;

  function open(pill: HTMLElement) {
    pillEl = pill;
    pill.setAttribute('aria-expanded', 'true');
    const wasOpen = !el.hidden && !closing;
    el.hidden = false;
    closing = false;
    anim?.stop();
    if (!wasOpen) {
      anim = prefersReducedMotion() ? animate(el, { opacity: [0, 1] }, FADE) : springAxis(el, 'y', el.offsetHeight + 16, 0, SPRING.sheetOpen);
    }
    [...buttons.values()].find((b) => b.getAttribute('aria-pressed') === 'true')?.focus({ preventScroll: true });
  }

  function hide() {
    anim?.stop();
    anim = null;
    closing = false;
    el.hidden = true;
    resetTransform(el);
    el.style.opacity = '';
    pillEl?.setAttribute('aria-expanded', 'false');
  }

  function close() {
    if (el.hidden || closing) return;
    closing = true;
    const hadFocus = el.contains(document.activeElement);
    anim?.stop();
    const velocity = releaseVelocity;
    releaseVelocity = 0;
    anim = prefersReducedMotion()
      ? animate(el, { opacity: 0 }, FADE)
      : springAxis(el, 'y', currentTranslate(el).y, el.offsetHeight + 16, SPRING.sheetClose, velocity);
    const mine = anim;
    void mine.then(() => {
      if (anim !== mine) return;
      hide();
    });
    if (hadFocus) pillEl?.focus({ preventScroll: true });
  }

  // A tap outside the sheet only closes it: it never reaches what is underneath.
  let swallowClick = false;
  document.addEventListener(
    'pointerdown',
    (e) => {
      swallowClick = false;
      if (el.hidden || closing) return;
      const target = e.target as Node;
      if (el.contains(target) || pillEl?.contains(target)) return;
      e.stopPropagation();
      e.preventDefault();
      swallowClick = true;
      setTimeout(() => (swallowClick = false), 600);
      close();
    },
    { capture: true },
  );
  document.addEventListener(
    'click',
    (e) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.stopPropagation();
      e.preventDefault();
    },
    { capture: true },
  );

  // drag down from the grabber or the title to close
  const tracker = createVelocityTracker();
  let drag: { startX: number; startY: number; active: boolean; y: number } | null = null;
  for (const handle of [grabber, title]) {
    handle.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary || closing) return;
      tracker.reset();
      tracker.add(e.clientX, e.clientY);
      drag = { startX: e.clientX, startY: e.clientY, active: false, y: 0 };
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', (e) => {
      if (!drag) return;
      tracker.add(e.clientX, e.clientY);
      const dy = e.clientY - drag.startY;
      if (!drag.active) {
        if (Math.hypot(e.clientX - drag.startX, dy) < GESTURE_SLOP) return;
        if (dy <= 0) {
          drag = null;
          return;
        }
        drag.active = true;
        drag.startY = e.clientY;
        anim?.stop();
      }
      drag.y = Math.max(0, e.clientY - drag.startY);
      el.style.transform = `translateY(${drag.y}px)`;
    });
    const end = () => {
      const d = drag;
      drag = null;
      if (!d?.active) return;
      const v = tracker.velocity().y;
      if (sheetReleaseAction(d.y, v, el.offsetHeight, false) === 'close') {
        releaseVelocity = v;
        close();
      } else {
        anim = springAxis(el, 'y', d.y, 0, SPRING.sheetRestore, v);
      }
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  return {
    el,
    open,
    close,
    hide,
    isOpen: () => !el.hidden && !closing,
    update(bars) {
      for (const [value, b] of buttons) b.setAttribute('aria-pressed', String(value === bars));
    },
  };
}
