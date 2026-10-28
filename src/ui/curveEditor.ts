import type { BarsOption, GainCurve, VolumeCurves } from '../types';
import { BEATS_PER_BAR } from '../lib/timing';
import { addPoint, bendForMidValue, deletePoint, isFull, movePoint, segmentMid, setBend, snapX, toggleEase } from '../lib/gainCurve';
import { h } from './dom';
import type { Stage } from './waveform';

type Lane = 'out' | 'in';
const LANES: Lane[] = ['out', 'in'];
const LANE_NAMES: Record<Lane, string> = { out: 'curva de salida', in: 'curva de entrada' };

/** Seconds moved by `,` and `.` (fine nudge, no snap). */
const FINE_NUDGE_SECONDS = 0.01;
const GAIN_STEP = 0.05;
const GAIN_STEP_LARGE = 0.25;
const BEND_STEP = 0.1;

export interface CurveEditorModel {
  curves: VolumeCurves;
  bars: BarsOption;
  /** Transition length in mix seconds. */
  d: number;
}

export interface CurveEditorHandlers {
  onChange(lane: Lane, curve: GainCurve): void;
  onGestureStart(): void;
  onGestureEnd(): void;
  /** Adding a point was refused because the curve already has the maximum. */
  onLimit(): void;
}

export interface CurveEditor {
  update(model: CurveEditorModel | null, active: boolean): void;
  isDragging(): boolean;
}

interface Focus {
  lane: Lane;
  kind: 'point' | 'handle';
  index: number;
}

/**
 * "Personalizar" overlay on the aligned view: point and segment handles as real buttons, so Tab,
 * focus and screen readers work natively. Points snap to beats, half beats and the window centre.
 */
