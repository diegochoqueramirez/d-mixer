import type { EditLane, LoopEvent } from '../types';
import { loopedAudioAt } from '../lib/effects';
import type { LaneLine } from '../lib/lanes';
import { incomingAudioAt } from '../lib/timeline';
import { barsToSeconds, beatSeconds, BEATS_PER_BAR, snapToBeat } from '../lib/timing';
import { clampView, fitSpan, fitView, maxZoom, panBy, peakBetween, rescaleView, visibleRange, zoomAround, ZOOM_STEP, type StageView } from '../lib/zoom';
import { formatTime, h, icon } from './dom';
import { attachStageZoom } from './stageZoom';

export interface StageTrack {
  name: string;
  /** Fine peaks (one bin every 5 ms). */
  peaks: Float32Array;
  duration: number;
  bpm: number;
  firstBeatOffset: number;
}

export interface StageModel {
  from: StageTrack;
  to: StageTrack;
  outStart: number;
  inStart: number;
  /** Transition length in mix seconds. */
  d: number;
  /** Playback rate of the incoming track during the transition. */
  r: number;
  /** Lane lines over each song, back to front. */
  linesOut: LaneLine[];
  linesIn: LaneLine[];
  /** Beat loop of the outgoing song, jump times in mix time (0 = window start); null = none. */
  loop: LoopEvent | null;
}

/** Lane whose sheet is open: only its lines are drawn (looping has none). */
export type FocusLane = EditLane | 'looping';

export interface Stage {
  el: HTMLElement;
  draw(model: StageModel | null): void;
  /** Mix time of the playhead (0 = transition start), or null to hide it. */
  setPlayhead(tau: number | null): void;
  isDragging(): boolean;
  /**
   * Personalizar mode on a lane (null = off): waves stop sliding, nudge hides, the waves are dimmed
   * inside the window, the edited lane is drawn on top of the others and the view goes back to the
   * whole transition (zoom is off until it ends).
   */
  setCustomizing(lane: EditLane | null): void;
  /** Pixel layout of the window and lanes, relative to `el`; null until something is drawn. */
  geometry(): StageGeometry | null;
  /** Called after every redraw (model change or resize) so overlays can follow the layout. */
  onLayout(listener: () => void): void;
  /** Back to the whole transition. The editor calls it on open and on pair change. */
  resetZoom(): void;
  /** One step of − / +; ignored while customizing. */
  stepZoom(direction: 1 | -1): void;
  /** Lane sheet open: only that lane's lines are drawn and the play pill moves to the bottom edge. */
  setFocusLane(lane: FocusLane | null): void;
  /** Called when a wave is touched or released, so the editor can show and hide the minimaps. */
  onWaveTouch(listener: (touching: boolean) => void): void;
}

export interface StageGeometry {
  /** Left and right edge of the transition window (outside the stage when zoomed in). */
  x0: number;
  x1: number;
  /** Top and height of the outgoing (`out`) and incoming (`in`) lanes. */
  lanes: Record<'out' | 'in', { top: number; height: number }>;
  /** Vertical padding inside a lane: its full height spans top + pad to top + height − pad. */
  pad: number;
}

export interface MinimapModel {
  peaks: Float32Array;
  duration: number;
  bpm: number;
  firstBeatOffset: number;
  windowStart: number;
  windowLength: number;
}

export interface Minimap {
  el: HTMLCanvasElement;
  draw(model: MinimapModel | null): void;
  isDragging(): boolean;
}

/** Seconds moved by one press of a nudge button. Nudging never snaps to the beat. */
export const NUDGE_SECONDS = 0.01;

interface Tokens {
  wave: string;
  waveDim: string;
  surfaceRaised: string;
  windowFrame: string;
  lanes: Record<EditLane, string>;
  loop: string;
  playhead: string;
  beatLine: string;
  barLine: string;
}

/** Vertical layout measured on Spotify Mix: 6% margin, A in 41%, 6% gap, B in 41%, 6% margin. */
const LANE_TOP = 0.06;
const LANE_HEIGHT = 0.41;
const LANE_GAP = 0.06;
const BAR_WIDTH = 2;
const BAR_GAP = 1;
const LANE_PAD = 8;
const RADIUS = 10;
/** Opacity of the lanes not being edited in Personalizar, and of the EQ's mid and high bands. */
const DIMMED_ALPHA = 0.35;
const FAINT_ALPHA = 0.4;
const LOOP_MARK_SIZE = 11;
/** Grid lines closer than this are not drawn. */
const MIN_LINE_GAP = 5;
/** The nudge arrows of the last touched wave hide after this long. */
const NUDGE_HIDE_MS = 3000;
/** The scroll indicator fades this long after the last zoom or pan. */
const SCROLL_INDICATOR_MS = 1000;

