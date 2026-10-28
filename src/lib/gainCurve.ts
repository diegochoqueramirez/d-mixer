import type { GainCurve, GainPoint, SegmentShape, VolumeCurves, VolumeStyle } from '../types';
import { BEATS_PER_BAR } from './timing';

export const MAX_POINTS = 32;
/** Minimum distance between neighbouring points, relative to the window. */
export const MIN_GAP = 0.001;
export const DEFAULT_SAMPLES = 256;

const STRAIGHT: SegmentShape = { ease: false, bend: 0 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Exponent applied to the segment position: bend 1 → 0.25 (concave), bend −1 → 4 (convex). */
function exponentOf(bend: number): number {
  return 2 ** (-2 * bend);
}

function bendOf(exponent: number): number {
  return clamp(-Math.log2(exponent) / 2, -1, 1);
}

function shape(t: number, s: SegmentShape): number {
  const t1 = t ** exponentOf(s.bend);
  return s.ease ? t1 * t1 * (3 - 2 * t1) : t1;
}

/** Inverse of smoothstep on [0, 1]. */
function unsmoothstep(v: number): number {
  return 0.5 - Math.sin(Math.asin(1 - 2 * v) / 3);
}

function segmentIndexAt(curve: GainCurve, x: number): number {
  const { points } = curve;
  for (let i = 0; i < points.length - 1; i++) if (x <= points[i + 1].x) return i;
  return points.length - 2;
}

export function evaluateGainCurve(curve: GainCurve, x: number): number {
  const cx = clamp(x, 0, 1);
  const i = segmentIndexAt(curve, cx);
  const p0 = curve.points[i];
  const p1 = curve.points[i + 1];
  const span = p1.x - p0.x;
  const t = span > 0 ? (cx - p0.x) / span : 1;
  return p0.y + (p1.y - p0.y) * shape(t, curve.segments[i]);
}

export function sampleGainCurve(curve: GainCurve, n = DEFAULT_SAMPLES): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = evaluateGainCurve(curve, i / (n - 1));
  return out;
}

function curve(points: [number, number][], segments?: SegmentShape[]): GainCurve {
  return {
    points: points.map(([x, y]) => ({ x, y })),
    segments: segments ?? points.slice(1).map(() => ({ ...STRAIGHT })),
  };
}

/** Breakpoint curves that reproduce each volume style (see SPEC 02, "Curva inicial desde el estilo"). */
export function curveFromStyle(style: VolumeStyle): VolumeCurves {
  switch (style) {
    case 'crossfade':
      return { out: curve([[0, 1], [1, 0]]), in: curve([[0, 0], [1, 1]]) };
    case 'smooth-crossfade':
      // Three points with bends fitted offline to cos/sin (max error 0.3% out, 1.03% in).
      return {
        out: curve([[0, 1], [0.5, Math.SQRT1_2], [1, 0]], [{ ease: false, bend: -0.477 }, { ease: false, bend: -0.077 }]),
        in: curve([[0, 0], [0.5, Math.SQRT1_2], [1, 1]], [{ ease: false, bend: 0.074 }, { ease: true, bend: 0.4 }]),
      };
    case 'overlap':
      return { out: curve([[0, 1], [0.99, 1], [1, 0]]), in: curve([[0, 1], [1, 1]]) };
    case 'fade-in-fade-out':
      return { out: curve([[0, 1], [0.5, 1], [1, 0]]), in: curve([[0, 0], [0.5, 1], [1, 1]]) };
    case 'cut-in-fade-out':
      return { out: curve([[0, 1], [1, 0]]), in: curve([[0, 1], [1, 1]]) };
    case 'fade-in-cut-out':
      return { out: curve([[0, 1], [0.99, 1], [1, 0]]), in: curve([[0, 0], [1, 1]]) };
    case 'center-cut':
      return {
        out: curve([[0, 1], [0.49, 1], [0.5, 0], [1, 0]]),
        in: curve([[0, 0], [0.49, 0], [0.5, 1], [1, 1]]),
      };
    case 'fade-in-fast-out':
      return { out: curve([[0, 1], [0.25, 0], [1, 0]]), in: curve([[0, 0], [1, 1]]) };
  }
}

