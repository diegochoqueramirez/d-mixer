import type { EditLane, Transition } from '../types';
import { VOLUME_STYLES } from '../types';
import { VOLUME_LABELS } from '../lib/curves';
import { EFFECT_LABELS, EFFECT_STYLES, LOOP_LABELS, LOOP_STYLES } from '../lib/effects';
import { GESTURE_SLOP, sheetReleaseAction } from '../lib/gestures';
import { EQ_LABELS, EQ_STYLES, FILTER_LABELS, FILTER_STYLES } from '../lib/lanes';
import { h, icon } from './dom';
import { FADE, SPRING, animate, createVelocityTracker, currentTranslate, prefersReducedMotion, resetTransform, springAxis, type Animation } from './motion';

/** The lanes with a sheet: the four with curves, plus looping. */
export type SheetLane = EditLane | 'looping';

export const SHEET_LANES: SheetLane[] = ['volume', 'eq', 'filter', 'effect', 'looping'];

export const SHEET_LANE_NAMES: Record<SheetLane, string> = { volume: 'Volumen', eq: 'EQ', filter: 'Filtro', effect: 'Efectos', looping: 'Looping' };

/** Text for a lane that follows a hand-drawn curve instead of a style. */
export const CUSTOM_LABEL = 'Personalizada';

const OPTIONS: Record<SheetLane, [string, string][]> = {
  volume: VOLUME_STYLES.map((v) => [v, VOLUME_LABELS[v]]),
  eq: EQ_STYLES.map((v) => [v, EQ_LABELS[v]]),
  filter: FILTER_STYLES.map((v) => [v, FILTER_LABELS[v]]),
  effect: EFFECT_STYLES.map((v) => [v, EFFECT_LABELS[v]]),
  looping: LOOP_STYLES.map((v) => [v, LOOP_LABELS[v]]),
};

const HINT = 'Arrastra los puntos. Doble toque para añadir o quitar uno.';

/** The lane's current style, or 'custom' when it follows a hand-drawn curve. */
export function laneValue(t: Transition, lane: SheetLane): string {
  switch (lane) {
    case 'volume':
      return t.customVolume ? 'custom' : t.volume;
    case 'eq':
      return t.customEq ? 'custom' : t.eq;
    case 'filter':
      return t.customFilter ? 'custom' : t.filter;
    case 'effect':
      return t.customEffect ? 'custom' : t.effect;
    case 'looping':
      return t.looping;
  }
}

/** What a lane row shows: the style's name, or "Personalizada". */
export function laneValueLabel(t: Transition, lane: SheetLane): string {
  const value = laneValue(t, lane);
  return value === 'custom' ? CUSTOM_LABEL : (OPTIONS[lane].find(([v]) => v === value)?.[1] ?? value);
}

export interface LaneSheetsModel {
  draft: Transition;
  customizing: EditLane | null;
  canUndo: boolean;
  canRedo: boolean;
  /** "Máximo 32 puntos por curva" was hit. */
  limitShown: boolean;
  /** The waves are drawn: Personalizar needs them. */
  canCustomize: boolean;
}

export interface LaneSheetsHandlers {
  pick(lane: SheetLane, value: string): void;
  /** "Personalizar" / "Listo" of a curve lane. */
  toggleCustomize(lane: EditLane): void;
  undo(): void;
  redo(): void;
  /** The carousel settled on another lane. */
  laneChanged(lane: SheetLane): void;
  /** A swipe down asked to close. */
  requestClose(): void;
}

export interface LaneSheets {
  el: HTMLElement;
  open(lane: SheetLane): void;
  /** Slides the cards out; resolves once they are hidden. */
  close(): Promise<void>;
  /** Hides them at once (the editor closed). */
  hide(): void;
  isOpen(): boolean;
  current(): SheetLane;
  update(model: LaneSheetsModel): void;
}

interface Card {
  lane: SheetLane;
  el: HTMLElement;
  title: HTMLElement;
  customize: HTMLButtonElement | null;
  undo: HTMLButtonElement | null;
  redo: HTMLButtonElement | null;
  hint: HTMLElement | null;
  limit: HTMLElement | null;
  customItem: HTMLElement;
  options: Map<string, HTMLButtonElement>;
}

/**
 * Spotify Mix's lane sheets: one card per lane with its styles and a ✓, side by side in a carousel
 * (the neighbours peek in and a swipe or a tap on one moves to it). Swipe down to close.
 */
