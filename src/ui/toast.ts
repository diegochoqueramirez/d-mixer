import { restoreTrack, type RemovedTrack } from '../state';
import { FLING_VELOCITY, UNDO_TOAST_MS } from '../lib/gestures';
import { FADE, SPRING, animate, createVelocityTracker, prefersReducedMotion, pressFeedback, resetTransform, type Animation } from './motion';
import { h } from './dom';

export interface Toast {
  el: HTMLElement;
  /** Shows "Canción eliminada · Deshacer" for the last removal; a new one replaces the previous. */
  show(removed: RemovedTrack): void;
  hide(): void;
}

export function createToast(): Toast {
  const undoBtn = h('button', { class: 'toast-undo', type: 'button' }, 'Deshacer');
  const message = h('span', { class: 'toast-message' });
  const el = h('div', { class: 'toast', role: 'status', hidden: true }, message, undoBtn);
  pressFeedback(undoBtn);

  let removed: RemovedTrack | null = null;
  let timer = 0;
  let anim: Animation | null = null;

  const away = () => el.offsetHeight + 24;

  function show(next: RemovedTrack) {
    removed = next;
    message.textContent = 'Canción eliminada';
    window.clearTimeout(timer);
    timer = window.setTimeout(hide, UNDO_TOAST_MS);
    const wasHidden = el.hidden;
    el.hidden = false;
    document.body.classList.add('has-toast');
    anim?.stop();
    if (!wasHidden && !el.classList.contains('is-leaving')) return;
    el.classList.remove('is-leaving');
    anim = prefersReducedMotion()
      ? animate(el, { opacity: [0, 1], y: 0 }, FADE)
      : animate(el, { y: [away(), 0], opacity: [0, 1] }, SPRING.toast);
  }

  function hide(from = 0, velocity = 0) {
    window.clearTimeout(timer);
    removed = null;
    if (el.hidden || el.classList.contains('is-leaving')) return;
    el.classList.add('is-leaving');
    document.body.classList.remove('has-toast');
    anim?.stop();
    anim = prefersReducedMotion()
      ? animate(el, { opacity: 0 }, FADE)
      : animate(el, { y: [from, away()], opacity: 0 }, SPRING.toast, velocity);
    const mine = anim;
    void mine.then(() => {
      if (anim !== mine) return;
      el.hidden = true;
      el.classList.remove('is-leaving');
      resetTransform(el);
    });
  }

  undoBtn.addEventListener('click', () => {
    const r = removed;
    hide();
    if (r) restoreTrack(r);
  });

  // swipe down to dismiss
  const tracker = createVelocityTracker();
  let startY: number | null = null;
  let dy = 0;
  el.addEventListener('pointerdown', (e) => {
    if ((e.target as Element).closest('button')) return;
    startY = e.clientY;
    dy = 0;
    tracker.reset();
    tracker.add(0, e.clientY);
    el.setPointerCapture(e.pointerId);
    window.clearTimeout(timer);
  });
  el.addEventListener('pointermove', (e) => {
    if (startY === null) return;
    tracker.add(0, e.clientY);
    dy = Math.max(0, e.clientY - startY);
    el.style.transform = `translateY(${dy}px)`;
  });
  const release = () => {
    if (startY === null) return;
    startY = null;
    const v = tracker.velocity().y;
    if (dy > 30 || v > FLING_VELOCITY) hide(dy, v);
    else {
      animate(el, { y: [dy, 0] }, SPRING.toast);
      timer = window.setTimeout(hide, UNDO_TOAST_MS);
    }
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);

  return { el, show, hide: () => hide() };
}
