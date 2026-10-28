import { incomingAudioAt } from '../lib/timeline';
import { barsToSeconds, beatSeconds, BEATS_PER_BAR, snapToBeat } from '../lib/timing';
import { formatTime, h } from './dom';

export interface StageTrack {
  name: string;
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
  gainOut: Float32Array;
  gainIn: Float32Array;
}

export interface Stage {
  el: HTMLElement;
  draw(model: StageModel | null): void;
  /** Mix time of the playhead (0 = transition start), or null to hide it. */
  setPlayhead(tau: number | null): void;
  isDragging(): boolean;
  /** Personalizar mode: waves stop sliding, nudge hides and the waves are dimmed inside the window. */
  setCustomizing(on: boolean): void;
  /** Pixel layout of the window and lanes, relative to `el`; null until something is drawn. */
  geometry(): StageGeometry | null;
  /** Called after every redraw (model change or resize) so overlays can follow the layout. */
  onLayout(listener: () => void): void;
}

export interface StageGeometry {
  /** Left and right edge of the transition window. */
  x0: number;
  x1: number;
  /** Top and height of the outgoing (`out`) and incoming (`in`) lanes. */
  lanes: Record<'out' | 'in', { top: number; height: number }>;
  /** Vertical padding inside a lane: gain 1 sits at top + pad, gain 0 at top + height − pad. */
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
  gainCurve: string;
  playhead: string;
  beatLine: string;
}

/** The window covers the central 60% of the view; 20% of context on each side. */
const WINDOW_FRACTION = 0.6;
const LEAD_FRACTION = (1 - WINDOW_FRACTION) / 2;
const BAR_WIDTH = 2;
const BAR_GAP = 1;
const LANE_PAD = 8;
const RADIUS = 10;

let tokens: Tokens | null = null;

function readTokens(): Tokens {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    wave: v('--wave'),
    waveDim: v('--wave-dim'),
    surfaceRaised: v('--surface-raised'),
    windowFrame: v('--window-frame'),
    gainCurve: v('--gain-curve'),
    playhead: v('--playhead'),
    beatLine: v('--beat-line'),
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
}

/**
 * Transparent slider over one lane: dragging slides that track under the fixed window.
 * `secondsPerPx` converts pointer movement into this track's audio seconds.
 */
