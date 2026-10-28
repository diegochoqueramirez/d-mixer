import { WHEEL_ZOOM_RATE } from '../lib/zoom';

export interface StageZoomHost {
  /** The stage: every gesture is read on it. */
  el: HTMLElement;
  /** False while there is nothing to zoom or Personalizar is on. */
  enabled(): boolean;
  /** Scales the zoom keeping the mix time at `anchor` (0..1 of the width) in place. */
  zoomAround(factor: number, anchor: number): void;
  /** Moves the view by `dx` pixels; positive = the waves follow a finger moving right. */
  panBy(dx: number): void;
  /** Undoes a one-finger wave drag in progress: the second finger turns it into a pinch. */
  cancelDrags(): void;
}

/** Safari's non-standard pinch event (trackpad on macOS, fingers on iOS). */
interface GestureEventLike extends Event {
  scale: number;
  clientX: number;
}

/**
 * Zoom gestures on the stage: two-finger pinch and pan, Ctrl/⌘ + wheel, horizontal wheel and Safari's
 * trackpad pinch. One finger is left alone: it slides a wave.
 */
export function attachStageZoom(host: StageZoomHost): void {
  const { el } = host;
  const touches = new Map<number, { x: number; y: number }>();
  let pinch: { dist: number; midX: number } | null = null;
  /** Fingers of a pinch are still down: none of them may start a wave drag again. */
  let pinching = false;

  const anchorOf = (clientX: number) => {
    const r = el.getBoundingClientRect();
    return (clientX - r.left) / Math.max(1, r.width);
  };
  const measure = () => {
    const [a, b] = [...touches.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), midX: (a.x + b.x) / 2 };
  };

  // Capture phase: the second finger must be stopped before it reaches the other wave.
  el.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType !== 'touch' || !host.enabled()) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size < 2 && !pinching) return;
      e.stopPropagation();
      e.preventDefault();
      if (!pinching) {
        pinching = true;
        host.cancelDrags();
      }
      for (const id of touches.keys()) {
        try {
          el.setPointerCapture(id);
        } catch {
          // the pointer is already gone
        }
      }
      if (touches.size >= 2) pinch = measure();
    },
    { capture: true },
  );

  el.addEventListener('pointermove', (e) => {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!pinching || !pinch || touches.size < 2) return;
    const now = measure();
    if (pinch.dist > 0 && now.dist > 0) host.zoomAround(now.dist / pinch.dist, anchorOf(now.midX));
    host.panBy(now.midX - pinch.midX);
    pinch = now;
  });

  // Lifts are read on the window: a finger may leave the stage before it goes up.
  const lift = (e: PointerEvent) => {
    if (!touches.delete(e.pointerId)) return;
    if (touches.size < 2) pinch = null;
    if (touches.size === 0) pinching = false;
  };
  window.addEventListener('pointerup', lift, true);
  window.addEventListener('pointercancel', lift, true);

  // Desktop: Ctrl/⌘ + wheel (and Chrome's trackpad pinch) zooms, a horizontal wheel pans, vertical scrolls the editor.
  el.addEventListener(
    'wheel',
    (e) => {
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (host.enabled()) host.zoomAround(Math.exp(-e.deltaY * unit * WHEEL_ZOOM_RATE), anchorOf(e.clientX));
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        // also keeps a sideways swipe from navigating back
        e.preventDefault();
        if (host.enabled()) host.panBy(-e.deltaX * unit);
      }
    },
    { passive: false },
  );

  // Safari sends pinches as gesture events: never let them zoom the page. On macOS (no touches) they zoom the stage.
  let gestureScale = 1;
  el.addEventListener('gesturestart', (e) => {
    e.preventDefault();
    gestureScale = 1;
  });
  el.addEventListener('gesturechange', (e) => {
    e.preventDefault();
    const g = e as GestureEventLike;
    if (touches.size === 0 && host.enabled()) host.zoomAround(g.scale / gestureScale, anchorOf(g.clientX));
    gestureScale = g.scale;
  });
  el.addEventListener('gestureend', (e) => e.preventDefault());
}
