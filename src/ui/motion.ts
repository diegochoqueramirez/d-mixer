import { JSAnimation, press } from 'motion-dom';

/**
 * Animations run on Motion's own JS engine (motion-dom's JSAnimation): springs keep the finger's
 * speed and can be interrupted. It avoids `animate` from "motion" (≈26 kB) and Safari's
 * spring-in-linear() frame drops, since nothing goes through WAAPI.
 */

export interface Animation {
  stop(): void;
  then(onDone: () => void): Promise<void>;
}

interface SpringTransition {
  type: 'spring';
  stiffness: number;
  damping: number;
  mass: number;
}

interface TweenTransition {
  /** milliseconds */
  duration: number;
  ease: 'easeOut' | 'easeInOut' | 'linear';
}

export type Transition = SpringTransition | TweenTransition;

/**
 * A spring that visually settles in `duration` seconds with `bounce` (0 = none), expressed as
 * physics. Motion ignores the initial velocity of duration-based springs, so the finger's speed
 * only carries over with stiffness/damping (same conversion Motion uses for visualDuration).
 */
function spring(duration: number, bounce: number): SpringTransition {
  const stiffness = ((2 * Math.PI) / (1.2 * duration)) ** 2;
  const damping = 2 * Math.max(1 - bounce, 0.05) * Math.sqrt(stiffness);
  return { type: 'spring', stiffness, damping, mass: 1 };
}

/** Named springs (see the "Animaciones" table in SPEC 09). */
export const SPRING = {
  sheetOpen: spring(0.45, 0.12),
  sheetClose: spring(0.35, 0),
  sheetRestore: spring(0.4, 0.2),
  rowEnter: spring(0.3, 0),
  rowMove: spring(0.35, 0.15),
  rowLift: spring(0.2, 0),
  pressRelease: spring(0.25, 0.3),
  slide: spring(0.3, 0),
  toast: spring(0.35, 0.1),
};

/** Fade that replaces movement when the user asks for reduced motion. */
export const FADE: TweenTransition = { duration: 150, ease: 'easeOut' };

const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

export function prefersReducedMotion(): boolean {
  return reducedQuery.matches;
}

const done: Animation = { stop() {}, then: (onDone) => Promise.resolve().then(onDone) };

/** Animates a number; `velocity` is in units per millisecond. */
export function animateNumber(
  from: number,
  to: number,
  transition: Transition,
  onUpdate: (v: number) => void,
  velocity = 0,
): Animation {
  let resolveDone!: () => void;
  const finished = new Promise<void>((resolve) => (resolveDone = resolve));
  const anim = new JSAnimation<number>({
    keyframes: [from, to],
    ...transition,
    velocity: velocity * 1000,
    onUpdate,
    onComplete: () => resolveDone(),
  });
  return { stop: () => anim.stop(), then: (onDone) => finished.then(onDone) };
}

// ---------- element styles ----------

type Prop = 'x' | 'y' | 'scale' | 'opacity' | 'height';
type Target = Partial<Record<Prop, number | [number, number]>>;

/** Transform parts each element is showing, composed into one `transform`. */
const transforms = new WeakMap<Element, { x: number; y: number; scale: number }>();

function partsOf(el: Element) {
  let t = transforms.get(el);
  if (!t) transforms.set(el, (t = { x: 0, y: 0, scale: 1 }));
  return t;
}

function applyTransform(el: HTMLElement) {
  const { x, y, scale } = partsOf(el);
  const parts = [];
  if (x) parts.push(`translateX(${x}px)`);
  if (y) parts.push(`translateY(${y}px)`);
  if (scale !== 1) parts.push(`scale(${scale})`);
  el.style.transform = parts.join(' ');
}

function read(el: HTMLElement, prop: Prop): number {
  if (prop === 'opacity') return Number(getComputedStyle(el).opacity);
  if (prop === 'height') return el.offsetHeight;
  return partsOf(el)[prop];
}

function write(el: HTMLElement, prop: Prop, v: number) {
  if (prop === 'opacity') el.style.opacity = String(v);
  else if (prop === 'height') el.style.height = `${v}px`;
  else {
    partsOf(el)[prop] = v;
    applyTransform(el);
  }
}

