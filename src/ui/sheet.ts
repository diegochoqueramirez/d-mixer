import { GESTURE_SLOP, rubberBand, sheetReleaseAction } from '../lib/gestures';
import { FADE, SPRING, animate, createVelocityTracker, currentTranslate, prefersReducedMotion, resetTransform, springAxis, type Animation } from './motion';

/** Where a downward drag in the body never moves the sheet: editing surfaces and fields. */
const NO_DRAG = '.stage-view, .overview, .minimap, .lane-hit, .curve-editor, .curve-point, .curve-handle, select, input, .popover, .confirm';

export interface SheetOptions {
  panel: HTMLElement;
  backdrop: HTMLElement;
  /** Scrollable content; a drag from it moves the sheet only while scrolled to the top. */
  body: HTMLElement;
  /** Grabber and title bar: a vertical drag from them always moves the sheet. */
  handles: HTMLElement[];
  isDirty(): boolean;
  /** The drag asked to close and nothing is unsaved: the owner closes (and calls close()). */
  onDragClose(): void;
  /** The drag asked to close with unsaved changes: the sheet went back, ask the user. */
  onDragConfirm(): void;
}

export interface Sheet {
  open(): void;
  /** Animates out, then closes the dialog. Resolves false if open() interrupted it. */
  close(): Promise<boolean>;
  isClosing(): boolean;
}