let tokens: Tokens | null = null;

function readTokens(): Tokens {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    wave: v('--wave'),
    waveDim: v('--wave-dim'),
    surfaceRaised: v('--surface-raised'),
    windowFrame: v('--window-frame'),
    lanes: { volume: v('--lane-volume'), eq: v('--lane-eq'), filter: v('--lane-filter'), effect: v('--lane-effect') },
    loop: v('--lane-loop'),
    playhead: v('--playhead'),
    beatLine: v('--beat-line'),
    barLine: v('--bar-line'),
  };
}

function prepare(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(canvas.clientWidth * dpr);
  const hh = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== hh) {
    canvas.width = w;
    canvas.height = hh;
  }
  const g = canvas.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  return g;
}

function peakAt(track: { peaks: Float32Array; duration: number }, audio: number): number {
  const i = Math.floor((audio / track.duration) * track.peaks.length);
  return track.peaks[Math.min(track.peaks.length - 1, Math.max(0, i))];
}

interface LaneControl {
  el: HTMLElement;
  update(label: string, value: number, max: number): void;
  nudge(delta: number): void;
  isDragging(): boolean;
  /** Drops a drag in progress without finishing it (a second finger turned it into a pinch). */
  cancel(): void;
}

interface LaneHooks {
  change(start: number): void;
  start(): void;
  end(): void;
  cancel(): void;
}

/**
 * Transparent slider over one lane: dragging slides that track under the fixed window.
 * `secondsPerPx` converts pointer movement into this track's audio seconds.
 */
