import { beatSeconds } from './timing';

/** What the aligned view shows. Lives in the stage, not in AppState. */
export interface StageView {
  /** 1 = whole transition (window over the central 72%); higher = closer. */
  zoom: number;
  /** Mix time at the centre of the view (0 = transition start). */
  center: number;
}

/** The window covers the central 72% of the view at zoom 1 (Spotify Mix); 14% of context on each side. */
export const WINDOW_FRACTION = 0.72;
/** Beats of the outgoing track across the view at the closest zoom. */
export const MAX_ZOOM_BEATS = 2;
/** Factor of each − / + step. */
export const ZOOM_STEP = 2;
/** Zoom change per pixel of wheel with Ctrl/⌘ (1%). */
export const WHEEL_ZOOM_RATE = 0.01;

/** Mix seconds across the view at zoom 1. */
export function fitSpan(d: number): number {
  return d / WINDOW_FRACTION;
}

/** Zoom at which MAX_ZOOM_BEATS beats of A fill the view; never below 1. */
export function maxZoom(d: number, bpm: number): number {
  return Math.max(1, fitSpan(d) / (MAX_ZOOM_BEATS * beatSeconds(bpm)));
}

/** The whole transition: zoom 1, centred on the window. */
export function fitView(d: number): StageView {
  return { zoom: 1, center: d / 2 };
}

/** Clamps the zoom to [1, maxZoom] and the centre so the view stays inside the fit range. */
export function clampView(view: StageView, d: number, bpm: number): StageView {
  const zoom = Math.min(Math.max(view.zoom, 1), maxZoom(d, bpm));
  const full = fitSpan(d);
  const half = full / zoom / 2;
  const lo = d / 2 - full / 2 + half;
  const hi = d / 2 + full / 2 - half;
  return { zoom, center: Math.min(Math.max(view.center, lo), hi) };
}

/** Scales the zoom by `factor`, keeping the mix time at `anchor` (0..1 of the width) in place. */
export function zoomAround(view: StageView, factor: number, anchor: number, d: number, bpm: number): StageView {
  const full = fitSpan(d);
  const at = view.center + (anchor - 0.5) * (full / view.zoom);
  const zoom = Math.min(Math.max(view.zoom * factor, 1), maxZoom(d, bpm));
  return clampView({ zoom, center: at - (anchor - 0.5) * (full / zoom) }, d, bpm);
}

/** Moves the view by `dx` pixels of a `width`-pixel stage; positive = the waves follow a finger moving right. */
export function panBy(view: StageView, dx: number, width: number, d: number, bpm: number): StageView {
  const span = fitSpan(d) / view.zoom;
  return clampView({ zoom: view.zoom, center: view.center - (dx / Math.max(1, width)) * span }, d, bpm);
}

/** Keeps the on-screen size of A's beats and the centre (in beats from the transition start) when d or A's tempo change. */
export function rescaleView(view: StageView, before: { d: number; bpm: number }, after: { d: number; bpm: number }): StageView {
  const beatBefore = beatSeconds(before.bpm);
  const beatAfter = beatSeconds(after.bpm);
  const visibleBeats = fitSpan(before.d) / view.zoom / beatBefore;
  const zoom = fitSpan(after.d) / (visibleBeats * beatAfter);
  const center = (view.center / beatBefore) * beatAfter;
  return clampView({ zoom, center }, after.d, after.bpm);
}

/** Visible part of the fit range as fractions 0..1, for the scroll indicator. */
export function visibleRange(view: StageView, d: number): { start: number; end: number } {
  const full = fitSpan(d);
  const span = full / view.zoom;
  const start = (view.center - span / 2 - (d / 2 - full / 2)) / full;
  return { start, end: start + 1 / view.zoom };
}

/** Highest peak between two audio times; the single bin under `from` when the range is inside one bin or reversed. */
export function peakBetween(peaks: Float32Array, duration: number, from: number, to: number): number {
  const n = peaks.length;
  if (n === 0 || duration <= 0) return 0;
  const clampIndex = (i: number) => Math.min(n - 1, Math.max(0, i));
  const first = clampIndex(Math.floor((from / duration) * n));
  const last = clampIndex(Math.ceil((to / duration) * n) - 1);
  if (last <= first) return peaks[first];
  let max = 0;
  for (let i = first; i <= last; i++) if (peaks[i] > max) max = peaks[i];
  return max;
}