/** Forgets an element's transform (after code set or cleared `style.transform` by hand). */
export function resetTransform(el: HTMLElement): void {
  transforms.delete(el);
  el.style.transform = '';
}

/** Running animation of each element's property: a new one replaces it instead of fighting it. */
const running = new WeakMap<Element, Map<Prop, Animation>>();

/**
 * Animates x / y / scale / opacity / height. A value is a target (from the current value) or
 * [from, to]. `velocity` (px/ms) applies to x and y.
 */
export function animate(el: Element, target: Target, transition: Transition, velocity = 0): Animation {
  const html = el as HTMLElement;
  let props = running.get(el);
  if (!props) running.set(el, (props = new Map()));
  const own = props;
  const anims = (Object.entries(target) as [Prop, number | [number, number]][]).map(([prop, value]) => {
    own.get(prop)?.stop();
    const [from, to] = Array.isArray(value) ? value : [read(html, prop), value];
    write(html, prop, from);
    const anim = animateNumber(from, to, transition, (v) => write(html, prop, v), prop === 'x' || prop === 'y' ? velocity : 0);
    own.set(prop, anim);
    void anim.then(() => {
      if (own.get(prop) === anim) own.delete(prop);
    });
    return anim;
  });
  const all = Promise.all(anims.map((a) => a.then(() => undefined)));
  return { stop: () => anims.forEach((a) => a.stop()), then: (onDone) => all.then(onDone) };
}

/**
 * Springs one axis from `from` to `to`, continuing the finger's speed (px/ms).
 * With reduced motion the element jumps to `to`.
 */
export function springAxis(el: Element, axis: 'x' | 'y', from: number, to: number, transition: Transition, velocity = 0): Animation {
  if (prefersReducedMotion()) {
    write(el as HTMLElement, axis, to);
    return done;
  }
  return animate(el, { [axis]: [from, to] }, transition, velocity);
}

/** Current translateY / translateX of an element, including a running animation. */
export function currentTranslate(el: Element): { x: number; y: number } {
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return { x: 0, y: 0 };
  const m = new DOMMatrixReadOnly(t);
  return { x: m.m41, y: m.m42 };
}

/** Shrinks buttons, chips and presets to 0.97 while pressed (rows highlight instead). */
export function pressFeedback(targets: Element | Element[]): void {
  const list = targets instanceof Element ? [targets] : targets;
  if (list.length === 0) return;
  press(list, (el) => {
    if (prefersReducedMotion() || (el as HTMLButtonElement).disabled) return;
    animate(el, { scale: 0.97 }, { duration: 100, ease: 'easeOut' });
    return () => {
      animate(el, { scale: 1 }, SPRING.pressRelease);
    };
  });
}

/** Pointer speed over the last 100 ms, in px/ms. */
export function createVelocityTracker() {
  let samples: { x: number; y: number; t: number }[] = [];
  return {
    reset() {
      samples = [];
    },
    add(x: number, y: number, t = performance.now()) {
      samples.push({ x, y, t });
      while (samples.length > 2 && t - samples[0].t > 100) samples.shift();
    },
    velocity(): { x: number; y: number } {
      if (samples.length < 2) return { x: 0, y: 0 };
      const a = samples[0];
      const b = samples[samples.length - 1];
      // a finger that stopped before lifting has no speed left
      if (performance.now() - b.t > 100) return { x: 0, y: 0 };
      const dt = Math.max(1, b.t - a.t);
      return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
    },
  };
}

/** Content leaves towards one side (dir -1 = left) before a pair change. */
export function slideOut(el: Element, dir: number): Promise<void> {
  const anim = prefersReducedMotion() ? animate(el, { opacity: 0 }, FADE) : animate(el, { x: [0, -24 * dir], opacity: [1, 0] }, SPRING.slide);
  return new Promise((resolve) => void anim.then(resolve));
}

/** Content enters from the opposite side after a pair change. */
export function slideIn(el: Element, dir: number): Animation {
  if (prefersReducedMotion()) return animate(el, { x: [0, 0], opacity: [0, 1] }, FADE);
  return animate(el, { x: [24 * dir, 0], opacity: [0, 1] }, SPRING.slide);
}