/** iOS-style bottom sheet over a modal <dialog>: spring in/out and drag down to close. */
export function createSheet(dialog: HTMLDialogElement, o: SheetOptions): Sheet {
  const { panel, backdrop, body } = o;
  let anim: Animation | null = null;
  let fade: Animation | null = null;
  let closing = false;
  let token = 0;
  /** Finger speed (px/ms) handed to the closing spring after a drag. */
  let releaseVelocity = 0;

  const offscreen = () => Math.max(1, dialog.clientHeight - panel.offsetTop);

  function stop() {
    anim?.stop();
    anim = null;
  }

  function setY(y: number) {
    if (y) panel.style.transform = `translateY(${y}px)`;
    else resetTransform(panel);
  }

  function open() {
    const wasOpen = dialog.open;
    if (!wasOpen) dialog.showModal();
    document.documentElement.classList.add('sheet-open');
    const from = wasOpen ? currentTranslate(panel).y : offscreen();
    closing = false;
    token++;
    stop();
    fade?.stop();
    if (prefersReducedMotion()) {
      setY(0);
      anim = animate(panel, { opacity: [wasOpen ? Number(getComputedStyle(panel).opacity) : 0, 1] }, FADE);
      fade = animate(backdrop, { opacity: 1 }, FADE);
      return;
    }
    panel.style.opacity = '';
    anim = springAxis(panel, 'y', from, 0, wasOpen ? SPRING.sheetRestore : SPRING.sheetOpen);
    fade = animate(backdrop, { opacity: [wasOpen ? Number(getComputedStyle(backdrop).opacity) : 0, 1] }, { duration: 300, ease: 'easeOut' });
  }

  function close(): Promise<boolean> {
    if (!dialog.open) return Promise.resolve(true);
    closing = true;
    const mine = ++token;
    const from = currentTranslate(panel).y;
    const velocity = releaseVelocity;
    releaseVelocity = 0;
    stop();
    fade?.stop();
    const reduced = prefersReducedMotion();
    anim = reduced ? animate(panel, { opacity: 0 }, FADE) : springAxis(panel, 'y', from, offscreen(), SPRING.sheetClose, velocity);
    fade = animate(backdrop, { opacity: 0 }, reduced ? FADE : { duration: 250, ease: 'easeOut' });
    const out = anim;
    return new Promise((resolve) => {
      void out.then(() => {
        if (mine !== token) return resolve(false);
        closing = false;
        anim = null;
        setY(0);
        panel.style.opacity = '';
        dialog.close();
        document.documentElement.classList.remove('sheet-open');
        resolve(true);
      });
    });
  }

  // ---------- drag to close ----------

  const tracker = createVelocityTracker();
  let drag: { startY: number; startX: number; originY: number; moved: boolean; base: number; active: boolean; raw: number; shown: number } | null = null;

  function begin(x: number, y: number, base: number, active: boolean) {
    tracker.reset();
    tracker.add(x, y);
    drag = { startX: x, startY: y, originY: y, moved: false, base, active, raw: base, shown: base };
  }

  /** Returns true while the gesture moves the sheet. */
  function move(x: number, y: number): boolean {
    if (!drag) return false;
    tracker.add(x, y);
    const dy = y - drag.startY;
    if (!drag.active) {
      if (Math.hypot(x - drag.startX, dy) < GESTURE_SLOP) return false;
      if (dy <= 0 || Math.abs(dy) < Math.abs(x - drag.startX)) {
        drag = null;
        return false;
      }
      drag.active = true;
      drag.startY = y;
      stop();
    }
    if (Math.abs(y - drag.originY) >= GESTURE_SLOP) drag.moved = true;
    drag.raw = Math.max(0, drag.base + (y - drag.startY));
    drag.shown = o.isDirty() ? rubberBand(drag.raw, panel.offsetHeight) : drag.raw;
    setY(drag.shown);
    return true;
  }

  function end() {
    const d = drag;
    drag = null;
    if (!d?.active) return;
    const v = tracker.velocity().y;
    // a sheet caught mid-animation and let go without dragging just goes back up
    const action = d.moved ? sheetReleaseAction(d.raw, v, panel.offsetHeight, o.isDirty()) : 'restore';
    if (action === 'close') {
      releaseVelocity = v;
      o.onDragClose();
      return;
    }
    anim = springAxis(panel, 'y', d.shown, 0, SPRING.sheetRestore, v);
    if (action === 'confirm') o.onDragConfirm();
  }

  // grabber and bar: pointer events (touch and mouse)
  for (const handle of o.handles) {
    handle.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary || e.button !== 0 || closing) return;
      // catching a moving sheet stops it under the finger
      const moving = anim !== null && Math.abs(currentTranslate(panel).y) > 0.5;
      const base = currentTranslate(panel).y;
      if (moving) stop();
      begin(e.clientX, e.clientY, Math.max(0, base), moving);
      if (moving) {
        setY(Math.max(0, base));
        panel.setPointerCapture(e.pointerId);
      }
    });
  }
  panel.addEventListener('pointermove', (e) => {
    if (!drag || (e.pointerType === 'touch' && touchActive)) return;
    const wasActive = drag.active;
    if (move(e.clientX, e.clientY) && !wasActive) panel.setPointerCapture(e.pointerId);
  });
  const pointerEnd = () => {
    if (!touchActive) end();
  };
  panel.addEventListener('pointerup', pointerEnd);
  panel.addEventListener('pointercancel', pointerEnd);

  // body: touch events, so the drag can take over from scrolling at the top
  let touchActive = false;
  body.addEventListener(
    'touchstart',
    (e) => {
      const t = e.touches[0];
      if (e.touches.length !== 1 || closing || body.scrollTop > 0) return;
      if ((e.target as Element).closest(NO_DRAG)) return;
      touchActive = true;
      begin(t.clientX, t.clientY, 0, false);
    },
    { passive: true },
  );
  body.addEventListener(
    'touchmove',
    (e) => {
      if (!touchActive || !drag) return;
      const t = e.touches[0];
      if (!drag.active && body.scrollTop > 0) {
        drag = null;
        return;
      }
      if (move(t.clientX, t.clientY)) e.preventDefault();
    },
    { passive: false },
  );
  const touchEnd = () => {
    if (!touchActive) return;
    touchActive = false;
    end();
  };
  body.addEventListener('touchend', touchEnd);
  body.addEventListener('touchcancel', touchEnd);

  return { open, close, isClosing: () => closing };
}
