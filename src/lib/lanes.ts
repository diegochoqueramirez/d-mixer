import type { EditLane, EqStyle, FilterKind, FilterStyle, GainCurve, SideCurves, Transition, VolumeCurves } from '../types';
import { volumeSamples } from './curves';
import { effectSamples } from './effects';
import { DEFAULT_SAMPLES, sampleGainCurve } from './gainCurve';

// Shapes, frequencies and recipes follow vimj (a third-party reconstruction of Spotify Mix), see SPEC 04.

export const EQ_STYLES: EqStyle[] = [
  'center-bass-swap',
  'end-bass-swap',
  'start-bass-swap',
  'three-band-fade',
  'quick-bass-cut',
  'long-bass-cut',
  'start-fade-out',
  'bass-fade-out',
  'none',
];

export const FILTER_STYLES: FilterStyle[] = [
  'lpf-out',
  'lpf-in',
  'lpf-in-lpf-out',
  'lpf-in-hpf-out',
  'hpf-out',
  'hpf-in',
  'hpf-in-hpf-out',
  'hpf-in-lpf-out',
  'hpf-half-out',
  'noise-out-end',
  'none',
];

export const EQ_LABELS: Record<EqStyle, string> = {
  'center-bass-swap': 'Center bass swap',
  'end-bass-swap': 'End bass swap',
  'start-bass-swap': 'Start bass swap',
  'three-band-fade': '3-band fade',
  'quick-bass-cut': 'Quick bass cut',
  'long-bass-cut': 'Long bass cut',
  'start-fade-out': 'Start fade out',
  'bass-fade-out': 'Bass fade out',
  none: 'None',
};

export const FILTER_LABELS: Record<FilterStyle, string> = {
  'lpf-out': 'Low pass filter out',
  'lpf-in': 'Low pass filter in',
  'lpf-in-lpf-out': 'Low pass filter in low pass filter out',
  'lpf-in-hpf-out': 'Low pass filter in high pass filter out',
  'hpf-out': 'High pass filter out',
  'hpf-in': 'High pass filter in',
  'hpf-in-hpf-out': 'High pass filter in high pass filter out',
  'hpf-in-lpf-out': 'High pass filter in low pass filter out',
  'hpf-half-out': 'High-pass filter half out',
  'noise-out-end': 'Noise out end',
  none: 'None',
};

/** Smooth curve through the given points (every segment eased, no bend). */
function eased(points: [number, number][]): GainCurve {
  return {
    points: points.map(([x, y]) => ({ x, y })),
    segments: points.slice(1).map(() => ({ ease: true, bend: 0 })),
  };
}

const FULL: [number, number][] = [[0, 1], [1, 1]];
/** Quick switches, 3% of the window wide, centred where they happen. */
const offAt = (at: number): [number, number][] => [[0, 1], [at - 0.015, 1], [at + 0.015, 0], [1, 0]];
const onAt = (at: number): [number, number][] => [[0, 0], [at - 0.015, 0], [at + 0.015, 1], [1, 1]];

export interface EqBands {
  low: GainCurve;
  mid: GainCurve;
  high: GainCurve;
}

/** Gain curves of the three bands of each song for an EQ style. */
export function eqCurves(style: EqStyle): { out: EqBands; in: EqBands } {
  if (style === 'three-band-fade') {
    // Highs hand over first, then mids, then lows.
    return {
      out: { low: eased([[0, 1], [0.6, 1], [1, 0]]), mid: eased([[0, 1], [0.3, 1], [0.7, 0], [1, 0]]), high: eased([[0, 1], [0.4, 0], [1, 0]]) },
      in: { low: eased([[0, 0], [0.6, 0], [1, 1]]), mid: eased([[0, 0], [0.3, 0], [0.7, 1], [1, 1]]), high: eased([[0, 0], [0.4, 1], [1, 1]]) },
    };
  }
  const bass = (out: [number, number][], inn: [number, number][]) => ({
    out: { low: eased(out), mid: eased(FULL), high: eased(FULL) },
    in: { low: eased(inn), mid: eased(FULL), high: eased(FULL) },
  });
  switch (style) {
    case 'center-bass-swap':
      return bass(offAt(0.5), onAt(0.5));
    case 'end-bass-swap':
      return bass(offAt(0.9), onAt(0.9));
    case 'start-bass-swap':
      return bass(offAt(0.1), onAt(0.1));
    case 'quick-bass-cut':
      return bass(offAt(0.4), onAt(0.6));
    case 'long-bass-cut':
      return bass(offAt(0.05), onAt(0.95));
    case 'start-fade-out':
      return bass([[0, 1], [0.5, 0], [1, 0]], onAt(0.5));
    case 'bass-fade-out':
      return bass([[0, 1], [1, 0]], onAt(0.95));
    case 'none':
      return bass(FULL, FULL);
  }
}