export function createCurveEditor(stage: Stage, handlers: CurveEditorHandlers): CurveEditor {
  const el = h('div', { class: 'curve-editor', hidden: true });
  const areas: Record<Lane, HTMLElement> = {
    out: h('div', { class: 'curve-area', 'data-lane': 'out' }),
    in: h('div', { class: 'curve-area', 'data-lane': 'in' }),
  };
  const pointLayer = h('div', { class: 'curve-points' });
  const handleLayer = h('div', { class: 'curve-handles' });
  el.append(areas.out, areas.in, pointLayer, handleLayer);
  stage.el.append(el);

  let model: CurveEditorModel | null = null;
  let active = false;
  let drag: { lane: Lane; kind: 'point' | 'handle'; index: number } | null = null;
  let pendingFocus: Focus | null = null;
  const points: Record<Lane, HTMLButtonElement[]> = { out: [], in: [] };
  const handles: Record<Lane, HTMLButtonElement[]> = { out: [], in: [] };

  const curveOf = (lane: Lane) => model!.curves[lane];
  const lastIndex = (lane: Lane) => curveOf(lane).points.length - 1;
  /** Segment acted on from a point: the one after it, or the one before for the last point. */
  const segmentFrom = (lane: Lane, index: number) => (index < lastIndex(lane) ? index : index - 1);

  function change(lane: Lane, curve: GainCurve, focus?: Focus) {
    if (focus) pendingFocus = focus;
    handlers.onChange(lane, curve);
  }

  /** Converts a pointer position into window-relative (x, gain) for a lane. */
  function toCurve(lane: Lane, clientX: number, clientY: number) {
    const g = stage.geometry();
    if (!g) return null;
    const rect = el.getBoundingClientRect();
    const box = g.lanes[lane];
    const x = (clientX - rect.left - g.x0) / (g.x1 - g.x0);
    const y = 1 - (clientY - rect.top - box.top - g.pad) / (box.height - 2 * g.pad);
    return { x, y };
  }

  function describePoint(lane: Lane, index: number) {
    const p = curveOf(lane).points[index];
    const beats = p.x * model!.bars * BEATS_PER_BAR;
    return `Punto ${index + 1} de ${curveOf(lane).points.length} de la ${LANE_NAMES[lane]}: beat ${beats.toFixed(1)}, volumen ${Math.round(p.y * 100)}%`;
  }

  function describeHandle(lane: Lane, index: number) {
    const s = curveOf(lane).segments[index];
    return `Tramo ${index + 1} de la ${LANE_NAMES[lane]}: curvatura ${s.bend.toFixed(1)}, ${s.ease ? 'suave' : 'recto'}`;
  }

  // ---------- pointer ----------

  function onPointerDown(e: PointerEvent) {
    const b = e.currentTarget as HTMLButtonElement;
    const lane = b.dataset.lane as Lane;
    const kind = b.dataset.kind as 'point' | 'handle';
    drag = { lane, kind, index: Number(b.dataset.index) };
    b.setPointerCapture(e.pointerId);
    b.classList.add('is-dragging');
    handlers.onGestureStart();
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag || !model) return;
    const pos = toCurve(drag.lane, e.clientX, e.clientY);
    if (!pos) return;
    const c = curveOf(drag.lane);
    if (drag.kind === 'point') {
      const x = e.shiftKey ? pos.x : snapX(pos.x, model.bars);
      change(drag.lane, movePoint(c, drag.index, x, pos.y));
    } else {
      change(drag.lane, setBend(c, drag.index, bendForMidValue(c, drag.index, pos.y)));
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (!drag) return;
    (e.currentTarget as HTMLElement).classList.remove('is-dragging');
    drag = null;
    handlers.onGestureEnd();
  }

  function onDoubleClick(e: MouseEvent) {
    const b = e.currentTarget as HTMLButtonElement;
    const lane = b.dataset.lane as Lane;
    const index = Number(b.dataset.index);
    e.stopPropagation();
    if (b.dataset.kind === 'point') {
      if (index > 0 && index < lastIndex(lane)) change(lane, deletePoint(curveOf(lane), index), { lane, kind: 'point', index: index - 1 });
    } else {
      change(lane, toggleEase(curveOf(lane), index), { lane, kind: 'handle', index });
    }
  }

  function add(lane: Lane, x: number) {
    const added = addPoint(curveOf(lane), x);
    if (!added) {
      if (isFull(curveOf(lane))) handlers.onLimit();
      return;
    }
    change(lane, added.curve, { lane, kind: 'point', index: added.index });
  }

  for (const lane of LANES) {
    areas[lane].addEventListener('dblclick', (e) => {
      if (!model) return;
      const pos = toCurve(lane, e.clientX, e.clientY);
      if (!pos || pos.x <= 0 || pos.x >= 1) return;
      add(lane, e.shiftKey ? pos.x : snapX(pos.x, model.bars));
    });
  }

  // ---------- keyboard ----------

  function onPointKey(e: KeyboardEvent) {
    if (!model) return;
    const b = e.currentTarget as HTMLButtonElement;
    const lane = b.dataset.lane as Lane;
    const index = Number(b.dataset.index);
    const c = curveOf(lane);
    const p = c.points[index];
    const beat = 1 / (model.bars * BEATS_PER_BAR);
    const keep = (curve: GainCurve) => change(lane, curve, { lane, kind: 'point', index });

    switch (e.key) {
      case 'Home':
        focus({ lane, kind: 'point', index: 0 });
        break;
      case 'End':
        focus({ lane, kind: 'point', index: lastIndex(lane) });
        break;
      case 'ArrowLeft':
      case 'ArrowRight': {
        const dir = e.key === 'ArrowLeft' ? -1 : 1;
        const step = e.altKey ? 1 / model.bars : e.shiftKey ? beat / 2 : beat;
        keep(movePoint(c, index, p.x + dir * step, p.y));
        break;
      }
      case ',':
      case '.':
        keep(movePoint(c, index, p.x + (e.key === ',' ? -1 : 1) * (FINE_NUDGE_SECONDS / model.d), p.y));
        break;
      case 'ArrowUp':
      case 'ArrowDown': {
        const step = e.shiftKey ? GAIN_STEP_LARGE : GAIN_STEP;
        keep(movePoint(c, index, p.x, p.y + (e.key === 'ArrowUp' ? step : -step)));
        break;
      }
      case '<':
      case '>': {
        const seg = segmentFrom(lane, index);
        keep(setBend(c, seg, c.segments[seg].bend + (e.key === '<' ? -BEND_STEP : BEND_STEP)));
        break;
      }
      case 'e':
      case 'E':
        keep(toggleEase(c, segmentFrom(lane, index)));
        break;
      case 'Delete':
      case 'Backspace':
        if (index > 0 && index < lastIndex(lane)) change(lane, deletePoint(c, index), { lane, kind: 'point', index: index - 1 });
        break;
      case 'Enter': {
        const seg = segmentFrom(lane, index);
        add(lane, segmentMid(c, seg).x);
        break;
      }
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  }

  function onHandleKey(e: KeyboardEvent) {
    const b = e.currentTarget as HTMLButtonElement;
    const lane = b.dataset.lane as Lane;
    const index = Number(b.dataset.index);
    const c = curveOf(lane);
    const keep = (curve: GainCurve) => change(lane, curve, { lane, kind: 'handle', index });
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      keep(setBend(c, index, c.segments[index].bend + (e.key === 'ArrowUp' ? BEND_STEP : -BEND_STEP)));
    } else if (e.key === 'Enter') {
      keep(toggleEase(c, index));
    } else {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  }

  // ---------- rendering ----------

  function makeButton(lane: Lane, kind: 'point' | 'handle'): HTMLButtonElement {
    const b = h('button', { class: kind === 'point' ? 'curve-point' : 'curve-handle', type: 'button', 'data-lane': lane, 'data-kind': kind });
    b.addEventListener('pointerdown', onPointerDown);
    b.addEventListener('pointermove', onPointerMove);
    b.addEventListener('pointerup', onPointerUp);
    b.addEventListener('pointercancel', onPointerUp);
    b.addEventListener('dblclick', onDoubleClick);
    b.addEventListener('keydown', kind === 'point' ? onPointKey : onHandleKey);
    return b;
  }

  function focus(f: Focus) {
    const list = f.kind === 'point' ? points[f.lane] : handles[f.lane];
    list[Math.min(f.index, list.length - 1)]?.focus();
  }

  /** Keeps one button per point / segment, in Tab order: points of A, points of B, then segment handles. */
  function syncButtons() {
    if (!model) return;
    for (const lane of LANES) {
      const c = curveOf(lane);
      while (points[lane].length < c.points.length) points[lane].push(makeButton(lane, 'point'));
      while (points[lane].length > c.points.length) points[lane].pop()!.remove();
      while (handles[lane].length < c.segments.length) handles[lane].push(makeButton(lane, 'handle'));
      while (handles[lane].length > c.segments.length) handles[lane].pop()!.remove();
      points[lane].forEach((b, i) => {
        b.dataset.index = String(i);
        b.classList.toggle('is-endpoint', i === 0 || i === c.points.length - 1);
        b.setAttribute('aria-label', describePoint(lane, i));
      });
      handles[lane].forEach((b, i) => {
        b.dataset.index = String(i);
        b.classList.toggle('is-eased', c.segments[i].ease);
        b.setAttribute('aria-label', describeHandle(lane, i));
      });
    }
    // Re-inserting a node drops its pointer capture, so only touch the DOM when the set changed.
    setChildren(pointLayer, [...points.out, ...points.in]);
    setChildren(handleLayer, [...handles.out, ...handles.in]);
  }

  function setChildren(parent: HTMLElement, children: HTMLElement[]) {
    const same = parent.children.length === children.length && children.every((c, i) => parent.children[i] === c);
    if (!same) parent.replaceChildren(...children);
  }

  function layout() {
    const g = stage.geometry();
    if (!model || !g || !active) return;
    const w = g.x1 - g.x0;
    for (const lane of LANES) {
      const box = g.lanes[lane];
      const yAt = (y: number) => box.top + g.pad + (1 - y) * (box.height - 2 * g.pad);
      Object.assign(areas[lane].style, { left: `${g.x0}px`, width: `${w}px`, top: `${box.top}px`, height: `${box.height}px` });
      const c = curveOf(lane);
      points[lane].forEach((b, i) => {
        const p = c.points[i];
        b.style.left = `${g.x0 + p.x * w}px`;
        b.style.top = `${yAt(p.y)}px`;
      });
      handles[lane].forEach((b, i) => {
        const m = segmentMid(c, i);
        b.style.left = `${g.x0 + m.x * w}px`;
        b.style.top = `${yAt(m.y)}px`;
      });
    }
  }

  stage.onLayout(layout);

  return {
    update(next, isActive) {
      model = next;
      active = isActive && next !== null;
      el.hidden = !active;
      if (!active) {
        drag = null;
        return;
      }
      // Keep focus on the same point or handle across re-renders.
      const focused = el.contains(document.activeElement) ? (document.activeElement as HTMLElement) : null;
      const keepFocus: Focus | null =
        pendingFocus ??
        (focused?.dataset.lane
          ? { lane: focused.dataset.lane as Lane, kind: focused.dataset.kind as 'point' | 'handle', index: Number(focused.dataset.index) }
          : null);
      pendingFocus = null;
      syncButtons();
      layout();
      if (keepFocus && !drag) focus(keepFocus);
    },
    isDragging: () => drag !== null,
  };
}