/** Nearest beat, half beat or window centre, in window-relative coordinates. */
export function snapX(x: number, bars: number): number {
  const steps = bars * BEATS_PER_BAR * 2;
  const grid = Math.round(x * steps) / steps;
  return Math.abs(x - 0.5) < Math.abs(x - grid) ? 0.5 : grid;
}

function isEndpoint(curve: GainCurve, index: number): boolean {
  return index === 0 || index === curve.points.length - 1;
}

/** Moves a point, keeping endpoints on x = 0 / 1 and every point strictly between its neighbours. */
export function movePoint(c: GainCurve, index: number, x: number, y: number): GainCurve {
  const points = c.points.map((p) => ({ ...p }));
  const p = points[index];
  if (!p) return c;
  if (!isEndpoint(c, index)) {
    const lo = points[index - 1].x + MIN_GAP;
    const hi = points[index + 1].x - MIN_GAP;
    p.x = lo <= hi ? clamp(x, lo, hi) : p.x;
  }
  p.y = clamp(y, 0, 1);
  return { points, segments: c.segments.map((s) => ({ ...s })) };
}

/** Adds a point on the curve at `x`. Returns null when the curve is full or `x` is too close to a point. */
export function addPoint(c: GainCurve, x: number): { curve: GainCurve; index: number } | null {
  if (c.points.length >= MAX_POINTS) return null;
  if (x <= MIN_GAP || x >= 1 - MIN_GAP) return null;
  const i = segmentIndexAt(c, x);
  if (x - c.points[i].x < MIN_GAP || c.points[i + 1].x - x < MIN_GAP) return null;
  const point: GainPoint = { x, y: evaluateGainCurve(c, x) };
  const points = [...c.points.slice(0, i + 1), point, ...c.points.slice(i + 1)].map((p) => ({ ...p }));
  const split = c.segments[i];
  const segments = [...c.segments.slice(0, i), { ...split }, { ...split }, ...c.segments.slice(i + 1)].map((s) => ({ ...s }));
  return { curve: { points, segments }, index: i + 1 };
}

export function isFull(c: GainCurve): boolean {
  return c.points.length >= MAX_POINTS;
}

/** Removes a point (never an endpoint). The merged segment keeps the shape of the left one. */
export function deletePoint(c: GainCurve, index: number): GainCurve {
  if (isEndpoint(c, index) || !c.points[index]) return c;
  return {
    points: c.points.filter((_, i) => i !== index).map((p) => ({ ...p })),
    segments: c.segments.filter((_, i) => i !== index).map((s) => ({ ...s })),
  };
}

export function setBend(c: GainCurve, segment: number, bend: number): GainCurve {
  if (!c.segments[segment]) return c;
  return {
    points: c.points.map((p) => ({ ...p })),
    segments: c.segments.map((s, i) => (i === segment ? { ...s, bend: clamp(Math.round(bend * 1000) / 1000, -1, 1) } : { ...s })),
  };
}

export function toggleEase(c: GainCurve, segment: number): GainCurve {
  if (!c.segments[segment]) return c;
  return {
    points: c.points.map((p) => ({ ...p })),
    segments: c.segments.map((s, i) => (i === segment ? { ...s, ease: !s.ease } : { ...s })),
  };
}

/** Value of the curve at the middle of a segment, where its handle sits. */
export function segmentMid(c: GainCurve, segment: number): GainPoint {
  const x = (c.points[segment].x + c.points[segment + 1].x) / 2;
  return { x, y: evaluateGainCurve(c, x) };
}

/** Bend that makes a segment pass through `y` at its middle (used when dragging its handle). */
export function bendForMidValue(c: GainCurve, segment: number, y: number): number {
  const p0 = c.points[segment];
  const p1 = c.points[segment + 1];
  const s = c.segments[segment];
  if (!p0 || !p1 || !s || p0.y === p1.y) return s?.bend ?? 0;
  let f = clamp((y - p0.y) / (p1.y - p0.y), 0.001, 0.999);
  if (s.ease) f = unsmoothstep(f);
  return bendOf(Math.log(f) / Math.log(0.5));
}