function createLaneControl(
  className: string,
  get: () => { start: number; max: number; bpm: number; firstBeatOffset: number; secondsPerPx: number } | null,
  hooks: LaneHooks,
): LaneControl {
  const el = h('div', { class: `lane-hit ${className}`, role: 'slider', tabindex: 0, 'aria-valuemin': 0 });
  let drag: { x: number; start: number } | null = null;

  function commit(raw: number, free: boolean) {
    const m = get();
    if (!m) return;
    let start = free ? raw : snapToBeat(raw, m.bpm, m.firstBeatOffset);
    start = Math.min(Math.max(0, start), m.max);
    if (Math.abs(start - m.start) > 1e-6) hooks.change(start);
  }

  el.addEventListener('pointerdown', (e) => {
    const m = get();
    if (!m) return;
    drag = { x: e.clientX, start: m.start };
    el.setPointerCapture(e.pointerId);
    el.classList.add('is-dragging');
    hooks.start();
  });
  el.addEventListener('pointermove', (e) => {
    const m = get();
    if (!drag || !m) return;
    // Dragging the wave to the left brings later audio under the window.
    commit(drag.start - (e.clientX - drag.x) * m.secondsPerPx, e.shiftKey);
  });
  const end = () => {
    if (!drag) return;
    drag = null;
    el.classList.remove('is-dragging');
    hooks.end();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  el.addEventListener('keydown', (e) => {
    const m = get();
    if (!m) return;
    const beat = beatSeconds(m.bpm);
    const bar = barsToSeconds(1, m.bpm);
    const steps: Record<string, number> = {
      ArrowLeft: e.shiftKey ? -bar : -beat,
      ArrowRight: e.shiftKey ? bar : beat,
      ArrowDown: -beat,
      ArrowUp: beat,
      PageDown: -bar * BEATS_PER_BAR,
      PageUp: bar * BEATS_PER_BAR,
    };
    if (e.key in steps) commit(m.start + steps[e.key], false);
    else if (e.key === 'Home') commit(0, false);
    else if (e.key === 'End') commit(m.max, false);
    else return;
    e.preventDefault();
  });

  return {
    el,
    nudge(delta) {
      const m = get();
      if (m) commit(m.start + delta, true);
    },
    isDragging: () => drag !== null,
    cancel() {
      if (!drag) return;
      drag = null;
      el.classList.remove('is-dragging');
      hooks.cancel();
    },
    update(label, value, max) {
      el.setAttribute('aria-label', label);
      el.setAttribute('aria-valuemax', max.toFixed(2));
      el.setAttribute('aria-valuenow', value.toFixed(2));
      el.setAttribute('aria-valuetext', formatTime(value));
    },
  };
}

/**
 * Time-aligned transition view: the end of the outgoing track on top, the start of the incoming one
 * below, sharing one mix-time axis with the transition window in the middle. Zoom and pan move that
 * axis; the window stays where it is in mix time.
 *
 * `center` (the play pill) sits between the two waves; `bottom` (the bars pill) sits on the bottom
 * edge between − and +.
 */
export function createStage(
  center: HTMLElement,
  bottom: HTMLElement,
  onOutStart: (start: number) => void,
  onInStart: (start: number) => void,
  onDragEnd: () => void,
  onDragStart: () => void = () => {},
  onDragCancel: () => void = () => {},
): Stage {
  const canvas = h('canvas', { class: 'stage-canvas', 'aria-hidden': 'true' });
  let model: StageModel | null = null;
  let playhead: number | null = null;
  let customizing: EditLane | null = null;
  let focusLane: FocusLane | null = null;
  let layout: StageGeometry | null = null;
  const layoutListeners: (() => void)[] = [];
  const touchListeners: ((touching: boolean) => void)[] = [];

  /** What the view shows; null = the whole transition on the next draw. */
  let view: StageView | null = null;
  /** Length and tempo the view was computed for, to rescale it when they change. */
  let dims: { d: number; bpm: number } | null = null;
  /** The view before Personalizar, given back when it ends. */
  let savedView: StageView | null = null;

  const span = () => (model && view ? fitSpan(model.d) / view.zoom : 1);
  const secondsPerPx = () => span() / Math.max(1, canvas.clientWidth);

  const notifyTouch = (touching: boolean) => touchListeners.forEach((l) => l(touching));

  // ---------- nudge arrows: only on the wave touched last ----------

  let nudgeTimer: ReturnType<typeof setTimeout> | undefined;
  function showNudge(lane: 'out' | 'in') {
    clearTimeout(nudgeTimer);
    el.dataset.nudge = lane;
  }
  function hideNudgeLater() {
    clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(() => delete el.dataset.nudge, NUDGE_HIDE_MS);
  }

  const laneHooks = (lane: 'out' | 'in', change: (start: number) => void): LaneHooks => ({
    change,
    start() {
      showNudge(lane);
      notifyTouch(true);
      onDragStart();
    },
    end() {
      hideNudgeLater();
      notifyTouch(false);
      onDragEnd();
    },
    cancel() {
      hideNudgeLater();
      notifyTouch(false);
      onDragCancel();
    },
  });

  const out = createLaneControl(
    'lane-hit--out',
    () =>
      model && {
        start: model.outStart,
        max: Math.max(0, model.from.duration - model.d),
        bpm: model.from.bpm,
        firstBeatOffset: model.from.firstBeatOffset,
        secondsPerPx: secondsPerPx(),
      },
    laneHooks('out', onOutStart),
  );
  const inn = createLaneControl(
    'lane-hit--in',
    () =>
      model && {
        start: model.inStart,
        max: Math.max(0, model.to.duration - model.d * model.r),
        bpm: model.to.bpm,
        firstBeatOffset: model.to.firstBeatOffset,
        secondsPerPx: secondsPerPx() * model.r,
      },
    laneHooks('in', onInStart),
  );

  const nudgeButton = (lane: LaneControl, side: 'out' | 'in', delta: number, label: string) => {
    const b = h(
      'button',
      { class: `stage-btn nudge nudge--${side} ${delta < 0 ? 'nudge--left' : 'nudge--right'}`, type: 'button', 'aria-label': label, title: label },
      icon(delta < 0 ? 'prev' : 'next'),
    );
    b.addEventListener('pointerdown', () => showNudge(side));
    b.addEventListener('click', () => {
      lane.nudge(delta);
      hideNudgeLater();
    });
    return b;
  };

  // ---------- zoom ----------

  const zoomButton = (direction: 1 | -1, label: string) => {
    const b = h('button', { class: 'stage-btn zoom-btn', type: 'button', 'aria-label': label, title: label }, icon(direction > 0 ? 'add' : 'minus'));
    b.addEventListener('click', () => stepZoom(direction));
    return b;
  };
  const minusBtn = zoomButton(-1, 'Alejar');
  const plusBtn = zoomButton(1, 'Acercar');
  const indicator = h('div', { class: 'scroll-indicator', 'aria-hidden': 'true' });
  let indicatorTimer: ReturnType<typeof setTimeout> | undefined;

  const centerBand = h('div', { class: 'stage-center' }, center);
  const bottomRow = h('div', { class: 'stage-bottom' }, minusBtn, bottom, plusBtn);

  const el = h(
    'div',
    { class: 'stage-view' },
    canvas,
    out.el,
    inn.el,
    nudgeButton(out, 'out', -NUDGE_SECONDS, 'Salida 10 ms antes'),
    nudgeButton(out, 'out', NUDGE_SECONDS, 'Salida 10 ms después'),
    nudgeButton(inn, 'in', -NUDGE_SECONDS, 'Entrada 10 ms antes'),
    nudgeButton(inn, 'in', NUDGE_SECONDS, 'Entrada 10 ms después'),
    indicator,
    centerBand,
    bottomRow,
  );

  function updateZoomButtons() {
    const can = model !== null && view !== null && customizing === null;
    minusBtn.disabled = !can || view!.zoom <= 1 + 1e-6;
    plusBtn.disabled = !can || view!.zoom >= maxZoom(model!.d, model!.from.bpm) - 1e-6;
  }

  function flashIndicator() {
    clearTimeout(indicatorTimer);
    if (!model || !view || view.zoom <= 1 + 1e-6) {
      indicator.classList.remove('is-visible');
      return;
    }
    const r = visibleRange(view, model.d);
    indicator.style.left = `${r.start * 100}%`;
    indicator.style.width = `${(r.end - r.start) * 100}%`;
    indicator.classList.add('is-visible');
    indicatorTimer = setTimeout(() => indicator.classList.remove('is-visible'), SCROLL_INDICATOR_MS);
  }

  function setView(next: StageView) {
    if (view && next.zoom === view.zoom && next.center === view.center) return;
    view = next;
    updateZoomButtons();
    flashIndicator();
    render();
  }

  function stepZoom(direction: 1 | -1) {
    if (!model || !view || customizing) return;
    setView(zoomAround(view, direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP, 0.5, model.d, model.from.bpm));
  }

  attachStageZoom({
    el,
    enabled: () => model !== null && view !== null && customizing === null,
    zoomAround: (factor, anchor) => {
      if (model && view) setView(zoomAround(view, factor, anchor, model.d, model.from.bpm));
    },
    panBy: (dx) => {
      if (model && view) setView(panBy(view, dx, canvas.clientWidth, model.d, model.from.bpm));
    },
    cancelDrags: () => {
      out.cancel();
      inn.cancel();
    },
  });

  // ---------- drawing ----------

  /** `notify` is false for playhead-only redraws, which never change the layout. */
  function render(notify = true) {
    const g = prepare(canvas);
    const w = canvas.clientWidth;
    const hh = canvas.clientHeight;
    if (!model || !view || w === 0) {
      layout = null;
      return;
    }
    tokens ??= readTokens();
    const tk = tokens;
    const m = model;

    const s = span();
    const v = view;
    const tauAt = (x: number) => v.center + (x / w - 0.5) * s;
    const xAt = (tau: number) => ((tau - v.center) / s + 0.5) * w;
    const x0 = xAt(0);
    const x1 = xAt(m.d);

    const laneH = Math.round(hh * LANE_HEIGHT);
    const outTop = Math.round(hh * LANE_TOP);
    const inTop = Math.round(hh * (LANE_TOP + LANE_HEIGHT + LANE_GAP));
    layout = { x0, x1, lanes: { out: { top: outTop, height: laneH }, in: { top: inTop, height: laneH } }, pad: LANE_PAD };
    // Inside the window, A plays what its loop sends it to; repeats are drawn dimmed.
    const outAudioAt = (tau: number) => {
      if (m.loop && tau >= 0 && tau <= m.d) return loopedAudioAt(m.loop, 0, tau);
      return { audio: m.outStart + tau, repeat: false };
    };
    const ownLines = (lines: LaneLine[]) => (focusLane === null ? lines : focusLane === 'looping' ? [] : lines.filter((l) => l.lane === focusLane));
    // A sounds until the window ends; B sounds from the window's start. What does not sound is dimmed.
    const lanes = [
      { top: outTop, track: m.from, audioAt: outAudioAt, plays: (tau: number) => tau <= m.d, lines: ownLines(m.linesOut), jumps: m.loop?.jumps ?? [] },
      {
        top: inTop,
        track: m.to,
        audioAt: (tau: number) => ({ audio: incomingAudioAt(tau, m.inStart, m.d, m.r), repeat: false }),
        plays: (tau: number) => tau >= 0,
        lines: ownLines(m.linesIn),
        jumps: [],
      },
    ];

    // one raised panel behind both lanes: the window
    g.fillStyle = tk.surfaceRaised;
    g.beginPath();
    g.roundRect(x0, 0, x1 - x0, hh, RADIUS);
    g.fill();

    // beat grid of the outgoing track, only inside the window; every bar is stronger
    const beat = beatSeconds(m.from.bpm);
    const beatPx = (beat / s) * w;
    if (beatPx * BEATS_PER_BAR >= MIN_LINE_GAP) {
      const from = Math.max(0, tauAt(0));
      const to = Math.min(m.d, tauAt(w));
      const offset = m.from.firstBeatOffset;
      for (let k = Math.max(0, Math.ceil((m.outStart + from - offset) / beat - 1e-6)); ; k++) {
        const tau = offset + k * beat - m.outStart;
        if (tau > to + 1e-9) break;
        const isBar = k % BEATS_PER_BAR === 0;
        if (!isBar && beatPx < MIN_LINE_GAP) continue;
        g.fillStyle = isBar ? tk.barLine : tk.beatLine;
        g.fillRect(Math.round(xAt(tau)), 0, 1, hh);
      }
    }

    const step = BAR_WIDTH + BAR_GAP;
    for (const lane of lanes) {
      const mid = lane.top + laneH / 2;
      const amp = laneH / 2 - LANE_PAD;
      for (let x = 0; x < w; x += step) {
        const tau = tauAt(x + BAR_WIDTH / 2);
        const { audio, repeat } = lane.audioAt(tau);
        if (audio < 0 || audio > lane.track.duration) continue;
        // each bar shows the highest peak of the stretch it covers, so no hit is lost when zoomed out
        const peak = peakBetween(lane.track.peaks, lane.track.duration, lane.audioAt(tauAt(x)).audio, lane.audioAt(tauAt(x + step)).audio);
        const barH = Math.max(1, peak * amp);
        const inside = tau >= 0 && tau <= m.d;
        g.fillStyle = lane.plays(tau) && !repeat ? tk.wave : tk.waveDim;
        g.globalAlpha = inside && customizing !== null ? 0.6 : 1;
        g.fillRect(x, mid - barH, BAR_WIDTH, barH * 2);
      }
      g.globalAlpha = 1;

      // ↺ where the loop jumps back to the window's start
      if (lane.jumps.length > 0) {
        g.fillStyle = tk.loop;
        g.font = `${LOOP_MARK_SIZE}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'top';
        for (const j of lane.jumps) {
          const x = Math.round(xAt(j.time));
          g.fillRect(x, lane.top + LANE_PAD, 1, laneH - LANE_PAD * 2);
          g.fillText('↺', x, lane.top + 2);
        }
      }

      // The lane being edited goes on top; the others are dimmed.
      const ordered = customizing ? [...lane.lines.filter((l) => l.lane !== customizing), ...lane.lines.filter((l) => l.lane === customizing)] : lane.lines;
      g.lineJoin = 'round';
      for (const line of ordered) {
        const dimmed = customizing !== null && line.lane !== customizing;
        g.strokeStyle = tk.lanes[line.lane];
        g.lineWidth = line.faint ? 1 : 2;
        g.globalAlpha = (line.faint ? FAINT_ALPHA : 1) * (dimmed ? DIMMED_ALPHA : 1);
        g.beginPath();
        const n = line.values.length;
        const { zero, one } = line.scale;
        for (let k = 0; k < n; k++) {
          const x = x0 + ((x1 - x0) * k) / (n - 1);
          const height = zero + Math.min(1, Math.max(0, line.values[k])) * (one - zero);
          const y = lane.top + LANE_PAD + (1 - height) * (laneH - LANE_PAD * 2);
          if (k === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
      g.globalAlpha = 1;
    }

    if (playhead !== null) {
      const x = xAt(playhead);
      if (x >= 0 && x <= w) {
        g.fillStyle = tk.playhead;
        g.fillRect(Math.round(x) - 1, 0, 2, hh);
      }
    }
    if (notify) layoutListeners.forEach((l) => l());
  }

  new ResizeObserver(() => render()).observe(canvas);

  return {
    el,
    draw(next) {
      model = next;
      if (model) {
        out.update(`Punto de salida en ${model.from.name}`, model.outStart, Math.max(0, model.from.duration - model.d));
        inn.update(`Punto de entrada en ${model.to.name}`, model.inStart, Math.max(0, model.to.duration - model.d * model.r));
        const now = { d: model.d, bpm: model.from.bpm };
        if (!view || !dims) {
          view = fitView(now.d);
        } else if (dims.d !== now.d || dims.bpm !== now.bpm) {
          view = rescaleView(view, dims, now);
          if (savedView) savedView = rescaleView(savedView, dims, now);
        }
        view = clampView(view, now.d, now.bpm);
        dims = now;
      }
      updateZoomButtons();
      render();
    },
    setPlayhead(tau) {
      if (tau === playhead) return;
      playhead = tau;
      render(false);
    },
    isDragging: () => out.isDragging() || inn.isDragging(),
    setCustomizing(lane) {
      if (lane === customizing) return;
      const on = lane !== null;
      const was = customizing !== null;
      customizing = lane;
      if (on && !was) {
        savedView = view;
        if (model) view = fitView(model.d);
      } else if (!on && was) {
        if (savedView && model) view = clampView(savedView, model.d, model.from.bpm);
        savedView = null;
      }
      el.classList.toggle('is-customizing', on);
      for (const lane of [out.el, inn.el]) lane.tabIndex = on ? -1 : 0;
      for (const b of el.querySelectorAll<HTMLButtonElement>('.nudge')) b.tabIndex = on ? -1 : 0;
      updateZoomButtons();
      flashIndicator();
      render();
    },
    geometry: () => layout,
    onLayout(listener) {
      layoutListeners.push(listener);
    },
    resetZoom() {
      view = null;
      dims = null;
      savedView = null;
      clearTimeout(indicatorTimer);
      indicator.classList.remove('is-visible');
    },
    stepZoom,
    setFocusLane(lane) {
      if (lane === focusLane) return;
      focusLane = lane;
      el.classList.toggle('is-focus', lane !== null);
      // with a sheet open the bars pill goes away and play takes its place on the bottom edge
      if (lane !== null) bottomRow.insertBefore(center, plusBtn);
      else centerBand.append(center);
      bottom.hidden = lane !== null;
      render();
    },
    onWaveTouch(listener) {
      touchListeners.push(listener);
    },
  };
}

/** Full-song strip showing where the window sits. Click or drag to jump there. */
export function createMinimap(onSeek: (start: number) => void, onDragEnd: () => void): Minimap {
  const el = h('canvas', { class: 'minimap', 'aria-hidden': 'true' });
  let model: MinimapModel | null = null;
  let dragging = false;

  function seek(e: PointerEvent) {
    if (!model) return;
    const x = e.clientX - el.getBoundingClientRect().left;
    const raw = (x / el.clientWidth) * model.duration - model.windowLength / 2;
    let start = e.shiftKey ? raw : snapToBeat(raw, model.bpm, model.firstBeatOffset);
    start = Math.min(Math.max(0, start), Math.max(0, model.duration - model.windowLength));
    if (Math.abs(start - model.windowStart) > 1e-6) onSeek(start);
  }

  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    dragging = true;
    seek(e);
  });
  el.addEventListener('pointermove', (e) => {
    if (dragging) seek(e);
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    onDragEnd();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  function render() {
    const g = prepare(el);
    const w = el.clientWidth;
    const hh = el.clientHeight;
    if (!model || w === 0) return;
    tokens ??= readTokens();
    const tk = tokens;
    const x0 = (model.windowStart / model.duration) * w;
    const x1 = ((model.windowStart + model.windowLength) / model.duration) * w;
    const mid = hh / 2;

    for (let x = 0; x < w; x += BAR_WIDTH) {
      const audio = ((x + 0.5) / w) * model.duration;
      const barH = Math.max(0.5, peakAt(model, audio) * (mid - 3));
      g.fillStyle = x + 1 >= x0 && x <= x1 ? tk.wave : tk.waveDim;
      g.fillRect(x, mid - barH, BAR_WIDTH - 0.5, barH * 2);
    }

    g.strokeStyle = tk.windowFrame;
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(x0, 1, Math.max(3, x1 - x0), hh - 2, 4);
    g.stroke();
  }

  new ResizeObserver(render).observe(el);

  return {
    el,
    draw(next) {
      model = next;
      render();
    },
    isDragging: () => dragging,
  };
}