function createLaneControl(
  className: string,
  get: () => { start: number; max: number; bpm: number; firstBeatOffset: number; secondsPerPx: number } | null,
  onChange: (start: number) => void,
  onDragEnd: () => void,
): LaneControl {
  const el = h('div', { class: `lane-hit ${className}`, role: 'slider', tabindex: 0, 'aria-valuemin': 0 });
  let drag: { x: number; start: number } | null = null;

  function commit(raw: number, free: boolean) {
    const m = get();
    if (!m) return;
    let start = free ? raw : snapToBeat(raw, m.bpm, m.firstBeatOffset);
    start = Math.min(Math.max(0, start), m.max);
    if (Math.abs(start - m.start) > 1e-6) onChange(start);
  }

  el.addEventListener('pointerdown', (e) => {
    const m = get();
    if (!m) return;
    drag = { x: e.clientX, start: m.start };
    el.setPointerCapture(e.pointerId);
    el.classList.add('is-dragging');
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
    onDragEnd();
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
 * below, sharing one mix-time axis with the transition window fixed in the middle.
 */
export function createStage(
  center: HTMLElement,
  onOutStart: (start: number) => void,
  onInStart: (start: number) => void,
  onDragEnd: () => void,
): Stage {
  const canvas = h('canvas', { class: 'stage-canvas', 'aria-hidden': 'true' });
  let model: StageModel | null = null;
  let playhead: number | null = null;
  let customizing = false;
  let layout: StageGeometry | null = null;
  const layoutListeners: (() => void)[] = [];

  const span = () => (model ? model.d / WINDOW_FRACTION : 1);
  const secondsPerPx = () => span() / Math.max(1, canvas.clientWidth);

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
    onOutStart,
    onDragEnd,
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
    onInStart,
    onDragEnd,
  );

  const nudgeButton = (lane: LaneControl, delta: number, className: string, label: string) => {
    const b = h('button', { class: `nudge ${className}`, type: 'button', 'aria-label': label, title: label }, delta < 0 ? '‹' : '›');
    b.addEventListener('click', () => lane.nudge(delta));
    return b;
  };

  const el = h(
    'div',
    { class: 'stage-view' },
    canvas,
    out.el,
    inn.el,
    nudgeButton(out, -NUDGE_SECONDS, 'nudge--out nudge--left', 'Salida 10 ms antes'),
    nudgeButton(out, NUDGE_SECONDS, 'nudge--out nudge--right', 'Salida 10 ms después'),
    nudgeButton(inn, -NUDGE_SECONDS, 'nudge--in nudge--left', 'Entrada 10 ms antes'),
    nudgeButton(inn, NUDGE_SECONDS, 'nudge--in nudge--right', 'Entrada 10 ms después'),
    h('div', { class: 'stage-center' }, center),
  );

  /** `notify` is false for playhead-only redraws, which never change the layout. */
  function render(notify = true) {
    const g = prepare(canvas);
    const w = canvas.clientWidth;
    const hh = canvas.clientHeight;
    if (!model || w === 0) {
      layout = null;
      return;
    }
    tokens ??= readTokens();
    const tk = tokens;
    const m = model;

    const s = span();
    const tauAt = (x: number) => (x / w - LEAD_FRACTION) * s;
    const xAt = (tau: number) => (tau / s + LEAD_FRACTION) * w;
    const x0 = xAt(0);
    const x1 = xAt(m.d);

    const laneH = Math.round(hh * 0.4);
    layout = { x0, x1, lanes: { out: { top: 0, height: laneH }, in: { top: hh - laneH, height: laneH } }, pad: LANE_PAD };
    const lanes = [
      { top: 0, track: m.from, audioAt: (tau: number) => m.outStart + tau, gain: m.gainOut },
      { top: hh - laneH, track: m.to, audioAt: (tau: number) => incomingAudioAt(tau, m.inStart, m.d, m.r), gain: m.gainIn },
    ];

    // one raised panel behind both lanes, like the reference
    g.fillStyle = tk.surfaceRaised;
    g.beginPath();
    g.roundRect(x0, 0, x1 - x0, hh, RADIUS);
    g.fill();

    // beat grid of the outgoing track across the whole view
    const beat = beatSeconds(m.from.bpm);
    if ((beat / s) * w >= 5) {
      g.fillStyle = tk.beatLine;
      const firstTau = snapToBeat(m.outStart + tauAt(0), m.from.bpm, m.from.firstBeatOffset) - m.outStart;
      for (let tau = firstTau; tau <= tauAt(w); tau += beat) g.fillRect(Math.round(xAt(tau)), 0, 1, hh);
    }

    const step = BAR_WIDTH + BAR_GAP;
    for (const lane of lanes) {
      const mid = lane.top + laneH / 2;
      const amp = laneH / 2 - LANE_PAD;
      for (let x = 0; x < w; x += step) {
        const tau = tauAt(x + BAR_WIDTH / 2);
        const audio = lane.audioAt(tau);
        if (audio < 0 || audio > lane.track.duration) continue;
        const barH = Math.max(1, peakAt(lane.track, audio) * amp);
        const inside = tau >= 0 && tau <= m.d;
        g.fillStyle = inside ? tk.wave : tk.waveDim;
        g.globalAlpha = inside && customizing ? 0.6 : 1;
        g.fillRect(x, mid - barH, BAR_WIDTH, barH * 2);
      }
      g.globalAlpha = 1;

      g.strokeStyle = tk.windowFrame;
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(x0 + 1, lane.top + 1, x1 - x0 - 2, laneH - 2, RADIUS);
      g.stroke();

      g.strokeStyle = tk.gainCurve;
      g.lineJoin = 'round';
      g.beginPath();
      const n = lane.gain.length;
      for (let k = 0; k < n; k++) {
        const x = x0 + ((x1 - x0) * k) / (n - 1);
        const y = lane.top + LANE_PAD + (1 - lane.gain[k]) * (laneH - LANE_PAD * 2);
        if (k === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
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
      }
      render();
    },
    setPlayhead(tau) {
      if (tau === playhead) return;
      playhead = tau;
      render(false);
    },
    isDragging: () => out.isDragging() || inn.isDragging(),
    setCustomizing(on) {
      if (on === customizing) return;
      customizing = on;
      el.classList.toggle('is-customizing', on);
      for (const lane of [out.el, inn.el]) lane.tabIndex = on ? -1 : 0;
      for (const b of el.querySelectorAll<HTMLButtonElement>('.nudge')) b.tabIndex = on ? -1 : 0;
      render();
    },
    geometry: () => layout,
    onLayout(listener) {
      layoutListeners.push(listener);
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