/** How far the filter closes in the sweeps. */
const SWEEP = 0.8;
const CLOSE: [number, number][] = [[0, 0], [1, SWEEP]];
const OPEN: [number, number][] = [[0, SWEEP], [1, 0]];
const HALF: [number, number][] = [[0, 0], [1, SWEEP / 2]];
const RISE: [number, number][] = [[0, 0], [0.5, 0], [1, 1]];

export interface FilterSide {
  kind: FilterKind;
  /** Closure: 0 = open, 1 = fully shut (for noise: its amount). */
  curve: GainCurve;
}

/** Filter of each song for a style: outgoing songs close, incoming ones open; null = left alone. */
export function filterShape(style: FilterStyle): { out: FilterSide | null; in: FilterSide | null } {
  const side = (kind: FilterKind, points: [number, number][]): FilterSide => ({ kind, curve: eased(points) });
  switch (style) {
    case 'lpf-out':
      return { out: side('lowpass', CLOSE), in: null };
    case 'lpf-in':
      return { out: null, in: side('lowpass', OPEN) };
    case 'lpf-in-lpf-out':
      return { out: side('lowpass', CLOSE), in: side('lowpass', OPEN) };
    case 'lpf-in-hpf-out':
      return { out: side('highpass', CLOSE), in: side('lowpass', OPEN) };
    case 'hpf-out':
      return { out: side('highpass', CLOSE), in: null };
    case 'hpf-in':
      return { out: null, in: side('highpass', OPEN) };
    case 'hpf-in-hpf-out':
      return { out: side('highpass', CLOSE), in: side('highpass', OPEN) };
    case 'hpf-in-lpf-out':
      return { out: side('lowpass', CLOSE), in: side('highpass', OPEN) };
    case 'hpf-half-out':
      return { out: side('highpass', HALF), in: null };
    case 'noise-out-end':
      return { out: side('noise', RISE), in: null };
    case 'none':
      return { out: null, in: null };
  }
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Low-pass cutoff for a closure: 20 kHz open, 150 Hz shut (exponential). */
export function lowpassHz(closure: number): number {
  return 20000 * (150 / 20000) ** clamp01(closure);
}

/** High-pass cutoff for a closure: 20 Hz open, 4 kHz shut (exponential). */
export function highpassHz(closure: number): number {
  return 20 * (4000 / 20) ** clamp01(closure);
}

/** Low-pass cutoff of the noise for an amount: 300 Hz to 14 kHz (exponential). */
export function noiseHz(amount: number): number {
  return 300 * (14000 / 300) ** clamp01(amount);
}

/** Below this closure the dry signal is blended back in, so an open filter is transparent. */
export const FILTER_ENGAGE = 0.05;

export function filterWet(closure: number): number {
  return Math.min(1, Math.max(0, closure) / FILTER_ENGAGE);
}

/** Peak level of the noise of "Noise out end". */
export const NOISE_LEVEL = 0.3;
/** Fixed filter resonance (linear Q 0.9), in the dB units Web Audio uses for lowpass/highpass. */
export const FILTER_Q_DB = 20 * Math.log10(0.9);

type LaneFields = Pick<Transition, 'eq' | 'filter' | 'customEq' | 'customFilter'>;

/** Bass curves being played or edited: the hand-drawn ones, or the ones of the EQ style. */
export function bassCurves(t: Pick<Transition, 'eq' | 'customEq'>): VolumeCurves {
  if (t.customEq) return t.customEq;
  const c = eqCurves(t.eq);
  return { out: c.out.low, in: c.in.low };
}

/** Filter curves being played or edited: the hand-drawn ones, or the ones of the filter style. */
export function filterCurves(t: Pick<Transition, 'filter' | 'customFilter'>): SideCurves {
  if (t.customFilter) return t.customFilter;
  const s = filterShape(t.filter);
  return { out: s.out?.curve ?? null, in: s.in?.curve ?? null };
}

/** True when a curve is flat at 1 (a band the EQ leaves alone). */
function isFlatFull(c: GainCurve): boolean {
  return c.points.every((p) => p.y === 1);
}

export interface EqSide {
  low: Float32Array;
  mid: Float32Array;
  high: Float32Array;
}

/** Band gains of each song, or null for a song whose three bands stay flat. */
export function eqSamples(t: LaneFields, n = DEFAULT_SAMPLES): { out: EqSide | null; in: EqSide | null } {
  const style = eqCurves(t.eq);
  const bass = bassCurves(t);
  const side = (bands: EqBands, low: GainCurve): EqSide | null =>
    isFlatFull(low) && isFlatFull(bands.mid) && isFlatFull(bands.high)
      ? null
      : { low: sampleGainCurve(low, n), mid: sampleGainCurve(bands.mid, n), high: sampleGainCurve(bands.high, n) };
  return { out: side(style.out, bass.out), in: side(style.in, bass.in) };
}

export interface FilterSamples {
  kind: FilterKind;
  closure: Float32Array;
}

/** Closure of each song's filter, or null for a song the filter style leaves alone. */
export function filterSamples(t: LaneFields, n = DEFAULT_SAMPLES): { out: FilterSamples | null; in: FilterSamples | null } {
  const shape = filterShape(t.filter);
  const curves = filterCurves(t);
  const side = (s: FilterSide | null, c: GainCurve | null): FilterSamples | null =>
    s && c ? { kind: s.kind, closure: sampleGainCurve(c, n) } : null;
  return { out: side(shape.out, curves.out), in: side(shape.in, curves.in) };
}

/** Where a lane's values sit on a waveform, as fractions of its height from the bottom: value 0 at `zero`, 1 at `one`. */
export interface LaneScale {
  zero: number;
  one: number;
}

/**
 * Volume and the effect send fill the lane from the bottom. EQ rests in the middle and cuts down from there. The filter is
 * open in the middle: a high-pass closing goes up, a low-pass closing goes down, and noise grows upwards.
 */
export function laneScale(lane: EditLane, kind: FilterKind | null = null): LaneScale {
  if (lane === 'volume' || lane === 'effect') return { zero: 0, one: 1 };
  if (lane === 'eq') return { zero: 0, one: 0.5 };
  return kind === 'lowpass' ? { zero: 0.5, one: 0 } : { zero: 0.5, one: 1 };
}

export interface LaneLine {
  lane: EditLane;
  values: Float32Array;
  scale: LaneScale;
  /** The EQ's mid and high bands: drawn fainter, under the rest. */
  faint: boolean;
}

/**
 * Lines drawn over each song, back to front: EQ mid/high, filter, EQ bass, effect send, volume. Lanes that
 * leave a song alone draw nothing; the effect only ever goes on the outgoing song.
 */
export function laneLines(t: Transition, n = DEFAULT_SAMPLES): { out: LaneLine[]; in: LaneLine[] } {
  const volume = volumeSamples(t, n);
  const eq = eqSamples(t, n);
  const filter = filterSamples(t, n);
  const effect = effectSamples(t, n);
  const flat = (v: Float32Array) => v.every((x) => x === 1);
  const side = (vol: Float32Array, e: EqSide | null, f: FilterSamples | null, send: Float32Array | null): LaneLine[] => {
    const lines: LaneLine[] = [];
    if (e) {
      for (const band of [e.mid, e.high]) {
        if (!flat(band)) lines.push({ lane: 'eq', values: band, scale: laneScale('eq'), faint: true });
      }
    }
    if (f) lines.push({ lane: 'filter', values: f.closure, scale: laneScale('filter', f.kind), faint: false });
    if (e && !flat(e.low)) lines.push({ lane: 'eq', values: e.low, scale: laneScale('eq'), faint: false });
    if (send) lines.push({ lane: 'effect', values: send, scale: laneScale('effect'), faint: false });
    lines.push({ lane: 'volume', values: vol, scale: laneScale('volume'), faint: false });
    return lines;
  };
  return { out: side(volume.out, eq.out, filter.out, effect), in: side(volume.in, eq.in, filter.in, null) };
}