export function createLaneSheets(handlers: LaneSheetsHandlers): LaneSheets {
  const carousel = h('div', { class: 'lane-carousel' });
  const el = h('div', { class: 'lane-sheets', role: 'dialog', 'aria-modal': 'false', hidden: true }, carousel);
  const cards = SHEET_LANES.map(createCard);
  carousel.append(...cards.map((c) => c.el));

  let index = 0;
  let anim: Animation | null = null;
  let closing = false;
  let releaseVelocity = 0;

  function optionButton(lane: SheetLane, value: string, label: string) {
    const b = h('button', { class: 'lane-option', type: 'button', 'aria-pressed': 'false' }, h('span', { class: 'lane-option-label' }, label), icon('check'));
    if (value !== 'custom') b.addEventListener('click', () => handlers.pick(lane, value));
    return b;
  }

  function createCard(lane: SheetLane): Card {
    const titleId = `lane-card-title-${lane}`;
    const title = h('h3', { class: 'lane-card-title', id: titleId }, SHEET_LANE_NAMES[lane]);
    const curve = lane !== 'looping';
    const customize = curve ? h('button', { class: 'lane-card-action', type: 'button', 'aria-pressed': 'false' }, 'Personalizar') : null;
    const undo = curve ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Deshacer', title: 'Deshacer', hidden: true }, icon('undo')) : null;
    const redo = curve ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Rehacer', title: 'Rehacer', hidden: true }, icon('redo')) : null;
    customize?.addEventListener('click', () => handlers.toggleCustomize(lane as EditLane));
    undo?.addEventListener('click', handlers.undo);
    redo?.addEventListener('click', handlers.redo);
    const head = h(
      'header',
      { class: 'lane-card-head' },
      h('span', { class: 'lane-bar', 'aria-hidden': 'true' }),
      title,
      h('div', { class: 'lane-card-actions' }, ...[undo, redo, customize].filter((b): b is HTMLButtonElement => b !== null)),
    );
    const hint = curve ? h('p', { class: 'lane-card-hint', hidden: true }, HINT) : null;
    const limit = curve ? h('p', { class: 'lane-card-limit', hidden: true }, icon('warning'), h('span', {}, 'Máximo 32 puntos por curva')) : null;

    const options = new Map<string, HTMLButtonElement>();
    const custom = optionButton(lane, 'custom', CUSTOM_LABEL);
    options.set('custom', custom);
    const customItem = h('li', { hidden: true }, custom);
    const list = h('ul', { class: 'lane-options' }, customItem);
    for (const [value, label] of OPTIONS[lane]) {
      const b = optionButton(lane, value, label);
      options.set(value, b);
      list.append(h('li', {}, b));
    }
    const el = h(
      'section',
      { class: 'lane-card', 'data-lane': lane, 'aria-labelledby': titleId },
      h('div', { class: 'card-grabber', 'aria-hidden': 'true' }),
      head,
      ...[hint, limit].filter((p): p is HTMLParagraphElement => p !== null),
      list,
    );
    return { lane, el, title, customize, undo, redo, hint, limit, customItem, options };
  }

  // ---------- carousel ----------

  const stride = () => (cards.length > 1 ? cards[1].el.offsetLeft - cards[0].el.offsetLeft : carousel.clientWidth) || 1;

  function settle(i: number) {
    if (i === index) return;
    index = i;
    el.setAttribute('aria-labelledby', cards[i].title.id);
    handlers.laneChanged(cards[i].lane);
  }

  let scrollFrame = 0;
  carousel.addEventListener(
    'scroll',
    () => {
      cancelAnimationFrame(scrollFrame);
      scrollFrame = requestAnimationFrame(() => settle(Math.min(cards.length - 1, Math.max(0, Math.round(carousel.scrollLeft / stride())))));
    },
    { passive: true },
  );

  // a tap on a card that peeks in moves to it instead of acting on it
  cards.forEach((card, i) => {
    card.el.addEventListener(
      'click',
      (e) => {
        if (i === index) return;
        e.stopPropagation();
        e.preventDefault();
        carousel.scrollTo({ left: i * stride(), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      },
      { capture: true },
    );
  });

  // ---------- open / close ----------

  function open(lane: SheetLane) {
    const i = SHEET_LANES.indexOf(lane);
    index = i;
    el.setAttribute('aria-labelledby', cards[i].title.id);
    el.hidden = false;
    closing = false;
    carousel.scrollLeft = i * stride();
    anim?.stop();
    anim = prefersReducedMotion() ? animate(el, { opacity: [0, 1] }, FADE) : springAxis(el, 'y', el.offsetHeight, 0, SPRING.sheetOpen);
    const card = cards[i];
    (card.el.querySelector<HTMLButtonElement>('.lane-option[aria-pressed="true"]') ?? card.customize ?? card.el.querySelector('button'))?.focus({
      preventScroll: true,
    });
  }

  function hide() {
    anim?.stop();
    anim = null;
    closing = false;
    el.hidden = true;
    resetTransform(el);
    el.style.opacity = '';
  }

  function close(): Promise<void> {
    if (el.hidden) return Promise.resolve();
    closing = true;
    anim?.stop();
    const velocity = releaseVelocity;
    releaseVelocity = 0;
    const mine = prefersReducedMotion()
      ? animate(el, { opacity: 0 }, FADE)
      : springAxis(el, 'y', currentTranslate(el).y, el.offsetHeight, SPRING.sheetClose, velocity);
    anim = mine;
    return new Promise((resolve) => {
      void mine.then(() => {
        if (anim === mine) hide();
        resolve();
      });
    });
  }

  // ---------- swipe down to close ----------

  const tracker = createVelocityTracker();
  let drag: { startX: number; startY: number; active: boolean; y: number } | null = null;

  function begin(x: number, y: number) {
    tracker.reset();
    tracker.add(x, y);
    drag = { startX: x, startY: y, active: false, y: 0 };
  }

  /** Returns true while the gesture moves the cards. */
  function move(x: number, y: number): boolean {
    if (!drag) return false;
    tracker.add(x, y);
    const dy = y - drag.startY;
    if (!drag.active) {
      if (Math.hypot(x - drag.startX, dy) < GESTURE_SLOP) return false;
      // sideways belongs to the carousel, upwards to the list
      if (dy <= 0 || Math.abs(dy) < Math.abs(x - drag.startX)) {
        drag = null;
        return false;
      }
      drag.active = true;
      drag.startY = y;
      anim?.stop();
    }
    drag.y = Math.max(0, y - drag.startY);
    el.style.transform = `translateY(${drag.y}px)`;
    return true;
  }

  function end() {
    const d = drag;
    drag = null;
    if (!d?.active) return;
    const v = tracker.velocity().y;
    if (sheetReleaseAction(d.y, v, el.offsetHeight, false) === 'close') {
      releaseVelocity = v;
      handlers.requestClose();
    } else {
      anim = springAxis(el, 'y', d.y, 0, SPRING.sheetRestore, v);
    }
  }

  for (const card of cards) {
    // grabber and title: pointer events (pan-x leaves sideways swipes to the carousel)
    for (const handle of [card.el.querySelector<HTMLElement>('.card-grabber')!, card.el.querySelector<HTMLElement>('.lane-card-head')!]) {
      handle.addEventListener('pointerdown', (e) => {
        if (!e.isPrimary || closing || (e.target as Element).closest('button')) return;
        begin(e.clientX, e.clientY);
      });
      handle.addEventListener('pointermove', (e) => {
        const wasActive = drag?.active;
        if (move(e.clientX, e.clientY) && !wasActive) handle.setPointerCapture(e.pointerId);
      });
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
    }
    // the list: touch events, so a drag can take over from scrolling at the top
    const list = card.el.querySelector<HTMLElement>('.lane-options')!;
    list.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length !== 1 || closing || list.scrollTop > 0) return;
        begin(e.touches[0].clientX, e.touches[0].clientY);
      },
      { passive: true },
    );
    list.addEventListener(
      'touchmove',
      (e) => {
        if (!drag) return;
        if (!drag.active && list.scrollTop > 0) {
          drag = null;
          return;
        }
        if (move(e.touches[0].clientX, e.touches[0].clientY)) e.preventDefault();
      },
      { passive: false },
    );
    list.addEventListener('touchend', end);
    list.addEventListener('touchcancel', end);
  }

  return {
    el,
    open,
    close,
    hide,
    isOpen: () => !el.hidden && !closing,
    current: () => cards[index].lane,
    update(model) {
      for (const card of cards) {
        const value = laneValue(model.draft, card.lane);
        card.customItem.hidden = value !== 'custom';
        for (const [v, b] of card.options) b.setAttribute('aria-pressed', String(v === value));
        if (card.lane === 'looping') continue;
        const editing = model.customizing === card.lane;
        card.customize!.textContent = editing ? 'Listo' : 'Personalizar';
        card.customize!.setAttribute('aria-pressed', String(editing));
        card.customize!.disabled = !model.canCustomize;
        card.undo!.hidden = card.redo!.hidden = !editing;
        card.undo!.disabled = !model.canUndo;
        card.redo!.disabled = !model.canRedo;
        card.hint!.hidden = !editing;
        card.limit!.hidden = !(editing && model.limitShown);
      }
    },
  };
}
